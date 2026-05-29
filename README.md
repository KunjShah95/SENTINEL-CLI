# Sentinel — AI-Powered Code Security & Review Platform

[![npm version](https://img.shields.io/npm/v/sentinel-cli?style=flat-square&color=blue)](https://www.npmjs.com/package/sentinel-cli)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Marketplace-white?logo=github&style=flat-square)](https://github.com/marketplace/actions/sentinel-pr-review)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.x-black?style=flat-square)](https://bun.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

Sentinel is a local-first, privacy-focused code security platform. It automates security audits, AI-powered code reviews, dependency checks, threat modeling, and compliance scanning — all from your terminal. Built with a React-based TUI and a multi-agent AI pipeline, it detects and fixes vulnerabilities before they reach production.

---

## Features

| Area                   | Capabilities                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **21 Analyzers**       | Security, secrets, quality, bugs, performance, accessibility, TypeScript, React, Vue, Go, Docker, Kubernetes, GraphQL, IaC, API security, env security, dependency scanning, container image scanning, AI-powered analysis, custom rules |
| **Multi-Agent AI**     | Scanner → Fixer → Validator pipeline with OpenAI, Gemini, Groq, Anthropic, or OpenRouter. False positive reduction, adaptive model selection, active learning                                                                            |
| **Local-First**        | Your code never leaves your machine. Prompts generated locally. Optional cloud features                                                                                                                                                  |
| **Git Native**         | Analyze staged changes, commits, branches, diffs. Pre-commit hooks. Git blame integration                                                                                                                                                |
| **Auto-Fix**           | One-command fix for common issues: console logs, debuggers, trailing whitespace, missing alt text, unused vars, sort imports, JSX indentation                                                                                            |
| **TUI & Dashboard**    | Full React-based terminal UI (OpenTUI) plus web dashboard for visual reporting                                                                                                                                                           |
| **CI/CD Ready**        | GitHub Action, GitLab CI, Azure Pipelines, Bitbucket Pipelines. SARIF output for GitHub Security tab                                                                                                                                     |
| **Interactive AI**     | Chat with your codebase. Semantic search. Codebase-aware Q&A via RAG pipeline                                                                                                                                                            |
| **Threat Modeling**    | Attack surface mapping, STRIDE-based threat analysis, compliance checks (OWASP, HIPAA, PCI-DSS)                                                                                                                                          |
| **Multi-Tenant**       | Policy engine, tenant isolation, queue prioritization, feature flags for enterprise deployments                                                                                                                                          |
| **Custom Rules**       | `.sentinelrules.yaml` for project-specific patterns with regex, severity, and auto-fix suggestions                                                                                                                                       |
| **Notifications**      | Slack, Discord, webhooks for security alerts                                                                                                                                                                                             |
| **MCP Server**         | Model Context Protocol server for AI tool integration                                                                                                                                                                                    |
| **Trends & Analytics** | Historical analysis tracking, CSV export, trend visualization                                                                                                                                                                            |

---

## Quick Start

```bash
# Install globally
npm install -g sentinel-cli

# Configure AI provider
sentinel auth

# Run a security audit
sentinel security-audit
```

### Without install

```bash
npx sentinel-cli analyze --staged
```

---

## CLI Overview

### Core Analysis

| Command                   | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `sentinel analyze`        | Analyze files or directories with selected analyzers          |
| `sentinel security-audit` | Comprehensive security scan (security + secrets + API + deps) |
| `sentinel full-scan`      | Run all 21 analyzers across the project                       |
| `sentinel pre-commit`     | Scan staged files (for git hooks)                             |
| `sentinel frontend`       | React/TypeScript/a11y focused analysis                        |
| `sentinel backend`        | Security + API + performance analysis                         |
| `sentinel diff`           | Staged diff review (pre-commit friendly)                      |
| `sentinel ci`             | CI-friendly run with fail conditions and JSON output          |

### AI & Interactive

| Command                        | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `sentinel interactive` / `s i` | Interactive conversational AI mode                     |
| `sentinel chat`                | Launch interactive assistant console                   |
| `sentinel ask <question>`      | Ask questions about your codebase (with RAG indexing)  |
| `sentinel search <query>`      | Semantic code search with natural language             |
| `sentinel context`             | Deep project context analysis (framework, arch, risks) |

### Security & Governance

| Command                          | Description                                             |
| -------------------------------- | ------------------------------------------------------- |
| `sentinel attack-surface`        | Map entry points, data flows, API endpoints, risk areas |
| `sentinel threats`               | Generate STRIDE-based threat models with mitigations    |
| `sentinel compliance <standard>` | Check against OWASP, HIPAA, PCI-DSS, SOC2               |
| `sentinel sarif`                 | Export SARIF for GitHub Code Scanning                   |
| `sentinel trace <id>`            | Trace function/class usage across codebase              |
| `sentinel impact <file>`         | Analyze architectural impact of changing a file         |

### Automation & CI

| Command                      | Description                                          |
| ---------------------------- | ---------------------------------------------------- |
| `sentinel review-pr <url>`   | Analyze and post review to GitHub PR                 |
| `sentinel fix`               | Auto-fix detected issues                             |
| `sentinel fix --dry-run`     | Preview fixes without applying                       |
| `sentinel blame`             | Analysis with author attribution                     |
| `sentinel analyze-workspace` | Monorepo/workspace analysis (npm, pnpm, lerna, rush) |
| `sentinel badge`             | Generate dynamic security score badges               |

### Reporting

| Command                                   | Description                                |
| ----------------------------------------- | ------------------------------------------ |
| `sentinel dashboard`                      | Launch local web dashboard                 |
| `sentinel trends`                         | Historical analysis trends with CSV export |
| `sentinel audit-log` / `sentinel history` | Command and findings history               |
| `sentinel notify`                         | Send alerts to Slack, Discord, webhooks    |

### Configuration

| Command                  | Description                                |
| ------------------------ | ------------------------------------------ |
| `sentinel auth`          | Interactive API key setup for AI providers |
| `sentinel auth status`   | Check which providers are configured       |
| `sentinel config`        | Manage configuration manually              |
| `sentinel setup`         | Interactive configuration wizard           |
| `sentinel status`        | System status and statistics               |
| `sentinel install-hooks` | Install pre-commit git hooks               |

### Output Formats

Console (rich), JSON, HTML, Markdown, SARIF, JUnit XML — via `--format` flag.

---

## GitHub Action

Add to `.github/workflows/sentinel.yml`:

```yaml
- uses: actions/checkout@v4
- uses: KunjShah95/Sentinel-CLI@main
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

Supports analyzers selection, fail-on-error, SARIF upload to GitHub Security tab.

Other CI integrations: GitLab CI (`.gitlab-ci.yml`), Azure Pipelines (`azure-pipelines.yml`), Bitbucket Pipelines (`bitbucket-pipelines-sentinel.yml`).

---

## Analyzers

| Analyzer                | Type                                                    |
| ----------------------- | ------------------------------------------------------- |
| Security Scanner        | XSS, SQLi, CSRF, command injection, dangerous APIs      |
| Secrets Detection       | 20+ regex patterns for API keys, tokens, passwords      |
| Dependency Scanner      | npm audit, CVE checking, unpinned versions              |
| API Security            | CORS, JWT, rate limiting, hardcoded secrets             |
| Environment Security    | .env analysis, secret exposure                          |
| Docker Security         | Root user, secrets in ENV, health checks                |
| Kubernetes Security     | Privileged containers, securityContext, resource limits |
| GraphQL Security        | Query depth, introspection, data exposure               |
| IaC Security            | Infrastructure-as-code misconfigurations                |
| Container Image Scanner | Image vulnerability analysis                            |
| Quality Analyzer        | Complexity, maintainability, code smells                |
| Bug Analyzer            | Null checks, logic errors, common mistakes              |
| Performance Analyzer    | Memory leaks, N+1 queries, inefficiencies               |
| TypeScript Analyzer     | `any` types, `@ts-ignore`, type safety                  |
| React/JSX Analyzer      | Hooks rules, missing keys, dangerous innerHTML          |
| Vue Analyzer            | Composition API, template issues                        |
| Go Analyzer             | Concurrency issues, error handling                      |
| Accessibility (A11y)    | WCAG 2.1 compliance, ARIA, form labels                  |
| AI Analyzer             | LLM-powered deep code review                            |
| Custom Analyzer         | User-defined YAML rules in `.sentinelrules.yaml`        |
| Cross-File Analysis     | Multi-file pattern detection and data flow tracking     |

---

## TUI (Terminal UI)

Sentinel ships with a full React-based terminal UI built on OpenTUI:

```bash
sentinel dashboard   # Launch TUI dashboard
sentinel             # Default TUI entry point
```

Requires Bun, tsx, or Node.js 18+. The TUI features multi-screen navigation with Home, Session, and Dashboard views.

---

## AI Providers

| Provider      | Env Variable         |
| ------------- | -------------------- |
| OpenAI        | `OPENAI_API_KEY`     |
| Google Gemini | `GEMINI_API_KEY`     |
| Groq          | `GROQ_API_KEY`       |
| Anthropic     | `ANTHROPIC_API_KEY`  |
| OpenRouter    | `OPENROUTER_API_KEY` |

Configure via `sentinel auth` or set environment variables directly.

---

## Auto-Fix

```bash
sentinel fix                              # Auto-fix all issues
sentinel fix --dry-run                    # Preview only
sentinel fix --type remove-console-log    # Specific fix type
sentinel fix --staged                     # Fix staged files only
```

Available fix types: `missing-alt-text`, `remove-console-log`, `remove-debugger`, `trailing-whitespace`, `multiple-empty-lines`, `sort-imports`, `fix-jsx-indentation`, `remove-unused-vars`.

---

## AI Agents

Sentinel's multi-agent system orchestrates specialized agents for deep analysis:

- **Scanner Agent** — Identifies issues across all analyzers
- **Fixer Agent** — Generates and applies fixes
- **Validator Agent** — Validates fixes don't introduce regressions
- **Security Agent** — Deep security-specific analysis
- **Documentation Agent** — Generates documentation and PR descriptions
- **Task Planner Agent** — Plans multi-step remediation
- **Universal Agent** — General-purpose code analysis
- **Language Agents** — Language-specific (Go, Python) deep analysis

---

## Custom Rules

Create `.sentinelrules.yaml` in your project root:

```yaml
rules:
  - id: no-console-log
    pattern: "console\\.log"
    message: 'Avoid console.log in production'
    severity: warning
    filePattern: "\\.(js|ts)$"
    suggestion: 'Use a proper logging library'
```

Rule locations: project-level (`.sentinelrules.yaml`), user-level (`~/.sentinelrules.yaml`), or custom path via `--rules`.

---

## Architecture Overview

```
src/
├── analyzers/       # 21 built-in analyzers
├── agents/          # Multi-agent AI pipeline
├── analysis/        # Attack surface mapping, threat modeling, cross-file analysis
├── cli/             # CLI handlers and console interface
├── compliance/      # OWASP, HIPAA, PCI-DSS scanning
├── config/          # Configuration management
├── core/            # Orchestration, bot, event bus, policy engine
├── database/        # Local SQLite-based storage
├── git/             # Git integration
├── integrations/    # GitHub, Jira, CVE database, notifications
├── intelligence/    # Active learning, GNN feature extraction, AST retrieval
├── llm/             # LLM provider abstraction layer
├── mcp/             # Model Context Protocol server
├── ml/              # MLOps pipeline, anomaly detection, synthetic data
├── output/          # Report generation (console, JSON, SARIF, HTML, Markdown)
├── rag/             # RAG pipeline for codebase-aware AI
├── search/          # Semantic code search
├── server/          # Dashboard and badge web server
├── tui/             # React-based terminal UI (OpenTUI)
└── workers/         # Background workers
```

---

## Documentation

| Resource                                    | Description                         |
| ------------------------------------------- | ----------------------------------- |
| [Command Reference](docs/commands.md)       | Full CLI command list               |
| [Quick Start Guide](docs/QUICK_START.md)    | 5-minute getting started            |
| [Analyzers Reference](docs/analyzers.md)    | All 21 analyzers detailed           |
| [AI Providers](docs/providers.md)           | LLM configuration reference         |
| [Command Guide](command_guide.md)           | Detailed command usage and examples |
| [Custom Rules](.sentinelrules.yaml.example) | Rule configuration reference        |

---

## Requirements

- **Runtime**: Bun 1.x (recommended), Node.js 18+, or tsx
- **Memory**: 256 MB minimum, 1 GB+ for large codebases
- **Disk**: ~50 MB for installation

---

## License

MIT — Created by [Kunj Shah](https://github.com/KunjShah95).
