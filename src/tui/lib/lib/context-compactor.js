/**
 * Context Compactor — inspired by Codex CLI's context compaction.
 *
 * When chat history grows too long (>30 messages or >40k estimated tokens),
 * summarises older messages into a compact synthetic assistant message so the
 * active context stays manageable without losing essential information.
 */
// ─── Token estimation ─────────────────────────────────────────────────────────
/**
 * Rough token estimator: ~4 chars per token.
 * Sums all text and reasoning part lengths across every message.
 */
export function estimateTokens(messages) {
  let charCount = 0;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'text' || part.type === 'reasoning') {
        charCount += part.text.length;
      }
      else if (part.type === 'tool-call') {
        // Include serialised input/output in the estimate
        try {
          charCount += JSON.stringify(part.input).length;
        }
        catch { }
        if (part.output !== undefined) {
          try {
            charCount += JSON.stringify(part.output).length;
          }
          catch { }
        }
        if (part.errorText)
          charCount += part.errorText.length;
      }
    }
  }
  // More accurate token estimation: ~3.5 chars per token for code, ~4.5 for prose
  // Using 3.8 as a blended rate which is closer to observed tokenizer behavior
  return Math.ceil(charCount / 3.8);
}
// ─── Compaction trigger ───────────────────────────────────────────────────────
/**
 * Returns true if compaction should be triggered.
 * Defaults: 30 messages or 40 000 estimated tokens.
 */
export function shouldCompact(messages, options) {
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
export async function compactMessages(messages, submitAndWait, options) {
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
          if (p.type === 'text' || p.type === 'reasoning')
            return p.text;
          if (p.type === 'tool-call')
            return `[tool: ${p.toolName}]`;
          return '';
        })
        .join(' ')
        .slice(0, 200);
      return `${role}: ${text}`;
    })
    .join('\n');
  const summaryPrompt = `You are a context compactor. Summarize the following conversation history into a JSON object with these EXACT fields:
- "filesRead": array of file paths that were read, created, or modified
- "issuesFound": array of { file, line?, severity, title } for each bug or issue discovered (omit fixed issues)
- "fixesApplied": array of { file, description } for changes that were made
- "decisions": array of key architectural or design decisions made (max 5)
- "summary": 2-3 sentence plain-text overview including what was accomplished and what remains

CRITICAL: Preserve all file paths and line numbers exactly. Do not invent issues or fixes.
Output ONLY valid JSON, no markdown fences, no extra text.

Conversation:\n\n${headText}`;
  onProgress?.('summarizing');
  let summary;
  try {
    summary = await submitAndWait(summaryPrompt, 'PLAN');
  }
  catch {
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
  let displayText;
  try {
    const parsed = JSON.parse(summary);
    const lines = [`**[Compacted Context — ${head.length} messages summarized]**`];
    if (parsed.summary)
      lines.push('', parsed.summary);
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
      lines.push('', '**Decisions:**');
      for (const d of parsed.decisions) {
        lines.push(`  - ${d}`);
      }
    }
    displayText = lines.join('\n');
  }
  catch {
    displayText = `**[Compacted Context — ${head.length} messages summarized]**\n\n${summary}`;
  }
  const syntheticMessage = {
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
export function formatTokenUsage(messages) {
  const limit = 40_000;
  const estimated = estimateTokens(messages);
  const remaining = Math.max(0, limit - estimated);
  const fmt = (n) => n.toLocaleString('en-US');
  return `~${fmt(estimated)} tokens used · ${fmt(remaining)} remaining (40k limit)`;
}
