export const DEFAULT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'then', 'than', 'have', 'has', 'had', 'was', 'were', 'will', 'would', 'should',
  'could', 'about', 'after', 'before', 'over', 'under', 'update', 'updates', 'fix', 'fixes', 'merge', 'changes', 'change', 'add', 'adds',
  'remove', 'refactor', 'minor', 'small', 'some', 'just', 'only', 'your', 'their', 'there', 'here', 'when', 'where', 'what'
]);

export function tokenizeForSimilarity(text = '', stopwords = DEFAULT_STOPWORDS) {
  return String(text)
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));
}

export function jaccardSimilarity(aTokens = [], bTokens = []) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);

  if (a.size === 0 || b.size === 0) return 0;

  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function fileOverlapScore(currentFiles = [], candidateFiles = []) {
  const a = new Set(currentFiles || []);
  const b = new Set(candidateFiles || []);

  if (a.size === 0 || b.size === 0) return 0;

  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

export function computeDuplicateConfidence({
  prTitle = '',
  prBody = '',
  candidateTitle = '',
  candidateBody = '',
  currentFiles = [],
  candidateFiles = [],
}) {
  const titleScore = jaccardSimilarity(
    tokenizeForSimilarity(prTitle),
    tokenizeForSimilarity(candidateTitle)
  );
  const bodyScore = jaccardSimilarity(
    tokenizeForSimilarity(prBody),
    tokenizeForSimilarity(candidateBody)
  );
  const filesScore = fileOverlapScore(currentFiles, candidateFiles);

  return (0.55 * titleScore) + (0.15 * bodyScore) + (0.30 * filesScore);
}

export function computeRelatedIssueConfidence({
  prTitle = '',
  prBody = '',
  changedFiles = [],
  issueTitle = '',
  issueBody = '',
}) {
  const prTokens = tokenizeForSimilarity(`${prTitle} ${prBody}`);
  const issueTokens = tokenizeForSimilarity(`${issueTitle} ${issueBody}`);
  const fileTokens = tokenizeForSimilarity((changedFiles || []).join(' '));

  const textScore = jaccardSimilarity(prTokens, issueTokens);
  const fileHint = jaccardSimilarity(fileTokens, issueTokens);

  return (0.75 * textScore) + (0.25 * fileHint);
}

export function rankDuplicatePullRequests({
  prTitle = '',
  prBody = '',
  currentFiles = [],
  candidates = [],
  threshold = 0.38,
  limit = 5,
} = {}) {
  return (candidates || [])
    .map((candidate) => {
      const score = computeDuplicateConfidence({
        prTitle,
        prBody,
        candidateTitle: candidate.title || '',
        candidateBody: candidate.body || '',
        currentFiles,
        candidateFiles: candidate.files || [],
      });

      return {
        number: candidate.number,
        title: candidate.title,
        score,
      };
    })
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function rankRelatedIssues({
  prTitle = '',
  prBody = '',
  changedFiles = [],
  issues = [],
  threshold = 0.2,
  limit = 5,
} = {}) {
  return (issues || [])
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url || issue.html_url,
      confidence: computeRelatedIssueConfidence({
        prTitle,
        prBody,
        changedFiles,
        issueTitle: issue.title || '',
        issueBody: issue.body || '',
      }),
    }))
    .filter((item) => item.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

export function normalizeAnnotationPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  return filePath.replace(/^\.\//, '').replace(/^\.\\/, '').replace(/\\/g, '/');
}

export function severityToAnnotationLevel(severity = '') {
  const sev = String(severity).toLowerCase();
  if (sev === 'critical' || sev === 'high') return 'failure';
  if (sev === 'medium' || sev === 'low') return 'warning';
  return 'notice';
}

export function buildCheckAnnotations(issues = [], options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 50;

  return (issues || [])
    .map((issue) => {
      const path = normalizeAnnotationPath(issue.file);
      const hasLine = issue.line !== undefined && issue.line !== null;
      const line = hasLine ? Number(issue.line) : 1;
      if (!path || !Number.isInteger(line) || line < 1) return null;

      return {
        path,
        start_line: line,
        end_line: line,
        annotation_level: severityToAnnotationLevel(issue.severity),
        title: issue.type || issue.title || 'Sentinel finding',
        message: issue.message || issue.description || 'Issue detected',
      };
    })
    .filter(Boolean)
    .slice(0, Math.max(0, limit));
}

export function computeSecurityScore(issues = []) {
  const weights = {
    critical: 40,
    high: 10,
    medium: 3,
    low: 1,
    info: 0,
  };

  const penalty = (issues || []).reduce((sum, issue) => {
    const severity = String(issue.severity || 'info').toLowerCase();
    return sum + (weights[severity] || 0);
  }, 0);

  return Math.max(0, 100 - penalty);
}

export function computeScoreDelta({ baseIssues = [], headIssues = [] } = {}) {
  const baseScore = computeSecurityScore(baseIssues);
  const headScore = computeSecurityScore(headIssues);
  const delta = headScore - baseScore;

  return {
    baseScore,
    headScore,
    delta,
    trend: delta > 0 ? 'improved' : delta < 0 ? 'regressed' : 'unchanged',
  };
}

export function detectPRChangeTypeLabels({
  prTitle = '',
  prBody = '',
  files = [],
  issues = [],
} = {}) {
  const titleBody = `${prTitle} ${prBody}`.toLowerCase();
  const fileNames = (files || []).map((f) => String(f).toLowerCase());
  const findings = issues || [];

  const labels = new Set();

  const hasSecurityIssue = findings.some((i) => ['critical', 'high'].includes(String(i.severity || '').toLowerCase()))
    || findings.some((i) => /(security|xss|sql|injection|csrf|ssrf|secret|auth)/i.test(`${i.type || ''} ${i.message || ''}`));

  if (hasSecurityIssue || /security|vuln|cve|harden|patch/.test(titleBody)) {
    labels.add('security-fix');
  }

  const hasPerfContext = findings.some((i) => /performance|slow|latency|memory|cpu/i.test(`${i.type || ''} ${i.message || ''}`))
    || /perf|performance|optimi[sz]e|latency|throughput/.test(titleBody)
    || fileNames.some((f) => f.includes('performance'));

  if (hasPerfContext) {
    labels.add('performance');
  }

  const isBreaking = /breaking|!:/.test(String(prTitle || '').toLowerCase())
    || /breaking change|major version/.test(String(prBody || '').toLowerCase());
  if (isBreaking) {
    labels.add('breaking-change');
  }

  const docsOnly = fileNames.length > 0 && fileNames.every((f) =>
    f.endsWith('.md') || f.startsWith('docs/') || f.includes('/docs/')
  );
  if (docsOnly) {
    labels.add('documentation');
  }

  const ciRelated = fileNames.some((f) =>
    f.startsWith('.github/workflows/') || f === '.gitlab-ci.yml' || f === 'azure-pipelines.yml'
  );
  if (ciRelated) {
    labels.add('ci-cd');
  }

  return Array.from(labels);
}

export function buildScoreHistoryEntry({
  pullRequestNumber,
  runId,
  sha,
  baseScore,
  headScore,
  delta,
  trend,
  timestamp = new Date().toISOString(),
} = {}) {
  return {
    pullRequestNumber,
    runId,
    sha,
    baseScore,
    headScore,
    delta,
    trend,
    timestamp,
  };
}

export function buildFindingKey(type = '', file = '') {
  return `${String(type || 'unknown').trim().toLowerCase()}::${String(file || 'unknown').trim().toLowerCase()}`;
}

export function parseIssueFindingKey(issueBody = '') {
  const matchType = String(issueBody || '').match(/\*\*Type:\*\*\s*(.+)/i);
  const matchFile = String(issueBody || '').match(/\*\*File:\*\*\s*`([^`]+)`/i);
  return buildFindingKey(matchType?.[1], matchFile?.[1]);
}
