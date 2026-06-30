import { parseReviewResponse, type ReviewIssue } from './security-reviewer.js';
import { titleSimilarity, severityRank } from './deduplicate.js';

// ─── Configuration ─────────────────────────────────────────────────

export type EnsembleModelConfig = {
  id: string;         // e.g. "claude-sonnet-4-6"
  label: string;      // "Claude Sonnet"
  role: 'reviewer' | 'critic';  // Is this the Critic?
  weight: number;     // Confidence multiplier
};

export const DEFAULT_ENSEMBLE: EnsembleModelConfig[] = [
  { id: 'llama-3.3-70b-specdec', label: 'Llama 3.3', role: 'critic', weight: 2.0 },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', role: 'reviewer', weight: 1.0 },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1', role: 'reviewer', weight: 0.7 },
];

// ─── Consensus scoring ─────────────────────────────────────────────

export type ScoredIssue = ReviewIssue & {
  ensembleConfidence: number;   // 0.0 to 1.0
  agreedBy: string[];           // Models that flagged this issue
  vetoedByCritic?: boolean;     // True if non-critic models flagged but Critic didn't
};

export function scoreByConsensus(
  allResults: Array<{ modelId: string; label: string; issues: ReviewIssue[]; weight: number; isCritic: boolean }>,
  similarityThreshold: number = 0.5
): ScoredIssue[] {
  // 1. Flatten all issues with origin tracking
  const flattened: Array<{ issue: ReviewIssue; modelId: string; label: string; weight: number; isCritic: boolean }> = [];
  for (const result of allResults) {
    for (const issue of result.issues) {
      flattened.push({ issue, ...result });
    }
  }

  // 2. Cluster by Jaccard similarity of title + same file + same line
  const clusters: Array<{
    issues: typeof flattened;
    models: Set<string>;
    modelLabels: Set<string>;
    criticPresent: boolean;
  }> = [];

  for (const item of flattened) {
    let matched = false;
    for (const cluster of clusters) {
      const representative = cluster.issues[0].issue;
      const sim = titleSimilarity(item.issue.title, representative.title);
      const sameFile = (item.issue.file ?? '') === (representative.file ?? '');
      const sameLine = item.issue.line === representative.line || (item.issue.line == null && representative.line == null);

      if (sim > similarityThreshold && sameFile && sameLine) {
        cluster.issues.push(item);
        cluster.models.add(item.modelId);
        cluster.modelLabels.add(item.label);
        if (item.isCritic) cluster.criticPresent = true;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({
        issues: [item],
        models: new Set([item.modelId]),
        modelLabels: new Set([item.label]),
        criticPresent: item.isCritic,
      });
    }
  }

  // 3. Score each cluster
  const scored: ScoredIssue[] = [];

  for (const cluster of clusters) {
    // Pick representative issue with highest model config weight
    const bestIssue = cluster.issues.reduce((best, curr) =>
      (curr.weight > best.weight) ? curr : best
    , cluster.issues[0]).issue;

    const modelCount = cluster.models.size;
    const hasCritic = cluster.criticPresent;
    const totalModels = allResults.length;

    let confidence: number;
    let vetoed = false;

    if (hasCritic) {
      // Critic validated: base confidence = 0.7, increments with more agreements
      confidence = Math.min(1.0, 0.7 + (modelCount - 1) * 0.15);
    } else if (modelCount >= 2) {
      // Non-critic models agree, but Critic did not validate it (Veto / Demote)
      confidence = 0.5;
      vetoed = true;
    } else {
      // Single model flagging (Critic absent)
      confidence = 0.3;
    }

    scored.push({
      ...bestIssue,
      provenance: {
        ...bestIssue.provenance,
        confidence,
      },
      ensembleConfidence: confidence,
      agreedBy: Array.from(cluster.modelLabels),
      vetoedByCritic: vetoed,
    } as ScoredIssue);
  }

  // 4. Sort: highest confidence first, then by severity rank, then alphabetically
  return scored.sort((a, b) => {
    const confOrder = b.ensembleConfidence - a.ensembleConfidence;
    if (Math.abs(confOrder) > 0.01) return confOrder;
    const sevOrder = severityRank(b.severity) - severityRank(a.severity);
    if (sevOrder !== 0) return sevOrder;
    const fileA = a.file ?? '';
    const fileB = b.file ?? '';
    if (fileA !== fileB) return fileA.localeCompare(fileB);
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

// ─── Main Orchestration ───────────────────────────────────────────

export type EnsembleResult = {
  issues: ScoredIssue[];
  modelResults: Array<{ modelId: string; label: string; issues: ReviewIssue[]; durationMs: number }>;
  totalDurationMs: number;
  configuration: EnsembleModelConfig[];
};

export async function runEnsembleReview(
  diff: string,
  files: string[],
  submitWithModel: (prompt: string, modelId: string) => Promise<string>,
  config: EnsembleModelConfig[] = DEFAULT_ENSEMBLE
): Promise<EnsembleResult> {
  const wallStart = Date.now();

  const { buildReviewPrompt, getVulnerabilityContext } = await import('./security-reviewer.js');
  
  // Fetch security/vuln DB context for targeted files
  const vulnContext = await getVulnerabilityContext(files, []);
  const prompt = buildReviewPrompt(diff, { files, contextInjection: vulnContext, focus: 'security' });

  // Execute review across all models concurrently
  const modelResults = await Promise.all(
    config.map(async (modelCfg) => {
      const start = Date.now();
      try {
        const text = await submitWithModel(prompt, modelCfg.id);
        const parsed = parseReviewResponse(text, files);
        return {
          modelId: modelCfg.id,
          label: modelCfg.label,
          issues: parsed.issues,
          durationMs: Date.now() - start,
        };
      } catch (e) {
        return {
          modelId: modelCfg.id,
          label: modelCfg.label,
          issues: [],
          durationMs: Date.now() - start,
        };
      }
    })
  );

  // Score by consensus
  const scoredIssues = scoreByConsensus(
    modelResults.map((r, i) => ({
      modelId: r.modelId,
      label: r.label,
      issues: r.issues,
      weight: config[i].weight,
      isCritic: config[i].role === 'critic',
    }))
  );

  return {
    issues: scoredIssues,
    modelResults,
    totalDurationMs: Date.now() - wallStart,
    configuration: config,
  };
}

// ─── Formatting Results ───────────────────────────────────────────

export function formatEnsembleResult(result: EnsembleResult): string {
  const lines: string[] = [];
  lines.push('## ⊕ Multi-Model Ensemble Review');
  lines.push('');

  // Performance / speed report
  lines.push('### Model Pipeline Performance');
  for (const mr of result.modelResults) {
    const isCritic = result.configuration.find(c => c.id === mr.modelId)?.role === 'critic';
    lines.push(`- ${isCritic ? '★ **[Critic]**' : '○'} **${mr.label}** — ${mr.issues.length} issues flagged (${(mr.durationMs / 1000).toFixed(1)}s)`);
  }
  lines.push('');

  const highConf = result.issues.filter(i => i.ensembleConfidence >= 0.7);
  const medConf = result.issues.filter(i => i.ensembleConfidence >= 0.4 && i.ensembleConfidence < 0.7);
  const lowConf = result.issues.filter(i => i.ensembleConfidence < 0.4);

  lines.push(`### Consensus Breakdown`);
  lines.push(`- **✅ High Confidence** (Critic Approved + Agreed): ${highConf.length}`);
  lines.push(`- **⚠️ Medium Confidence** (Reviewer Agreed, Critic Vetoed): ${medConf.length}`);
  lines.push(`- **❓ Low Confidence** (Single Model Findings): ${lowConf.length}`);
  lines.push('');

  if (result.issues.length === 0) {
    lines.push('> 🎉 **No security findings detected across the model ensemble!**');
    return lines.join('\n');
  }

  lines.push('### Scored Findings');
  lines.push('');

  for (const issue of result.issues) {
    const confIcon = issue.ensembleConfidence >= 0.7 ? '✅' :
                     issue.ensembleConfidence >= 0.4 ? '⚠️' : '❓';
    const vetoTag = issue.vetoedByCritic ? ' **[Critic Vetoed]**' : '';
    const sevIcon = issue.severity === 'critical' ? '🔴' :
                    issue.severity === 'high' ? '🟠' :
                    issue.severity === 'medium' ? '🟡' : '🟢';

    lines.push(`#### ${confIcon} ${sevIcon} [${(issue.ensembleConfidence * 100).toFixed(0)}%] ${issue.title}${vetoTag}`);
    lines.push(`- **Location**: ${issue.file ? '`' + issue.file + '`' : 'Workspace'}${issue.line ? ':' + issue.line : ''}`);
    lines.push(`- **Description**: ${issue.description}`);
    if (issue.suggestion) {
      lines.push(`- **💡 Recommendation**: ${issue.suggestion}`);
    }
    lines.push(`- **Agreed By**: _${issue.agreedBy.join(', ')}_`);
    lines.push('');
  }

  return lines.join('\n');
}
