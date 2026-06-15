/**
 * Loop Engine — four agentic loop patterns for SENTINEL:
 *  1. Review Loop  — review → fix → re-review until clean
 *  2. Watch Loop   — watch files, trigger review on change
 *  3. Pipeline Loop — scan → plan → fix → verify in sequence
 *  4. CI Loop      — run tests → fix failures → repeat until green
 */

import { watch as fsWatch, type FSWatcher } from 'fs';
import { join } from 'path';
import {
  getGitDiff,
  getChangedFiles,
  buildReviewPrompt,
  parseReviewResponse,
  type ReviewIssue,
} from './security-reviewer.js';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type LoopType = 'review' | 'watch' | 'pipeline' | 'ci';

export type LoopEvent = {
  timestamp: number;
  type: 'state' | 'stage' | 'issues' | 'fix' | 'message' | 'file-change' | 'done' | 'error';
  state?: string;
  stage?: string;
  iteration?: number;
  attempt?: number;
  issues?: ReviewIssue[];
  files?: string[];
  text?: string;
  summary?: LoopSummary;
  error?: string;
};

export type LoopSummary = {
  type: LoopType;
  iterations: number;
  issuesFound: number;
  issuesFixed: number;
  finalState: string;
  durationMs: number;
};

/** Callback for the loop to submit a prompt and get the full response text back. */
export type SubmitAndWait = (prompt: string, mode?: 'BUILD' | 'PLAN' | 'REVIEW') => Promise<string>;

function now() {
  return Date.now();
}

// ─── Fix prompt builder ───────────────────────────────────────────────────────

export function buildFixPrompt(issues: ReviewIssue[], diff: string, files: string[]): string {
  const formatted = issues.map(iss => {
    const loc = iss.file ? `  File: ${iss.file}${iss.line ? `:${iss.line}` : ''}` : '';
    return `[${iss.severity.toUpperCase()}] ${iss.title}\n${loc ? loc + '\n' : ''}  Issue: ${iss.description}${iss.suggestion ? `\n  Fix: ${iss.suggestion}` : ''}`;
  }).join('\n\n');

  return `You are a senior security engineer performing an automated fix pass.

## Security Issues to Fix

${formatted}

## Context — git diff

\`\`\`diff
${diff.slice(0, 4000)}
\`\`\`

## Changed Files
${files.map(f => `- ${f}`).join('\n')}

Fix every issue listed above by editing the relevant files using your available tools. Apply minimal, targeted changes — only touch what's needed to resolve the security problem. After completing all fixes, summarise what you changed.`;
}

// ─── 1. Review Loop ──────────────────────────────────────────────────────────

export type ReviewLoopOptions = {
  maxIterations?: number;
  stopOnSeverity?: string[];
  branch?: string;
  onEvent: (event: LoopEvent) => void;
  submitAndWait: SubmitAndWait;
  abortSignal?: { aborted: boolean };
};

export async function runReviewLoop(opts: ReviewLoopOptions): Promise<LoopSummary> {
  const {
    maxIterations = 3,
    stopOnSeverity = ['critical', 'high'],
    branch,
    onEvent,
    submitAndWait,
    abortSignal,
  } = opts;

  const startTime = now();
  let totalIssuesFound = 0;
  let totalIssuesFixed = 0;
  let finalState = 'done';
  let actualIterations = 0;

  const emit = (partial: Omit<LoopEvent, 'timestamp'>) => onEvent({ ...partial, timestamp: now() });

  for (let i = 0; i < maxIterations; i++) {
    if (abortSignal?.aborted) { finalState = 'stopped'; break; }
    actualIterations = i + 1;
    emit({ type: 'state', state: 'reviewing', iteration: i + 1 });

    const files = getChangedFiles({ branch });
    const diff = getGitDiff({ branch });

    if (!diff) {
      emit({ type: 'message', text: 'No git diff detected — nothing to review.' });
      finalState = 'done';
      break;
    }

    let reviewText: string;
    try {
      reviewText = await submitAndWait(
        buildReviewPrompt(diff, { files, focus: 'all' }),
        'REVIEW'
      );
    } catch (e) {
      emit({ type: 'error', error: `Review request failed: ${e}` });
      finalState = 'error';
      break;
    }

    const parsed = parseReviewResponse(reviewText, files);
    const blocking = parsed.issues.filter(iss =>
      stopOnSeverity.includes(iss.severity.toLowerCase())
    );
    totalIssuesFound += parsed.issues.length;
    emit({ type: 'issues', issues: parsed.issues, iteration: i + 1 });

    if (blocking.length === 0) {
      emit({ type: 'message', text: `✅ No ${stopOnSeverity.join('/')} issues found. Loop complete.` });
      finalState = 'done';
      break;
    }

    if (i === maxIterations - 1) {
      emit({ type: 'message', text: `⚠️  Max iterations reached. ${blocking.length} issue(s) remain.` });
      finalState = 'max-iterations';
      break;
    }

    emit({ type: 'state', state: 'fixing', iteration: i + 1 });
    emit({ type: 'message', text: `Found ${blocking.length} blocking issue(s). Auto-fixing...` });

    if (abortSignal?.aborted) { finalState = 'stopped'; break; }

    try {
      await submitAndWait(buildFixPrompt(blocking, diff, files), 'BUILD');
      totalIssuesFixed += blocking.length;
      emit({ type: 'fix', iteration: i + 1, text: `Fixed ${blocking.length} issue(s). Re-running review...` });
    } catch (e) {
      emit({ type: 'error', error: `Fix request failed: ${e}` });
      finalState = 'error';
      break;
    }
  }

  const summary: LoopSummary = {
    type: 'review',
    iterations: actualIterations,
    issuesFound: totalIssuesFound,
    issuesFixed: totalIssuesFixed,
    finalState,
    durationMs: now() - startTime,
  };
  emit({ type: 'done', summary });
  return summary;
}

// ─── 2. Watch Loop ───────────────────────────────────────────────────────────

export type WatchLoopOptions = {
  paths?: string[];
  debounceMs?: number;
  ignorePatterns?: RegExp[];
  onEvent: (event: LoopEvent) => void;
  onFilesChanged: (files: string[]) => void;
};

export function startWatchLoop(opts: WatchLoopOptions): () => void {
  const {
    paths = [process.cwd()],
    debounceMs = 1500,
    ignorePatterns = [/node_modules/, /\.git/, /dist\//, /\.sentinel/],
    onEvent,
    onFilesChanged,
  } = opts;

  const emit = (partial: Omit<LoopEvent, 'timestamp'>) => onEvent({ ...partial, timestamp: now() });
  const pending = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const watchers: FSWatcher[] = [];

  const flush = () => {
    if (pending.size === 0) return;
    const files = [...pending];
    pending.clear();
    emit({ type: 'file-change', files, text: `${files.length} file(s) changed` });
    onFilesChanged(files);
  };

  for (const watchPath of paths) {
    try {
      const w = fsWatch(watchPath, { recursive: true }, (_evt, filename) => {
        if (!filename) return;
        const full = join(watchPath, filename);
        if (ignorePatterns.some(p => p.test(full))) return;
        pending.add(full);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flush, debounceMs);
      });
      watchers.push(w);
    } catch {}
  }

  emit({ type: 'state', state: 'watching', text: `Watching ${paths.map(p => p.replace(process.cwd() + '/', '')).join(', ')}` });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watchers.forEach(w => { try { w.close(); } catch {} });
    emit({ type: 'state', state: 'idle' });
  };
}

// ─── 3. Pipeline Loop ────────────────────────────────────────────────────────

export type PipelineLoopOptions = {
  target?: string;
  onEvent: (event: LoopEvent) => void;
  submitAndWait: SubmitAndWait;
  abortSignal?: { aborted: boolean };
};

const PIPELINE_STAGES = ['scanning', 'planning', 'fixing', 'verifying'] as const;

export async function runPipelineLoop(opts: PipelineLoopOptions): Promise<LoopSummary> {
  const { target = '.', onEvent, submitAndWait, abortSignal } = opts;
  const startTime = now();
  let issuesFound = 0;
  let issuesFixed = 0;
  let finalState = 'done';

  const emit = (partial: Omit<LoopEvent, 'timestamp'>) => onEvent({ ...partial, timestamp: now() });

  // Stage 1: Scan
  emit({ type: 'stage', stage: 'scanning', text: 'Running security scan...' });
  let scanText = '';
  try {
    const { executeLocalTool } = await import('../../shared/tools/index.js');
    const r = await executeLocalTool('securityAudit', { files: target });
    scanText = (r as any)?.output || '';
  } catch {
    const diff = getGitDiff();
    if (diff) {
      const files = getChangedFiles();
      scanText = await submitAndWait(buildReviewPrompt(diff, { files, focus: 'security' }), 'REVIEW');
    }
  }

  const scanned = parseReviewResponse(scanText, []);
  issuesFound = scanned.issues.length;
  emit({ type: 'issues', issues: scanned.issues, iteration: 1 });

  if (issuesFound === 0 || abortSignal?.aborted) {
    emit({ type: 'message', text: issuesFound === 0 ? '✅ No issues found. Pipeline complete.' : 'Aborted.' });
    const summary: LoopSummary = { type: 'pipeline', iterations: 1, issuesFound, issuesFixed, finalState, durationMs: now() - startTime };
    emit({ type: 'done', summary });
    return summary;
  }

  // Stage 2: Plan
  emit({ type: 'stage', stage: 'planning', text: 'Planning fixes...' });
  const critHighIssues = scanned.issues.filter(i => ['critical', 'high'].includes(i.severity.toLowerCase()));

  const planPrompt = `You are a security architect. These issues were found in a code scan:

${critHighIssues.map(i => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}${i.suggestion ? ` → ${i.suggestion}` : ''}`).join('\n')}

For each issue, specify: (1) exact file and line to change, (2) old code pattern, (3) new code pattern. Be precise.`;

  let plan = '';
  try {
    plan = await submitAndWait(planPrompt, 'PLAN');
    emit({ type: 'message', text: 'Fix plan created.' });
  } catch (e) {
    emit({ type: 'error', error: `Planning failed: ${e}` });
    finalState = 'error';
  }

  // Stage 3: Fix
  if (finalState !== 'error' && !abortSignal?.aborted) {
    emit({ type: 'stage', stage: 'fixing', text: `Applying fixes for ${critHighIssues.length} issue(s)...` });
    const diff = getGitDiff();
    const files = getChangedFiles();
    const fixPrompt = buildFixPrompt(critHighIssues, diff || '', files) + (plan ? `\n\n## Fix Plan\n${plan}` : '');
    try {
      await submitAndWait(fixPrompt, 'BUILD');
      issuesFixed = critHighIssues.length;
      emit({ type: 'fix', iteration: 1, text: `Applied fixes for ${issuesFixed} issue(s).` });
    } catch (e) {
      emit({ type: 'error', error: `Fix stage failed: ${e}` });
      finalState = 'error';
    }
  }

  // Stage 4: Verify
  if (finalState !== 'error' && !abortSignal?.aborted) {
    emit({ type: 'stage', stage: 'verifying', text: 'Verifying fixes...' });
    const newDiff = getGitDiff();
    if (newDiff) {
      const newFiles = getChangedFiles();
      try {
        const verifyText = await submitAndWait(buildReviewPrompt(newDiff, { files: newFiles, focus: 'security' }), 'REVIEW');
        const verified = parseReviewResponse(verifyText, newFiles);
        const remaining = verified.issues.filter(i => ['critical', 'high'].includes(i.severity.toLowerCase()));
        emit({ type: 'issues', issues: verified.issues, iteration: 2 });
        if (remaining.length === 0) {
          emit({ type: 'message', text: '✅ All critical/high issues resolved. Pipeline complete.' });
        } else {
          emit({ type: 'message', text: `⚠️  ${remaining.length} issue(s) remain after fixing.` });
          finalState = 'partial';
        }
      } catch (e) {
        emit({ type: 'error', error: `Verification failed: ${e}` });
        finalState = 'error';
      }
    } else {
      emit({ type: 'message', text: 'No diff after fixes — cannot verify.' });
    }
  }

  const summary: LoopSummary = {
    type: 'pipeline',
    iterations: 1,
    issuesFound,
    issuesFixed,
    finalState,
    durationMs: now() - startTime,
  };
  emit({ type: 'done', summary });
  return summary;
}

// ─── 4. CI Loop ──────────────────────────────────────────────────────────────

export type CILoopOptions = {
  testCommand?: string;
  maxAttempts?: number;
  onEvent: (event: LoopEvent) => void;
  submitAndWait: SubmitAndWait;
  abortSignal?: { aborted: boolean };
};

export async function runCILoop(opts: CILoopOptions): Promise<LoopSummary> {
  const {
    testCommand = 'npm test --passWithNoTests 2>&1',
    maxAttempts = 4,
    onEvent,
    submitAndWait,
    abortSignal,
  } = opts;

  const startTime = now();
  let fixAttempts = 0;
  let finalState = 'green';

  const emit = (partial: Omit<LoopEvent, 'timestamp'>) => onEvent({ ...partial, timestamp: now() });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (abortSignal?.aborted) { finalState = 'stopped'; break; }
    emit({ type: 'state', state: 'checking', attempt: attempt + 1, text: `Running tests (attempt ${attempt + 1}/${maxAttempts})...` });

    let testOutput = '';
    let testPassed = false;
    try {
      const { executeLocalTool } = await import('../../shared/tools/index.js');
      const r = await executeLocalTool('bash', { command: testCommand, timeout: 90000 });
      testOutput = (r as any)?.output || '';
      testPassed = !/(FAIL|ERROR|failed|error)/i.test(testOutput) || /pass|ok|success/i.test(testOutput);
    } catch (e) {
      testOutput = String(e);
      testPassed = false;
    }

    if (testPassed) {
      emit({ type: 'state', state: 'green' });
      emit({ type: 'message', text: '✅ All tests passing! CI is green.' });
      finalState = 'green';
      break;
    }

    if (attempt === maxAttempts - 1) {
      emit({ type: 'message', text: `⛔ CI still failing after ${maxAttempts} attempt(s).` });
      finalState = 'timeout';
      break;
    }

    emit({ type: 'state', state: 'fixing', attempt: attempt + 1 });
    emit({ type: 'message', text: `Tests failing. Auto-fixing (attempt ${attempt + 1})...` });

    const fixPrompt = `You are a CI engineer. The following test failures must be fixed:

\`\`\`
${testOutput.slice(0, 3000)}
\`\`\`

Analyse each failure carefully. Fix the underlying production code — do NOT skip or delete tests. Edit the relevant source files. After fixing, confirm what you changed.`;

    try {
      await submitAndWait(fixPrompt, 'BUILD');
      fixAttempts++;
      emit({ type: 'fix', attempt: attempt + 1, text: 'Fixes applied. Re-running tests...' });
    } catch (e) {
      emit({ type: 'error', error: `Fix failed: ${e}` });
      finalState = 'error';
      break;
    }
  }

  const summary: LoopSummary = {
    type: 'ci',
    iterations: maxAttempts,
    issuesFound: maxAttempts,
    issuesFixed: fixAttempts,
    finalState,
    durationMs: now() - startTime,
  };
  emit({ type: 'done', summary });
  return summary;
}
