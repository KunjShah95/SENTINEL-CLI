/**
 * Integration surface: external MCP client, web search chain, page fetch,
 * assistant config registration, and provider tool declaration.
 *
 * Everything here is offline — no API keys, no network, no LLM. The MCP client
 * is tested against a real in-process stdio MCP server so transport behavior
 * (handshake, namespacing, schema coercion, error propagation) is exercised
 * rather than mocked.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

import {
  namespaceTool,
  parseNamespacedTool,
  normalizeServerSpec,
  buildToolRegistry,
  callExternalTool,
  closeAll,
} from '../src/agent/mcp-client.js';
import { providerOrder, availableProviders, formatSearchResults } from '../src/shared/web-search.js';
import { htmlToText, fetchUrl } from '../src/shared/fetch-url.js';
import { buildProviderTools } from '../src/agent/loop.js';
import { sentinelServerDefinition, registerWithAssistant, unregisterFromAssistant } from '../src/cli/connect.js';
import { isReadOnlyTool } from '../src/shared/schemas/mode.js';
import { READ_ONLY_TOOL_NAMES } from '../src/shared/tools/schemas.js';

// ── A real MCP server to connect to ─────────────────────────────────────────
// Written to a temp dir and spawned as a child process, so the client under
// test does the actual stdio handshake and JSON-RPC exchange.
// The fixture lives in a temp dir outside the repo, so it cannot resolve bare
// specifiers — every import is an absolute path into this repo's node_modules.
// Zod's ESM entry is index.js (it ships TypeScript sources behind its exports
// map), not index.mjs.
// Windows requires file:// URLs for absolute ESM imports — a bare "C:/..." is
// parsed as a URL scheme and rejected. pathToFileURL handles both platforms.
const sdk = (rel) => pathToFileURL(join(root, 'node_modules', rel)).href;

const FIXTURE = `
import { McpServer } from ${JSON.stringify(sdk('@modelcontextprotocol/sdk/dist/esm/server/mcp.js'))};
import { StdioServerTransport } from ${JSON.stringify(sdk('@modelcontextprotocol/sdk/dist/esm/server/stdio.js'))};
import { z } from ${JSON.stringify(sdk('zod/index.js'))};

const server = new McpServer({ name: 'fixture', version: '0.0.0' });

server.tool('search', 'Fixture search tool', { q: z.string() }, async ({ q }) => ({
  content: [{ type: 'text', text: 'echo:' + q }],
}));

server.tool('explode', 'Always fails', {}, async () => {
  throw new Error('intentional failure');
});

// A tool with a messy schema and no outputSchema: the SDK drops
// structuredContent unless one is declared, so this returns text only.
// Exercises that a handler which throws surfaces as an error, not a crash.
server.tool('messy', 'Messy schema, returns a minimal object', {}, async () => ({
  content: [{ type: 'text', text: 'ok' }],
}));

server.tool('big', 'Returns more text than the result cap', {}, async () => ({
  content: [{ type: 'text', text: 'x'.repeat(50000) }],
}));

await server.connect(new StdioServerTransport());
`;

describe('mcp client — namespacing', () => {
  it('round-trips a namespaced tool name', () => {
    const name = namespaceTool('github', 'create_issue');
    assert.equal(name, 'github__create_issue');
    assert.deepEqual(parseNamespacedTool(name), { server: 'github', tool: 'create_issue' });
  });

  it('sanitizes characters providers reject', () => {
    const name = namespaceTool('my server!', 'search/query');
    assert.match(name, /^[a-zA-Z0-9_-]{1,64}$/, 'matches OpenAI tool-name charset');
    assert.ok(name.includes('__'), 'separator survives sanitizing');
  });

  it('caps total length at the provider limit', () => {
    const name = namespaceTool('s'.repeat(80), 't'.repeat(80));
    assert.ok(name.length <= 64, `length ${name.length} <= 64`);
  });

  it('returns null for a name with no separator', () => {
    assert.equal(parseNamespacedTool('plainname'), null);
  });
});

describe('mcp client — spec normalization', () => {
  it('reads a stdio server', () => {
    const spec = normalizeServerSpec('gh', { command: 'npx', args: ['-y', 'srv'], env: { A: '1' } });
    assert.equal(spec.kind, 'stdio');
    assert.equal(spec.command, 'npx');
    assert.deepEqual(spec.args, ['-y', 'srv']);
  });

  it('defaults a missing args array to empty', () => {
    assert.deepEqual(normalizeServerSpec('x', { command: 'run' }).args, []);
  });

  it('reads a url server as streamable-http by default', () => {
    assert.equal(normalizeServerSpec('r', { url: 'https://example.com/mcp' }).kind, 'streamable-http');
  });

  it('honors explicit sse', () => {
    assert.equal(normalizeServerSpec('r', { url: 'https://example.com', type: 'sse' }).kind, 'sse');
  });

  it('marks disabled servers', () => {
    assert.equal(normalizeServerSpec('r', { command: 'x', disabled: true }).disabled, true);
  });

  it('rejects entries with neither command nor url', () => {
    assert.equal(normalizeServerSpec('r', { nonsense: true }), null);
    assert.equal(normalizeServerSpec('r', null), null);
  });
});

describe('mcp client — live connection', () => {
  let tmp;
  let fixturePath;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'sentinel-mcp-'));
    fixturePath = join(tmp, 'fixture-server.mjs');
    writeFileSync(fixturePath, FIXTURE);
  });

  after(async () => {
    // Close every client AND its transport. closeAll() closes clients, but the
    // spawned node children keep the event loop alive unless their stdio pipes
    // are destroyed — without this the test file hangs after the last assert.
    await closeAll();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  it('connects, discovers tools, and calls one', async () => {
    const registry = await buildToolRegistry({ fixture: { command: process.execPath, args: [fixturePath] } });
    assert.equal(registry.errors.length, 0, `no errors: ${JSON.stringify(registry.errors)}`);
    const names = registry.tools.map((t) => t.namespacedName).sort();
    assert.deepEqual(names, ['fixture__big', 'fixture__explode', 'fixture__messy', 'fixture__search']);

    const out = await callExternalTool('fixture__search', { q: 'hello' }, {
      mcpServers: { fixture: { command: process.execPath, args: [fixturePath] } },
    });
    assert.equal(out.text, 'echo:hello');
  });

  it('coerces schemas to provider-safe JSON Schema', async () => {
    const registry = await buildToolRegistry({ fixture: { command: process.execPath, args: [fixturePath] } });
    for (const tool of registry.tools) {
      assert.equal(tool.inputSchema.type, 'object', `${tool.namespacedName} is an object schema`);
      assert.ok(tool.inputSchema.properties, `${tool.namespacedName} has properties`);
      assert.ok(!Array.isArray(tool.inputSchema.required) || tool.inputSchema.required.length > 0);
      // Unknown keywords that providers reject must not survive.
      assert.equal(tool.inputSchema.$schema, undefined, 'no $schema keyword');
    }
  });

  it('surfaces a throwing tool as an error, not a crash', async () => {
    const out = await callExternalTool('fixture__explode', {}, {
      mcpServers: { fixture: { command: process.execPath, args: [fixturePath] } },
    });
    assert.ok(out.error, 'error returned');
  });

  it('returns text content as-is', async () => {
    const out = await callExternalTool('fixture__messy', {}, {
      mcpServers: { fixture: { command: process.execPath, args: [fixturePath] } },
    });
    assert.equal(out.text, 'ok');
  });

  it('caps an oversized tool result so one server cannot blow the budget', async () => {
    const out = await callExternalTool('fixture__big', {}, {
      mcpServers: { fixture: { command: process.execPath, args: [fixturePath] } },
      maxChars: 1000,
    });
    assert.ok(out.text.length < 1200, `truncated to ${out.text.length} chars`);
    assert.match(out.text, /truncated \d+ chars/);
  });

  it('reports an unknown tool rather than throwing', async () => {
    const out = await callExternalTool('fixture__nope', {}, {
      mcpServers: { fixture: { command: process.execPath, args: [fixturePath] } },
    });
    assert.match(out.error, /Unknown MCP tool/);
  });

  it('does not throw when the server command does not exist', async () => {
    const registry = await buildToolRegistry({
      broken: { command: 'definitely-not-a-real-binary-xyz', args: [] },
    });
    assert.equal(registry.tools.length, 0);
    assert.equal(registry.errors.length, 1);
    assert.equal(registry.errors[0].server, 'broken');
  });

  it('keeps healthy servers when one fails', async () => {
    const registry = await buildToolRegistry({
      broken: { command: 'definitely-not-a-real-binary-xyz' },
      fixture: { command: process.execPath, args: [fixturePath] },
    });
    assert.equal(registry.errors.length, 1);
    assert.equal(registry.servers.length, 1);
    assert.ok(registry.tools.length >= 4, 'healthy server still contributed tools');
  });

  it('skips disabled servers entirely', async () => {
    const registry = await buildToolRegistry({
      fixture: { command: process.execPath, args: [fixturePath], disabled: true },
    });
    assert.equal(registry.servers.length, 0);
  });

  it('returns empty for an empty config without spawning anything', async () => {
    const registry = await buildToolRegistry({});
    assert.deepEqual(registry.tools, []);
    assert.deepEqual(registry.errors, []);
  });
});

describe('web search provider chain', () => {
  it('ends the default chain with the keyless provider', () => {
    // contextdev is first when configured (repo-aware code context), then the
    // general web providers. Only the tail is asserted: the head is where new
    // providers get added, and pinning it here made this test the place that
    // broke on every addition.
    const order = providerOrder();
    assert.equal(order[order.length - 1], 'duckduckgo', 'keyless fallback is last');
    for (const expected of ['exa', 'tavily', 'brave']) {
      assert.ok(order.includes(expected), `${expected} is in the default chain`);
    }
    assert.ok(order.indexOf('exa') < order.indexOf('duckduckgo'), 'paid providers precede the fallback');
  });

  it('honors an explicit order', () => {
    assert.deepEqual(providerOrder(['brave', 'exa']), ['brave', 'exa']);
  });

  it('deduplicates the order', () => {
    assert.deepEqual(providerOrder(['exa', 'exa', 'brave']), ['exa', 'brave']);
  });

  it('always keeps duckduckgo as the keyless fallback', () => {
    assert.ok(availableProviders([]).includes('duckduckgo'));
  });

  it('drops keyless-requiring providers when no key is set', () => {
    // Every keyless provider in the chain, so this stays correct as providers are
    // added. Asserting an exact list made the test fail on each addition.
    const CHAIN_KEY_VARS = {
      contextdev: 'CONTEXT_DEV_API_KEY',
      exa: 'EXA_API_KEY',
      tavily: 'TAVILY_API_KEY',
      brave: 'BRAVE_API_KEY',
    };
    const saved = Object.fromEntries(
      Object.entries(CHAIN_KEY_VARS).map(([, k]) => [k, process.env[k]]),
    );
    for (const k of Object.keys(CHAIN_KEY_VARS)) delete process.env[k];
    try {
      assert.deepEqual(availableProviders([]), ['duckduckgo']);
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v) process.env[k] = v;
    }
  });

  it('includes a provider once its key is present', () => {
    const saved = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = 'test-key';
    try {
      assert.ok(availableProviders([]).includes('tavily'));
    } finally {
      if (saved) process.env.TAVILY_API_KEY = saved;
      else delete process.env.TAVILY_API_KEY;
    }
  });

  it('reports each failure when a query fails', () => {
    const text = formatSearchResults({ results: [], provider: null, errors: [{ provider: 'exa', error: '401' }] });
    assert.match(text, /No results found/);
    assert.match(text, /exa: 401/, 'names the failing provider');
  });

  it('renders results compactly', () => {
    const text = formatSearchResults({
      results: [{ title: 'T', url: 'https://e.com', snippet: 's', provider: 'exa' }],
      provider: 'exa',
      errors: [],
    });
    assert.match(text, /Results from exa/);
    assert.match(text, /https:\/\/e\.com/);
  });
});

describe('fetchUrl — html extraction', () => {
  it('strips script and style content', () => {
    const html = '<html><head><style>.a{color:red}</style><script>var x=1</script></head><body><p>Hello</p></body></html>';
    const text = htmlToText(html);
    assert.equal(text, 'Hello');
  });

  it('drops nav, header, footer, and aside', () => {
    const html = '<body><nav>Menu</nav><header>Top</header><p>Body</p><footer>Foot</footer></body>';
    assert.equal(htmlToText(html), 'Body');
  });

  it('decodes entities', () => {
    assert.equal(htmlToText('<p>a &amp; b &lt;c&gt; &#65;</p>'), 'a & b <c> A');
  });

  it('keeps list structure', () => {
    const text = htmlToText('<ul><li>one</li><li>two</li></ul>');
    assert.match(text, /- one/);
    assert.match(text, /- two/);
  });

  it('collapses whitespace', () => {
    assert.equal(htmlToText('<p>a</p><p></p><p>b</p>'), 'a\n\nb');
  });

  it('rejects a non-http protocol', async () => {
    await assert.rejects(() => fetchUrl({ url: 'file:///etc/passwd' }), /Unsupported protocol/);
  });

  it('requires a url', async () => {
    await assert.rejects(() => fetchUrl({}), /url is required/);
  });
});

describe('tool declaration', () => {
  it('appends external tools after local ones', () => {
    const tools = buildProviderTools('BUILD', [
      { namespacedName: 'gh__create_issue', description: 'd', inputSchema: { type: 'object', properties: {} } },
    ]);
    const last = tools[tools.length - 1];
    assert.equal(last.function.name, 'gh__create_issue');
    assert.equal(last.function.description, 'd');
    assert.ok(tools.length > 1, 'local tools still present');
  });

  it('is unchanged when there are no external tools', () => {
    assert.deepEqual(buildProviderTools('BUILD'), buildProviderTools('BUILD', []));
  });

  it('exposes fetchUrl to every mode that allows read-only tools', () => {
    for (const mode of ['BUILD', 'PLAN', 'REVIEW', 'SCAN', 'FIX']) {
      const names = buildProviderTools(mode).map((t) => t.function.name);
      assert.ok(names.includes('fetchUrl'), `${mode} declares fetchUrl`);
    }
  });

  it('classifies fetchUrl as read-only everywhere it matters', () => {
    assert.ok(isReadOnlyTool('fetchUrl'), 'read-only for mode gating');
    assert.ok(READ_ONLY_TOOL_NAMES.includes('fetchUrl'), 'listed for subagent readonly sets');
  });

  it('keeps searchWeb read-only', () => {
    assert.ok(isReadOnlyTool('searchWeb'));
  });
});

describe('assistant registration', () => {
  // Every case writes into a throwaway project dir and needs its parent
  // directories to exist first.
  const scratchProject = (sub = '.vscode') => {
    const tmp = mkdtempSync(join(tmpdir(), 'sentinel-connect-'));
    const proj = join(tmp, 'proj');
    mkdirSync(join(proj, sub), { recursive: true });
    return { tmp, proj };
  };

  it('uses npx to launch the mcp server', () => {
    const server = sentinelServerDefinition();
    assert.equal(server.command, 'npx');
    assert.deepEqual(server.args, ['-y', 'sentinel-cli', 'mcp']);
  });

  it('merges into an existing config without dropping other servers', () => {
    const { tmp, proj } = scratchProject();
    try {
      const file = join(proj, '.vscode', 'mcp.json');
      writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: 'x' } }, inputs: [{ id: 'a' }] }));

      const res = registerWithAssistant({ targetId: 'vscode-copilot', scope: 'project', cwd: proj });
      assert.equal(res.ok, true);
      assert.ok(existsSync(res.backup), 'backup written');

      const after = JSON.parse(readFileSync(file, 'utf-8'));
      assert.ok(after.mcpServers.other, 'pre-existing server preserved');
      assert.ok(after.mcpServers.sentinel, 'sentinel added');
      assert.deepEqual(after.inputs, [{ id: 'a' }], 'unrelated keys preserved');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports unchanged on a second run', () => {
    const { tmp, proj } = scratchProject();
    try {
      registerWithAssistant({ targetId: 'vscode-copilot', scope: 'project', cwd: proj });
      const second = registerWithAssistant({ targetId: 'vscode-copilot', scope: 'project', cwd: proj });
      assert.equal(second.action, 'unchanged');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('dry-run writes nothing', () => {
    // The .vscode dir exists but mcp.json must not be created.
    const { tmp, proj } = scratchProject();
    try {
      const res = registerWithAssistant({ targetId: 'vscode-copilot', scope: 'project', cwd: proj, dryRun: true });
      assert.equal(res.action, 'would-write');
      assert.ok(!existsSync(join(proj, '.vscode', 'mcp.json')), 'no file created');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('unregister removes only the sentinel entry', () => {
    const { tmp, proj } = scratchProject();
    try {
      const file = join(proj, '.vscode', 'mcp.json');
      writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
      registerWithAssistant({ targetId: 'vscode-copilot', scope: 'project', cwd: proj });
      unregisterFromAssistant({ targetId: 'vscode-copilot', scope: 'project', cwd: proj });
      const after = JSON.parse(readFileSync(file, 'utf-8'));
      assert.ok(!after.mcpServers.sentinel, 'sentinel removed');
      assert.ok(after.mcpServers.other, 'other server still there');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('nests opencode servers under the mcp key with local transport shape', () => {
    const { tmp, proj } = scratchProject();
    try {
      const file = join(proj, 'opencode.json');
      registerWithAssistant({ targetId: 'opencode', scope: 'project', cwd: proj });
      const after = JSON.parse(readFileSync(file, 'utf-8'));
      assert.equal(after.mcp.sentinel.type, 'local');
      assert.ok(Array.isArray(after.mcp.sentinel.command));
      assert.ok(after.mcp.sentinel.command.includes('mcp'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('emits a codex TOML block without touching the real config', () => {
    // Codex user scope is the real ~/.codex/config.toml, so this asserts the
    // generated fragment via dry-run rather than writing to it.
    const res = registerWithAssistant({ targetId: 'codex', scope: 'user', dryRun: true });
    assert.equal(res.ok, true);
    assert.match(res.message, /mcp_servers\.sentinel|already has/);
  });

  it('rejects an unknown target id', () => {
    const res = registerWithAssistant({ targetId: 'not-a-real-assistant' });
    assert.equal(res.ok, false);
    assert.match(res.message, /Unknown assistant target/);
  });
});
