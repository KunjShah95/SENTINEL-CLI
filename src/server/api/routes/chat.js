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
import { z } from '../../../shared/schemas/index.js';
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

const require = createRequire(import.meta.url);

const chat = new Hono();

chat.use('*', requireCreditsBalance());

const submitSchema = z.object({
  id: z.string(),
  messages: z.array(z.object({})).min(1),
  mode: z.enum(['BUILD', 'PLAN', 'REVIEW']),
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

chat.post('/', async c => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error?.message || 'Invalid request' }, 400);
  }
  const { id, messages, mode, model } = parsed.data;

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

  const startTime = Date.now();
  let completedUsage = null;
  let finalMessages = null;
  let aborted = false;

  const stream = await pickStreamer().stream({
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

  // Background tasks: persist + bill. Fire-and-forget; the response has
  // already been sent so we just attach a handler.
  (async () => {
    try {
      // Wait for the stream to fully drain by attaching to it.
      await stream.cancel().catch(() => {});
    } catch {
      // ignore
    }
    if (aborted) return;
    if (finalMessages && finalMessages.length > 0) {
      const last = finalMessages[finalMessages.length - 1];
      if (hasPendingToolCalls(last)) return;
      try {
        await appendMessages({ id, userId, messages: finalMessages });
      } catch (e) {
        console.error('[chat] persist failed:', e.message);
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
        console.error('[chat] billing failed:', e.message);
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});

function pickStreamer() {
  const hasKey = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'].some(
    k => process.env[k]
  );
  if (!hasKey) return { stream: streamWithOrchestrator };
  try {
    require('ai');
    return { stream: streamWithAiSdk };
  } catch {
    return { stream: streamWithOrchestrator };
  }
}

export default chat;
