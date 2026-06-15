# SENTINEL — AI Security Code Guardian

[![npm version](https://img.shields.io/npm/v/sentinel-cli?style=flat-square&color=blue)](https://www.npmjs.com/package/sentinel-cli)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square)](https://www.typescriptlang.org/)

**SENTINEL** is a terminal-based AI security code reviewer and coding agent — think CodeRabbit meets Claude Code, running entirely in your terminal. It performs CodeRabbit-style security reviews, runs SAST tools, manages agentic fix loops, and streams AI responses from 13 different LLM providers — all from a beautiful Ink-powered TUI.

---

## Features at a Glance

| Feature | What it does |
|---|---|
| **CodeRabbit-style review** | Full diff review with 🔴🟠🟡🟢 severity ratings, security checklist, A-F score |
| **SAST integration** | ESLint, Semgrep, secret scanning, npm audit — runs before every review |
| **4 agentic loop types** | Review→fix loop, file-watch loop, pipeline loop, CI loop |
| **Parallel specialist agents** | 4 concurrent reviewers (security / deps / logic / style) |
| **13 LLM providers** | Anthropic, OpenAI, Gemini, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, Perplexity, OpenRouter, Ollama, LM Studio |
| **Smart model routing** | Picks the best model tier per task (security-review, fix-code, quick-scan, etc.) |
| **Context compaction** | Auto-summarises history when >30 messages or >40k tokens |
| **Context files** | Reads `SENTINEL.md` / `CLAUDE.md` and injects project context into every review |
| **Auto-server startup** | Hono API server starts automatically when you launch the TUI |
| **Session persistence** | SQLite/JSON session storage with full message history |

---

## Quick Start

```bash
git clone https://github.com/KunjShah95/sentinel-cli
cd sentinel-cli
npm install
npm start              # launches TUI
```

The TUI auto-starts the Hono server in the background. Set at least one API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
# (see Provider Setup below for all 13 providers)
```

> **No Bun required.** SENTINEL runs on Node.js ≥ 18 using `tsx`.

---

## TUI Navigation

```
sentinel              # open TUI (Home screen)
```

### Screens

| Screen | How to reach | What it does |
|---|---|---|
| **Home** | startup | Quick actions, mode selector, input bar |
| **Session** | Enter any prompt | AI chat with full slash commands |
| **Review** | `Ctrl+R` or `/review` | Two-panel security review interface |
| **Loop Engine** | `Ctrl+L` or `/loop` | All 4 agentic loop types |
| **Dashboard** | `Ctrl+D` | System stats, provider status |

### Keyboard Shortcuts (Home)

| Key | Action |
|---|---|
| `Tab` | Cycle mode: BUILD → PLAN → REVIEW → SCAN → FIX |
| `Ctrl+R` | Open Security Review screen |
| `Ctrl+L` | Open Loop Engine |
| `Ctrl+D` | Open Dashboard |
| `Ctrl+C` | Exit |

### Keyboard Shortcuts (Session)

| Key | Action |
|---|---|
| `Tab` | Toggle BUILD ↔ PLAN mode |
| `Ctrl+P` | Open Command Palette |
| `Ctrl+S` | Open Session Panel |
| `@filename` | File autocomplete with ↑↓ to select, Tab to insert |

---

## Five Modes

| Mode | Symbol | Tools available | Use case |
|---|---|---|---|
| **BUILD** | `⬡` | All tools (read + write + bash) | Implement, edit, fix code |
| **PLAN** | `◎` | Read-only | Explore codebase, propose architecture |
| **REVIEW** | `⊕` | Read-only | Security review, code audit |
| **SCAN** | `◈` | Read-only | Static analysis, vulnerability scan |
| **FIX** | `⚙` | Read + write (no bash) | Targeted fix application |

---

## Security Review

SENTINEL's flagship feature — a full CodeRabbit-style review that combines:
1. **SAST pre-scan** (ESLint security rules, Semgrep, secret detection, npm audit)
2. **Project context injection** from `SENTINEL.md` / `CLAUDE.md`
3. **AI review** with structured output: Summary → Walkthrough → Issues → Checklist → Score

```bash
# Review current git diff (staged + unstaged)
/review

# Review a specific file's changes
/review src/auth.ts

# Review all changes vs a branch
/review-branch main

# Run SAST tools only (no AI)
/sast

# Run 4 specialist AI agents in parallel
/parallel
```

### Review Output Format

```
## Summary
High-risk changes detected. Authentication logic modified with potential bypass.

## Issues Found

### 🔴 Critical (must fix before merge)
- **[src/auth.ts:42]** JWT secret hardcoded
  Secret exposed in source control
  💡 Fix: Move to process.env.JWT_SECRET

### 🟠 High (should fix)
...

## Score: C
Two critical issues require immediate attention before merge.
```

### Project Context File

Create `SENTINEL.md` in your project root to inject context into every review:

```bash
/context           # creates SENTINEL.md template if none exists
```

```markdown
# Project Context

## About This Project
Node.js REST API for payment processing

## Security Notes
- All financial data must be encrypted at rest
- JWT tokens expire in 15 minutes
- Never log credit card numbers

## Architecture
Express + PostgreSQL + Redis session store

## Out of Scope
node_modules/, dist/, *.test.ts
```

---

## Loop Engine

Four agentic automation patterns accessible from `/loop` or `Ctrl+L`:

### 1. Review Loop
Repeatedly reviews, fixes, and re-reviews until no critical/high issues remain.
```
[review] → [fix] → [review] → [fix] → ... → clean ✅
```
- Up to 3 iterations by default
- Stops when no critical/high issues found
- Optional `autoCommitFixes` to commit each fix pass (like Aider)

### 2. Watch Loop
Watches your filesystem and auto-reviews any changed files.
```
[file saved] → [review changed files] → [show issues] → [watch again]
```
- 1500ms debounce
- Ignores `node_modules`, `dist`, `.git`
- Cleans up watchers on Ctrl+C (SIGINT safe)

### 3. Pipeline Loop
Full scan → plan → fix → verify sequence.
```
[SAST scan] → [plan fixes] → [apply fixes] → [verify clean]
```

### 4. CI Loop
Runs your test suite and fixes failures automatically.
```
[npm test] → [fix failures] → [npm test] → ... → green ✅
```
- Up to 4 attempts
- Fixes production code, never deletes tests

---

## SAST Integration

SENTINEL runs static analysis tools before every AI review:

| Tool | What it checks | Requires |
|---|---|---|
| **ESLint** | Security rules (`no-eval`, `no-implied-eval`, injection patterns) | `eslint` in `node_modules/.bin` |
| **Semgrep** | OWASP Top 10, custom security patterns | `semgrep` in PATH |
| **Secret scan** | API keys, passwords, private keys (always runs) | Nothing |
| **npm audit** | Known vulnerable dependencies | `package.json` |

```bash
/sast              # run all SAST tools
/sast src/         # scan specific directory
```

---

## Parallel Specialist Agents

Instead of one review pass, `/parallel` runs 4 agents concurrently:

| Agent | Focus |
|---|---|
| **Security Auditor** | OWASP Top 10, injection, auth issues, hardcoded secrets |
| **Dependency Inspector** | Package changes, version downgrades, known-vulnerable patterns |
| **Logic Analyst** | Business logic bugs, race conditions, null pointer risks |
| **Best Practices Reviewer** | Error handling gaps, missing validation, logging sensitive data |

Results are merged and deduplicated (Jaccard similarity deduplication).

---

## LLM Providers

SENTINEL supports 13 providers and 40+ models out of the box.

### Tier 1 — Proprietary (best quality)

| Provider | Models | API Key |
|---|---|---|
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | `ANTHROPIC_API_KEY` |
| **OpenAI** | GPT-5.4, GPT-5.4 mini/nano, GPT-4o, GPT-4o mini | `OPENAI_API_KEY` |
| **Google** | Gemini 2.5 Pro (thinking), Gemini 2.5 Flash | `GEMINI_API_KEY` |
| **xAI / Grok** | Grok-3, Grok-3 Mini (thinking) | `XAI_API_KEY` |

### Tier 2 — Fast & Cheap

| Provider | Models | API Key |
|---|---|---|
| **Groq** | Llama 3.3 70B, Llama 3.1 8B Instant, QwQ 32B, Mixtral | `GROQ_API_KEY` |
| **Mistral** | Codestral (code-specialist), Mistral Large/Small/Nemo | `MISTRAL_API_KEY` |
| **DeepSeek** | DeepSeek V3 (chat), DeepSeek R1 (reasoner/thinking) | `DEEPSEEK_API_KEY` |
| **Together AI** | Llama 3.3 70B Turbo, Qwen2.5 Coder 32B, DeepSeek V3 | `TOGETHER_API_KEY` |
| **Fireworks** | Same models, fastest inference | `FIREWORKS_API_KEY` |
| **Perplexity** | Sonar Large/Small with live web search | `PERPLEXITY_API_KEY` |

### Tier 3 — Meta / Local

| Provider | How to use | API Key |
|---|---|---|
| **OpenRouter** | `openrouter/<any-model>` — 200+ models | `OPENROUTER_API_KEY` |
| **Ollama** | `ollama/<model>` — fully local, zero cost | None (local) |
| **LM Studio** | `lmstudio/<model>` — local OpenAI-compatible | None (local) |

### Smart Model Routing

SENTINEL automatically routes tasks to the best available model:

| Task | Best model | Fallback |
|---|---|---|
| Security review | Claude Opus 4.6 | DeepSeek R1 |
| Fix code | Claude Sonnet 4.6 | Codestral |
| Plan/architecture | Claude Opus 4.6 | DeepSeek R1 |
| Quick scan | Claude Haiku 4.5 | Llama 3.1 8B Instant |
| CI fix | Claude Sonnet 4.6 | GPT-5.4 |

```bash
/models            # list all 40+ models with pricing
```

---

## Context Compaction

Long sessions are automatically compacted when they exceed 30 messages or ~40,000 tokens:

1. The oldest messages are summarised into bullet points
2. The summary replaces the old messages
3. The last 8 messages are always kept verbatim
4. Token usage is shown live in the status bar

The status bar shows: `~12.4k/40k tok` (yellow at 60%, red at 80%).

---

## Agent Stability Features

| Feature | What it does |
|---|---|
| **Auto-server startup** | Hono server auto-starts if not running; TUI waits up to 3s |
| **Retry / backoff** | 429 → respects Retry-After header; 503 → 1/2/4s backoff |
| **SIGINT cleanup** | Loops and watchers register cleanup; Ctrl+C exits cleanly |
| **Context compaction** | Auto-compacts at 30 msgs / 40k tokens |
| **Session recovery** | Sessions persist via SQLite → JSON file fallback |
| **Local fallback** | If server is down, falls back to local LLM orchestrator |

---

## Architecture

```
sentinel-cli/
├── bin/sentinel.js          # Entry point — routes to CLI or TUI
│                            # Auto-starts Hono server before TUI
├── src/
│   ├── tui/                 # Ink React terminal UI (Node.js ≥ 18)
│   │   ├── index.tsx        # Router: Home / Session / Review / Loop / Dashboard
│   │   ├── screens/
│   │   │   ├── home.tsx     # Landing screen with quick actions
│   │   │   ├── session.tsx  # AI chat + all slash commands
│   │   │   ├── review.tsx   # Two-panel security review
│   │   │   ├── loop.tsx     # Loop Engine UI (4 loop types)
│   │   │   └── dashboard.tsx
│   │   ├── components/
│   │   │   ├── messages/    # UserMessage, BotMessage, ErrorMessage
│   │   │   ├── command-menu/ # Searchable command palette (40+ commands)
│   │   │   ├── session-shell.tsx
│   │   │   ├── status-bar.tsx  # Mode / model / git / tokens / server status
│   │   │   └── input-bar.tsx   # @-mention file autocomplete
│   │   ├── hooks/
│   │   │   ├── use-agent-chat.ts    # SSE streaming + context compaction
│   │   │   └── use-loop-engine.ts   # Loop engine React hook
│   │   └── lib/
│   │       ├── security-reviewer.ts  # Git diff + review prompt builder
│   │       ├── loop-engine.ts        # 4 loop patterns + SIGINT cleanup
│   │       ├── sast-runner.ts        # ESLint / Semgrep / secrets / npm audit
│   │       ├── context-file.ts       # SENTINEL.md / CLAUDE.md injection
│   │       ├── context-compactor.ts  # Auto-compaction of long sessions
│   │       ├── parallel-agents.ts    # 4 concurrent specialist reviewers
│   │       └── model-router.ts       # Smart task → model routing
│   ├── server/
│   │   ├── api/
│   │   │   ├── app.js         # Hono app with auth middleware
│   │   │   ├── start.js       # Server entry (auto-started by TUI)
│   │   │   ├── routes/chat.js # SSE /chat endpoint
│   │   │   └── lib/
│   │   │       ├── chat-stream.js   # 13-provider AI SDK routing
│   │   │       └── system-prompt.js # Mode-aware system prompts
│   │   └── database/
│   │       ├── adapter.js     # Prisma → SQLite → JSON fallback
│   │       └── sessions.js    # Session CRUD
│   ├── shared/
│   │   ├── models/index.js    # 40+ model registry + pricing
│   │   └── tools/index.js     # Local tool implementations
│   ├── llm/
│   │   └── llmOrchestrator.js # Multi-provider fallback orchestrator
│   └── cli/                   # Legacy CLI subcommands
```

---

## Commands Reference

See **[COMMANDS.md](COMMANDS.md)** for the complete slash command reference with usage examples.

---

## Configuration

### Environment Variables

```bash
# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GROQ_API_KEY=gsk_...
MISTRAL_API_KEY=...
DEEPSEEK_API_KEY=...
XAI_API_KEY=...
TOGETHER_API_KEY=...
FIREWORKS_API_KEY=...
PERPLEXITY_API_KEY=...
OPENROUTER_API_KEY=sk-or-...

# Local providers (defaults shown)
OLLAMA_HOST=http://localhost:11434
LMSTUDIO_HOST=http://localhost:1234

# Server
PORT=3000
SENTINEL_HOME=~/.sentinel   # auth + config directory

# Production billing (optional)
POLAR_ACCESS_TOKEN=...
POLAR_ORGANIZATION_ID=...
CLERK_SECRET_KEY=...
```

### Project Context File

Create `SENTINEL.md` in your project root (or run `/context`):

```bash
# Project Context
## About This Project
## Security Notes
## Architecture
## Out of Scope
```

---

## CLI Mode (non-interactive)

```bash
sentinel --help              # all subcommands
sentinel analyze src/        # run analyzers
sentinel security-audit      # full security scan
sentinel diff                # review staged changes
sentinel fix                 # auto-fix issues
sentinel pre-commit          # scan staged files only
sentinel login               # issue dev token
sentinel whoami              # user + credit status
sentinel status              # system diagnostics
sentinel upgrade             # Polar billing checkout
```

---

## Development

```bash
npm install
npm run typecheck            # TypeScript check (zero errors)
npm test                     # all tests
npm run build                # rebuild dist/
npm run sentinel:server      # start Hono server separately
npm start                    # launch TUI (auto-starts server)
```

---

## Requirements

- **Node.js** 18+ (no Bun required)
- **npm** 8+
- At least one AI provider API key

---

## License

MIT — Created by [Kunj Shah](https://github.com/KunjShah95)
