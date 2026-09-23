/**
 * Unified multi-provider LLM streaming client — raw fetch, no SDKs.
 *
 * Covers OpenAI-compatible endpoints (OpenAI, Groq, Mistral, DeepSeek, xAI,
 * Together, Fireworks, Perplexity, OpenRouter, Ollama, LM Studio, Copilot)
 * plus native Anthropic and Google Gemini wire protocols.
 *
 * Yields normalized events:
 *   { type: 'text', text }                  incremental text
 *   { type: 'reasoning', text }             incremental reasoning/thinking
 *   { type: 'tool_call', id, name, input }  complete tool call
 *   { type: 'usage', usage }                { inputTokens, outputTokens } or null
 *   { type: 'error', message }              fatal provider error
 */

const ENV_KEYS = {
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  google: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  together: 'TOGETHER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'github-copilot': 'GITHUB_TOKEN',
};

const OPENAI_COMPAT = {
  openai: () => 'https://api.openai.com/v1',
  groq: () => 'https://api.groq.com/openai/v1',
  mistral: () => 'https://api.mistral.ai/v1',
  deepseek: () => 'https://api.deepseek.com/v1',
  xai: () => 'https://api.x.ai/v1',
  together: () => 'https://api.together.xyz/v1',
  fireworks: () => 'https://api.fireworks.ai/inference/v1',
  perplexity: () => 'https://api.perplexity.ai',
  openrouter: () => 'https://openrouter.ai/api/v1',
  ollama: () => `${(process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '')}/v1`,
  lmstudio: () => `${(process.env.LMSTUDIO_HOST || 'http://localhost:1234').replace(/\/$/, '')}/v1`,
  local: () => `${(process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/$/, '')}/v1`,
  'github-copilot': () => 'https://api.githubcopilot.com',
};

let cachedManagerPromise = null;

/** Resolve an API key: config store first (sentinel auth), then env. */
export async function getApiKey(provider) {
  const envKey = ENV_KEYS[provider];
  const envVal = envKey ? process.env[envKey] : undefined;
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
    /* fall through to env */
  }
  return envVal || undefined;
}

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

/** Read an SSE response body, yielding parsed `{ type:'frame', json }` events. */
async function* sse(res) {
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      /* ignore */
    }
    yield { type: 'error', message: `Provider HTTP ${res.status}: ${detail || res.statusText}` };
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
}

// ─── OpenAI-compatible streaming ──────────────────────────────────────────────

async function* streamOpenAICompat({ provider, model, messages, tools, apiKey, signal }) {
  const base = OPENAI_COMPAT[provider]();
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
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: headersFor('anthropic', apiKey),
    body: JSON.stringify({
      model,
      system,
      messages,
      max_tokens: 4096,
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
    } else if (j.type === 'message_delta' && j.usage) {
      yield {
        type: 'usage',
        usage: { inputTokens: j.usage.input_tokens || 0, outputTokens: j.usage.output_tokens || 0 },
      };
    } else if (j.type === 'error') {
      yield { type: 'error', message: j.error?.message || 'anthropic error' };
      return;
    }
  }
}

// ─── Google Gemini native streaming ──────────────────────────────────────────

async function* streamGoogle({ model, messages, tools, apiKey, system, signal }) {
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : '' }],
      })),
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
  const nameById = new Map();
  for (const m of messages) {
    for (const tc of m.tool_calls || []) nameById.set(tc.id, tc.function.name);
  }
  void nameById;
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
  const needsKey = provider !== 'ollama' && provider !== 'lmstudio' && provider !== 'local';
  const apiKey = await getApiKey(provider);
  if (needsKey && !apiKey) {
    const envKey = ENV_KEYS[provider] || `${String(provider).toUpperCase()}_API_KEY`;
    yield {
      type: 'error',
      message: `No API key for "${provider}". Run 'sentinel auth login ${provider}' or set ${envKey}.`,
    };
    return;
  }

  try {
    if (provider === 'anthropic') {
      yield* streamAnthropic({
        model: modelId.replace(/^anthropic\//, ''),
        messages: adaptMessagesForAnthropic(messages),
        tools,
        apiKey,
        system,
        signal,
      });
      return;
    }
    if (provider === 'google') {
      yield* streamGoogle({
        model: modelId.replace(/^google\//, ''),
        messages: adaptMessagesForGoogle(messages),
        tools,
        apiKey,
        system,
        signal,
      });
      return;
    }
    if (!OPENAI_COMPAT[provider]) {
      yield { type: 'error', message: `Unsupported provider: ${provider}` };
      return;
    }
    // OpenAI-compat: system prompt rides as the first message
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    yield* streamOpenAICompat({ provider, model: modelId, messages: msgs, tools, apiKey, signal });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    yield { type: 'error', message: e?.message || String(e) };
  }
}
