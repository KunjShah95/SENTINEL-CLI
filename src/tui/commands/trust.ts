import type { CommandContext } from './types.js';

export async function handleTrust(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const target = raw.trim();
  try {
    const { TrustScorer } = await import('../../shared/models/trust-scoring.js');
    const scorer = new TrustScorer();
    if (target) {
      const score = await scorer.getModelScore(target);
      if (!score) { toast.error(`No trust data for model "${target}"`); return; }
      const lines = [
        `## Trust Score: ${target}`, '',
        `  Total issues:  ${score.totalIssues}`,
        `  Confirmed:     ${score.confirmed}`,
        `  False pos:     ${score.falsePositives} (${(score.fpRate * 100).toFixed(1)}% FP rate)`,
        `  Unrated:       ${score.unrated}`,
        `  Accuracy:      ${(score.accuracy * 100).toFixed(1)}%`,
        `  Avg confidence: ${(score.avgConfidence * 100).toFixed(1)}%`,
      ];
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
    } else {
      const stats = await scorer.getStats();
      if (stats.models.length === 0) {
        appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: 'No trust data available yet. Run some reviews first!' }] });
        return;
      }
      const lines = ['## Model Trust Scores', '', 'Ranked by false-positive rate (lowest first):', ''];
      for (const m of stats.models) {
        const icon = m.fpRate === 0 ? '🟢' : m.fpRate < 0.2 ? '🟡' : '🔴';
        lines.push(`  ${icon} ${m.modelId}`);
        lines.push(`      ${m.totalIssues} issues · ${(m.accuracy * 100).toFixed(1)}% accuracy · ${(m.fpRate * 100).toFixed(1)}% FP · ${m.unrated} unrated`);
        lines.push('');
      }
      lines.push('> Use `/trust <modelId>` for details, `/feedback <issueId> accurate|fp` to rate.');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
    }
  } catch (e) { toast.error('Trust command failed: ' + String(e)); }
}

export async function handleFeedback(ctx: CommandContext) {
  const { args: raw, toast } = ctx;
  const args = raw.trim();
  if (!args) { toast.error('Usage: /feedback <issueId> accurate|fp'); return; }
  const parts = args.split(/\s+/);
  if (parts.length < 2) { toast.error('Usage: /feedback <issueId> accurate|fp'); return; }
  const [issueId, verdict] = parts;
  if (verdict !== 'accurate' && verdict !== 'fp') { toast.error('Verdict must be "accurate" or "fp"'); return; }
  try {
    const { TrustScorer } = await import('../../shared/models/trust-scoring.js');
    const scorer = new TrustScorer();
    const ok = await scorer.recordFeedback(issueId, verdict === 'accurate');
    if (ok) { toast.success(`Feedback recorded: ${issueId} → ${verdict}`); }
    else { toast.error('Could not record feedback — issue ID not found'); }
  } catch (e) { toast.error('Feedback failed: ' + String(e)); }
}
