/**
 * MCP client — connect to external MCP servers and expose their tools.
 *
 * The repo already ships an MCP *server* (mcp/sentinel-mcp-server.js) so other
 * assistants can call into Sentinel. This is the mirror image: Sentinel as the
 * *host*, consuming tools from any stdio or HTTP MCP server the user configures.
 *
 * Design notes:
 * - Connections are lazily established. A server that is not configured is
 *   never spawned; a server that fails to start degrades to "tool absent" so a
 *   broken third-party server can never break the agent turn.
 * - Tools are namespaced `<server>__<tool>` because two servers commonly expose
 *   the same name (every server has a `search` tool). The MCP spec forbids
 *   "/" in tool names, which is what the usual `server/tool` convention uses.
 * - Discovery is cached per process. `refresh()` forces a re-scan.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getTokenProvider, authSummary } from './mcp-oauth.js';

const CLIENT_INFO = { name: 'sentinel-cli', version: '3.4.0' };

const NAME_SEP = '__';
const CONNECT_TIMEOUT_MS = 15_000;
const LIST_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 120_000;

/** Per-process connection cache. Keyed by server name. */
const connections = new Map();
/** Per-process tool registry. Keyed by namespaced tool name. */
let toolRegistry = null;
let refreshPromise = null;

/**
 * Normalize one entry of `mcpServers` into a descriptor.
 * Accepts stdio (`command`/`args`) and URL transports (`url`).
 */
export function normalizeServerSpec(name, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const disabled = raw.disabled === true;
  if (raw.url) {
    const transport =
      raw.type === 'sse' || /^https?:/.test(raw.url) && raw.sse === true
        ? 'sse'
        : 'streamable-http';
    return {
      name,
      kind: transport,
      url: String(raw.url),
      headers: raw.headers && typeof raw.headers === 'object' ? raw.headers : undefined,
      disabled,
    };
  }
  if (raw.command) {
    return {
      name,
      kind: 'stdio',
      command: String(raw.command),
      args: Array.isArray(raw.args) ? raw.args.map(String) : [],
      env: raw.env && typeof raw.env === 'object' ? raw.env : undefined,
      cwd: raw.cwd ? String(raw.cwd) : undefined,
      disabled,
    };
  }
  return null;
}

/**
 * Tool names must match OpenAI's `^[a-zA-Z0-9_-]{1,64}$`. MCP names may contain
 * characters outside that set, so sanitize the server side of the separator and
 * cap total length. Collisions after sanitizing are disambiguated in
 * `buildToolRegistry` by appending an index.
 */
function sanitizeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function namespaceTool(serverName, toolName) {
  const prefix = sanitizeSegment(serverName).slice(0, 32);
  const suffix = sanitizeSegment(toolName).slice(0, 64 - prefix.length - NAME_SEP.length);
  return `${prefix}${NAME_SEP}${suffix}`;
}

export function parseNamespacedTool(namespaced) {
  const idx = namespaced.indexOf(NAME_SEP);
  if (idx === -1) return null;
  return {
    server: namespaced.slice(0, idx),
    tool: namespaced.slice(idx + NAME_SEP.length),
  };
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function openConnection(spec) {
  let transport;
  let authProvider;
  if (spec.kind === 'stdio') {
    transport = new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      // Pass the parent env plus explicit overrides. A fully empty env breaks
      // child processes (no PATH, no SystemRoot on Windows, no HOME), so we
      // inherit and layer rather than replacing. Server-specific secrets are
      // declared under `env` in config and never read from the parent's
      // process env implicitly by us.
      env: { ...process.env, ...(spec.env || {}) },
      cwd: spec.cwd,
      stderr: 'ignore',
    });
  } else if (spec.kind === 'sse') {
    transport = new SSEClientTransport(new URL(spec.url), {
      requestInit: spec.headers ? { headers: spec.headers } : undefined,
    });
  } else {
    // Remote servers that require OAuth (the hosted Context.dev server is one)
    // need an OAuthClientProvider, not a static header. It is resolved lazily:
    // `getTokenProvider` returns undefined until the user has signed in, and an
    // unauthenticated server still fails cleanly as "no tools" rather than
    // throwing out of the connection.
    authProvider = getTokenProvider(spec.name, spec.url);
    transport = new StreamableHTTPClientTransport(new URL(spec.url), {
      ...(spec.headers || authProvider ? { requestInit: spec.headers ? { headers: spec.headers } : undefined } : {}),
      ...(authProvider ? { authProvider } : {}),
    });
  }

  const client = new Client(CLIENT_INFO, { capabilities: {} });
  await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect "${spec.name}"`);
  return client;
}

async function listServerTools(spec) {
  const client = await openConnection(spec);
  const { tools } = await withTimeout(client.listTools(), LIST_TIMEOUT_MS, `listTools "${spec.name}"`);
  // Replace any prior connection for this server, closing it first. Rediscovery
  // happens on every `refresh`, and a stdio server is a real child process —
  // without this, repeated rediscovery leaks processes and open pipes.
  const previous = connections.get(spec.name);
  connections.set(spec.name, { client, spec });
  if (previous) await previous.client?.close?.().catch(() => {});
  return Array.isArray(tools) ? tools : [];
}

/**
 * Connect to every enabled server and build the flat tool registry.
 * Never throws: an unreachable server is recorded as an error entry.
 *
 * @param {Record<string, object>} mcpServers raw config map
 * @param {{refresh?: boolean}} [options]
 * @returns {Promise<{tools: Array, servers: Array, errors: Array}>}
 */
export async function buildToolRegistry(mcpServers, options = {}) {
  if (options.refresh) {
    await closeAll();
  }
  const specs = Object.entries(mcpServers || {})
    .map(([name, raw]) => normalizeServerSpec(name, raw))
    .filter((s) => s && !s.disabled);
  if (specs.length === 0) return { tools: [], servers: [], errors: [] };

  const results = await Promise.allSettled(specs.map((spec) => listServerTools(spec)));
  const tools = [];
  const servers = [];
  const errors = [];
  const usedNames = new Set();

  results.forEach((result, i) => {
    const spec = specs[i];
    if (result.status === 'rejected') {
      errors.push({ server: spec.name, error: result.reason?.message || String(result.reason) });
      return;
    }
    let count = 0;
    for (const tool of result.value) {
      if (!tool?.name) continue;
      let namespaced = namespaceTool(spec.name, tool.name);
      // Sanitizing can map two distinct tools onto one name — disambiguate.
      if (usedNames.has(namespaced)) {
        let n = 2;
        while (usedNames.has(`${namespaced}_${n}`)) n++;
        namespaced = `${namespaced}_${n}`;
      }
      usedNames.add(namespaced);
      tools.push({
        namespacedName: namespaced,
        server: spec.name,
        toolName: tool.name,
        description: tool.description || `${tool.name} (via ${spec.name})`,
        inputSchema: normalizeSchema(tool.inputSchema),
      });
      count++;
    }
    servers.push({ name: spec.name, kind: spec.kind, toolCount: count });
  });

  return { tools, servers, errors };
}

/**
 * Coerce an MCP inputSchema into something every provider accepts.
 * Providers reject unknown JSON Schema keywords, so only a safe subset passes.
 */
function normalizeSchema(schema) {
  const base = {
    type: 'object',
    properties: {},
    required: [],
  };
  if (!schema || typeof schema !== 'object') return base;
  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  for (const [key, value] of Object.entries(props)) {
    base.properties[key] = sanitizePropertySchema(value);
  }
  if (Array.isArray(schema.required)) {
    base.required = schema.required.filter((r) => typeof r === 'string' && r in base.properties);
  }
  if (!base.required.length) delete base.required;
  return base;
}

const ALLOWED_KEYWORDS = new Set(['type', 'description', 'enum', 'items', 'properties', 'required', 'default']);

function sanitizePropertySchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'string' };
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!ALLOWED_KEYWORDS.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object') {
      const nested = {};
      for (const [k, v] of Object.entries(value)) nested[k] = sanitizePropertySchema(v);
      out.properties = nested;
    } else if (key === 'items') {
      out.items = sanitizePropertySchema(value);
    } else {
      out[key] = value;
    }
  }
  if (!out.type) out.type = inferType(out);
  return out;
}

function inferType(schema) {
  if (Array.isArray(schema.enum) && schema.enum.length) {
    return typeof schema.enum[0] === 'number' ? 'number' : 'string';
  }
  return 'string';
}

/**
 * Registry for this process, built on first use and cached.
 */
export async function getToolRegistry(mcpServers, options = {}) {
  if (options.refresh) {
    toolRegistry = null;
    refreshPromise = null;
  }
  if (toolRegistry) return toolRegistry;
  if (!refreshPromise) {
    refreshPromise = buildToolRegistry(mcpServers, {})
      .then((registry) => {
        toolRegistry = registry;
        refreshPromise = null;
        return registry;
      })
      .catch(() => {
        refreshPromise = null;
        return { tools: [], servers: [], errors: [] };
      });
  }
  return refreshPromise;
}

/** Reset the cached registry so the next turn rediscovers. */
export function resetToolRegistry() {
  toolRegistry = null;
  refreshPromise = null;
}

/**
 * Invoke a namespaced external tool. Results are coerced to the plain text /
 * object shape the agent loop expects, and content is capped so one chatty
 * third-party server cannot blow the in-turn budget.
 *
 * @param {string} namespacedName
 * @param {object} input
 * @param {{mcpServers?: Record<string, object>, maxChars?: number}} [options]
 */
export async function callExternalTool(namespacedName, input, options = {}) {
  const maxChars = options.maxChars ?? 20000;
  const registry = await getToolRegistry(options.mcpServers);
  const target = registry.tools.find((t) => t.namespacedName === namespacedName);
  if (!target) {
    return { error: `Unknown MCP tool "${namespacedName}"`, available: registry.tools.length };
  }
  const conn = connections.get(target.server);
  if (!conn) {
    return { error: `MCP server "${target.server}" is not connected` };
  }
  try {
    const result = await withTimeout(
      conn.client.callTool({ name: target.toolName, arguments: input || {} }),
      CALL_TIMEOUT_MS,
      `callTool "${namespacedName}"`,
    );
    return normalizeToolResult(result, maxChars);
  } catch (e) {
    return { error: `MCP call failed: ${e?.message || String(e)}` };
  }
}

function normalizeToolResult(result, maxChars) {
  if (result?.isError) {
    const text = flattenContent(result.content);
    return { error: text || 'MCP tool returned an error', isError: true };
  }
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = flattenContent(blocks);
  if (text) {
    return text.length > maxChars
      ? { text: `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]` }
      : { text };
  }
  const structured = result?.structuredContent;
  if (structured !== undefined) {
    const json = JSON.stringify(structured);
    return {
      structured: structured,
      text: json.length > maxChars ? `${json.slice(0, maxChars)}…[truncated]` : json,
    };
  }
  return { text: '' };
}

function flattenContent(blocks) {
  if (!Array.isArray(blocks)) return '';
  const parts = [];
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'resource' && block.resource?.text) parts.push(block.resource.text);
    else if (block.type === 'image') parts.push('[image omitted]');
  }
  return parts.join('\n').trim();
}

/** Close every open connection. Safe to call repeatedly. */
export async function closeAll() {
  const open = [...connections.values()];
  connections.clear();
  toolRegistry = null;
  await Promise.allSettled(open.map((c) => c.client?.close?.()));
}

/** Introspection for `sentinel mcp status` and doctor. */
export function activeConnections() {
  return [...connections.values()].map((c) => ({ name: c.spec.name, kind: c.spec.kind }));
}

/**
 * Auth state per configured server, for `sentinel mcp-status`.
 *
 * Reported separately from connectivity because "needs sign-in" and
 * "unreachable" look identical in a tool listing but need different user
 * actions. Token values are never included.
 */
export function authStatus(mcpServers) {
  return Object.entries(mcpServers || {})
    .map(([name, raw]) => normalizeServerSpec(name, raw))
    .filter((s) => s && !s.disabled && s.kind !== 'stdio')
    .map((s) => authSummary(s.name));
}
