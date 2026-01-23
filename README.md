# 🛡️ Sentinel CLI — AI-Powered Code Guardian

> **All-in-one code review tool: local-first, private, and extensible. Security, TypeScript, React, API, secrets, dependency analysis — powered by multiple LLMs.**

[![npm version](https://img.shields.io/npm/v/sentinel-cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/sentinel-cli)
[![npm downloads](https://img.shields.io/npm/dm/sentinel-cli.svg?style=flat-square&color=green)](https://www.npmjs.com/package/sentinel-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/KunjShah95/Sentinel-CLI?style=flat-square)](https://github.com/KunjShah95/Sentinel-CLI)
[![GitHub issues](https://img.shields.io/github/issues/KunjShah95/Sentinel-CLI?style=flat-square)](https://github.com/KunjShah95/Sentinel-CLI/issues)

<p align="center">
  <b>🔒 Security</b> • <b>📦 Dependencies</b> • <b>♿ Accessibility</b> • <b>🐛 Bugs</b> • <b>⚡ Performance</b> • <b>💎 TypeScript</b> • <b>⚛️ React</b> • <b>🔑 Secrets</b> • <b>🌐 API</b> • <b>🤖 Multi-LLM</b>
</p>

---

## 1️⃣ Overview: What is Sentinel CLI?

**Sentinel CLI** is a _developer-first, open-source code review platform_ with a focus on privacy, power, and extensibility:

- **13+ built-in analyzers:** Security, TypeScript, React, Dependency, Accessibility (A11y), API, Docker, Kubernetes, Secrets, Code Quality, Bug patterns and more
- **AI-powered audits** — Your OpenAI/Groq/Gemini/Anthropic/OpenRouter keys, not SaaS APIs
- **All local:** Your code and AI prompts stay on your machine (or CI), never sent out
- **Instant setup:** One `npm i -g sentinel-cli` and `sentinel auth` to use
- **Autofix:** Automatic fixing for common issues (console.log, missing alt, etc.)
- **Extensible:** Custom YAML rules, integration hooks and config
- **True private CI:** Works in CI/CD & pre-commit hooks with environment auth
- **Beautiful dashboard:** Built-in web UI to visualize scans and trends

> No lock-in. No seat-based fees. No code leaks. Just serious code & security automation.

---

## 2️⃣ Key Features & Analyzers

### 🔍 General

- Local-first: Code review _without leaving your machine/server_ — no cloud uploads
- Works for: JS, TS, React, Python, Java, Go, PHP, Ruby, Docker, K8s, Markdown, configs
- Highly scriptable: CLI, JSON, SARIF, Markdown, Slack/Discord notifications, monorepo support
- Multi-LLM: Use **OpenAI, Groq, Gemini, Anthropic, OpenRouter** — bring your own API key

### 🧠 AI & Security

| Category             | What It Detects/Does                                                        |
|----------------------|------------------------------------------------------------------------------|
| **Security Analysis**| SQL injection, XSS, CSRF, exposed secrets, dangerous APIs (eval, innerHTML) |
| **Secrets Detection**| 20+ key/token regexes, passwords, high-entropy, private keys                |
| **Dependency Scan**  | `npm audit`, CVE & license issues, unpinned/legacy versions                 |
| **A11y/Accessibility**| WCAG 2.1 checks (alt, color, focus, heading, form)                         |
| **TypeScript & JS**  | `any` types, `@ts-ignore`, type loopholes, code smells                      |
| **React/JSX**        | Rules-of-hooks, missing keys, a11y, dangerous innerHTML                     |
| **API Security**     | CORS, JWT, secrets in configs, rate limiting, leak patterns                 |
| **Docker Analysis**  | Root user, secrets, ADD/COPY, latest tag, health checks, hardcoded creds    |
| **K8s Manifests**    | Privilege, root, missing securityContext, resource limits, secrets          |
| **Code Quality**     | Complexity, duplications, async/await, unreachable, risky patterns          |
| **Performance**      | N+1s, leaks, large deps/arrays, expensive ops, missed optimizations         |
| **Custom Rules**     | `.sentinelrules.yaml` or `.codereviewrc.json` (your patterns)               |
| **PR Review**        | Direct GitHub PR comments, diff reviews, CI integration                     |
| **Auto-Fix**         | Remove console.log, debugger, add alt, etc. (see details below)             |
| **Trend Analysis**   | Track and visualize historic issue trends                                   |

---

## 3️⃣ Quickstart: 30-Second Setup

```bash
npm install -g sentinel-cli
sentinel auth         # Enter your AI provider API keys (OpenAI, Groq, etc.)

# Run scans with presets or combinations:
sentinel security-audit          # Full security scan
sentinel full-scan               # All analyzers
sentinel analyze                 # Scan current dir with active analyzers
sentinel frontend                # For React + TS + A11y only
sentinel backend                 # For Security + API + Quality
sentinel pre-commit --block      # Block commit on high severity
sentinel ci --fail-on high       # For CI pipelines (exit on threshold)
sentinel dashboard               # Local dashboard UI
```

For full command list, see [All Commands](#all-commands).

---

## 4️⃣ Output Sample

```bash
🛡️ SENTINEL — AI-Powered Code Guardian v1.8.0

✔ Analyzing 17 files with 8 analyzers...

┌─────────────────────────────────────────────────────────────┐
│  CRITICAL  │ AWS Access Key ID exposed                    │
│  File: src/config.js:45                                   │
│  → Use env vars (dotenv) or AWS IAM roles                 │
├─────────────────────────────────────────────────────────────┤
│  HIGH      │ SQL injection risk                           │
│  File: src/db/queries.js:23                               │
│  → Use parameterized queries / ORM                        │
├─────────────────────────────────────────────────────────────┤
│  MEDIUM    │ 'any' type disables type safety              │
│  File: src/utils/helpers.ts:67                            │
│  → Use specific type or unknown                           │
├─────────────────────────────────────────────────────────────┤
│  MEDIUM    │ Missing useEffect deps array                 │
│  File: src/components/Dashboard.tsx:34                    │
│  → Add deps: [userId, fetchData]                          │
└─────────────────────────────────────────────────────────────┘

Summary: 1 critical, 2 high, 4 medium, 13 low issues
```

---

## 5️⃣ Why Sentinel Over SaaS & Online Reviewers?

| Feature              | Sentinel CLI | CodeRabbit | Copilot | SonarCloud |
|----------------------|:-----------:|:----------:|:-------:|:----------:|
| 100% Local/Offline   | ✅          | ❌         | ❌      | ⚠️        |
| Custom API Keys      | ✅          | ❌         | ❌      | ❌        |
| Security Scanning    | ✅          | ⚠️        | ❌      | ✅        |
| TypeScript Analysis  | ✅          | ⚠️        | ⚠️      | ✅        |
| React / JSX          | ✅ Hooks,a11y| ❌        | ⚠️      | ❌        |
| API Security         | ✅          | ❌         | ❌      | ⚠️        |
| Secrets Detection    | ✅          | ⚠️        | ❌      | ✅        |
| Dependency Checks    | ✅ npm      | ❌         | ❌      | ✅        |
| A11y Checks          | ✅ WCAG     | ❌         | ❌      | ❌        |
| Auto-fix             | ✅          | ❌         | ❌      | ❌        |
| PR Reviews           | ✅ Direct   | ✅         | ❌      | ✅        |
| Notification Hooks   | ✅ Slack/D | ❌         | ❌      | ⚠️        |
| Monorepo Support     | ✅          | ⚠️        | ❌      | ⚠️        |
| Free & OSS           | ✅ MIT      | ❌ Paid    | ❌ Paid | ⚠️ Free   |

---

## 6️⃣ Detailed Analyzer Reference & Example Output

### Security, Bug & Secrets

- SQL injection, XSS, CSRF, command injection
- API key/token & secret detection (20+ patterns: AWS, Stripe, GitHub, JWT, etc.)
- Dangerous JS/TS constructs (`eval`, `innerHTML`, etc.)
- Dependency scan (CVE, license, deprecated, unpinned)
- Static code risks: null pointer, async/await, etc.

**Example:**
```bash
CRITICAL | AWS secret key in code
File: src/config/secrets.js:20
Fix: Use environment variables, never commit secrets!
```

### TypeScript/React/JS/Quality

- `any` type, unsafe `@ts-ignore`, non-null, mistaken patterns
- Rules-of-hooks in React
- a11y (label, alt, ARIA) and semantic HTML
- code quality: complexity, duplication, maintainability

**Example:**
```bash
MEDIUM | 'any' disables type checking
File: src/components/Foo.tsx:15
Fix: Replace with explicit type
```

### Docker/Kubernetes

- Root user, missing healthcheck, ADD/COPY, secrets
- Privileged containers/contexts, missing securityContext/resource limits

**Example:**
```bash
HIGH | Container runs as root (no USER set)
File: Dockerfile:10
Fix: Add USER directive (USER appuser)
```

---

## 7️⃣ Configuration & Auth

### `sentinel auth` (Recommended)
```bash
sentinel auth
```
- Prompts and stores API keys (OpenAI, Anthropic, Groq, etc.) at `~/.sentinel.json` (mode 600)

### Environment Variables

All analyzers can be configured by env and overridden in CI:
```bash
export OPENAI_API_KEY="sk-...."
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="AI..."
export ANTHROPIC_API_KEY="sk-ant-..."
sentinel analyze
```

### Analyzer Selection

Choose one or many:

```bash
sentinel analyze --analyzers security,dependency,a11y,docker,kubernetes
sentinel analyze --analyzers frontend      # React + TS + A11y
sentinel analyze --analyzers backend       # Security + API + Dependency
```

### Custom Config

Create `.codereviewrc.json` for full control:

```json
{
  "analysis": {
    "enabledAnalyzers": [
      "security", "quality", "bugs", "performance",
      "dependency", "accessibility", "docker", "kubernetes"
    ],
    "ignoredFiles": [
      "node_modules/**", "dist/**", "*.min.js", "coverage/**"
    ]
  },
  "ai": {
    "enabled": true,
    "providers": [
      {"id": "openai", "provider": "openai", "model": "gpt-4o-mini", "enabled": true},
      {"id": "groq", "provider": "groq", "model": "llama3-70b-8192", "enabled": true}
    ]
  },
  "output": { "format": "console", "minSeverity": "low" }
}
```

### Custom Rules

Add `.sentinelrules.yaml` in your project:

```yaml
rules:
  - id: no-console-log
    pattern: "console\\.log"
    message: "Avoid using console.log in prod"
    severity: warning
    filePattern: "\\.(js|ts)$"
    suggestion: "Use a proper logging library"
```

---

## 8️⃣ CI/CD & PR Integration

### Example — GitHub Actions

`.github/workflows/sentinel.yml`:
```yaml
name: Sentinel Code Review

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install -g sentinel-cli

      - name: Analyze Security
        run: sentinel analyze --analyzers security --format json --output security.json
        env: { OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} }

      - name: Analyze Full
        run: sentinel analyze --format json --output full.json
        env: { OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} }

      - name: Block on critical
        run: |
          if grep -q '"severity":"critical"' full.json; then exit 1; fi

      - name: Upload report
        uses: actions/upload-artifact@v4
        with: { name: sentinel-report, path: full.json }
```

### Pre-commit Hooks Example (`husky`)

```bash
npm i --save-dev husky
npx husky init
echo 'sentinel analyze --staged --format console' > .husky/pre-commit
```

Manual `.git/hooks/pre-commit` example:
```bash
#!/bin/sh
echo "🛡️ Sentinel pre-commit check..."
sentinel analyze --staged --format console
[ $? -ne 0 ] && exit 1
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
  only:
    - merge_requests
```

---

## 9️⃣ Deep-Dive: Docker & Kubernetes Security

### Docker

- Detects `USER root`/missing USER, secrets in ENV, ADD/COPY, missing HEALTHCHECK, latest tags, privileged ports
- Example:
    ```bash
    HIGH | Hardcoded secret ENV in Dockerfile:8
    Fix: Use ARG or secret mount instead of ENV
    ```

### K8s

- Privileged containers, missing securityContext, lack of resource limits, hardcoded secrets, hostPath/network/IPC/hostPID
- Example:
    ```bash
    CRITICAL | Privileged container
    File: deployment.yaml:45
    Code: privileged: true
    Fix: Remove privileged: true or drop linux capabilities
    ```

---

## 🔟 Advanced: Automation, Notifications, & Web UI

### Fixing

```bash
sentinel fix              # Fixes all known autofixable issues
sentinel fix src/*.js     # Only specified files
sentinel fix --staged     # Only staged files
sentinel fix --dry-run    # Preview changes
sentinel fix --type remove-console-log,missing-alt-text
```

### PR Review/Notifications

```bash
# Post review to PR (needs GITHUB_TOKEN env set)
sentinel review-pr https://github.com/org/repo/pull/123

# Send scan to Slack/Discord
sentinel notify --slack --discord

# View historic trend in dashboard
sentinel dashboard
```

### SARIF for GitHub Security

```bash
sentinel sarif --output report.sarif
gh code-scanning upload-sarif --sarif report.sarif
```

---

## 📦 Installation Options

### npm (Recommended)

```bash
npm install -g sentinel-cli      # Install globally
npx sentinel-cli analyze --staged
```

### From Source

```bash
git clone https://github.com/KunjShah95/Sentinel-CLI.git
cd Sentinel-CLI
npm install
npm link
sentinel --help
```

### Docker

```bash
docker build -t sentinel-cli .
docker run --rm -v $(pwd):/workspace sentinel-cli analyze
docker run --rm \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -v $(pwd):/workspace \
  sentinel-cli analyze --format json
```

---

## 📝 All Commands

```bash
# Core
sentinel analyze [files...]            # Analyze files or current directory
sentinel analyze --staged              # Analyze git staged changes
sentinel analyze --branch feature/x    # Analyze branch diff
sentinel analyze --commit abc123       # Analyze commit
sentinel analyze --format console      # Pretty output (default)
sentinel analyze --format json         # For CI/CD, linting
sentinel analyze --format html         # HTML report
sentinel analyze --format markdown     # MD report

# Presets
sentinel security-audit                # Security-focused scan
sentinel full-scan                     # All analyzers
sentinel frontend                      # React + TypeScript + A11y scan
sentinel backend                       # Security + API + Perf
sentinel pre-commit                    # Pre-commit check

# Config/Tools
sentinel setup                         # Quick config wizard
sentinel models                        # Manage AI providers
sentinel models --enable openai        # Enable/disable
sentinel install-hooks                 # Git hooks

# Advanced
sentinel fix                           # Autofix issues
sentinel fix --dry-run                 # Preview fixes
sentinel review-pr                     # Analyze & review PRs
sentinel analyze-workspace             # For monorepos
sentinel notify                        # Slack/Discord
sentinel trends                        # Show trends/historic analysis
sentinel sarif                         # For GitHub/Security tab
sentinel blame                         # Git blame context

# Interactive
sentinel chat                          # Interactive AI chat assistant
sentinel chat "Why is this failing?"   # One-shot code question
sentinel stats                         # Repo code stats
```

---

## 🌟 Author & Motivation

I’m **Kunj Shah** — passionate about AI, dev tools, and privacy-first coding.  
Sentinel CLI exists because:

- Cloud AI reviewers leak code & charge high fees per seat
- No unified tool handles security+dependencies+a11y locally
- I wanted **zero lock-in, zero code-leak, full customization, and extensibility**  
- [Star Sentinel CLI](https://github.com/KunjShah95/Sentinel-CLI) if you want OSS, LLM-based, dev-owned code review!

---

## 🤝 Contributing

**Awesome contributions welcome!**

- Good first PRs:
    - Add rules for more languages (PHP, Ruby, Rust, Go, etc.)
    - Improve accuracy/scanner coverage
    - VS Code extension
    - More auto-fixers & notification integrations
    - SARIF/HTML/Slack output improvements

**How to contribute:**
```bash
git clone https://github.com/KunjShah95/Sentinel-CLI.git
cd Sentinel-CLI
npm install
npm run dev
npm run lint
npm run test
```
1. Fork & branch off `main`
2. Build, test, and commit
3. Send PR and I’ll review!

---

## 🗺️ Roadmap

- [ ] VS Code extension (inline review, show severity)
- [ ] Enhanced Gitlab/PR integration
- [ ] Incremental/lazy monorepo analysis
- [ ] Web-based trends dashboard
- [ ] Advanced auto-fixers for all analyzers
- [ ] Real-time CVE sync & package lock advisory

---

## 📄 License

**MIT** — see [LICENSE](LICENSE) for details.

_Star this repo if Sentinel helps you ship better code!_

---

<p align="center">
  <a href="https://www.npmjs.com/package/sentinel-cli">
    <img src="https://img.shields.io/npm/v/sentinel-cli?style=for-the-badge&logo=npm&color=red" alt="npm" />
  </a>
  &nbsp;
  <a href="https://github.com/KunjShah95/Sentinel-CLI/stargazers">
    <img src="https://img.shields.io/github/stars/KunjShah95/Sentinel-CLI?style=for-the-badge&logo=github&color=yellow" alt="GitHub stars" />
  </a>
  &nbsp;
  <a href="https://github.com/KunjShah95/Sentinel-CLI/fork">
    <img src="https://img.shields.io/github/forks/KunjShah95/Sentinel-CLI?style=for-the-badge&logo=github&color=blue" alt="GitHub forks" />
  </a>
</p>

<p align="center">
  Made with ❤️ by <a href="https://github.com/KunjShah95">Kunj Shah</a>
</p>

<p align="center">
  <b>⭐ Star this repo if Sentinel helps you ship better code!</b>
</p>
