# PR Review Bot Implementation Plan

> **For agentic workers:** Each task is independent and can be worked in order.

**Goal:** Transform Sentinel's existing GitHub webhook into a real-time autonomous PR reviewer that runs SAST + AI review and posts results (inline comments, summary, check run, SARIF) — the open-source CodeRabbit alternative.

**Architecture:** A headless orchestrator (`pr-review-orchestrator.js`) sits between the Hono webhook and GitHub API. It fetches the PR diff, runs SAST (via existing `sast-runner.ts`) + AI review (via `buildReviewPrompt()` + LLM call), merges results, and posts to the PR. No React/TUI dependencies.

**Tech Stack:** Node.js, Hono, GitHub REST API, LLM providers (Groq/OpenAI/Anthropic/etc via standard OpenAI-compatible API calls), GitHub SARIF API.

---

### Task 1: Fix `sast-runner.js` import path in webhook

**Files:**
- Modify: `src/server/api/routes/github-webhook.js` (lines 40-41)

The import `../../tui/lib/sast-runner.js` resolves to `src/server/tui/lib/sast-runner.js` — wrong directory. The actual file is at `src/tui/lib/sast-runner.ts`. The path needs one more `../`.

- [ ] **Step 1: Fix the import path**

Change line 40 from:
```javascript
const { runSast } = await import('../../tui/lib/sast-runner.js');
```
To:
```javascript
const { runSast } = await import('../../../tui/lib/sast-runner.js');
```

---

### Task 2: Add `uploadSarif` method to GitHubIntegration

**Files:**
- Modify: `src/integrations/github.js` (insert after line 507, before the CodeRabbit-style section)

The orchestrator needs to upload SARIF results to GitHub's code scanning API. Add this method to `GitHubIntegration`.

- [ ] **Step 1: Add the uploadSarif method**

Insert after the `createCheckRun` method (line 507):

```javascript
  /**
   * Upload SARIF results to GitHub code scanning.
   * Requires SARIF 2.1.0 format. The SARIF content must be base64-encoded.
   * Returns the SARIF upload ID for status tracking.
   */
  async uploadSarif(owner, repo, commitSha, sarifContent, sarifVersion = '2.1.0') {
    const encoded = Buffer.from(sarifContent).toString('base64');
    return this.request('POST', `/repos/${owner}/${repo}/code-scanning/sarifs`, {
      commit_sha: commitSha,
      ref: `refs/heads/${await this._getDefaultBranch(owner, repo)}`,
      sarif: encoded,
      checkout_uri: `${this.baseUrl}/repos/${owner}/${repo}`,
      started_at: new Date().toISOString(),
      tool_name: 'Sentinel CLI',
      version: sarifVersion,
    });
  }

  /**
   * Get the default branch name for a repository.
   */
  async _getDefaultBranch(owner, repo) {
    try {
      const repoInfo = await this.request('GET', `/repos/${owner}/${repo}`);
      return repoInfo.default_branch;
    } catch {
      return 'main';
    }
  }
```

- [ ] **Step 2: Verify the method signature matches how SARIF upload works**

The SARIF upload endpoint (`POST /repos/{owner}/{repo}/code-scanning/sarifs`) accepts:
- `commit_sha` (string, required)
- `ref` (string, optional — the full Git ref, e.g. `refs/heads/main`)
- `sarif` (string, required — base64-encoded SARIF content)
- `started_at` (string, ISO 8601)
- `tool_name` (string)

The GitHub API returns a SARIF upload ID that can be used to check processing status.

---

### Task 3: Create `pr-review-orchestrator.js`

**Files:**
- Create: `src/server/api/lib/pr-review-orchestrator.js`

This is the main headless orchestrator. It has no UI dependencies and runs purely server-side.

- [ ] **Step 1: Create the file with helper to call LLM providers**

```javascript
import { GitHubIntegration } from '../../../integrations/github.js';

// Priority-ordered provider fallback chain
const PROVIDERS = [
  { key: 'GROQ_API_KEY',     url: 'https://api.groq.com/openai/v1/chat/completions',    model: 'llama-3.1-8b-instant' },
  { key: 'OPENAI_API_KEY',   url: 'https://api.openai.com/v1/chat/completions',          model: 'gpt-4o-mini' },
  { key: 'ANTHROPIC_API_KEY', url: 'https://api.anthropic.com/v1/messages',               model: 'claude-sonnet-4-20250514' },
  { key: 'GEMINI_API_KEY',   url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', model: null },
  { key: 'DEEPSEEK_API_KEY', url: 'https://api.deepseek.com/v1/chat/completions',         model: 'deepseek-chat' },
  { key: 'TOGETHER_API_KEY', url: 'https://api.together.xyz/v1/chat/completions',         model: 'mistralai/Mixtral-8x22B-Instruct-v0.1' },
  { key: 'MISTRAL_API_KEY',  url: 'https://api.mistral.ai/v1/chat/completions',           model: 'mistral-small-latest' },
  { key: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/api/v1/chat/completions',      model: 'gryphe/mythomax-l2-13b' },
];

async function callLLM(prompt, systemPrompt = 'You are a code review assistant.') {
  for (const provider of PROVIDERS) {
    const apiKey = process.env[provider.key];
    if (!apiKey) continue;

    try {
      const body = {
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      };

      const headers = { 'Content-Type': 'application/json' };

      if (provider.key === 'ANTHROPIC_API_KEY') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body.messages = [{ role: 'user', content: prompt }];
        body.system = systemPrompt;
        body.max_tokens = 4000;
        // Anthropic uses a different format
        const res = await fetch(provider.url, { method: 'POST', headers, body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        })});
        const data = await res.json();
        if (data.content?.[0]?.text) return data.content[0].text;
        continue;
      }

      if (provider.key === 'GEMINI_API_KEY') {
        const res = await fetch(`${provider.url}?key=${apiKey}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
          }),
        });
        const data = await res.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text;
        continue;
      }

      // OpenAI-compatible
      headers['Authorization'] = `Bearer ${apiKey}`;
      const res = await fetch(provider.url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
    } catch (e) {
      console.warn(`[pr-review] Provider ${provider.key} failed: ${e.message}`);
    }
  }
  throw new Error('No LLM provider configured. Set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
}

export { callLLM };
```

- [ ] **Step 2: Add fetchPrDiff helper**

Add to the same file:

```javascript
async function fetchPrDiff(owner, repo, prNumber, github) {
  const pr = await github.getPrDetails(owner, repo, prNumber);
  const headSha = pr.head.sha;
  const baseSha = pr.base.sha;

  // Get changed files with patches
  let files = [];
  let page = 1;
  while (true) {
    const batch = await github.request('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    if (!batch || batch.length === 0) break;
    files = files.concat(batch);
    if (batch.length < 100) break;
    page++;
  }

  // Build a unified diff string from the patches
  const diffContent = files
    .filter(f => f.patch)
    .map(f => {
      const header = `diff --git a/${f.filename} b/${f.filename}\nindex 0000000..0000000 100644\n--- a/${f.filename}\n+++ b/${f.filename}\n`;
      return header + f.patch;
    })
    .join('\n');

  return {
    diff: diffContent,
    files: files.map(f => f.filename),
    headSha,
    baseSha,
    prTitle: pr.title,
    prBody: pr.body || '',
  };
}

export { fetchPrDiff };
```

- [ ] **Step 3: Add runAiReview helper**

Add to the same file:

```javascript
async function runAiReview(diff, files) {
  // Detect if diff is too large and truncate
  const maxDiffLen = 15000;
  const truncatedDiff = diff.length > maxDiffLen
    ? diff.slice(0, maxDiffLen) + `\n\n... (${diff.length - maxDiffLen} more chars truncated)`
    : diff;

  const prompt = buildReviewPrompt(truncatedDiff, { files, focus: 'all' });
  const response = await callLLM(prompt);
  const parsed = parseReviewResponse(response, files);
  return parsed.issues;
}

import { buildReviewPrompt, parseReviewResponse } from '../../../tui/lib/security-reviewer.js';
export { runAiReview };
```

- [ ] **Step 4: Add mergeResults and SARIF helper**

Add to the same file:

```javascript
function mergeResults(sastFindings, aiIssues) {
  // Convert SAST findings to ReviewIssue format
  const sastAsIssues = sastFindings.map(f => ({
    severity: f.severity,
    file: f.file,
    line: f.line,
    title: f.rule || f.tool,
    description: f.message,
    suggestion: f.suggestion,
    category: f.severity === 'critical' || f.severity === 'high' ? 'security' : 'quality',
  }));

  const all = [...sastAsIssues, ...aiIssues];

  // Dedup by file+line+title (Jaccard-like simple matching)
  const seen = new Set();
  const deduped = [];
  for (const issue of all) {
    const key = `${issue.file || ''}:${issue.line || 0}:${issue.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  // Sort: critical first
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  deduped.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));

  return deduped;
}

import SarifGenerator from '../../../output/sarifGenerator.js';

function normalizeForSarif(issues) {
  // Map ReviewIssue/SastFinding format to SarifGenerator's expected format
  return issues.map(i => ({
    ...i,
    message: i.message || i.description || i.title,
    type: i.type || i.category || i.tool || 'review',
    analyzer: 'sentinel',
  }));
}

async function uploadSarif(owner, repo, headSha, issues, github) {
  try {
    const generator = new SarifGenerator();
    const sarifJson = generator.generate(normalizeForSarif(issues));
    await github.uploadSarif(owner, repo, headSha, JSON.stringify(sarifJson));
  } catch (e) {
    console.warn(`[pr-review] SARIF upload failed: ${e.message}`);
  }
}

export { mergeResults, uploadSarif };
```

- [ ] **Step 5: Add the main `reviewPullRequest` function**

Add to the same file:

```javascript
export async function reviewPullRequest(owner, repo, prNumber, options = {}) {
  const startTime = Date.now();
  const token = options.token || process.env.GITHUB_TOKEN || '';
  const github = new GitHubIntegration({ token });

  // 1. Fetch PR diff
  const { diff, files, headSha, prTitle } = await fetchPrDiff(owner, repo, prNumber, github);

  // 2. Post "review in progress" status
  await github.postReviewStatus(owner, repo, prNumber, 'in_progress', {
    mode: process.env.PARALLEL_REVIEW ? 'parallel' : 'standard',
  }).catch(() => {});

  // 3. Run SAST (on current working directory — for webhook, this is the PR repo if checked out)
  let sastFindings = [];
  try {
    const { runSast } = await import('../../../tui/lib/sast-runner.js');
    const sastResult = await runSast({ target: process.cwd() });
    sastFindings = sastResult.findings || [];
  } catch (e) {
    console.warn(`[pr-review] SAST skipped: ${e.message}`);
  }

  // 4. Run AI review
  let aiIssues = [];
  try {
    aiIssues = await runAiReview(diff, files);
  } catch (e) {
    console.warn(`[pr-review] AI review failed: ${e.message}`);
  }

  // 5. Merge and deduplicate
  const allIssues = mergeResults(sastFindings, aiIssues);

  // 6. Post inline comments (file+line issues)
  const inlineIssues = allIssues.filter(i => i.file && i.line);
  if (inlineIssues.length > 0) {
    const formatted = inlineIssues.map(i => ({
      file: i.file,
      line: i.line,
      body: `${i.severity.toUpperCase()}: ${i.title}\n\n${i.description}${i.suggestion ? `\n\n💡 ${i.suggestion}` : ''}`,
    }));
    try {
      await github.createReview(owner, repo, prNumber, headSha, formatted);
    } catch (e) {
      console.warn(`[pr-review] Inline comments failed: ${e.message}`);
    }
  }

  // 7. Post summary comment
  const summary = github.generateSummaryComment(allIssues);
  await github.postComment(owner, repo, prNumber, summary).catch(() => {});

  // 8. Create check run
  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const highCount = allIssues.filter(i => i.severity === 'high').length;
  const conclusion = criticalCount > 0 ? 'action_required' : highCount > 0 ? 'neutral' : 'success';

  try {
    await github.createCheckRun(owner, repo, headSha, {
      status: 'completed',
      conclusion,
      output: {
        title: `Sentinel: ${allIssues.length} issue(s) found`,
        summary: `${criticalCount} critical, ${highCount} high, ${allIssues.filter(i => i.severity === 'medium').length} medium, ${allIssues.filter(i => i.severity === 'low').length} low`,
        text: allIssues.slice(0, 50).map(i =>
          `- [${i.severity?.toUpperCase()}] ${i.file ? `${i.file}:${i.line || ''} ` : ''}${i.title}`
        ).join('\n'),
      },
    });
  } catch (e) {
    console.warn(`[pr-review] Check run failed: ${e.message}`);
  }

  // 9. Upload SARIF
  await uploadSarif(owner, repo, headSha, allIssues, github).catch(() => {});

  // 10. Post completion status
  await github.postReviewStatus(owner, repo, prNumber, 'complete', {
    issuesFound: allIssues.length,
    duration: Date.now() - startTime,
  }).catch(() => {});

  return {
    issuesFound: allIssues.length,
    conclusion,
    duration: Date.now() - startTime,
    pr: `${owner}/${repo}#${prNumber}`,
  };
}
```

---

### Task 4: Update webhook route to use orchestrator

**Files:**
- Modify: `src/server/api/routes/github-webhook.js`

Replace the broken `runReviewPipeline` function with a call to the new orchestrator.

- [ ] **Step 1: Add import for orchestrator**

At the top of the file, after the existing imports:
```javascript
import { reviewPullRequest } from '../lib/pr-review-orchestrator.js';
```

- [ ] **Step 2: Replace runReviewPipeline body**

Replace the entire `runReviewPipeline` function (lines 31-85):
```javascript
async function runReviewPipeline(owner, repo, prNumber) {
  return reviewPullRequest(owner, repo, prNumber);
}
```

---

### Task 5: Create GitHub Actions workflow

**Files:**
- Create: `.github/workflows/pr-review.yml`

This is an optional CI-based alternative for users who prefer GitHub Actions over webhook deployment.

- [ ] **Step 1: Create the workflow file**

```yaml
name: Sentinel PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  sentinel-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Sentinel CLI
        run: npm install -g sentinel-cli

      - name: Run Sentinel PR Review
        run: sentinel review-pr --owner ${{ github.repository_owner }} --repo ${{ github.event.repository.name }} --pr ${{ github.event.number }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
          # Add other provider keys as needed:
          # OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          # ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

---

### Task 6: Fix docker-compose entrypoint

**Files:**
- Modify: `docker-compose.yml` (line 160)

The `sentinel-pr` service has a broken entrypoint: `src/dist/cli.js` does not exist.

- [ ] **Step 1: Fix the entrypoint**

Change line 160 from:
```yaml
    entrypoint: ['node', 'src/dist/cli.js']
```
To:
```yaml
    entrypoint: ['node', 'src/server/api/start.js']
```

This makes `sentinel-pr` start the Hono API server (which includes the `/webhook/github` route), so it can receive webhook events.
