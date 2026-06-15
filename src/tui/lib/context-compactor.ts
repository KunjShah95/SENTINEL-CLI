/**
 * Context Compactor — inspired by Codex CLI's context compaction.
 *
 * When chat history grows too long (>30 messages or >40k estimated tokens),
 * summarises older messages into a compact synthetic assistant message so the
 * active context stays manageable without losing essential information.
 */

import type { AgentMessage } from '../hooks/use-agent-chat.js';
import type { SubmitAndWait } from './loop-engine.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export type CompactionResult = {
  messages: AgentMessage[];
  compacted: boolean;
  oldCount: number;
  newCount: number;
  estimatedTokensSaved: number;
};

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Rough token estimator: ~4 chars per token.
 * Sums all text and reasoning part lengths across every message.
 */
export function estimateTokens(messages: AgentMessage[]): number {
  let charCount = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'text' || part.type === 'reasoning') {
        charCount += part.text.length;
      } else if (part.type === 'tool-call') {
        // Include serialised input/output in the estimate
        try { charCount += JSON.stringify(part.input).length; } catch {}
        if (part.output !== undefined) {
          try { charCount += JSON.stringify(part.output).length; } catch {}
        }
        if (part.errorText) charCount += part.errorText.length;
      }
    }
  }
  return Math.ceil(charCount / 4);
}

// ─── Compaction trigger ───────────────────────────────────────────────────────

/**
 * Returns true if compaction should be triggered.
 * Defaults: 30 messages or 40 000 estimated tokens.
 */
export function shouldCompact(
  messages: AgentMessage[],
  options?: {
    maxMessages?: number;
    maxTokens?: number;
  }
): boolean {
  const maxMessages = options?.maxMessages ?? 30;
  const maxTokens = options?.maxTokens ?? 40_000;
  return messages.length >= maxMessages || estimateTokens(messages) >= maxTokens;
}

// ─── Compaction ───────────────────────────────────────────────────────────────

/**
 * Compact messages by summarising everything except the last `keepTail`
 * messages. The summary is injected as a synthetic assistant message at
 * position 0 of the returned array.
 */
export async function compactMessages(
  messages: AgentMessage[],
  submitAndWait: SubmitAndWait,
  options?: {
    /** Number of recent messages to keep verbatim (default 8). */
    keepTail?: number;
    onProgress?: (phase: 'summarizing' | 'done') => void;
  }
): Promise<CompactionResult> {
  const keepTail = options?.keepTail ?? 8;
  const onProgress = options?.onProgress;

  // Need at least keepTail + 1 messages to bother compacting.
  if (messages.length <= keepTail) {
    return {
      messages,
      compacted: false,
      oldCount: messages.length,
      newCount: messages.length,
      estimatedTokensSaved: 0,
    };
  }

  const head = messages.slice(0, -keepTail);
  const tail = messages.slice(-keepTail);

  // Build a text representation of the head messages.
  const headText = head
    .map((msg) => {
      const role = msg.role.toUpperCase();
      const text = msg.parts
        .map((p) => {
          if (p.type === 'text' || p.type === 'reasoning') return p.text;
          if (p.type === 'tool-call') return `[tool: ${p.toolName}]`;
          return '';
        })
        .join(' ')
        .slice(0, 200);
      return `${role}: ${text}`;
    })
    .join('\n');

  const summaryPrompt =
    `You are a context compactor. Summarize the following conversation history into 3-5 bullet points capturing the key decisions, code changes made, and issues found. Be specific about file names and actions taken. Output ONLY the bullet list.\n\n${headText}`;

  onProgress?.('summarizing');

  let summary: string;
  try {
    summary = await submitAndWait(summaryPrompt, 'PLAN');
  } catch {
    // If summarisation fails, return the original messages unchanged.
    onProgress?.('done');
    return {
      messages,
      compacted: false,
      oldCount: messages.length,
      newCount: messages.length,
      estimatedTokensSaved: 0,
    };
  }

  onProgress?.('done');

  const tokensBefore = estimateTokens(head);

  const syntheticMessage: AgentMessage = {
    id: `compaction-${Date.now()}`,
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: `**[Compacted Context — ${head.length} messages summarized]**\n\n${summary}`,
      },
    ],
    timestamp: Date.now(),
  };

  const newMessages = [syntheticMessage, ...tail];
  const tokensAfter = estimateTokens([syntheticMessage]);

  return {
    messages: newMessages,
    compacted: true,
    oldCount: messages.length,
    newCount: newMessages.length,
    estimatedTokensSaved: Math.max(0, tokensBefore - tokensAfter),
  };
}

// ─── Formatting helper ────────────────────────────────────────────────────────

/**
 * Returns a human-readable token usage line, e.g.:
 * "~1,234 tokens used · 38,766 remaining (40k limit)"
 */
export function formatTokenUsage(messages: AgentMessage[]): string {
  const limit = 40_000;
  const estimated = estimateTokens(messages);
  const remaining = Math.max(0, limit - estimated);
  const fmt = (n: number) => n.toLocaleString('en-US');
  return `~${fmt(estimated)} tokens used · ${fmt(remaining)} remaining (40k limit)`;
}
