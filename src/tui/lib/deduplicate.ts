import { type ReviewIssue } from './security-reviewer.js';

export const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export function severityRank(sev: string): number {
  return SEVERITY_RANK[sev.toLowerCase()] ?? 0;
}

/**
 * Normalises a title into a set of significant words.
 */
export function titleWords(title: string): Set<string> {
  const STOP = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'is', 'are', 'be', 'with', 'for', 'from', 'by', 'not', 'no', 'use', 'using']);
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP.has(w))
  );
}

/**
 * Returns the Jaccard similarity of two title word-sets (0 to 1).
 */
export function titleSimilarity(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 && wb.size === 0) return 1;
  if (wa.size === 0 || wb.size === 0) return 0;
  let intersection = 0;
  for (const w of wa) {
    if (wb.has(w)) intersection++;
  }
  const union = wa.size + wb.size - intersection;
  return intersection / union;
}

/**
 * Two issues are considered duplicates if they reference the same file, the
 * same (or no) line, and their titles share more than 60% of words by Jaccard
 * similarity. When a duplicate pair is found the issue with higher severity is
 * kept; on a tie the first one (lower index) is kept.
 */
export function deduplicateIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const kept: ReviewIssue[] = [];

  for (const candidate of issues) {
    let isDuplicate = false;

    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i];

      // Must reference the same file to be a duplicate
      const sameFile =
        (candidate.file ?? '') === (existing.file ?? '');

      if (!sameFile) continue;

      // Lines must match, or both must be absent
      const sameLine =
        candidate.line === existing.line ||
        (candidate.line == null && existing.line == null);

      if (!sameLine) continue;

      const sim = titleSimilarity(candidate.title, existing.title);
      if (sim > 0.6) {
        // It's a duplicate — keep the higher-severity one
        if (severityRank(candidate.severity) > severityRank(existing.severity)) {
          kept[i] = candidate;
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(candidate);
    }
  }

  return kept;
}

/**
 * Sort merged issues by severity (critical first) then by file+line.
 */
export function sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => {
    const sevDiff = severityRank(b.severity) - severityRank(a.severity);
    if (sevDiff !== 0) return sevDiff;
    const fileA = a.file ?? '';
    const fileB = b.file ?? '';
    if (fileA !== fileB) return fileA.localeCompare(fileB);
    return (a.line ?? 0) - (b.line ?? 0);
  });
}
