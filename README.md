# 🛡️ Sentinel CLI — AI-Powered Code Guardian

<p align="center">
  <a href="https://www.npmjs.com/package/sentinel-cli">
    <img src="https://img.shields.io/npm/v/sentinel-cli.svg?style=flat-square&color=blue" alt="npm version" />
  </a>
  <a href="https://www.npmjs.com/package/sentinel-cli">
    <img src="https://img.shields.io/npm/dm/sentinel-cli.svg?style=flat-square&color=green" alt="npm downloads" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square" alt="License: MIT" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square" alt="Node Version" />
  </a>
  <a href="https://github.com/KunjShah95/Sentinel-CLI">
    <img src="https://img.shields.io/github/stars/KunjShah95/Sentinel-CLI?style=flat-square" alt="GitHub stars" />
  </a>
</p>

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Quick Start](#quick-start)
5. [Commands Reference](#commands-reference)
6. [Configuration](#configuration)
7. [AI Providers](#ai-providers)
8. [Analyzers](#analyzers)
9. [Output Formats](#output-formats)
10. [CI/CD Integration](#cicd-integration)
11. [Advanced Features](#advanced-features)
12. [VS Code Extension](#vs-code-extension)
13. [Development](#development)
14. [Roadmap](#roadmap)
15. [License](#license)

---

## Overview

**Sentinel CLI** is a comprehensive, developer-first code review platform with a focus on privacy, power, and extensibility. It provides 20+ built-in analyzers for security, code quality, dependency checking, and more—all powered by multiple LLM providers.

### Core Philosophy

- **Local-First**: All code and AI prompts stay on your machine, never sent to external SaaS
- **Privacy**: Your code never leaves your environment
- **Extensible**: Custom rules, YAML configuration, and plugin architecture
- **Multi-LLM**: Use OpenAI, Groq, Gemini, Anthropic, or OpenRouter—bring your own API key

### Supported Languages & Technologies

- **JavaScript/TypeScript**: Full analysis including React, Vue, Node.js
- **Python, Java, Go, Ruby, PHP**: Quality and security scanning
- **Infrastructure**: Docker, Kubernetes, Terraform, CloudFormation
- **Web**: HTML, CSS, Markdown, JSON, YAML
- **API**: REST, GraphQL, OpenAPI schemas

---

## Features

### 🔐 Security Analysis

| Analyzer | Description |
|----------|-------------|
| Security Scanner | XSS, SQL injection, CSRF, command injection, dangerous APIs |
| Secrets Detection | 20+ regex patterns for API keys, tokens, passwords, private keys |
| Dependency Scanner | npm audit, CVE checking, license issues, unpinned versions |
| API Security | CORS, JWT, rate limiting, hardcoded secrets in configs |
| Environment Security | .env file analysis, secret exposure |
| Docker Security | Root user detection, secrets in ENV, ADD/COPY, health checks |
| Kubernetes Security | Privileged containers, securityContext, resource limits |
| GraphQL Security | Query depth limits, introspection, sensitive data exposure |

### 📊 Code Quality

| Analyzer | Description |
|----------|-------------|
| Quality Analyzer | Complexity, maintainability, code smells |
| Bug Analyzer | Null checks, logic errors, common mistakes |
| Performance Analyzer | Memory leaks, N+1 queries, inefficient operations |
| TypeScript Analyzer | `any` types, @ts-ignore, type safety issues |
| Accessibility (A11y) | WCAG 2.1 compliance, alt text, ARIA, form labels |

### ⚛️ Framework-Specific

| Analyzer | Description |
|----------|-------------|
| React/JSX | Hooks rules, missing keys, dangerous innerHTML |
| Vue | Composition API, template issues |
| Go | Concurrency issues, error handling |
| Custom | User-defined YAML rules |

### 🤖 AI-Powered

- **Multi-Agent Orchestration**: Scanner → Fixer → Validator pipeline
- **RAG System**: Advanced retrieval-augmented generation for code context
- **Semantic Search**: Natural language code search using embeddings
- **Self-Learning**: Learns from user feedback and corrections
- **Code Verification**: Executes and validates generated code

### 🛠️ Operations

- **Auto-Fix**: Automatic fixes for common issues (console.log, missing alt, etc.)
- **Baseline Comparison**: Compare scans against a baseline
- **Incremental Analysis**: Only analyze changed files
- **Caching**: Intelligent caching for 10x faster repeated scans
- **Trend Analysis**: Track issues over time

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Sentinel CLI                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │   CLI       │  │  Config     │  │   LLM Orchestrator      ││
│  │  (Commander)│  │  Manager    │  │   (Multi-Provider)      ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                      Core Analysis Engine                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Parallel   │  │   False      │  │   Incremental         │ │
│  │   Processor  │  │   Positive   │  │   Analyzer            │ │
│  │              │  │   Reducer    │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    Analyzers (20+)                              │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │Sec │ │Qual│ │Bug │ │Perf│ │Dep │ │A11y│ │TS  │ │API │    │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘    │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │Reac│ │Vue │ │Dock│ │K8s │ │Secr│ │IAc │ │GQL │ │Cust│    │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘    │
├─────────────────────────────────────────────────────────────────┤
│                    Advanced Systems                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │   RAG      │  │  Vector    │  │  Session   │              │
│  │   System   │  │  Database  │  │  Store     │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │  Learning  │  │   Threat   │  │   Cross-File│              │
│  │  System   │  │  Modeling   │  │   Analysis  │              │
│  └────────────┘  └────────────┘  └────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                    Output & Integration                         │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────────┐ │
│  │ Console │ │  JSON  │ │ SARIF  │ │ Slack │ │  GitHub PR  │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `src/core/cli.js` | Command-line interface with 30+ commands |
| `src/core/bot.js` | Main analysis orchestrator |
| `src/analyzers/*` | Individual analyzer implementations |
| `src/llm/*` | Multi-provider LLM orchestration |
| `src/rag/*` | Retrieval-augmented generation system |
| `src/intelligence/*` | ML-powered analysis features |
| `src/distributed/*` | Parallel processing engine |
| `src/database/*` | Vector database for semantic search |
| `src/context/*` | Session and learning system |

---

## Quick Start

### Installation

```bash
# Install globally
npm install -g sentinel-cli

# Verify installation
sentinel --version

# Or run without install
npx sentinel-cli --help
```

### Configuration

```bash
# Interactive API key setup (recommended)
sentinel auth

# Or set environment variables
export OPENAI_API_KEY="sk-..."
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="AI..."
```

### Basic Usage

```bash
# Quick security audit
sentinel security-audit

# Full project scan
sentinel full-scan

# Analyze specific files
sentinel analyze src/

# Analyze staged changes (pre-commit)
sentinel pre-commit --block

# Frontend-focused (React + TS + A11y)
sentinel frontend

# Backend-focused (Security + API + Performance)
sentinel backend

# Container security (Docker + K8s)
sentinel container
```

---

## Commands Reference

### Core Analysis

| Command | Description |
|---------|-------------|
| `sentinel analyze [files...]` | Analyze files or directory |
| `sentinel analyze --staged` | Analyze git staged changes |
| `sentinel analyze --branch <name>` | Analyze branch diff |
| `sentinel analyze --analyzers security,quality,bugs` | Specific analyzers |
| `sentinel analyze --format json` | JSON output |
| `sentinel analyze --fail-on high` | Exit code on severity |

### Preset Scans

| Command | Description |
|---------|-------------|
| `sentinel security-audit` | Security + API + Secrets + Dependency |
| `sentinel full-scan` | All 20+ analyzers |
| `sentinel frontend` | React + TypeScript + Accessibility |
| `sentinel backend` | Security + API + Performance + Secrets |
| `sentinel container` | Docker + Kubernetes + Security |
| `sentinel pre-commit` | Fast pre-commit check |
| `sentinel ci` | CI-friendly with fail-on threshold |

### AI & Agents

| Command | Description |
|---------|-------------|
| `sentinel chat [prompt]` | Interactive AI assistant |
| `sentinel agents [input]` | Multi-agent analysis pipeline |
| `sentinel agents-pr <pr-url>` | Run agents and post to PR |

### Configuration

| Command | Description |
|---------|-------------|
| `sentinel auth` | Configure API keys |
| `sentinel config --list` | Show configuration |
| `sentinel config --set key=value` | Set config value |
| `sentinel models` | Manage AI providers |
| `sentinel list-analyzers` | Show available analyzers |

### Output & Reporting

| Command | Description |
|---------|-------------|
| `sentinel fix [files...]` | Auto-fix common issues |
| `sentinel fix --dry-run` | Preview fixes |
| `sentinel sarif` | Generate SARIF report |
| `sentinel notify --slack` | Send to Slack |
| `sentinel trends` | Historical trend analysis |
| `sentinel blame` | Git blame attribution |

### Integration

| Command | Description |
|---------|-------------|
| `sentinel review-pr <url>` | Post review to GitHub PR |
| `sentinel webhook` | Start webhook server |
| `sentinel install-hooks` | Install git pre-commit hooks |
| `sentinel badge` | Generate security badges |

### Utilities

| Command | Description |
|---------|-------------|
| `sentinel stats` | Repository statistics |
| `sentinel dashboard` | Web UI dashboard |
| `sentinel cache --stats` | Cache statistics |
| `sentinel cache --clear` | Clear cache |

---

## Configuration

### Configuration Files (in order of priority)

1. `.sentinel.json` (project-local)
2. `$XDG_CONFIG_HOME/sentinel/.sentinel.json`
3. `$HOME/.sentinel.json` (global)

### Example Configuration

```json
{
  "analysis": {
    "enabledAnalyzers": [
      "security", "quality", "bugs", "performance",
      "dependency", "accessibility", "typescript", "react",
      "api", "secrets", "docker", "kubernetes"
    ],
    "ignoredFiles": [
      "node_modules/**", "dist/**", "*.min.js", "coverage/**"
    ]
  },
  "ai": {
    "enabled": true,
    "providers": [
      {
        "id": "openai",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "enabled": true,
        "weight": 0.4
      },
      {
        "id": "groq",
        "provider": "groq",
        "model": "llama3-70b-8192",
        "enabled": true,
        "weight": 0.3
      },
      {
        "id": "gemini",
        "provider": "gemini",
        "model": "gemini-pro",
        "enabled": true,
        "weight": 0.3
      }
    ]
  },
  "output": {
    "format": "console",
    "minSeverity": "low"
  },
  "cache": {
    "enabled": true,
    "ttl": 3600000
  }
}
```

### Custom Rules

Create `.sentinelrules.yaml` in your project:

```yaml
rules:
  - id: no-console-log
    pattern: "console\\.log"
    message: "Avoid using console.log in production"
    severity: warning
    filePattern: "\\.(js|ts)$"
    suggestion: "Use a proper logging library"

  - id: no-eval
    pattern: "\\beval\\s*\\("
    message: "eval() is dangerous"
    severity: critical
    suggestion: "Use JSON.parse() or a safe alternative"
```

---

## AI Providers

### Supported Providers

| Provider | Environment Variable | Models |
|----------|---------------------|--------|
| OpenAI | `OPENAI_API_KEY` | gpt-4o, gpt-4, gpt-3.5-turbo |
| Groq | `GROQ_API_KEY` | llama3-70b-8192, mixtral-8x7b |
| Gemini | `GEMINI_API_KEY` | gemini-pro, gemini-flash |
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-opus, claude-3-sonnet |
| OpenRouter | `OPENROUTER_API_KEY` | Multiple |

### Managing Providers

```bash
# Show configured providers
sentinel models

# Enable/disable providers
sentinel models --enable openai,gemini
sentinel models --disable groq

# Set weights (affects response merging)
sentinel models --weight openai=0.5 --weight groq=0.3 --weight gemini=0.2

# Use environment variables
sentinel models --env openai=OPENAI_API_KEY
```

---

## Analyzers

### Available Analyzers

| Name | Alias | Description | Default |
|------|-------|-------------|---------|
| security | sec | Core security scanning (XSS, SQLi) | ✓ |
| quality | qual | Code quality & complexity | ✓ |
| bugs | bug | Common bug detection | ✓ |
| performance | perf | Performance issues | ✓ |
| dependency | deps | npm audit, CVE checking | |
| accessibility | a11y | WCAG compliance | |
| typescript | ts | TypeScript anti-patterns | |
| react | jsx | React/JSX issues | |
| api | api-security | API security | |
| secrets | env | Exposed credentials | |
| docker | | Dockerfile analysis | |
| kubernetes | k8s | K8s manifest analysis | |
| custom | | User-defined rules | |

### Using Analyzers

```bash
# Default analyzers (security, quality, bugs, performance)
sentinel analyze

# Specific analyzers
sentinel analyze --analyzers security,typescript,react

# All analyzers
sentinel analyze --all-analyzers

# Frontend preset
sentinel analyze --analyzers quality,bugs,typescript,react,accessibility
```

---

## Output Formats

### Console (Default)

```
🛡️ SENTINEL — AI-Powered Code Guardian

┌─────────────────────────────────────────────────────────────┐
│  CRITICAL  │ AWS Access Key ID exposed                      │
│  File: src/config.js:45                                     │
│  → Use env vars (dotenv) or AWS IAM roles                  │
├─────────────────────────────────────────────────────────────┤
│  HIGH      │ SQL injection risk                             │
│  File: src/db/queries.js:23                                │
│  → Use parameterized queries / ORM                           │
└─────────────────────────────────────────────────────────────┘

Summary: 1 critical, 2 high, 4 medium, 13 low issues
```

### JSON

```bash
sentinel analyze --format json --output results.json
```

### SARIF (GitHub Security)

```bash
sentinel sarif --output results.sarif
gh code-scanning upload-sarif --sarif results.sarif
```

### HTML/Markdown

```bash
sentinel analyze --format html --output report.html
sentinel analyze --format markdown --output report.md
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Sentinel Code Review

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  sentinel:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Sentinel
        run: |
          npm install -g sentinel-cli
          sentinel analyze --format json --output results.json
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      
      - name: Fail on critical issues
        run: |
          if grep -q '"severity":"critical"' results.json; then
            echo "Critical issues found!"
            exit 1
          fi
```

### GitLab CI

```yaml
sentinel-review:
  image: node:20-alpine
  stage: test
  script:
    - npm install -g sentinel-cli
    - sentinel analyze --format json --output report.json
  artifacts:
    reports:
      codequality: report.json
```

### Pre-commit Hook

```bash
# Install hooks
sentinel install-hooks

# Manual setup
echo 'sentinel analyze --staged' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

---

## Advanced Features

### RAG System

Sentinel includes an advanced Retrieval-Augmented Generation system for intelligent code understanding:

```bash
# Start RAG pipeline
sentinel chat "How does authentication work in this codebase?"
```

Features:
- Semantic code search
- Context-aware responses
- Multiple retrieval strategies (Simple, Self-RAG, CRAG, Graph, Iterative, Adaptive)

### Threat Modeling

```bash
# Analyze attack surface
sentinel analyze --analyzers security
```

Generates:
- STRIDE threats (Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege)
- Risk scores and mitigations

### Learning System

Sentinel learns from your feedback:

```bash
# Mark false positive
sentinel analyze --feedback false_positive --rule-id <rule>

# Auto-suppress patterns
sentinel analyze --learn
```

### Code Execution Sandbox

Safely execute and verify generated code:

- VM2 isolation
- Worker thread execution
- Docker-based sandboxing
- Resource limits (CPU, memory, time)

---

## VS Code Extension

The Sentinel VS Code extension brings AI-powered analysis directly into your editor.

### Features

- **AI Chat Interface**: Chat with multiple LLM providers
- **Real-time Analysis**: Auto-analyze on file save
- **Inline Diagnostics**: Issues shown directly in editor
- **Quick Fixes**: One-click issue resolution
- **Sidebar Panel**: Organized issue view by severity
- **Pre-commit Hooks**: Block commits with issues

### Installation

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 to launch
```

### Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Sentinel: Open AI Chat | Ctrl+Shift+S | Open chat panel |
| Sentinel: Analyze | Ctrl+Shift+A | Analyze current file |
| Sentinel: Security Audit | - | Run security scan |
| Sentinel: Auto-fix | - | Apply fixes |

---

## Development

### Project Structure

```
sentinel-cli/
├── src/
│   ├── agents/           # AI agents (scanner, fixer, validator)
│   ├── analyzers/        # 20+ analyzer implementations
│   ├── cli/              # CLI helpers
│   ├── commands/         # Command implementations
│   ├── config/           # Configuration management
│   ├── context/          # Session & learning
│   ├── core/             # Main CLI & bot
│   ├── database/          # Vector database
│   ├── debugger/         # Debug utilities
│   ├── distributed/      # Parallel processing
│   ├── evaluation/       # ML evaluation
│   ├── execution/        # Code sandbox
│   ├── git/              # Git utilities
│   ├── integrations/     # GitHub, Slack, Discord
│   ├── intelligence/     # ML/AI features
│   ├── interactive/      # Interactive mode
│   ├── llm/              # LLM orchestration
│   ├── ml/               # ML utilities
│   ├── mlops/            # ML pipelines
│   ├── output/           # Report generators
│   ├── rag/              # RAG system
│   ├── search/           # Semantic search
│   ├── server/           # Dashboard server
│   └── utils/            # Utilities
├── vscode-extension/    # VS Code extension
├── __tests__/            # Test suite
└── frontend/             # Web dashboard
```

### Running Development

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Run tests
npm run test

# Watch mode
npm run dev

# Build
npm run build
```

---

## Roadmap

- [ ] Enhanced GitLab/PR integration
- [ ] Incremental monorepo analysis  
- [ ] Web-based trends dashboard improvements
- [ ] Advanced auto-fixers for all analyzers
- [ ] Real-time CVE sync
- [ ] IDE plugins (IntelliJ, WebStorm)
- [ ] More language support (Rust, Kotlin, Swift)
- [ ] Custom plugin system

---

## License

**MIT** — See [LICENSE](LICENSE) for details.

---

## Author

**Kunj Shah** — Passionate about AI, dev tools, and privacy-first coding.

- GitHub: [KunjShah95](https://github.com/KunjShah95)
- Star the repo if Sentinel helps you ship better code!

---

<p align="center">
  <b>🛡️ Sentinel CLI — Your AI-Powered Code Guardian</b>
</p>
