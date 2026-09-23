import type { AgentMessage } from '../hooks/use-agent-chat.js';

/** Async function that submits a prompt and waits for the agent turn to finish. */
type SubmitAndWait = (prompt: string, mode?: "BUILD" | "PLAN" | "REVIEW") => Promise<string>;

import {
  estimateTokens as estimateTokensShared,
  getCompactionState as getStateShared,
  formatTokenUsage as formatTokenUsageShared,
} from '../../agent/context.js';

export type CompactionResult = {
  messages: AgentMessage[];
  compacted: boolean;
  oldCount: number;
  newCount: number;
  estimatedTokensSaved: number;
  zone?: 'async' | 'sync';
};

export type CompactionState = {
  estimatedTokens: number;
  atAsyncThreshold: boolean;
  atSyncThreshold: boolean;
  percentage: number;
};

const DEFAULT_MAX_TOKENS = 40_000;
const ASYNC_THRESHOLD = 0.60;
const SYNC_THRESHOLD = 0.80;
const FROZEN_COUNT = 2;
const ACTIVE_COUNT = 8;

export function estimateTokens(messages: AgentMessage[]): number {
  return estimateTokensShared(messages as any);
}

export function getCompactionState(
  messages: AgentMessage[],
  options?: { maxTokens?: number }
): CompactionState {
  return getStateShared(messages as any, options) as CompactionState;
}

export function shouldCompact(
  messages: AgentMessage[],
  options?: {
    maxTokens?: number;
  }
): boolean {
  return getStateShared(messages as any, options).atAsyncThreshold;
}

export async function compactMessages(
  messages: AgentMessage[],
  submitAndWait: SubmitAndWait,
  options?: {
    keepTail?: number;
    onProgress?: (phase: 'summarizing' | 'done') => void;
    maxTokens?: number;
  }
): Promise<CompactionResult> {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const keepTail = options?.keepTail ?? ACTIVE_COUNT;
  const onProgress = options?.onProgress;
  const state = getCompactionState(messages, { maxTokens });
  const isSync = state.atSyncThreshold;

  if (messages.length <= keepTail + FROZEN_COUNT) {
    return {
      messages,
      compacted: false,
      oldCount: messages.length,
      newCount: messages.length,
      estimatedTokensSaved: 0,
    };
  }

  const frozen = messages.slice(0, FROZEN_COUNT);
  const compressZone = messages.slice(FROZEN_COUNT, -keepTail);
  const activeZone = messages.slice(-keepTail);

  const headText = compressZone
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
    `You are a context compactor. Summarize the following conversation history into a JSON object with these EXACT fields:
- "filesRead": array of file paths that were read, created, or modified
- "issuesFound": array of { file, line?, severity, title } for each bug or issue discovered (omit fixed issues)
- "fixesApplied": array of { file, description } for changes that were made
- "decisions": array of key architectural or design decisions made (max 5)
- "summary": 2-3 sentence plain-text overview including what was accomplished and what remains

CRITICAL: Preserve all file paths and line numbers exactly. Do not invent issues or fixes.
Output ONLY valid JSON, no markdown fences, no extra text.

Conversation:\n\n${headText}`;

  onProgress?.('summarizing');

  let summary: string;
  try {
    summary = await submitAndWait(summaryPrompt);
  } catch {
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

  const tokensBefore = estimateTokens(compressZone);

  let displayText: string;
  try {
    const parsed = JSON.parse(summary);
    const lines: string[] = [`**[Compacted Context — ${compressZone.length} messages summarized (${isSync ? 'emergency' : 'background'})]**`];
    if (parsed.summary) lines.push('', parsed.summary);
    if (Array.isArray(parsed.filesRead) && parsed.filesRead.length > 0) {
      lines.push('', `**Files read:** ${parsed.filesRead.join(', ')}`);
    }
    if (Array.isArray(parsed.issuesFound) && parsed.issuesFound.length > 0) {
      lines.push('', `**Issues found (${parsed.issuesFound.length}):**`);
      for (const issue of parsed.issuesFound.slice(0, 5)) {
        const loc = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '';
        lines.push(`  - [${issue.severity || '?'}] ${loc} ${issue.title}`);
      }
    }
    if (Array.isArray(parsed.fixesApplied) && parsed.fixesApplied.length > 0) {
      lines.push('', `**Fixes applied (${parsed.fixesApplied.length}):**`);
      for (const fix of parsed.fixesApplied) {
        lines.push(`  - ${fix.file}: ${fix.description}`);
      }
    }
    if (Array.isArray(parsed.decisions) && parsed.decisions.length > 0) {
      lines.push('', `**Decisions:**`);
      for (const d of parsed.decisions) {
        lines.push(`  - ${d}`);
      }
    }
    displayText = lines.join('\n');
  } catch {
    displayText = `**[Compacted Context — ${compressZone.length} messages summarized (${isSync ? 'emergency' : 'background'})]**\n\n${summary}`;
  }

  const syntheticMessage: AgentMessage = {
    id: `compaction-${Date.now()}`,
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: displayText,
      },
    ],
    timestamp: Date.now(),
  };

  const newMessages = [...frozen, syntheticMessage, ...activeZone];
  const tokensAfter = estimateTokens([syntheticMessage]);

  return {
    messages: newMessages,
    compacted: true,
    oldCount: messages.length,
    newCount: newMessages.length,
    estimatedTokensSaved: Math.max(0, tokensBefore - tokensAfter),
    zone: isSync ? 'sync' : 'async',
  };
}

export function formatTokenUsage(messages: AgentMessage[], maxTokens?: number): string {
  return formatTokenUsageShared(messages as any, maxTokens);
}
