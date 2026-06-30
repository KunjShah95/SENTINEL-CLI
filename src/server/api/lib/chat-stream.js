/**
 * Chat streaming — two backends.
 *
 * 1. `streamWithAiSdk` — uses the Vercel AI SDK with @ai-sdk/anthropic /
 *    @ai-sdk/openai / @ai-sdk/google to stream `streamText` responses.
 *    Tool calls are emitted as `tool_call` SSE events for the CLI to
 *    execute locally.
 *
 * 2. `streamWithOrchestrator` — uses the existing
 *    `src/llm/llmOrchestrator.js` (Sentinel's multi-provider chat) to
 *    stream tokens. This is the fallback when the AI SDK isn't
 *    installed. Tool calls are not supported in this path; the CLI
 *    shows the response and the user can ask for changes.
 *
 * Both return an object with `getReader()` yielding
 * `{ kind: "frame"|"ui-message"|"usage"|"aborted", frame?: string, messages?, usage? }`
 * so the route can forward SSE frames to the client while still tracking
 * the final message list and usage for persistence + billing.
 */

/**
 * JSON Schema for each tool name. AI SDK 3.x's streamText accepts
 * plain JSON Schema objects for tool `parameters`. We look up by name
 * since our chainable validators are not real Zod schemas.
 */
const TOOL_PARAM_SCHEMAS = {
  readFile:              { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  listDirectory:         { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  glob:                  { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  grep:                  { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] },
  searchWeb:             { type: 'object', properties: { query: { type: 'string' }, count: { type: 'integer' } }, required: ['query'] },
  writeFile:             { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  editFile:              { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'] },
  batchEdit:             { type: 'object', properties: { operations: { type: 'array', items: { type: 'object', properties: { filePath: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['filePath', 'oldString', 'newString'] } }, fallback: { type: 'boolean' } }, required: ['operations'] },
  bash:                  { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'integer' }, description: { type: 'string' } }, required: ['command'] },
};

/**
 * Build a small SSE ReadableStream that yields frames in the right format.
 */
function createSseStream() {
  let controller = null;
  const queue = [];
  const stream = new ReadableStream({
    start(c) {
      controller = c;
      for (const item of queue) controller.enqueue(item);
      queue.length = 0;
    },
  });
  function emit(value) {
    if (controller) controller.enqueue(value);
    else queue.push(value);
  }
  function close() {
    if (controller) controller.close();
  }
  return { stream, emit, close };
}

/**
 * Vercel AI SDK backend.
 */
export async function streamWithAiSdk({
  system,
  messages,
  tools,
  modelId,
  provider,
  providerOptions,
  onUsage,
}) {
  const { streamText } = await import('ai');

  let modelFn;
  if (provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic');
    modelFn = anthropic(modelId);
  } else if (provider === 'openai') {
    const { openai } = await import('@ai-sdk/openai');
    modelFn = openai(modelId);
  } else if (provider === 'google') {
    const { google } = await import('@ai-sdk/google');
    modelFn = google(modelId);
  } else if (provider === 'groq') {
    const { createGroq } = await import('@ai-sdk/groq');
    const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
    modelFn = groq(modelId);
  } else if (provider === 'mistral') {
    const { createMistral } = await import('@ai-sdk/mistral');
    const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY });
    modelFn = mistral(modelId);
  } else if (provider === 'deepseek') {
    // DeepSeek is OpenAI-compatible
    const { createOpenAI } = await import('@ai-sdk/openai');
    const deepseek = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: process.env.DEEPSEEK_API_KEY });
    modelFn = deepseek(modelId);
  } else if (provider === 'xai') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const xai = createOpenAI({ baseURL: 'https://api.x.ai/v1', apiKey: process.env.XAI_API_KEY });
    modelFn = xai(modelId);
  } else if (provider === 'together') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const together = createOpenAI({ baseURL: 'https://api.together.xyz/v1', apiKey: process.env.TOGETHER_API_KEY });
    modelFn = together(modelId);
  } else if (provider === 'fireworks') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const fireworks = createOpenAI({ baseURL: 'https://api.fireworks.ai/inference/v1', apiKey: process.env.FIREWORKS_API_KEY });
    modelFn = fireworks(modelId);
  } else if (provider === 'perplexity') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const perplexity = createOpenAI({ baseURL: 'https://api.perplexity.ai', apiKey: process.env.PERPLEXITY_API_KEY });
    modelFn = perplexity(modelId);
  } else if (provider === 'openrouter') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const bare = modelId.replace(/^openrouter\//, '');
    const openrouter = createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });
    modelFn = openrouter(bare);
  } else if (provider === 'ollama') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const base = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const bare = modelId.replace(/^ollama\//, '');
    const ollama = createOpenAI({ baseURL: `${base}/v1`, apiKey: 'ollama' });
    modelFn = ollama(bare);
  } else if (provider === 'lmstudio') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const base = process.env.LMSTUDIO_HOST || 'http://localhost:1234';
    const bare = modelId.replace(/^lmstudio\//, '');
    const lmstudio = createOpenAI({ baseURL: `${base}/v1`, apiKey: 'lmstudio' });
    modelFn = lmstudio(bare);
  } else if (provider === 'github-copilot') {
    const { createOpenAI } = await import('@ai-sdk/openai');
    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_COPILOT_TOKEN || '';
    const bare = modelId.replace(/^copilot\//, '');
    const copilot = createOpenAI({ baseURL: 'https://api.githubcopilot.com/v1', apiKey: token });
    modelFn = copilot(bare);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const aiTools = {};
  for (const [name, contract] of Object.entries(tools)) {
    aiTools[name] = {
      description: contract.description,
      parameters: TOOL_PARAM_SCHEMAS[name] || { type: 'object', properties: {}, additionalProperties: true },
    };
  }

  const result = streamText({
    model: modelFn,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    tools: aiTools,
    providerOptions,
    onFinish: ({ totalUsage }) => {
      if (totalUsage) onUsage?.(totalUsage);
    },
  });

  const { stream: sseStream, emit, close } = createSseStream();

  // Forward the AI SDK stream as SSE frames.
  (async () => {
    try {
      for await (const part of result.fullStream) {
        const frame = sseFrameFor(part);
        if (frame) emit({ kind: 'frame', frame });
      }
      emit({ kind: 'ui-message', messages: messages });
      emit({ kind: 'frame', frame: 'event: done\ndata: {}\n\n' });
    } catch (e) {
      emit({ kind: 'frame', frame: `event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n` });
    } finally {
      close();
    }
  })();

  return sseStream;
}

function sseFrameFor(part) {
  // Map AI SDK stream parts to SSE frames the CLI can decode.
  switch (part.type) {
  case 'text-delta':
    return `event: text\ndata: ${JSON.stringify({ delta: part.textDelta })}\n\n`;
  case 'tool-call':
    return `event: tool_call\ndata: ${JSON.stringify(part)}\n\n`;
  case 'tool-result':
    return `event: tool_result\ndata: ${JSON.stringify(part)}\n\n`;
  case 'reasoning':
    return `event: reasoning\ndata: ${JSON.stringify({ text: part.textDelta })}\n\n`;
  case 'finish':
    return `event: finish\ndata: ${JSON.stringify({ usage: part.totalUsage })}\n\n`;
  case 'error':
    return `event: error\ndata: ${JSON.stringify({ message: String(part.error) })}\n\n`;
  default:
    return null;
  }
}

/**
 * Sentinel orchestrator backend.
 */
export async function streamWithOrchestrator({
  system,
  messages,
  modelId,
  provider,
  onUsage,
}) {
  const { getLLMOrchestrator } = await import('../../../llm/llmOrchestrator.js');
  const { stream: sseStream, emit, close } = createSseStream();

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.content || '';

  (async () => {
    try {
      const orchestrator = getLLMOrchestrator({ provider, model: modelId });
      const iter = orchestrator.streamChat(prompt, {
        systemPrompt: system,
        model: modelId,
      });
      let usage = null;
      for await (const chunk of iter) {
        if (chunk.type === 'content') {
          emit({
            kind: 'frame',
            frame: `event: text\ndata: ${JSON.stringify({ delta: chunk.content })}\n\n`,
          });
        } else if (chunk.type === 'error') {
          emit({
            kind: 'frame',
            frame: `event: error\ndata: ${JSON.stringify({ message: chunk.content })}\n\n`,
          });
        } else if (chunk.type === 'done') {
          if (chunk.usage) usage = chunk.usage;
        }
      }
      if (usage) onUsage?.(usage);
      emit({ kind: 'ui-message', messages });
      emit({ kind: 'frame', frame: 'event: done\ndata: {}\n\n' });
    } catch (e) {
      emit({
        kind: 'frame',
        frame: `event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`,
      });
    } finally {
      close();
    }
  })();

  return sseStream;
}
