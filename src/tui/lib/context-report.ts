/**
 * /context — context budget report (MiniMax Code transcript/
 * context-visualization.ts + capacity-meter.ts, rendered as Markdown text).
 * Pure: estimates from the message parts currently in the session.
 */
type Part = { type: string; text?: string; toolName?: string; input?: unknown; output?: unknown };
type Msg = { role: string; parts: Part[] };

const est = (s: string) => Math.ceil(s.length / 3.8);
const size = (v: unknown) => {
  if (v == null) return 0;
  if (typeof v === 'string') return v.length;
  try { return JSON.stringify(v).length; } catch { return 0; }
};

export function measureContext(messages: Msg[]) {
  const buckets = { user: 0, assistant: 0, reasoning: 0, toolCalls: 0, toolOutput: 0 };
  const byTool: Record<string, number> = {};
  for (const m of messages) {
    for (const p of m.parts || []) {
      if (p.type === 'text') {
        if (m.role === 'user') buckets.user += est(p.text || '');
        else buckets.assistant += est(p.text || '');
      } else if (p.type === 'reasoning') {
        buckets.reasoning += est(p.text || '');
      } else if (p.type === 'tool-call') {
        const input = Math.ceil(size(p.input) / 3.8);
        const output = Math.ceil(size(p.output) / 3.8);
        buckets.toolCalls += input;
        buckets.toolOutput += output;
        const k = p.toolName || 'tool';
        byTool[k] = (byTool[k] || 0) + input + output;
      }
    }
  }
  const total = Object.values(buckets).reduce((a, b) => a + b, 0);
  return { buckets, byTool, total };
}

export function bar(ratio: number, width = 24): string {
  const r = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
  const filled = Math.round(r * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
}

export function formatContextReport(messages: Msg[], limit: number): string {
  const { buckets, byTool, total } = measureContext(messages);
  const ratio = limit > 0 ? total / limit : 0;
  const rows = [
    ['User', buckets.user],
    ['Assistant', buckets.assistant],
    ['Reasoning', buckets.reasoning],
    ['Tool calls', buckets.toolCalls],
    ['Tool output', buckets.toolOutput],
  ] as const;
  const top = Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lines = [
    '## Context',
    '',
    `\`${bar(ratio)}\` **${Math.round(ratio * 100)}%** — ~${total.toLocaleString()} / ${limit.toLocaleString()} tokens`,
    '',
    ...rows.map(([k, v]) => `- ${k.padEnd(12)} \`${bar(total ? v / total : 0, 12)}\` ~${v.toLocaleString()}`),
  ];
  if (top.length) {
    lines.push('', '**Heaviest tools**', ...top.map(([k, v]) => `- ${k}: ~${v.toLocaleString()}`));
  }
  lines.push('', ratio >= 0.7 ? 'Run `/compact` to summarize and free context.' : 'Plenty of room left.');
  return lines.join('\n');
}
