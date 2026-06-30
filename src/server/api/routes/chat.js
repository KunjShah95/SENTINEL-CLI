/**
 * Chat route — streams a model response back to the client.
 *
 * Two modes are supported:
 *   - **Vercel AI SDK** (preferred) — when `ai` and a provider package are
 *     installed, this route uses `streamText` for SSE streaming, and pipes
 *     tool calls back to the client.
 *   - **Sentinel streaming** (fallback) — uses the existing
 *     `src/llm/llmOrchestrator.js` to stream tokens. Tool calls are
 *     simulated via a marker convention that the CLI decodes.
 *
 * Mirrors packages/server/src/routes/chat.ts from Nightcode with two key
 * differences:
 *   1. The model registry lives in `src/shared/models` (same shape).
 *   2. The client-side tool execution lives in `src/shared/tools` and is
 *      invoked by the CLI when it receives a `tool_call` SSE event.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { getSession, appendMessages } from '../../database/sessions.js';
import {
  resolveChatModel,
  calculateCreditsForUsage,
  isSupportedChatModel,
  getToolContracts,
} from '../../../shared/index.js';
import { requireCreditsBalance } from '../middleware/credits.js';
import { ingestAiUsage } from '../lib/polar.js';
import { streamWithAiSdk, streamWithOrchestrator } from '../lib/chat-stream.js';
import { buildSystemPrompt } from '../lib/system-prompt.js';
import { createRequire } from 'node:module';
import { SessionLogger } from '../../database/session-logger.js';
import { getLogger } from '../../../utils/structuredLogger.js';
import { validate, chatSubmitSchema } from '../middleware/validate.js';

const chatLogger = getLogger().child({ service: 'chat' });

const require = createRequire(import.meta.url);

const chat = new Hono();

chat.use('*', requireCreditsBalance());

/**
 * Extended submit schema that includes the `isSupportedChatModel` refinement.
 * The base chatSubmitSchema from validate.js handles shape; we layer the
 * model refinement here since it requires a runtime import.
 */
const submitSchema = chatSubmitSchema.extend({
  model: z.string().refine(isSupportedChatModel, 'Unsupported model'),
});

function hasPendingToolCalls(message) {
  if (!message?.parts) return false;
  return message.parts.some(
    p =>
      (p.type === 'dynamic-tool' || p.type?.startsWith?.('tool-')) &&
      p.state !== 'output-available' &&
      p.state !== 'output-error'
  );
}

chat.post('/',
  validate({ body: submitSchema }),
  async c => {
    const userId = c.get('userId');
    const { id, messages, mode, model } = c.get('validatedBody');

    const session = await getSession({ id, userId });
  if (!session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  const resolved = resolveChatModel(model);
  const tools = getToolContracts(mode);
  const systemPrompt = buildSystemPrompt({ mode });

  // Merge incoming messages with stored ones by id.
  const previous =
    typeof session.messages === 'string' ? JSON.parse(session.messages) : session.messages || [];
  const byId = new Map();
  for (const m of previous) byId.set(m.id, m);
  for (const m of messages) {
    m.metadata = { ...(m.metadata || {}), mode, model };
    byId.set(m.id, m);
  }
  const merged = Array.from(byId.values());

  let completedUsage = null;
  let finalMessages = null;
  let aborted = false;

  const stream = await pickStreamer(resolved.provider).stream({
    system: systemPrompt,
    messages: merged,
    tools,
    modelId: resolved.modelId,
    provider: resolved.provider,
    providerOptions: resolved.providerOptions,
    onUsage: u => {
      completedUsage = u;
    },
  });

  // Read the stream; we need to capture the final message list AND forward
  // SSE frames to the client.
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value.kind === 'ui-message') {
            finalMessages = value.messages;
          } else if (value.kind === 'usage') {
            completedUsage = value.usage;
          } else if (value.kind === 'aborted') {
            aborted = true;
          }
          controller.enqueue(encoder.encode(value.frame));
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ message: e.message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  // Background tasks: persist + bill + log. Fire-and-forget; the response has
  // already been sent so we just attach a handler.
  (async () => {
    const logger = new SessionLogger({ sessionId: id });
    await logger.start(id);
    await logger.logLLMRequest({
      model: resolved.modelId,
      messages: messages.slice(-3),
      tools: Object.keys(tools || {}),
      maxTokens: resolved.maxTokens || 4096,
    });

    try {
      await stream.cancel().catch(() => {});
    } catch {
      // stream already drained
    }

    if (completedUsage) {
      await logger.logLLMResponse({
        model: resolved.modelId,
        usage: completedUsage,
        finishReason: aborted ? 'aborted' : 'stop',
      });
    } else {
      await logger.logLLMResponse({
        model: resolved.modelId,
        usage: {},
        finishReason: aborted ? 'aborted' : 'unknown',
      });
    }

    if (aborted) {
      await logger.end({ duration: 0, totalMessages: merged.length, totalToolCalls: 0, totalErrors: 1 });
      return;
    }

    if (finalMessages && finalMessages.length > 0) {
      const last = finalMessages[finalMessages.length - 1];
      if (hasPendingToolCalls(last)) {
        await logger.end({ duration: 0, totalMessages: merged.length, totalToolCalls: 0, totalErrors: 0 });
        return;
      }
      try {
        await appendMessages({ id, userId, messages: finalMessages });
      } catch (e) {
        chatLogger.error('persist failed', { err: e });
        await logger.logLLMError(new Error(e.message));
      }
    }

    if (completedUsage) {
      try {
        const { credits } = calculateCreditsForUsage({
          provider: resolved.provider,
          model: resolved.modelId,
          usage: completedUsage,
        });
        await ingestAiUsage({
          externalCustomerId: userId,
          eventId: `chat-message:${id}:${Date.now()}`,
          credits,
          provider: resolved.provider,
          model: resolved.modelId,
          sessionId: id,
        });
      } catch (e) {
        chatLogger.error('billing failed', { err: e });
      }
    }

    await logger.end({
      duration: completedUsage?.totalDuration || 0,
      totalMessages: finalMessages?.length || merged.length,
      totalToolCalls: 0,
      totalErrors: aborted ? 1 : 0,
    });
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});

const PROVIDER_KEY_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  together: 'TOGETHER_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  perplexity: 'PERPLEXITY_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'github-copilot': 'GITHUB_TOKEN',
};

const LOCAL_STREAM_PROVIDERS = new Set(['ollama', 'lmstudio']);

function pickStreamer(provider) {
  // Route to the AI SDK only when the provider can actually be served:
  //   - local providers (Ollama / LM Studio) need no key, OR
  //   - the cloud provider's API key is present.
  // Otherwise use the orchestrator, which degrades gracefully to a local
  // response instead of erroring on a keyless cloud provider.
  //
  // Probe with require.resolve, NOT require: the AI SDK packages are ESM-only,
  // so require() throws ERR_REQUIRE_ESM; resolve just checks they're installed,
  // and streamWithAiSdk loads them via dynamic import().
  const isLocal = LOCAL_STREAM_PROVIDERS.has(provider);
  const hasKey = provider && PROVIDER_KEY_ENV[provider] && !!process.env[PROVIDER_KEY_ENV[provider]];

  if (isLocal || hasKey) {
    try {
      require.resolve('ai');
      if (isLocal) require.resolve('@ai-sdk/openai');
      return { stream: streamWithAiSdk };
    } catch {
      // AI SDK not installed — fall through to the orchestrator.
    }
  }
  return { stream: streamWithOrchestrator };
}

export default chat;
