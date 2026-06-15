# SENTINEL — Complete Command Reference

All commands are available inside the TUI session screen. Type `/` to open the searchable command palette, or type commands directly in the input bar.

---

## Table of Contents

- [Navigation](#navigation)
- [Session](#session)
- [Security Review](#security-review)
- [SAST & Scanning](#sast--scanning)
- [Loop Engine](#loop-engine)
- [Git Integration](#git-integration)
- [AI & Agents](#ai--agents)
- [Context & Models](#context--models)
- [Output & Reports](#output--reports)
- [System & Settings](#system--settings)
- [Server & CI](#server--ci)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Navigation

| Command | Description |
|---|---|
| `/home` | Return to Home screen |
| `/session` | Open AI chat session |
| `/review` | Open Security Review screen |
| `/loop` | Open Loop Engine |
| `/dashboard` | Open system Dashboard |
| `/new` | Start a brand-new session (clears history) |
| `/sessions` | Browse past sessions (Ctrl+S in session) |

---

## Session

| Command | Description |
|---|---|
| `/clear` | Clear current session messages |
| `/new` | Start a new conversation |
| `/mode` | Toggle BUILD ↔ PLAN mode |
| `/undo` | Undo last AI change (restores from checkpoint) |
| `/help` | Show command list in a toast |
| `/exit` | Quit SENTINEL |

---

## Security Review

### Basic Review

| Command | Example | Description |
|---|---|---|
| `/review` | `/review` | Open two-panel review screen for current diff |
| `/review <file>` | `/review src/auth.ts` | Review changes to a specific file |
| `/review-branch <branch>` | `/review-branch main` | Review all changes vs a branch |
| `/review-file <path>` | `/review-file src/api.ts` | Open review screen for a specific file |

Each review automatically:
- Runs SAST tools (ESLint + Semgrep + secret scan + npm audit)
- Injects `SENTINEL.md` / `CLAUDE.md` project context
- Returns structured output: Summary → Issues (🔴🟠🟡🟢) → Checklist → Score (A–F)

### Review Output Severity

| Icon | Level | Action |
|---|---|---|
| 🔴 | **Critical** | Must fix before merge |
| 🟠 | **High** | Should fix |
| 🟡 | **Medium** | Consider fixing |
| 🟢 | **Low** | Suggestions only |

### Parallel Review

| Command | Description |
|---|---|
| `/parallel` | Run 4 specialist AI agents concurrently on current diff |

The 4 specialists are:
- **Security Auditor** — OWASP Top 10, injection, hardcoded secrets, auth
- **Dependency Inspector** — package changes, version downgrades, vulnerable patterns
- **Logic Analyst** — race conditions, null pointer risks, off-by-one errors
- **Best Practices Reviewer** — missing error handling, logging sensitive data

Results are merged and deduplicated before display.

---

## SAST & Scanning

| Command | Example | Description |
|---|---|---|
| `/sast` | `/sast` | Run all SAST tools on current directory |
| `/sast <path>` | `/sast src/` | Run SAST on a specific path |
| `/scan` | `/scan` | Quick security scan of current directory |
| `/scan <path>` | `/scan src/api/` | Scan a specific path |
| `/secrets` | `/secrets` | Scan for secrets and sensitive data only |
| `/analyze` | `/analyze` | Run Sentinel code analyzers |
| `/full-scan` | `/full-scan` | Run all available analyzers |
| `/security` | `/security` | Comprehensive security audit |
| `/lint` | `/lint` | Run linter analysis |
| `/complexity` | `/complexity` | Analyze code complexity |
| `/best-practices` | `/best-practices` | Check code against best practices |
| `/frontend` | `/frontend` | Frontend-focused analysis (React, TS, a11y) |
| `/backend` | `/backend` | Backend-focused analysis (API, security, perf) |
| `/container` | `/container` | Container/Docker security analysis |
| `/multi-file` | `/multi-file` | Cross-file dependency analysis |
| `/pre-commit` | `/pre-commit` | Scan staged files only (pre-commit check) |

### SAST Tools Run

| Tool | Trigger | What it finds |
|---|---|---|
| ESLint (security rules) | Always (if eslint in node_modules/.bin) | `no-eval`, injection patterns, unsafe regexes |
| Semgrep | Always (if semgrep in PATH) | OWASP patterns, custom rules |
| Secret scan | Always (no external tool) | API keys, passwords, private key headers |
| npm audit | Always (if package.json exists) | Known vulnerable dependencies |

---

## Loop Engine

Access via `/loop` or `Ctrl+L`. All loops use the AI to review and fix iteratively.

| Command | Description |
|---|---|
| `/loop` | Open Loop Engine screen (all 4 types) |
| `/watch` | Open Loop Engine → Watch Loop |
| `/pipeline` | Open Loop Engine → Pipeline Loop |
| `/ci` | Open Loop Engine → CI Loop |

### Loop Types (from the Loop Engine screen)

#### 1. Review Loop
```
review → [find issues] → fix → review → ... → clean ✅
```
- Repeats up to 3 iterations (configurable)
- Stops when no critical/high issues found
- Auto-commit each fix pass with `autoCommitFixes` option

#### 2. Watch Loop
```
[file changed] → review → show issues → watch again ↺
```
- 1500ms debounce on changes
- Ignores `node_modules/`, `dist/`, `.git/`
- Cleans up file watchers on Ctrl+C

#### 3. Pipeline Loop
```
scan → plan → fix → verify ✅
```
1. SAST scan of entire codebase
2. AI plans fix sequence for critical/high issues
3. AI applies fixes
4. Re-reviews to verify clean

#### 4. CI Loop
```
npm test → [fix failures] → npm test → ... → green ✅
```
- Default command: `npm test --passWithNoTests`
- Up to 4 fix attempts
- Only fixes production code — never deletes tests

### Loop Controls (keyboard, in Loop Engine screen)

| Key | Action |
|---|---|
| `↑` / `↓` | Select loop type |
| `1` / `2` / `3` / `4` | Jump to loop type directly |
| `Enter` | Start selected loop |
| `s` | Stop running loop |
| `q` / `Esc` | Go back to Session |

---

## Git Integration

| Command | Example | Description |
|---|---|---|
| `/review` | `/review` | Review current git diff |
| `/review-branch <branch>` | `/review-branch main` | Review vs branch |
| `/diff` | `/diff` | Review staged changes only |
| `/commit` | `/commit` | AI generates commit message for current changes |
| `/blame` | `/blame` | Analyse issues with git blame attribution |
| `/pre-commit` | `/pre-commit` | Pre-commit check (staged files only) |
| `/pr` | `/pr` | Review a GitHub PR |
| `/pr-description` | `/pr-description` | Generate PR description from changes |
| `/pr-summary` | `/pr-summary` | Generate comprehensive PR summary |
| `/log` | `/log` | View git history |
| `/install-hooks` | `/install-hooks` | Install git pre-commit hooks |

### `/commit` — AI Commit Messages

Types `/commit` to get an AI-generated commit message based on your current diff. The AI follows conventional commit format:

```
feat(auth): add JWT refresh token rotation

- Implements sliding window token refresh
- Adds token blacklist on logout
- Fixes potential session fixation vulnerability
```

---

## AI & Agents

| Command | Example | Description |
|---|---|---|
| `/background <prompt>` | `/background audit all API endpoints` | Launch a background agent task |
| `/agents` | `/agents` | List all running background agents and status |
| `/parallel` | `/parallel` | 4 specialist agents on current diff in parallel |
| `/wizard` | `/wizard` | Multi-step analysis wizard dialog |
| `/fix` | `/fix` | Auto-fix detected issues |
| `/explain` | `/explain sql-injection` | Plain-English vulnerability explanation |
| `/agent` | `/agent` | Chat with autonomous agent |
| `/chat` | `/chat` | Quick AI chat |
| `/search` | `/search CVE-2024-1234` | Web search |
| `/test-suggestions` | `/test-suggestions` | Generate test suggestions for changed code |
| `/ollama` | `/ollama` | Chat with local Ollama models |

### Background Agents

```bash
/background audit all API endpoints for OWASP vulnerabilities
# → 🚀 Background agent `agent_1234` started.
# → Check status with /agents

/agents
# → • agent_1234 — running (2m 34s) — "audit all API endpoints..."
```

---

## Context & Models

| Command | Description |
|---|---|
| `/context` | Show active context files, or create `SENTINEL.md` template |
| `/models` | List all 40+ supported models by provider with pricing |
| `/health` | System diagnostics: server, memory, tokens, API providers |

### `/context` — Project Context Files

SENTINEL reads context from (in priority order):
1. `SENTINEL.md` in project root
2. `CLAUDE.md` in project root
3. `.sentinel/context.md`

Running `/context` when no file exists creates a `SENTINEL.md` template:

```markdown
# Project Context

## About This Project
[Describe your project here]

## Security Notes
[List security-sensitive areas, constraints]

## Architecture
[Brief overview]

## Out of Scope
[What Sentinel should NOT touch]
```

Context is auto-injected into every review prompt — the AI knows your project before reviewing.

### `/models` — Available Models

Shows all 40+ models across 13 providers:

```
## Available Models by Provider

### Anthropic
  `claude-opus-4-6`    — Claude Opus 4.6 🧠 ($5/$25 per M)
  `claude-sonnet-4-6`  — Claude Sonnet 4.6 🧠 ($3/$15 per M)
  `claude-haiku-4-5`   — Claude Haiku 4.5 ($1/$5 per M)

### Groq
  `llama-3.3-70b-versatile`  — Llama 3.3 70B (Groq) ($0.59/$0.79 per M)
  `llama-3.1-8b-instant`     — Llama 3.1 8B Instant (Groq) ($0.05/$0.08 per M)
...
```

🧠 = supports extended thinking/reasoning mode.

### `/health` — System Diagnostics

```
## System Health

**Server:** 🟢 Connected (localhost:3000)
**Uptime:** 12m 34s  **Memory:** 142.3MB heap / 310.1MB RSS
**Model:** claude-sonnet-4-6  **Mode:** REVIEW
**Context:** ~8,234 tokens used of 40,000 limit (21%)
**AI Providers:** Anthropic ✓ · Groq ✓ · Ollama ✓
```

---

## Output & Reports

| Command | Description |
|---|---|
| `/report` | Generate analysis report |
| `/sarif` | Generate SARIF report for GitHub Security tab |
| `/badge` | Generate security score badge |
| `/status` | Show system status and statistics |
| `/metrics` | Show performance metrics (memory, uptime, CPU) |
| `/stats` | Show repository statistics |
| `/trends` | View historical analysis trends |
| `/notify` | Send results to Slack or Discord |
| `/secret-patterns` | List all active secret detection patterns |

### SARIF Output

SARIF (Static Analysis Results Interchange Format) can be uploaded to GitHub Advanced Security:

```bash
/sarif
# → Generates sentinel-results.sarif
# Upload via: gh api repos/owner/repo/code-scanning/sarifs
```

---

## System & Settings

| Command | Description |
|---|---|
| `/config` | Manage Sentinel configuration |
| `/auth` | Configure API keys for AI providers |
| `/models` | List and configure AI models |
| `/rules` | Manage custom linting rules |
| `/theme` | Change color theme |
| `/features` | Manage feature flags |
| `/team` | Manage team workspace |
| `/policy` | Manage security policies |
| `/cache` | Manage analysis cache |
| `/validate` | Validate Sentinel configuration |
| `/setup` | Run setup configuration wizard |

---

## Server & CI

| Command | Description |
|---|---|
| `/ci` | Open Loop Engine → CI Loop |
| `/server` | Start Sentinel API server |
| `/webhook` | Start GitHub App webhook server |

### CI Usage (non-interactive)

```bash
# Run from CI pipeline
sentinel analyze --format sarif --output sentinel.sarif
sentinel security-audit --fail-on critical
sentinel pre-commit
```

---

## Keyboard Shortcuts

### All Screens

| Key | Action |
|---|---|
| `Ctrl+C` | Exit SENTINEL |

### Home Screen

| Key | Action |
|---|---|
| `Tab` | Cycle mode: BUILD → PLAN → REVIEW → SCAN → FIX |
| `Ctrl+R` | Open Security Review screen |
| `Ctrl+L` | Open Loop Engine |
| `Ctrl+D` | Open Dashboard |
| `Enter` | Submit prompt |

### Session Screen

| Key | Action |
|---|---|
| `Tab` | Toggle BUILD ↔ PLAN |
| `Ctrl+P` | Open Command Palette |
| `Ctrl+S` | Toggle Session Panel (session history) |
| `@` + text | File autocomplete — `↑↓` to select, `Tab` to insert, `Esc` to cancel |

### Command Palette (Ctrl+P)

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate commands |
| `Enter` | Run selected command |
| `Esc` | Close palette |
| type to filter | Searches names and descriptions |

### Loop Engine Screen

| Key | Action |
|---|---|
| `↑` / `↓` | Select loop type |
| `1` / `2` / `3` / `4` | Jump to loop type |
| `Enter` | Start selected loop |
| `s` | Stop running loop |
| `q` / `Esc` | Back to Session |

### Review Screen

| Key | Action |
|---|---|
| `Tab` | Switch focus between file list and review panel |
| `↑` / `↓` | Navigate files (in file list) |
| `Enter` | Review selected file |
| `Ctrl+R` | Re-run review |
| `q` / `Esc` | Back to Session |

---

## Quick Reference Card

```
Navigation          Review              Scan                Loops
──────────          ──────              ────                ─────
/home               /review             /sast               /loop
/session            /review <file>      /scan               /watch
/review             /review-branch      /secrets            /pipeline
/loop               /parallel           /analyze            /ci
/dashboard          /review-file        /full-scan

Git                 AI Agents           Context             System
───                 ─────────           ───────             ──────
/commit             /background         /context            /health
/diff               /agents             /models             /status
/pre-commit         /fix                /wizard             /metrics
/blame              /explain            /chat               /config
/pr                 /parallel           /search             /auth

Output              Session
──────              ───────
/report             /clear
/sarif              /new
/badge              /undo
/notify             /mode
                    /help
```

---

> **Tip:** Type any partial command name in the Command Palette (`Ctrl+P`) to filter. The palette shows the last-used commands first (MRU ordering).
