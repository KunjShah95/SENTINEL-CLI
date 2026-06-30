// Security reviewer utilities - no UI, pure logic

import { execSync } from 'child_process';
import type { ThemeColors } from '../theme';
import type { LspContext } from './lsp-client';

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type IssueProvenance = {
  modelId: string;
  provider: string;
  timestamp: number;
  confidence?: number;
};

export type ReviewIssue = {
  severity: ReviewSeverity;
  file?: string;
  line?: number;
  title: string;
  description: string;
  suggestion?: string;
  category: 'security' | 'bug' | 'quality' | 'performance' | 'style';
  provenance?: IssueProvenance;
};

export type ReviewSummary = {
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  files: string[];
  walkthrough: string;
};

export type ParsedReview = {
  summary: ReviewSummary;
  issues: ReviewIssue[];
  rawText: string;
};

// Get git diff (staged, unstaged, or against a branch)
export function getGitDiff(options: { staged?: boolean; branch?: string; file?: string } = {}): string {
  try {
    let cmd = 'git diff';
    if (options.staged) cmd += ' --staged';
    if (options.branch) cmd += ` ${options.branch}`;
    if (options.file) cmd += ` -- ${options.file}`;
    if (!options.staged && !options.branch) cmd += ' HEAD';
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
    return result.trim();
  } catch {
    return '';
  }
}

// Get changed files list
export function getChangedFiles(options: { staged?: boolean; branch?: string } = {}): string[] {
  try {
    let cmd = 'git diff --name-only';
    if (options.staged) cmd += ' --staged';
    if (options.branch) cmd += ` ${options.branch}`;
    if (!options.staged && !options.branch) cmd += ' HEAD';
    const result = execSync(cmd, { encoding: 'utf-8' });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// Build the CodeRabbit-style review prompt (optionally enhanced with SAST + context + LSP)
export function buildReviewPrompt(
  diff: string,
  options: {
    files?: string[];
    focus?: 'security' | 'quality' | 'all';
    sastSummary?: string;
    contextInjection?: string;
    lspContext?: LspContext;
  } = {}
): string {
  const focus = options.focus || 'all';
  const filesHint = options.files?.length ? `Changed files: ${options.files.join(', ')}\n\n` : '';
  const contextBlock = options.contextInjection ? `${options.contextInjection}\n\n` : '';
  const sastBlock = options.sastSummary ? `${options.sastSummary}\n\n` : '';
  const lspBlock = options.lspContext ? formatLspBlock(options.lspContext) : '';

  return `${contextBlock}${lspBlock}You are performing a CodeRabbit-style code review. ${filesHint}
${sastBlock}
Review this diff and produce a STRUCTURED security review in the following format:

## Summary
[1-2 sentence overview of the changes and overall risk level]

## Walkthrough
[Brief description of what changed and why it matters]

## Issues Found

### 🔴 Critical (must fix before merge)
- **[FILE:LINE]** Issue title
  Description and impact
  💡 Fix: How to fix it

### 🟠 High (should fix)
- **[FILE:LINE]** Issue title
  Description
  💡 Fix: suggestion

### 🟡 Medium (consider fixing)
- **[FILE:LINE]** Issue title
  Description
  💡 Fix: suggestion

### 🟢 Low / Suggestions
- **[FILE:LINE]** Issue title
  Description

## Security Checklist
- [ ] SQL injection: checked
- [ ] XSS: checked
- [ ] Hardcoded secrets: checked
- [ ] Command injection: checked
- [ ] Path traversal: checked
- [ ] Missing auth: checked
- [ ] Input validation: checked
- [ ] SSRF (Server-Side Request Forgery): checked
- [ ] Prototype pollution: checked
- [ ] Supply-chain/ dependency confusion: checked
- [ ] LLM prompt injection: checked
- [ ] Async race conditions / TOCTOU: checked
- [ ] Insecure deserialization: checked
- [ ] Path traversal in file uploads: checked

## Score: [A/B/C/D/F]
[Justification]

---

If no issues found in a severity category, omit that section.
Focus especially on: ${focus === 'security' ? 'security vulnerabilities (OWASP Top 10, CWE, modern threats like supply-chain, prompt injection, SSRF, async race conditions)' : focus === 'quality' ? 'code quality, bugs, and maintainability' : 'security, bugs, performance, and code quality'}.

Here is the diff to review:

\`\`\`diff
${diff.slice(0, 15000)}
\`\`\``;
}

function formatLspBlock(ctx: LspContext): string {
  const lines = ctx.diagnostics.slice(0, 30).map(d =>
    `- [${d.severity.toUpperCase()}] ${d.file}:${d.line}:${d.column} ${d.message}${d.code ? ` (${d.code})` : ''}`
  );
  if (ctx.diagnostics.length > 30) {
    lines.push(`... and ${ctx.diagnostics.length - 30} more diagnostic(s)`);
  }
  return `## LSP Diagnostics (${ctx.serverName}, ${ctx.diagnostics.length} issues, ${ctx.elapsed}ms)\n\n${lines.join('\n')}\n\n`;
}

// Parse severity emoji from review text
export function parseSeverityFromEmoji(text: string): ReviewSeverity {
  if (text.includes('🔴') || text.toLowerCase().includes('critical')) return 'critical';
  if (text.includes('🟠') || text.toLowerCase().includes('high')) return 'high';
  if (text.includes('🟡') || text.toLowerCase().includes('medium')) return 'medium';
  if (text.includes('🟢') || text.toLowerCase().includes('low') || text.toLowerCase().includes('suggestion')) return 'low';
  return 'info';
}

// Parse a review response into structured issues
export function parseReviewResponse(text: string, files: string[] = []): ParsedReview {
  const issues: ReviewIssue[] = [];

  // Simple line-based parsing
  let curSev: ReviewSeverity = 'info';
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('🔴') || (line.startsWith('#') && line.toLowerCase().includes('critical'))) curSev = 'critical';
    else if (line.includes('🟠') || (line.startsWith('#') && line.toLowerCase().includes('high'))) curSev = 'high';
    else if (line.includes('🟡') || (line.startsWith('#') && line.toLowerCase().includes('medium'))) curSev = 'medium';
    else if (line.includes('🟢') || (line.startsWith('#') && (line.toLowerCase().includes('low') || line.toLowerCase().includes('suggestion')))) curSev = 'low';

    // Issue line: starts with - ** or * **
    if (/^[-*]\s+\*\*/.test(line)) {
      const fileLineMatch = line.match(/\*\*\[?([^:\]]+):?(\d+)?\]?\*\*\s+(.*)/);
      if (fileLineMatch) {
        const [, fileRef, lineNum, title] = fileLineMatch;
        const desc = lines[i + 1]?.trim() || '';
        const fixLine = lines.find((l, j) => j > i && j < i + 4 && l.includes('💡'));
        issues.push({
          severity: curSev,
          file: fileRef?.trim(),
          line: lineNum ? parseInt(lineNum) : undefined,
          title: title?.trim() || fileRef?.trim(),
          description: desc.startsWith('-') || desc.startsWith('*') ? '' : desc,
          suggestion: fixLine?.replace(/.*💡\s*Fix:\s*/i, '').trim(),
          category: curSev === 'critical' || curSev === 'high' ? 'security' : 'quality',
        });
      }
    }
  }

  // Count by severity
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;

  // Extract summary
  const summaryMatch = text.match(/##\s+Summary\n([\s\S]*?)(?=\n##|\n---|\z)/);
  const walkthroughMatch = text.match(/##\s+Walkthrough\n([\s\S]*?)(?=\n##|\n---|\z)/);

  return {
    summary: {
      totalIssues: issues.length,
      ...counts,
      files,
      walkthrough: walkthroughMatch?.[1]?.trim() || summaryMatch?.[1]?.trim() || 'Review complete.',
    },
    issues,
    rawText: text,
  };
}

// Get severity color key for theme
export function getSeverityColorKey(sev: ReviewSeverity): keyof ThemeColors {
  switch (sev) {
    case 'critical': return 'critical';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'info';
    default: return 'dimSeparator';
  }
}

// Get severity icon
export function getSeverityIcon(sev: ReviewSeverity): string {
  switch (sev) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

// Get score color
export function getScoreColor(text: string): string {
  const scoreMatch = text.match(/Score:\s*([A-F])/i);
  if (!scoreMatch) return '#88C0D0';
  const grade = scoreMatch[1].toUpperCase();
  switch (grade) {
    case 'A': return '#34D399';
    case 'B': return '#60A5FA';
    case 'C': return '#F59E0B';
    case 'D': return '#EF4444';
    case 'F': return '#DC2626';
    default: return '#88C0D0';
  }
}
