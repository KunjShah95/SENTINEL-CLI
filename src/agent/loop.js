/**
 * The agent loop — ONE turn of user input to completion.
 *
 * Streams model output, executes tool calls in-process, feeds results back,
 * and repeats until the model stops calling tools (or MAX_ITERATIONS).
 * Yields ChatEvent-shaped events: { event, data } where event is one of
 *   'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'finish' | 'error' | 'done'
 *
 * This replaces the deleted Hono server's /chat route — no HTTP, no process
 * boundary: the TUI and CLI call it directly.
 */
import { resolveChatModel, getModelPricing } from '../shared/models/index.js';
import { getToolContracts, executeLocalTool } from '../shared/tools/index.js';
import { buildSystemPrompt } from './prompt.js';
import { streamCompletion } from './providers.js';
import { recordUsage, estimateTokensFromText } from './cost.js';

const MAX_ITERATIONS = 25;
const HISTORY_LIMIT = 60;
const HISTORY_CHAR_CAP = 4000;
const TOOL_RESULT_CAP = 20000;

/** JSON Schema per tool (providers require JSON Schema, not Zod). */
const TOOL_PARAM_SCHEMAS = {
  readFile: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  listDirectory: { type: 'object', properties: { path: { type: 'string' } } },
  glob: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  grep: {
    type: 'object',
    properties: { pattern: { type: 'string' }, path: { type: 'string' } },
    required: ['pattern'],
  },
  searchWeb: {
    type: 'object',
    properties: { query: { type: 'string' }, count: { type: 'integer' } },
    required: ['query'],
  },
  writeFile: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
  editFile: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string' },
      newString: { type: 'string' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  batchEdit: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            oldString: { type: 'string' },
            newString: { type: 'string' },
          },
          required: ['filePath', 'oldString', 'newString'],
        },
      },
    },
    required: ['operations'],
  },
  bash: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'integer' },
      description: { type: 'string' },
    },
    required: ['command'],
  },
  diffFile: {
    type: 'object',
    properties: { path: { type: 'string' }, newString: { type: 'string' } },
    required: ['path'],
  },
  undoLastChange: { type: 'object', properties: {} },
};

/** Build provider tool definitions from the shared contracts + schemas. */
export function buildProviderTools(mode) {
  const contracts = getToolContracts(mode);
  return Object.entries(contracts)
    .filter(([name]) => TOOL_PARAM_SCHEMAS[name])
    .map(([name, contract]) => ({
      type: 'function',
      function: {
        name,
        description: contract.description,
        parameters: TOOL_PARAM_SCHEMAS[name],
      },
    }));
}

/** Convert UI history (parts) into lean OpenAI-format messages. */
export function historyToMessages(history = []) {
  const out = [];
  for (const m of history.slice(-HISTORY_LIMIT)) {
    if (!m || m.role === 'error') continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    let text = '';
    if (typeof m.content === 'string') text = m.content;
    else if (Array.isArray(m.parts)) {
      const bits = [];
      for (const p of m.parts) {
        if (p.type === 'text') bits.push(p.text);
        else if (p.type === 'tool-call') {
          bits.push(`[tool ${p.toolName}: ${p.state === 'output-available' ? 'done' : p.state || 'ran'}]`);
        }
      }
      text = bits.join('\n');
    }
    text = text.slice(0, HISTORY_CHAR_CAP);
    if (!text.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content += '\n' + text;
    else out.push({ role, content: text });
  }
  return out;
}

/**
 * Run one full agent turn (model -> tools -> model -> ... -> final answer).
 *
 * @param {object} opts
 * @param {Array}  opts.history      UI-shaped messages (id/role/parts)
 * @param {string} [opts.mode]       BUILD | PLAN | REVIEW
 * @param {string} [opts.model]      model id (registry-resolved)
 * @param {AbortSignal} [opts.signal]
 * @param {(toolName, toolCallId, input) => Promise<'allow'|'deny'|'allow-session'>}
 *        [opts.onPermissionRequest]
 * @yields {{event: string, data: object}}
 */
export async function* runAgentTurn(opts = {}) {
  const {
    history = [],
    mode = 'BUILD',
    model,
    signal,
    onPermissionRequest,
  } = opts;

  let resolved;
  try {
    resolved = resolveChatModel(model);
  } catch (e) {
    yield { event: 'error', data: { message: e.message } };
    yield { event: 'done', data: {} };
    return;
  }

  const system = buildSystemPrompt({ mode });
  const tools = buildProviderTools(mode);
  const messages = historyToMessages(history);
  const allowAll = new Set(); // tools allowed for the rest of the session

  let inputTokens = 0;
  let outputTokens = 0;
  // (usage-known flag removed — turnUsage presence is the signal)

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (signal?.aborted) break;

    const toolCalls = [];
    let text = '';
    let turnUsage = null;

    // Request-size estimate for providers that omit usage
    const requestEstimate = Math.ceil(JSON.stringify(messages).length / 4);

    for await (const ev of streamCompletion({
      modelId: resolved.modelId,
      provider: resolved.provider,
      system,
      messages,
      tools,
      signal,
    })) {
      if (ev.type === 'text') {
        text += ev.text;
        yield { event: 'text', data: { delta: ev.text } };
      } else if (ev.type === 'reasoning') {
        yield { event: 'reasoning', data: { text: ev.text } };
      } else if (ev.type === 'tool_call') {
        toolCalls.push(ev);
      } else if (ev.type === 'usage') {
        if (ev.usage) {
          turnUsage = ev.usage;
          // usage tracked via turnUsage
        }
      } else if (ev.type === 'error') {
        yield { event: 'error', data: { message: ev.message } };
        yield { event: 'done', data: {} };
        return;
      }
    }

    if (turnUsage) {
      inputTokens += turnUsage.inputTokens || 0;
      outputTokens += turnUsage.outputTokens || 0;
    } else {
      inputTokens += requestEstimate;
      outputTokens += estimateTokensFromText(text);
    }

    // ── No tool calls: final answer ──────────────────────────────────────
    if (toolCalls.length === 0) {
      const usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
      const { usd } = recordUsage(resolved.modelId, { inputTokens, outputTokens });
      const pricing = getModelPricing(resolved.modelId);
      void pricing;
      yield { event: 'finish', data: { usage, costUsd: usd, model: resolved.modelId } };
      yield { event: 'done', data: {} };
      return;
    }

    // ── Execute tool calls, then loop back with the results ──────────────
    const assistantMsg = {
      role: 'assistant',
      content: text || '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.input ?? {}) },
      })),
    };
    messages.push(assistantMsg);

    for (const tc of toolCalls) {
      yield {
        event: 'tool_call',
        data: { toolName: tc.name, toolCallId: tc.id, input: tc.input },
      };

      let output;
      try {
        let permission = allowAll.has(tc.name) ? 'allow' : null;
        if (!permission && onPermissionRequest) {
          permission = await onPermissionRequest(tc.name, tc.id, tc.input);
        }
        if (permission === 'deny') {
          output = { error: 'User denied permission' };
        } else {
          if (permission === 'allow-session') allowAll.add(tc.name);
          output = await executeLocalTool(tc.name, tc.input, mode);
        }
      } catch (e) {
        output = { error: e?.message || String(e) };
      }

      const serialized = JSON.stringify(output ?? null).slice(0, TOOL_RESULT_CAP);
      yield {
        event: 'tool_result',
        data: {
          toolCallId: tc.id,
          output: output && typeof output === 'object' && output.error ? undefined : output,
          error:
            output && typeof output === 'object' && output.error ? output.error : undefined,
        },
      };
      messages.push({ role: 'tool', tool_call_id: tc.id, content: serialized });
    }
  }

  // Hit the iteration cap
  yield {
    event: 'error',
    data: { message: `Stopped after ${MAX_ITERATIONS} tool iterations.` },
  };
  yield { event: 'done', data: {} };
}
