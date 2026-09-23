/**
 * TUI API client — now a LOCAL facade. There is no server: sessions are JSON
 * files under ~/.sentinel/sessions and chat streams come straight from the
 * in-process agent loop (src/agent/loop.js). Exported shapes are identical to
 * the old HTTP client so screens/hooks need no rewrites.
 */
import { sessions as store } from '../../agent/sessions.js';
import { runAgentTurn } from '../../agent/loop.js';

export type ChatEvent =
  | { event: 'text'; data: { delta: string } }
  | { event: 'tool_call'; data: { toolName: string; toolCallId: string; input: unknown } }
  | { event: 'tool_result'; data: { toolCallId: string; output?: unknown; error?: string } }
  | { event: 'reasoning'; data: { text: string } }
  | {
      event: 'finish';
      data: {
        usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
        costUsd?: number;
        model?: string;
      };
    }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: Record<string, unknown> };

export const Sessions = {
  list: () => store.list(),
  get: (id: string) => store.get(id),
  create: (body: { title: string; mode?: string; model?: string; projectPath?: string }) =>
    store.create(body),
  delete: (id: string) => store.delete(id),
};

/** Local identity — no accounts, no billing (kept for API compatibility). */
export const Auth = {
  async devLogin() {
    return { token: 'local', userId: 'local-user' };
  },
  async devLogout() {
    return true;
  },
  async ensure() {
    return { token: 'local', userId: 'local-user' };
  },
};

/** No server exists anymore — kept so old call sites keep working. */
export async function checkServerHealth(): Promise<boolean> {
  return false;
}

type StreamChatBody = {
  id: string;
  messages: Array<{
    id: string;
    role: string;
    content?: string;
    parts?: unknown[];
    metadata?: Record<string, unknown>;
  }>;
  mode: string;
  model: string;
};

type StreamChatOptions = {
  signal?: AbortSignal;
  onPermissionRequest?: (
    toolName: string,
    toolCallId: string,
    input: unknown
  ) => Promise<'allow' | 'deny' | 'allow-session'>;
};

/**
 * Stream a chat turn from the in-process agent loop. Persists the exchange
 * to the local session store when the turn finishes (best-effort).
 */
export async function* streamChat(
  body: StreamChatBody,
  options: StreamChatOptions = {}
): AsyncGenerator<ChatEvent> {
  const uiMessages = body.messages as unknown as Array<{
    id: string;
    role: string;
    content?: string;
    parts?: Array<Record<string, unknown>>;
  }>;

  let finalText = '';
  for await (const ev of runAgentTurn({
    history: uiMessages,
    mode: body.mode,
    model: body.model,
    signal: options.signal,
    onPermissionRequest: options.onPermissionRequest,
  })) {
    if (ev.event === 'text') finalText += (ev.data as { delta: string }).delta;
    yield ev as ChatEvent;
  }

  try {
    if (body.id && finalText) {
      const lastUser = [...uiMessages].reverse().find((m) => m.role === 'user');
      const toSave: unknown[] = [];
      if (lastUser) {
        toSave.push({
          id: lastUser.id,
          role: 'user',
          content:
            lastUser.content ??
            (lastUser.parts || [])
              .filter((p) => (p as any).type === 'text')
              .map((p) => (p as any).text)
              .join('\n'),
          parts: lastUser.parts,
        });
      }
      toSave.push({
        id: `asmt_${Date.now()}`,
        role: 'assistant',
        content: finalText,
        metadata: { mode: body.mode, model: body.model },
      });
      const existing = await store.get(body.id);
      if (existing) await store.appendMessages({ id: body.id, messages: toSave as any });
    }
  } catch {
    // best-effort persistence
  }
}
