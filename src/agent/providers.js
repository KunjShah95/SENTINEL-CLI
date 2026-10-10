/**
 * Unified multi-provider LLM streaming client — raw fetch, no SDKs.
 *
 * Covers OpenAI-compatible endpoints plus native Anthropic and Google Gemini
 * wire protocols. Which endpoints exist and where they live is decided by
 * `src/shared/connectors/registry.js`; this file only implements the three
 * transports. That split is what keeps adding a provider a registry edit
 * rather than a fourth place to remember a base URL.
 *
 * Yields normalized events:
 *   { type: 'text', text }                  incremental text
 *   { type: 'reasoning', text }             incremental reasoning/thinking
 *   { type: 'tool_call', id, name, input }  complete tool call
 *   { type: 'usage', usage }                { inputTokens, outputTokens } or null
 *   { type: 'error', message }              fatal provider error
 */
import {
  TRANSPORT,
  getConnector,
  getConnectorBaseUrl,
} from '../shared/connectors/registry.js';
import { resolveCredential, credentialHint } from '../shared/connectors/credentials.js';
import { getBareModelId } from '../shared/models/index.js';

/** Base URL for any connector, from the registry. Empty when unknown. */
function baseUrlFor(provider) {
  return getConnectorBaseUrl(provider);
}

/** Resolve an API key: the credential store first, then env. */
export async function getApiKey(provider) {
  const { key } = await resolveCredential(provider);
  if (key) return key;

  // Legacy fallback: configManager held keys before the connector store existed.
  // Kept so an existing `~/.sentinel.yaml` provider block keeps working, but it
  // is consulted after the store so a fresh `sentinel connect` wins.
  if (!cachedManagerPromise) {
    cachedManagerPromise = import('../config/configManager.js')
      .then(async (m) => {
        await m.configManager.load?.();
        m.configManager.injectEnvVars?.();
        return m.configManager;
      })
      .catch(() => null);
  }
  const manager = await cachedManagerPromise;
  try {
    const stored = manager?.getApiKey?.(provider);
    if (stored) return stored;
  } catch {
    /* fall through */
  }
  return undefined;
}

let cachedManagerPromise = null;

function headersFor(provider, apiKey) {
  if (provider === 'anthropic') {
    return {
      'content-type': 'application/json',
      'x-api-key': apiKey || '',
      'anthropic-version': '2023-06-01',
    };
  }
  if (provider === 'openrouter') {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey || ''}`,
      'HTTP-Referer': 'https://github.com/KunjShah95/SENTINEL-CLI',
      'X-Title': 'sentinel-cli',
    };
  }
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey || ''}`,
  };
}

const HTTP_HINTS = {
  401: 'Check the API key for this provider: run /setup.',
  403: 'The key is valid but not allowed to use this model: run /setup or pick another with /model.',
  402: 'The provider refused on billing or quota. Pick another model with /model (local Ollama models are free) or add credits.',
  404: 'This model id is not served by the provider. /models lists what is available.',
  429: 'Rate limited. Wait a moment, or switch with /model.',
};

/**
 * Turn a failed provider response into one readable line plus a next step.
 * Most providers wrap the reason as `{"error":{"message":...}}`; show just that.
 */
export function formatProviderError(status, detail, statusText) {
  let reason = (detail || '').trim();
  try {
    const j = JSON.parse(reason);
    const msg = j?.error?.message ?? j?.message ?? (typeof j?.error === 'string' ? j.error : null);
    if (msg) reason = String(msg);
  } catch {
    /* not JSON: keep the raw text */
  }
  const hint = HTTP_HINTS[status];
  return `Provider HTTP ${status}: ${reason || statusText}${hint ? `
→ ${hint}` : ''}`;
}

/** Read an SSE response body, yielding parsed `{ type:'frame', json }` events. */
async function* sse(res) {
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      /* ignore */
    }
    yield { type: 'error', message: formatProviderError(res.status, detail, res.statusText) };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      yield* parseFrame(frame);
    }
  }
  // Flush: servers may end the stream without a trailing blank line —
  // without this, the final event (often finish_reason + usage) is lost.
  buf += decoder.decode();
  if (buf.trim()) yield* parseFrame(buf);

  function* parseFrame(frame) {
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            yield { type: 'frame', json: JSON.parse(data) };
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
  }
}

// ─── OpenAI-compatible streaming ──────────────────────────────────────────────

async function* streamOpenAICompat({ provider, model, messages, tools, apiKey, signal }) {
  const base = baseUrlFor(provider);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: headersFor(provider, apiKey),
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
    }),
    signal,
  });

  const pending = new Map(); // index -> { id, name, args }
  let sawUsage = false;
  for await (const ev of sse(res)) {
    if (ev.type === 'error') {
      yield ev;
      return;
    }
    const choice = ev.json?.choices?.[0];
    const usage = ev.json?.usage;
    if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
      sawUsage = true;
      yield {
        type: 'usage',
        usage: {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        },
      };
    }
    const delta = choice?.delta;
    if (!delta) continue;
    if (delta.reasoning_content) yield { type: 'reasoning', text: delta.reasoning_content };
    else if (delta.reasoning) yield { type: 'reasoning', text: delta.reasoning };
    if (delta.content) yield { type: 'text', text: delta.content };
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        if (!pending.has(i)) {
          pending.set(i, { id: tc.id || `call_${i}_${Date.now()}`, name: '', args: '' });
        }
        const slot = pending.get(i);
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }
    if (choice?.finish_reason) {
      for (const [i, slot] of pending) yield makeToolCall(slot, i);
      pending.clear();
    }
  }
  for (const [i, slot] of pending) yield makeToolCall(slot, i);
  if (!sawUsage) yield { type: 'usage', usage: null };
}

function makeToolCall(slot, i) {
  let input = {};
  try {
    input = slot.args ? JSON.parse(slot.args) : {};
  } catch {
    input = { _raw: slot.args };
  }
  return { type: 'tool_call', id: slot.id || `call_${i}`, name: slot.name, input };
}

// ─── Anthropic native streaming ───────────────────────────────────────────────

async function* streamAnthropic({ model, messages, tools, apiKey, system, signal }) {
  // Explicit prompt caching. The system prompt is the stable prefix: it is
  // rebuilt from the same sections every turn and only varies when the project
  // context files, skills, or memory change. Marking it ephemeral makes Anthropic
  // cache it (90% input discount, 5-min TTL) instead of re-billing the full
  // prompt on each of the up-to-25 iterations in a turn.
  //
  // Cache breakpoint placement matters: it must be the LAST content block, so
  // everything before it (the whole system prompt) is what gets cached.
  const systemBlocks =
    typeof system === 'string' && system
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : undefined;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: headersFor('anthropic', apiKey),
    body: JSON.stringify({
      model,
      ...(systemBlocks ? { system: systemBlocks } : system ? { system } : {}),
      messages,
      max_tokens: 8192,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
    }),
    signal,
  });

  let tool = null;
  for await (const ev of sse(res)) {
    if (ev.type === 'error') {
      yield ev;
      return;
    }
    const j = ev.json;
    if (j.type === 'content_block_start') {
      if (j.content_block?.type === 'tool_use') {
        tool = { id: j.content_block.id, name: j.content_block.name, args: '' };
      }
    } else if (j.type === 'content_block_delta') {
      const d = j.delta;
      if (d.type === 'text_delta') yield { type: 'text', text: d.text };
      else if (d.type === 'thinking_delta') yield { type: 'reasoning', text: d.thinking };
      else if (d.type === 'input_json_delta' && tool) tool.args += d.partial_json;
    } else if (j.type === 'content_block_stop' && tool) {
      let input = {};
      try {
        input = tool.args ? JSON.parse(tool.args) : {};
      } catch {
        input = { _raw: tool.args };
      }
      yield { type: 'tool_call', id: tool.id, name: tool.name, input };
      tool = null;
    } else if (j.type === 'message_start' && j.message?.usage) {
      const u = j.message.usage;
      yield {
        type: 'usage',
        usage: {
          // cache_read_input_tokens are already billed but were NOT re-read;
          // report them separately so cost accounting can discount them
          // instead of charging full input price.
          inputTokens: u.input_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
          cacheWriteTokens: u.cache_creation_input_tokens || 0,
          outputTokens: 0,
        },
      };
    } else if (j.type === 'message_delta' && j.usage) {
      yield {
        type: 'usage',
        usage: { inputTokens: 0, outputTokens: j.usage.output_tokens || 0 },
      };
    } else if (j.type === 'error') {
      yield { type: 'error', message: j.error?.message || 'anthropic error' };
      return;
    }
  }
}

// ─── Google Gemini native streaming ──────────────────────────────────────────

async function* streamGoogle({ model, messages, tools, apiKey, system, signal }) {
  // streamCompletion passes raw OpenAI-format history; adapt exactly once
  // here: tool_calls become functionCall parts, tool results become
  // functionResponse parts. (Adapting zero times drops all tool context;
  // adapting twice yields empty contents — both were live bugs.)
  const contents = adaptMessagesForGoogle(messages);
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '(empty)' }] }],
    ...(tools && tools.length
      ? {
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            })),
          },
        ],
      }
      : {}),
  };
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:streamGenerateContent?alt=sse&key=${apiKey || ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  for await (const ev of sse(res)) {
    if (ev.type === 'error') {
      yield ev;
      return;
    }
    const cand = ev.json?.candidates?.[0];
    for (const part of cand?.content?.parts || []) {
      if (part.text) yield { type: 'text', text: part.text };
      if (part.functionCall) {
        yield {
          type: 'tool_call',
          id: `call_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        };
      }
    }
    const u = ev.json?.usageMetadata;
    if (u && (u.promptTokenCount || u.candidatesTokenCount)) {
      yield {
        type: 'usage',
        usage: { inputTokens: u.promptTokenCount || 0, outputTokens: u.candidatesTokenCount || 0 },
      };
    }
  }
}

// ─── Message adapters (OpenAI-format history -> native protocols) ────────────

/**
 * History is maintained once in OpenAI format. These adapters reshape it for
 * the native Anthropic and Google protocols, including tool blocks.
 */
export function adaptMessagesForAnthropic(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const block = {
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: String(m.content ?? ''),
      };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
        prev.content.push(block);
      } else {
        out.push({ role: 'user', content: [block] });
      }
      continue;
    }
    const content = [];
    if (m.content && String(m.content).length) {
      content.push({ type: 'text', text: String(m.content) });
    }
    for (const tc of m.tool_calls || []) {
      let input = {};
      try {
        input = JSON.parse(tc.function.arguments || '{}');
      } catch {
        input = {};
      }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
    if (!content.length) continue;
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.role === 'assistant' &&
      content.every((c) => c.type === 'text') &&
      prev.content.every((c) => c.type === 'text')
    ) {
      prev.content[0].text += '\n' + content[0].text;
      continue;
    }
    out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content });
  }
  // Anthropic requires the first block to be from the user
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export function adaptMessagesForGoogle(messages) {
  const nameById = new Map();
  for (const m of messages) {
    for (const tc of m.tool_calls || []) nameById.set(tc.id, tc.function.name);
  }
  const out = [];
  const push = (role, part) => {
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.parts.push(part);
    else out.push({ role, parts: [part] });
  };
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      let response;
      try {
        response = JSON.parse(String(m.content ?? ''));
      } catch {
        response = { result: String(m.content ?? '') };
      }
      push('user', {
        functionResponse: { name: nameById.get(m.tool_call_id) || 'tool', response },
      });
      continue;
    }
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (m.content && String(m.content).length) push(role, { text: String(m.content) });
    for (const tc of m.tool_calls || []) {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }
      push(role, { functionCall: { name: tc.function.name, args } });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// ─── Public entry ─────────────────────────────────────────────────────────────

/**
 * Stream one provider turn. Yields normalized events (see file header).
 * @param {{ modelId: string, provider: string, system?: string,
 *           messages: Array, tools?: Array, signal?: AbortSignal }} opts
 */
export async function* streamCompletion(opts) {
  const { modelId, provider, system, messages, tools, signal } = opts;
  const conn = getConnector(provider);
  const needsKey = !(conn?.local) && provider !== 'local';
  const apiKey = await getApiKey(provider);
  if (needsKey && !apiKey) {
    // The old message told users to run `sentinel auth login <provider>` and
    // that command did not exist, so a user with no key got a dead end: they
    // ran it, got "unknown command", and had no way to tell that from the key
    // being wrong. It exists now.
    yield {
      type: 'error',
      message: `No credential for "${provider}". ${credentialHint(provider)}.`,
    };
    return;
  }

  try {
    const transport = conn?.transport;
    if (transport === TRANSPORT.ANTHROPIC || provider === 'anthropic') {
      yield* streamAnthropic({
        model: getBareModelId(modelId),
        messages: adaptMessagesForAnthropic(messages),
        tools,
        apiKey,
        system,
        signal,
      });
      return;
    }
    if (transport === TRANSPORT.GOOGLE || provider === 'google') {
      yield* streamGoogle({
        model: getBareModelId(modelId),
        messages, // raw OpenAI-format history; streamGoogle adapts once
        tools,
        apiKey,
        system,
        signal,
      });
      return;
    }
    if (!conn && !baseUrlFor(provider)) {
      yield { type: 'error', message: `Unsupported provider: ${provider}` };
      return;
    }
    // OpenAI-compat: system prompt rides as the first message
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    // Strip the registry namespace so the vendor receives a bare model id.
    // This used to strip only `${provider}/`, which left Fireworks' wire-level
    // `accounts/fireworks/` namespace attached and produced a 404 that the
    // error formatter reported as a credential problem.
    const bareModelId = getBareModelId(modelId);
    yield* streamOpenAICompat({
      provider,
      model: bareModelId,
      messages: msgs,
      tools,
      apiKey,
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    yield { type: 'error', message: isNetworkError(e) ? formatNetworkError(provider, e) : e?.message || String(e) };
  }
}

/** undici reports an unreachable host as `TypeError: fetch failed` with the socket error as `cause`. */
function isNetworkError(e) {
  return e?.name === 'TypeError' && (e.message === 'fetch failed' || !!e.cause?.code);
}

function providerHost(provider) {
  try {
    return new URL(baseUrlFor(provider)).host;
  } catch {
    return provider;
  }
}

/**
 * A bare "fetch failed" says nothing. Name the host and the next step. Only
 * the host is shown, never the URL: Gemini puts the API key in the query.
 */
export function formatNetworkError(provider, e) {
  const code = e?.cause?.code ? ` (${e.cause.code})` : '';
  const hint = provider === 'ollama'
    ? 'Is Ollama running? Start it with `ollama serve`, or pick another model with /model.'
    : provider === 'lmstudio'
      ? 'Is the LM Studio server running? Start it from the Developer tab, or pick another model with /model.'
      : 'Check your network connection, VPN or proxy, then try again.';
  return `Could not reach ${provider} at ${providerHost(provider)}${code}.
→ ${hint}`;
}
