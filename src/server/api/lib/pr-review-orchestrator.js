/**
 * pr-review-orchestrator.js — Headless PR review orchestrator for Sentinel CLI
 *
 * Fetches PR diff from GitHub API, runs SAST + AI review, merges results,
 * and posts findings back to the PR (inline comments, summary, check run, SARIF).
 */

import { GitHubIntegration } from '../../../integrations/github.js';

// ─── Provider config ───────────────────────────────────────────────────────────

const PROVIDERS = [
  { key: () => process.env.GROQ_API_KEY,        url: 'https://api.groq.com/openai/v1/chat/completions',                         model: 'llama-3.1-8b-instant',      type: 'openai' },
  { key: () => process.env.OPENAI_API_KEY,       url: 'https://api.openai.com/v1/chat/completions',                              model: 'gpt-4o-mini',               type: 'openai' },
  { key: () => process.env.ANTHROPIC_API_KEY,    url: 'https://api.anthropic.com/v1/messages',                                   model: 'claude-sonnet-4-20250514',  type: 'anthropic' },
  { key: () => process.env.GEMINI_API_KEY,       url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', model: null, type: 'gemini' },
  { key: () => process.env.DEEPSEEK_API_KEY,     url: 'https://api.deepseek.com/v1/chat/completions',                             model: 'deepseek-chat',             type: 'openai' },
  { key: () => process.env.OPENROUTER_API_KEY,   url: 'https://openrouter.ai/api/v1/chat/completions',                           model: 'gryphe/mythomax-l2-13b',    type: 'openai' },
];

// ─── Helper: make a request to a provider ───────────────────────────────────────

async function makeProviderRequest(provider, prompt, systemPrompt) {
  const headers = { 'Content-Type': 'application/json' };
  let body;

  switch (provider.type) {
    case 'anthropic': {
      headers['x-api-key'] = provider.key();
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({
        model: provider.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.3,
      });
      break;
    }
    case 'gemini': {
      const res = await fetch(`${provider.url}?key=${provider.key()}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res.json();
    }
    default: {
      headers['Authorization'] = `Bearer ${provider.key()}`;
      body = JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });
    }
  }

  const res = await fetch(provider.url, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Helper: extract text from provider response ────────────────────────────────

function extractResponseText(type, data) {
  switch (type) {
    case 'anthropic':
      return data.content?.[0]?.text || data.content?.[0]?.body || '';
    case 'gemini':
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    default:
      return data.choices?.[0]?.message?.content || '';
  }
}

// ─── 1. callLLM ─────────────────────────────────────────────────────────────────

export async function callLLM(prompt, systemPrompt = 'You are a code review assistant.') {
  const errors = [];
  for (const provider of PROVIDERS) {
    if (!provider.key()) continue;
    try {
      const data = await makeProviderRequest(provider, prompt, systemPrompt);
      const text = extractResponseText(provider.type, data);
      if (text) return text;
    } catch (err) {
      errors.push(`${provider.type}: ${err.message}`);
      console.warn(`[callLLM] ${provider.type} failed: ${err.message}`);
    }
  }
  throw new Error(`All LLM providers failed: ${errors.join('; ')}`);
}

// ─── 2. fetchPrDiff ─────────────────────────────────────────────────────────────

export async function fetchPrDiff(owner, repo, prNumber, github) {
  const prDetails = await github.getPrDetails(owner, repo, prNumber);

  const prFiles = [];
  let page = 1;
  while (true) {
    const batch = await github.request('GET', `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`);
    if (!batch || batch.length === 0) break;
    prFiles.push(...batch);
    page++;
  }

  const diffParts = [];
  for (const file of prFiles) {
    if (file.patch) {
      diffParts.push(`diff --git a/${file.filename} b/${file.filename}`);
      diffParts.push('index 0000000..0000000 100644');
      diffParts.push(`--- a/${file.filename}`);
      diffParts.push(`+++ b/${file.filename}`);
      diffParts.push(file.patch);
    }
  }

  return {
    diff: diffParts.join('\n'),
    files: prFiles.map(f => f.filename),
    headSha: prDetails.head.sha,
    baseSha: prDetails.base.sha,
    prTitle: prDetails.title,
    prBody: prDetails.body,
  };
}

// ─── 3. runAiReview ─────────────────────────────────────────────────────────────

export async function runAiReview(diff, files) {
  const { buildReviewPrompt, parseReviewResponse } = await import('../../../tui/lib/security-reviewer.js');

  const MAX_DIFF_LENGTH = 15000;
  const truncatedDiff = diff.length > MAX_DIFF_LENGTH
    ? diff.slice(0, MAX_DIFF_LENGTH) + '\n\n[Diff truncated at 15000 characters — review limited to visible portion]'
    : diff;

  const prompt = buildReviewPrompt(truncatedDiff, { files, focus: 'all' });
  const response = await callLLM(prompt);
  const parsed = parseReviewResponse(response, files);
  return parsed.issues;
}

// ─── 4. mergeResults ────────────────────────────────────────────────────────────

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function mergeResults(sastFindings, aiIssues) {
  const converted = (sastFindings || []).map(f => ({
    severity: f.severity,
    file: f.file,
    line: f.line,
    title: f.rule || f.message.split('\n')[0],
    description: f.message,
    suggestion: f.suggestion,
    category: 'security',
  }));

  const seen = new Set();
  const merged = [];

  for (const issue of [...converted, ...(aiIssues || [])]) {
    const key = `${issue.file || ''}:${issue.line || 0}:${issue.title || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(issue);
  }

  merged.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));
  return merged;
}

// ─── 5. uploadSarif ─────────────────────────────────────────────────────────────

export async function uploadSarif(owner, repo, headSha, issues, github) {
  const { default: SarifGenerator } = await import('../../../output/sarifGenerator.js');

  const normalized = issues.map(issue => ({
    ...issue,
    message: issue.description || issue.message || issue.title,
    type: issue.category || issue.tool || 'review',
    analyzer: 'sentinel',
  }));

  const generator = new SarifGenerator();
  const sarifJson = generator.generate(normalized);
  await github.uploadSarif(owner, repo, headSha, JSON.stringify(sarifJson));
}

// ─── 6. reviewPullRequest (default export) ──────────────────────────────────────

export default async function reviewPullRequest(owner, repo, prNumber, options = {}) {
  const startTime = Date.now();
  const github = new GitHubIntegration({ token: options.token || process.env.GITHUB_TOKEN });

  let diff, files, headSha;
  try {
    const prData = await fetchPrDiff(owner, repo, prNumber, github);
    diff = prData.diff;
    files = prData.files;
    headSha = prData.headSha;
  } catch (err) {
    console.warn(`[pr-review] Failed to fetch PR diff: ${err.message}`);
    throw err;
  }

  try {
    await github.postReviewStatus(owner, repo, prNumber, 'in_progress', { mode: 'standard' });
  } catch (err) {
    console.warn(`[pr-review] Failed to post in_progress status: ${err.message}`);
  }

  const sastFindings = [];
  try {
    const { runSast } = await import('../../../tui/lib/sast-runner.js');
    const sastResult = await runSast({ target: process.cwd() });
    sastFindings.push(...(sastResult.findings || []));
  } catch (err) {
    console.warn(`[pr-review] SAST runner failed: ${err.message}`);
  }

  let aiIssues = [];
  try {
    aiIssues = await runAiReview(diff, files);
  } catch (err) {
    console.warn(`[pr-review] AI review failed: ${err.message}`);
  }

  const allIssues = mergeResults(sastFindings, aiIssues);

  try {
    const inlineIssues = allIssues.filter(i => i.file && i.line);
    if (inlineIssues.length > 0) {
      const formatted = github.formatIssuesForReview(inlineIssues);
      await github.createReview(owner, repo, prNumber, headSha, formatted);
    }
  } catch (err) {
    console.warn(`[pr-review] Failed to post inline comments: ${err.message}`);
  }

  try {
    const summary = github.generateSummaryComment(allIssues);
    await github.postComment(owner, repo, prNumber, summary);
  } catch (err) {
    console.warn(`[pr-review] Failed to post summary: ${err.message}`);
  }

  const criticalCount = allIssues.filter(i => i.severity === 'critical').length;
  const highCount = allIssues.filter(i => i.severity === 'high').length;
  const conclusion = criticalCount > 0 ? 'action_required'
    : highCount > 0 ? 'neutral' : 'success';

  try {
    await github.createCheckRun(owner, repo, headSha, {
      status: 'completed',
      conclusion,
      output: {
        title: `Sentinel: ${allIssues.length} issue(s) found`,
        summary: `${criticalCount} critical, ${highCount} high, ${allIssues.filter(i => i.severity === 'medium').length} medium, ${allIssues.filter(i => i.severity === 'low').length} low`,
        text: allIssues.slice(0, 50).map(i =>
          `- [${i.severity?.toUpperCase()}] ${i.file ? `${i.file}:${i.line || ''} ` : ''}${i.description || i.title}`
        ).join('\n'),
      },
    });
  } catch (err) {
    console.warn(`[pr-review] Check run failed: ${err.message}`);
  }

  try {
    await uploadSarif(owner, repo, headSha, allIssues, github);
  } catch (err) {
    console.warn(`[pr-review] SARIF upload failed: ${err.message}`);
  }

  const duration = Date.now() - startTime;
  try {
    await github.postReviewStatus(owner, repo, prNumber, 'complete', {
      issuesFound: allIssues.length,
      duration,
    });
  } catch (err) {
    console.warn(`[pr-review] Failed to post completion status: ${err.message}`);
  }

  return {
    issuesFound: allIssues.length,
    conclusion,
    duration,
    pr: `${owner}/${repo}#${prNumber}`,
  };
}
