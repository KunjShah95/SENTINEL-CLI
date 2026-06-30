/**
 * Parallel Specialist Agent Architecture
 *
 * Runs multiple focused reviewer agents concurrently, then merges and
 * deduplicates their findings. Inspired by fleet-of-specialists patterns
 * (similar to how Claude Code Review dispatches parallel specialist agents).
 */

import { parseReviewResponse, type ReviewIssue } from './security-reviewer.js';
import type { SubmitAndWait } from './loop-engine.js';
import { deduplicateIssues, sortIssues } from './deduplicate.js';

// ─── Specialist agent definition ─────────────────────────────────────────────

export type SpecialistAgent = {
  name: string;
  role: string;
  focus: string;
  buildPrompt: (diff: string, files: string[]) => string;
};

// ─── The four built-in specialists ───────────────────────────────────────────

export const SPECIALIST_AGENTS: SpecialistAgent[] = [
  {
    name: 'security-auditor',
    role: 'Security Auditor',
    focus: 'OWASP Top 10 — injection, XSS, auth issues, hardcoded secrets, path traversal',
    buildPrompt: (diff, files) => `You are a senior application security auditor with deep expertise in the OWASP Top 10.

Your ONLY job right now is to audit the following diff for security vulnerabilities. Do not comment on code style, performance, or general quality — focus exclusively on security.

Specifically look for:
- Injection flaws: SQL injection, command injection, LDAP injection, NoSQL injection
- Cross-site scripting (XSS): reflected, stored, DOM-based
- Authentication and session management weaknesses: weak tokens, missing expiry, insecure storage
- Hardcoded secrets: API keys, passwords, private keys, tokens in source
- Path traversal and directory traversal vulnerabilities
- Insecure direct object references (IDOR)
- Security misconfiguration: debug flags, permissive CORS, weak ciphers
- Sensitive data exposure: PII/PHI logged or returned in responses
- Missing access control checks or broken authorisation

Changed files: ${files.join(', ') || '(see diff)'}

Produce your findings in this exact format:

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

If a severity bucket has no findings, omit it entirely. If there are no security issues at all, output only: "## Issues Found\nNo security issues detected."

Here is the diff:

\`\`\`diff
${diff.slice(0, 12000)}
\`\`\``,
  },

  {
    name: 'dependency-inspector',
    role: 'Dependency Inspector',
    focus: 'package.json changes, lock file changes, version downgrades, known vulnerable patterns',
    buildPrompt: (diff, files) => `You are a supply-chain security specialist who reviews dependency changes.

Your ONLY job is to inspect dependency-related changes in the diff below. Ignore application code unless it relates to how dependencies are imported or used insecurely.

Specifically look for:
- New packages added — are they well-known and maintained? Do they have a history of CVEs?
- Version downgrades — regressing to an older, potentially vulnerable version
- Version ranges that are overly permissive (e.g. "*", ">= 0", or "x.x.x" patterns) that could pull in a vulnerable release
- Dependency confusion risks: internal package names that could be squatted on npm/PyPI
- Lock file changes without a corresponding package.json update (possible tampering)
- Packages with unusual install scripts (preinstall/postinstall) in package.json
- Direct use of git URLs or tarball URLs pointing to unversioned artifacts
- Dev-only packages promoted to production dependencies

Changed files: ${files.join(', ') || '(see diff)'}

Use the same structured output format:

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

Omit empty severity sections. If no dependency issues found, output only: "## Issues Found\nNo dependency issues detected."

Here is the diff:

\`\`\`diff
${diff.slice(0, 12000)}
\`\`\``,
  },

  {
    name: 'logic-analyst',
    role: 'Logic Analyst',
    focus: 'business logic bugs, race conditions, off-by-one errors, null pointer risks',
    buildPrompt: (diff, files) => `You are a principal engineer who specialises in finding logic bugs and correctness issues.

Your ONLY job is to find logic defects in the code changes below. Do not comment on security (unless it's a direct consequence of a logic bug) or code style.

Specifically look for:
- Business logic errors: incorrect conditionals, wrong operator precedence, inverted boolean checks
- Race conditions and TOCTOU (time-of-check to time-of-use) vulnerabilities
- Off-by-one errors in loops, array access, pagination, or length checks
- Null / undefined dereference: accessing a property on a value that could be null or undefined
- Integer overflow or underflow in arithmetic
- Incorrect error handling: swallowed exceptions, errors that change control flow unexpectedly
- Missing edge case handling: empty arrays, zero values, negative numbers, very large inputs
- Incorrect async/await usage: missing await, unhandled promise rejections, parallelism bugs
- State mutation bugs: shared mutable state modified concurrently or in unexpected order
- Dead code that was meant to be active, or active code that was meant to be behind a flag

Changed files: ${files.join(', ') || '(see diff)'}

Use the same structured output format:

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

Omit empty severity sections. If no logic issues found, output only: "## Issues Found\nNo logic issues detected."

Here is the diff:

\`\`\`diff
${diff.slice(0, 12000)}
\`\`\``,
  },

  {
    name: 'best-practices-reviewer',
    role: 'Best Practices Reviewer',
    focus: 'code style, error handling gaps, missing input validation, logging sensitive data',
    buildPrompt: (diff, files) => `You are a senior code reviewer focused on engineering best practices and maintainability.

Your ONLY job is to identify best-practice violations in the changes below. Do not re-report security vulnerabilities or logic bugs — focus on correctness-adjacent quality issues.

Specifically look for:
- Missing or inadequate input validation: user-supplied values used without sanitisation or type checks
- Sensitive data logged to console, files, or monitoring systems (passwords, tokens, PII)
- Poor error handling: empty catch blocks, overly broad try/catch, errors not propagated or logged
- Functions that are too long or do too many things (high cyclomatic complexity)
- Hardcoded configuration values that should be environment variables or constants
- Missing return type annotations or JSDoc on exported functions
- Test coverage gaps: new logic introduced without corresponding tests
- Inconsistent naming conventions within the changed files
- Deprecated API usage
- Magic numbers or strings that should be named constants

Changed files: ${files.join(', ') || '(see diff)'}

Use the same structured output format:

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

Omit empty severity sections. If no best-practice issues found, output only: "## Issues Found\nNo best-practice issues detected."

Here is the diff:

\`\`\`diff
${diff.slice(0, 12000)}
\`\`\``,
  },
];

// ─── Result types ─────────────────────────────────────────────────────────────

export type ParallelScanResult = {
  agentResults: Array<{ agent: string; issues: ReviewIssue[]; durationMs: number }>;
  mergedIssues: ReviewIssue[];
  totalDurationMs: number;
};

// Deduplication utilities imported from deduplicate.ts

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs all (or a filtered subset of) specialist agents concurrently, then
 * merges and deduplicates their findings into a single ranked list.
 *
 * @param diff           - Full git diff text to analyse.
 * @param files          - List of changed file paths.
 * @param submitAndWait  - Callback that sends a prompt to the active model and
 *                         returns the full response text.
 * @param options.agents - Optional list of agent names to run (runs all 4 by
 *                         default). Names must match SpecialistAgent.name.
 * @param options.onProgress - Optional callback fired when each agent starts
 *                             (done=false) and finishes (done=true).
 */
export async function runParallelAgents(
  diff: string,
  files: string[],
  submitAndWait: SubmitAndWait,
  options?: {
    agents?: string[];
    onProgress?: (agent: string, done: boolean) => void;
  }
): Promise<ParallelScanResult> {
  const wallStart = Date.now();
  const { agents: agentFilter, onProgress } = options ?? {};

  // Select which specialists to run
  const selectedAgents = agentFilter
    ? SPECIALIST_AGENTS.filter(a => agentFilter.includes(a.name))
    : SPECIALIST_AGENTS;

  // Run all selected agents concurrently
  const agentResults = await Promise.all(
    selectedAgents.map(async (agent) => {
      onProgress?.(agent.name, false);
      const agentStart = Date.now();
      let issues: ReviewIssue[] = [];

      try {
        const prompt = agent.buildPrompt(diff, files);
        const responseText = await submitAndWait(prompt, 'REVIEW');
        const parsed = parseReviewResponse(responseText, files);
        issues = parsed.issues;
      } catch {
        // If an individual agent fails, return an empty result so the others
        // are not affected.
        issues = [];
      }

      const durationMs = Date.now() - agentStart;
      onProgress?.(agent.name, true);

      return { agent: agent.name, issues, durationMs };
    })
  );

  // Merge all issues from every agent, then deduplicate
  const allIssues = agentResults.flatMap(r => r.issues);
  const mergedIssues = sortIssues(deduplicateIssues(allIssues));

  return {
    agentResults,
    mergedIssues,
    totalDurationMs: Date.now() - wallStart,
  };
}
