# PR Review Bot Design

> Transform Sentinel's existing webhook into a real-time, autonomous PR reviewer — the open-source CodeRabbit alternative.

## Architecture

```
GitHub PR (opened/synchronize/reopened)
        │
        ▼
  POST /webhook/github ──► Hono app
        │
        ▼
  pr-review-orchestrator.js  (NEW)
        │
        ├── fetchPrDiff() ──► GitHub API (compare commits)
        │
        ├── runSast() ──► sast-runner.ts (FIX import)
        │       ├── ESLint (eslint-plugin-security)
        │       ├── Semgrep (OWASP top 10 rules)
        │       ├── Secret scanner (built-in)
        │       └── npm audit (if package.json changed)
        │
        ├── runAiReview() ──► llmOrchestrator.js
        │       ├── Uses buildReviewPrompt() with the diff
        │       ├── Calls cheapest capable model
        │       └── parseReviewResponse() → ReviewIssue[]
        │
        └── postResults() ──► GitHub API
                ├── createReview() → inline comments (file+line issues)
                ├── postComment() → summary markdown
                ├── createCheckRun() → check with annotations
                └── uploadSarif() → POST /code-scanning/sarifs
```

## Files

| File | Action | Purpose |
|------|--------|---------|
| `src/server/api/lib/pr-review-orchestrator.js` | **NEW** | Headless orchestrator |
| `src/server/api/routes/github-webhook.js` | **UPDATE** | Wire orchestrator into Hono route |
| `src/tui/lib/sast-runner.ts` | **FIX** | Already exists — fix webhook import path |
| `.github/workflows/pr-review.yml` | **NEW** | GitHub Actions CI workflow |
| `docker-compose.yml` | **UPDATE** | Fix broken entrypoint |

## Key Design Decisions

1. **Single AI call by default** (cheap, fast). `PARALLEL_REVIEW=true` env var enables 4-agent parallel review.
2. **Model selection**: cheapest configured provider with sufficient capability (same routing from `model-router.ts`)
3. **SAST + AI merge**: SAST findings get `tool` field, AI findings get `ai` field. Dedup by file+line+rule.
4. **Error handling**: partial results always posted. LLM fails → SAST-only. SAST fails → AI-only.
5. **No React/TUI dependency**: orchestrator is pure Node.js, runs server-side only.

## What Makes This Unique

| Feature | CodeRabbit | Qodo | Sentinel |
|---------|-----------|------|----------|
| Pricing | $15-24/user/mo | $19/user/mo | Free + self-hosted |
| Open source | ❌ | ❌ | ✅ MIT |
| Model choice | Proprietary | Proprietary | 13+ providers, free tier first |
| SAST + AI | ❌ (LLM only) | ❌ (LLM only) | ✅ ESLint + Semgrep + secrets + AI |
| SARIF output | ❌ | ❌ | ✅ GitHub Security tab |
| Air-gap capable | ❌ | ❌ | ✅ Local models (Ollama, LM Studio) |
| Self-hosted | ❌ (SaaS only) | ❌ | ✅ Docker one-liner |
