# 🛡️ Sentinel CLI

> **AI-Powered Code Guardian: Security scanning, TypeScript/React analysis, API security, secrets detection, and multi-LLM integration — all running locally.**

[![npm version](https://img.shields.io/npm/v/sentinel-cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/sentinel-cli)
[![npm downloads](https://img.shields.io/npm/dm/sentinel-cli.svg?style=flat-square&color=green)](https://www.npmjs.com/package/sentinel-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)
[![GitHub stars](https://img.shields.io/github/stars/KunjShah95/Sentinel-CLI?style=flat-square)](https://github.com/KunjShah95/Sentinel-CLI)
[![GitHub issues](https://img.shields.io/github/issues/KunjShah95/Sentinel-CLI?style=flat-square)](https://github.com/KunjShah95/Sentinel-CLI/issues)

<p align="center">
  <b>🔒 Security</b> • <b>📦 Dependencies</b> • <b>♿ Accessibility</b> • <b>🐛 Bugs</b> • <b>⚡ Performance</b> • <b>💎 TypeScript</b> • <b>⚛️ React</b> • <b>🔑 Secrets</b> • <b>🌐 API</b> • <b>🤖 AI-Powered</b>
</p>

---

## 🎯 What is Sentinel CLI?

Sentinel CLI is a **local-first, developer-owned** code review tool with **13+ specialized analyzers**:

- **AI-powered code analysis** using your own API keys (OpenAI, Groq, Gemini, Anthropic, OpenRouter)
- **Security scanning** (SQL injection, XSS, exposed secrets, dangerous functions)
- **TypeScript analysis** (`any` types, @ts-ignore, type safety)
- **React analysis** (hooks rules, missing keys, performance)
- **API security** (CORS, JWT misconfig, rate limiting)
- **Secrets detection** (API keys, passwords, tokens)
- **Dependency analysis** (CVE scanning via npm audit)
- **Accessibility checking** (WCAG compliance, ARIA validation)
- **Docker security** (Dockerfile best practices, root user, secrets, vulnerabilities) **NEW**
- **Kubernetes security** (K8s manifest security, privileged containers, network policies) **NEW**
- **GitHub PR integration** (post reviews directly to PRs)
- **Slack/Discord notifications** (team alerts)
- **SARIF output** (GitHub Security tab integration)
- **Auto-fix capabilities** (common issues fixed automatically)
- **Monorepo/workspace support** (analyze entire workspaces)
- **Historical trend analysis** (track code quality over time)

Unlike hosted SaaS solutions, Sentinel runs **entirely on your machine or CI pipeline** — your code never leaves your infrastructure.

---

## ⚡ Quickstart in 30 Seconds

```bash
# Install globally
npm install -g sentinel-cli

# Quick preset commands (NEW in v1.4.0)
sentinel security-audit      # Full security scan
sentinel full-scan            # All 13 analyzers
sentinel frontend             # React + TypeScript + A11y
sentinel full                # Alias for full-scan (all analyzers)
sentinel backend              # Security + API + Performance
sentinel container            # Docker + Kubernetes security (NEW)
sentinel pre-commit --block   # Pre-commit check
sentinel diff                 # Staged diff review
sentinel ci --fail-on high    # CI-friendly run, exits on severity

# Analysis commands
sentinel analyze
sentinel analyze --staged
sentinel analyze --analyzers security,typescript,react
sentinel analyze --format junit --output sentinel-report.xml

# Output formats
sentinel analyze --format json --output report.json
sentinel sarif --output results.sarif  # GitHub Security

# Auto-fix common issues
sentinel fix
sentinel fix --dry-run

# GitHub PR integration
sentinel review-pr https://github.com/owner/repo/pull/123

# Interactive AI assistant
sentinel chat

# Web Dashboard (NEW)
sentinel dashboard            # Launch local web dashboard
```

**Sample Output:**

```
🛡️ SENTINEL — AI-Powered Code Guardian v1.4.0

✔ Analyzing 12 files with 6 analyzers...

┌─────────────────────────────────────────────────────────────┐
│  CRITICAL  │ AWS Access Key ID exposed                     │
│  File: src/config.js:45                                     │
│  → Use environment variables or AWS IAM roles               │
├─────────────────────────────────────────────────────────────┤
│  HIGH      │ SQL injection vulnerability                   │
│  File: src/db/queries.js:23                                 │
│  → Use parameterized queries                                │
├─────────────────────────────────────────────────────────────┤
│  MEDIUM    │ Explicit 'any' type used                      │
│  File: src/utils/helpers.ts:67                              │
│  → Replace with specific type or 'unknown'                 │
├─────────────────────────────────────────────────────────────┤
│  MEDIUM    │ useEffect missing dependency array            │
│  File: src/components/Dashboard.tsx:34                      │
│  → Add dependencies: [userId, fetchData]                    │
└─────────────────────────────────────────────────────────────┘

Summary: 1 critical, 2 high, 5 medium, 12 low issues found
```

---

## 🆚 Why Sentinel CLI vs Hosted Tools?

| Feature | Sentinel CLI | CodeRabbit | GitHub Copilot | SonarCloud |
|---------|-------------|------------|----------------|------------|
| **Local/Self-hosted** | ✅ Yes | ❌ SaaS only | ❌ SaaS only | ⚠️ Partial |
| **Your own AI keys** | ✅ OpenAI/Groq/Gemini | ❌ Their API | ❌ Their API | ❌ N/A |
| **Code stays private** | ✅ 100% local | ❌ Sent to cloud | ❌ Sent to cloud | ❌ Sent to cloud |
| **Security scanning** | ✅ Built-in | ⚠️ Limited | ❌ No | ✅ Yes |
| **TypeScript analysis** | ✅ Yes | ⚠️ Limited | ⚠️ Limited | ✅ Yes |
| **React analysis** | ✅ Hooks, JSX, a11y | ❌ No | ⚠️ Limited | ❌ No |
| **API security** | ✅ CORS, JWT, auth | ❌ No | ❌ No | ⚠️ Limited |
| **Secrets detection** | ✅ 20+ patterns | ⚠️ Limited | ❌ No | ✅ Yes |
| **GitHub PR reviews** | ✅ Direct posting | ✅ Yes | ❌ No | ✅ Yes |
| **Slack/Discord** | ✅ Yes | ❌ No | ❌ No | ⚠️ Limited |
| **SARIF output** | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| **Dependency checks** | ✅ npm audit | ❌ No | ❌ No | ✅ Yes |
| **Accessibility (a11y)** | ✅ WCAG checks | ❌ No | ❌ No | ❌ No |
| **Pre-commit hooks** | ✅ Yes | ❌ PR only | ❌ No | ❌ No |
| **Auto-fix capabilities** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Monorepo support** | ✅ Yes | ⚠️ Limited | ❌ No | ⚠️ Limited |
| **Free & Open Source** | ✅ MIT License | ❌ Paid | ❌ Paid | ⚠️ Freemium |

---

## ✨ Features (v1.4.0)

| Category | What It Does |
|----------|--------------|
| 🔒 **Security Analysis** | SQL injection, XSS, CSRF, exposed secrets, dangerous functions |
| 🔑 **Secrets Detection** | API keys (AWS, Stripe, GitHub), passwords, tokens, private keys, high-entropy strings |
| 💎 **TypeScript** | `any` types, @ts-ignore, @ts-nocheck, non-null assertions, namespace usage |
| ⚛️ **React/JSX** | Hooks rules, missing keys, index-as-key, dangerouslySetInnerHTML, a11y |
| 🌐 **API Security** | CORS misconfiguration, JWT issues, rate limiting, disabled SSL, exposed errors |
| 📦 **Dependency Scanning** | npm audit integration, CVE detection, deprecated packages, license compliance |
| ♿ **Accessibility (a11y)** | Missing alt text, form labels, ARIA validation, semantic HTML, keyboard access |
| 📊 **Code Quality** | Cyclomatic complexity, code duplication, maintainability index |
| 🐛 **Bug Detection** | Null pointer risks, type mismatches, async/await issues |
| ⚡ **Performance** | Memory leaks, N+1 queries, expensive operations |
| 🤖 **AI Review** | Multi-LLM analysis with OpenAI, Groq, Gemini, Anthropic, OpenRouter |
| 📝 **Custom Rules** | Define your own regex rules in `.sentinelrules.yaml` |
| 🛠️ **Auto-fix** | Automatically fix common issues (console.log, debugger, missing alt text, etc.) |
| 📊 **Trend Analysis** | Historical analysis and code quality trends |
| 🔗 **PR Integration** | GitHub PR review posting and comments |

---

## 🔧 Configuration Examples

### Using Different AI Providers

**OpenAI (GPT-4o-mini):**

```bash
export OPENAI_API_KEY="sk-..."
sentinel analyze --format console
```

**Groq (Llama 3 - fastest):**

```bash
export GROQ_API_KEY="gsk_..."
sentinel analyze --format console
```

**Google Gemini:**

```bash
export GEMINI_API_KEY="AI..."
sentinel analyze --format console
```

**Multiple providers (ensemble mode):**

```bash
export OPENAI_API_KEY="sk-..."
export GROQ_API_KEY="gsk_..."
export GEMINI_API_KEY="AI..."
sentinel analyze  # Uses all available providers, merges results
```

### Running Specific Checks Only

```bash
# Security checks only
sentinel analyze --analyzers security

# Dependencies only
sentinel analyze --analyzers dependency

# Accessibility only
sentinel analyze --analyzers accessibility

# Docker/Kubernetes security only (NEW)
sentinel analyze --analyzers docker,kubernetes

# Multiple specific analyzers
sentinel analyze --analyzers security,dependency,accessibility,docker,kubernetes

# Everything except AI (faster, no API calls)
sentinel analyze --analyzers security,quality,bugs,performance,dependency,accessibility,docker,kubernetes
```

### Configuration File

Create `.codereviewrc.json` in your project root:

```json
{
  "analysis": {
    "enabledAnalyzers": ["security", "quality", "bugs", "performance", "dependency", "accessibility", "docker", "kubernetes"],
    "ignoredFiles": ["node_modules/**", "dist/**", "*.min.js", "coverage/**"]
  },
  "ai": {
    "enabled": true,
    "providers": [
      {
        "id": "openai",
        "provider": "openai",
        "model": "gpt-4o-mini",
        "enabled": true
      },
      {
        "id": "groq",
        "provider": "groq",
        "model": "llama3-70b-8192",
        "enabled": true
      }
    ]
  },
  "output": {
    "format": "console",
    "minSeverity": "low"
  }
}
```

### Custom Rules

Create a `.sentinelrules.yaml` file in your project:

```yaml
rules:
  - id: no-console-log
    pattern: "console\\.log"
    message: "Avoid using console.log in production"
    severity: warning
    filePattern: "\\.(js|ts)$"
    suggestion: "Use a proper logging library"
```

---

## 🚀 CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/sentinel.yml`:

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
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Sentinel CLI
        run: npm install -g sentinel-cli

      - name: Run Security Scan
        run: sentinel analyze --analyzers security --format json --output security-report.json
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Run Full Analysis
        run: sentinel analyze --format json --output full-report.json
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Check for Critical Issues
        run: |
          if grep -q '"severity":"critical"' full-report.json; then
            echo "❌ Critical issues found!"
            cat full-report.json | jq '.issues[] | select(.severity=="critical")'
            exit 1
          fi
          echo "✅ No critical issues found"

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: sentinel-report
          path: |
            security-report.json
            full-report.json
```

### Pre-commit Hook (with Husky)

```bash
# Install husky
npm install --save-dev husky
npx husky init

# Add sentinel to pre-commit
echo 'sentinel analyze --staged --format console' > .husky/pre-commit
```

Or manually add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
echo "🛡️ Running Sentinel pre-commit check..."
sentinel analyze --staged --format console

if [ $? -ne 0 ]; then
  echo "❌ Code review failed. Please fix issues before committing."
  exit 1
fi

echo "✅ Code review passed!"
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

## ♿ Accessibility Checks Explained

Sentinel checks for **WCAG 2.1 Level AA** compliance issues:

| Check | What It Detects | Why It Matters |
|-------|-----------------|----------------|
| **Missing alt text** | `<img>` without `alt` attribute | Screen readers can't describe images |
| **Empty alt on meaningful images** | `alt=""` on non-decorative images | Important content is hidden |
| **Form labels** | `<input>` without associated `<label>` | Users can't identify form fields |
| **ARIA validation** | Invalid or redundant ARIA attributes | Breaks assistive technology |
| **Semantic HTML** | Missing `<main>`, `<nav>`, `<header>` landmarks | Navigation is difficult |
| **Heading hierarchy** | Skipped heading levels (h1 → h3) | Document structure is unclear |
| **Keyboard accessibility** | `tabindex > 0`, removed focus outlines | Keyboard users can't navigate |
| **Link purpose** | `<a>` without `href`, vague link text | Users don't know where links go |
| **Color contrast** | Very light text colors | Low vision users can't read |

**Example a11y issue:**

```bash
MEDIUM | Missing form label
File: src/components/LoginForm.jsx:45
Code: <input type="email" placeholder="Email" />
Fix:  Add <label for="email">Email</label> or aria-label="Email"
```

---

## � Docker & Kubernetes Security (NEW)

### Docker Analyzer

Scans Dockerfiles for security issues and best practices:

```bash
# Analyze Dockerfiles in your project
sentinel analyze --analyzers docker

# Common issues detected:
# ✅ Root user detection (USER root or missing USER directive)
# ✅ Using ADD instead of COPY
# ✅ Latest tag warnings (node:latest)
# ✅ Hardcoded secrets/credentials
# ✅ Privileged ports (< 1024)
# ✅ Privileged capabilities
# ✅ Missing HEALTHCHECK
# ✅ Layer optimization (combining RUN commands)
# ✅ Shell form vs exec form CMD/ENTRYPOINT
# ✅ Missing WORKDIR
```

**Example Docker issue:**

```bash
CRITICAL | Container runs as root user
File: Dockerfile:15
Code: # No USER directive found
Fix:  Add USER directive: USER node:node or RUN adduser -u 1000 appuser && USER appuser

HIGH | Hardcoded secret detected  
File: Dockerfile:8
Code: ENV API_KEY=sk_live_1234567890abcdef
Fix:  Use ARG for build-time or mount secret at runtime: docker run --secret id=api_key
```

### Kubernetes Analyzer

Scans Kubernetes YAML manifests for security issues:

```bash
# Analyze K8s manifests
sentinel analyze --analyzers kubernetes

# Security checks:
# ✅ Privileged containers
# ✅ Root user (runAsUser: 0)
# ✅ Security context missing
# ✅ Resource limits missing
# ✅ Linux capabilities
# ✅ hostPath volumes
# ✅ hostNetwork/hostPID/hostIPC
# ✅ Image pull policy
# ✅ Hardcoded secrets in ConfigMap/Secret
# ✅ Default service accounts
# ✅ NetworkPolicy enforcement
# ✅ Read-only root filesystem
```

**Example Kubernetes issue:**

```bash
CRITICAL | Privileged container detected
File: k8s/deployment.yaml:45
Code: privileged: true
Fix:  Remove privileged: true or use specific capabilities instead

HIGH | Missing SecurityContext
File: k8s/deployment.yaml:12
Code: # No securityContext defined
Fix:  Add:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        allowPrivilegeEscalation: false
        capabilities:
          drop: [ALL]
        readOnlyRootFilesystem: true
```

---

## 🔒 Security & Dependency Scanning

### What Sentinel Detects Today

| Category | Detections |
|----------|------------|
| **Secrets** | API keys, tokens, passwords, private keys in code |
| **Injection** | SQL injection, command injection, XSS, CSRF patterns |
| **Dangerous Functions** | `eval()`, `innerHTML`, `document.write()`, `dangerouslySetInnerHTML` |
| **Vulnerable Dependencies** | Known CVEs in npm/pip/gem packages |
| **Deprecated Packages** | Packages marked as deprecated on registries |
| **Unpinned Versions** | `*` or missing versions in requirements.txt |
| **License Issues** | GPL in commercial projects, license mismatches |
| **Docker Security** | Root user, secrets, privileged access, layer optimization |
| **Kubernetes Security** | Privileged containers, security contexts, resource limits |

### Supported Languages/Frameworks

| Language | Security | Dependencies | Tested |
|----------|----------|--------------|--------|
| JavaScript/TypeScript | ✅ Full | ✅ npm | ✅ |
| Python | ✅ Full | ✅ pip/requirements.txt | ✅ |
| Java | ✅ Basic | ⚠️ Partial | ⚠️ |
| PHP | ✅ Basic | ❌ Coming soon | ⚠️ |
| Ruby | ✅ Basic | ✅ Gemfile | ⚠️ |
| Go | ⚠️ Partial | ⚠️ go.mod | 🔜 |
| Rust | ⚠️ Partial | ⚠️ Cargo.toml | 🔜 |

### ⚠️ Limitations & Safety

> **Important:** Sentinel CLI is a **code review assistant**, not a replacement for comprehensive security tools.

- **AI can miss issues**: LLMs may not catch all vulnerabilities. Always use alongside dedicated SAST/DAST tools for production security.
- **Static analysis only**: No runtime detection, dynamic analysis, or penetration testing.
- **CVE database**: Uses curated known-vulnerable package list, not real-time CVE feeds (yet).
- **Not certified**: This tool is not SOC2/ISO27001 certified for compliance requirements.

**Recommended security stack:**

```bash
Sentinel CLI (this tool)     → AI code review + basic security
+
npm audit / safety / bundler-audit → Dependency CVE scanning
+
Snyk / Dependabot            → Real-time vulnerability alerts
+
SonarQube / Semgrep          → Deep SAST analysis
```

---

## 🛠️ Advanced Features

### Auto-Fix Capabilities

Sentinel can automatically fix common issues:

```bash
# Automatically fix common issues
sentinel fix

# Fix specific files
sentinel fix src/index.js src/utils.js

# Fix only staged files
sentinel fix --staged

# See what would be fixed (dry run)
sentinel fix --dry-run

# Fix specific types only
sentinel fix --type remove-console-log,remove-debugger

# Available fix types:
# - missing-alt-text (add placeholder alt to images)
# - remove-console-log (remove console.log statements)
# - remove-debugger (remove debugger statements)
# - trailing-whitespace (remove trailing whitespace)
# - multiple-empty-lines (reduce to max one empty line)
```

### GitHub PR Integration

```bash
# Analyze and post review to a GitHub PR
sentinel review-pr https://github.com/owner/repo/pull/123

# Analyze without posting (dry run)
sentinel review-pr https://github.com/owner/repo/pull/123 --dry-run

# Get JSON output
sentinel review-pr https://github.com/owner/repo/pull/123 --format json

# Required: Set GITHUB_TOKEN environment variable
export GITHUB_TOKEN=your-token-here
```

### Monorepo/Workspace Analysis

```bash
# Analyze all packages in a monorepo
sentinel analyze-workspace

# With specific output format
sentinel analyze-workspace --format json

# Save aggregated report
sentinel analyze-workspace --output workspace-report.json

# Supports:
# - npm/yarn workspaces (package.json workspaces field)
# - pnpm workspaces (pnpm-workspace.yaml)
```

### Notifications

```bash
# Send analysis results to Slack
sentinel notify --slack

# Send to Discord
sentinel notify --discord

# Both with project info
sentinel notify --slack --discord --project "MyApp" --branch "main"

# Required environment variables:
export SLACK_WEBHOOK_URL=https://hooks.slack.com/...
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### Historical Trend Analysis

```bash
# Save current analysis to history
sentinel trends --save

# View trend analysis
sentinel trends

# Show more history entries
sentinel trends --limit 20
```

### Web Dashboard (NEW)

Sentinel now includes a beautiful web dashboard to visualize your security posture and trends.

```bash
# Launch the dashboard locally
sentinel dashboard

# Specify a custom port
sentinel dashboard --port 4000
```

### Deployment (Go Live)

You can easily deploy the Sentinel website/dashboard to the web:

```bash
# Build and deploy to Vercel
npm run deploy

# Or build manually
npm run build:frontend
# The static files will be in frontend/dist
```

### SARIF Output for GitHub Security

```bash
# Generate SARIF report
sentinel sarif

# Custom output path
sentinel sarif --output my-report.sarif

# Upload to GitHub (after generating)
gh code-scanning upload-sarif --sarif sentinel-results.sarif
```

---

## 📦 Installation

### From npm (Recommended)

```bash
# Global installation
npm install -g sentinel-cli

# Or use npx (no install)
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
# Build image
docker build -t sentinel-cli .

# Run analysis
docker run --rm -v $(pwd):/workspace sentinel-cli analyze

# With API keys
docker run --rm \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -v $(pwd):/workspace \
  sentinel-cli analyze --format json
```

---

## 🎮 All Commands

```bash
# Core analysis
sentinel analyze [files...]           # Analyze files or current directory
sentinel analyze --staged             # Analyze git staged changes
sentinel analyze --branch feature/x   # Analyze branch diff
sentinel analyze --commit abc123      # Analyze specific commit

# Output formats
sentinel analyze --format console     # Rich terminal output (default)
sentinel analyze --format json        # JSON for CI/CD
sentinel analyze --format html        # HTML report
sentinel analyze --format markdown    # Markdown report

# Quick preset commands
sentinel security-audit               # Security-focused scan
sentinel full-scan                    # All analyzers
sentinel frontend                     # React + TypeScript + A11y
sentinel backend                      # Security + API + Performance
sentinel pre-commit                   # Pre-commit check
sentinel diff                         # Staged diff review
sentinel ci                           # CI-friendly run

# Configuration
sentinel setup                        # Interactive configuration wizard
sentinel models                       # Manage AI providers
sentinel models --enable openai       # Enable specific provider
sentinel install-hooks                # Install git pre-commit hooks

# Advanced features
sentinel fix                          # Auto-fix common issues
sentinel fix --dry-run                # Preview fixes
sentinel review-pr                    # GitHub PR integration
sentinel analyze-workspace            # Monorepo analysis
sentinel notify                       # Slack/Discord notifications
sentinel trends                       # Historical analysis
sentinel sarif                        # SARIF output
sentinel blame                        # Git blame integration

# Interactive features
sentinel chat                         # Interactive AI assistant
sentinel chat "Explain this code"     # One-shot AI query
sentinel stats                        # Show repository statistics
```

---

## 🌟 Why I Built Sentinel CLI

Hey! I'm **Kunj Shah**, a developer passionate about AI/ML and developer tools.

I built Sentinel CLI because I was frustrated with:

- **Hosted AI code reviewers** that require sending code to third-party servers
- **Fragmented tooling** — separate tools for security, dependencies, accessibility
- **Expensive SaaS** that charges per seat/repo for basic code review
- **Limited customization** — no way to add custom rules or fix issues automatically

I wanted something that:

- ✅ Runs **100% locally** — my code never leaves my machine
- ✅ Uses **my own API keys** — I control costs and data
- ✅ Combines **multiple analysis types** in one tool
- ✅ Works in **CI/CD and pre-commit hooks**
- ✅ Can **automatically fix** common issues
- ✅ Supports **monorepos and workspaces**
- ✅ Is **free and open source**

Sentinel CLI is that tool. I hope it helps you ship better, more secure code faster!

---

## 🤝 Contributing

I'd love your help making Sentinel better! Here are some ways to contribute:

### Good First Issues

- [ ] Add more security patterns for PHP/Ruby
- [ ] Improve Python type checking rules
- [ ] Add Cargo.toml (Rust) dependency parsing
- [ ] Create VS Code extension
- [ ] Add SARIF output format for GitHub Security tab
- [ ] Improve accessibility checker with more WCAG rules
- [ ] Add go.mod dependency analysis
- [ ] Implement auto-fix for more issue types
- [ ] Add support for additional notification platforms

### How to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/KunjShah95/Sentinel-CLI.git
cd Sentinel-CLI
npm install
npm run dev        # Run with hot reload
npm run lint       # Check code style
npm run test       # Run tests
```

### Testing

```bash
# Test with sample files
node integration_test_runner.js

# Quality testing
node test_quality.js

# Module testing
node test_modules.js

# Fix verification
node verify_fix.js
```

---

## 🗺️ Roadmap

- [ ] **v1.4** — VS Code extension with inline annotations
- [ ] **v1.5** — Enhanced GitHub/GitLab PR comment integration
- [ ] **v2.0** — Custom rule engine (YAML-based)
- [ ] **v2.1** — Monorepo support with incremental analysis
- [ ] **v2.2** — Web dashboard for trend visualization
- [ ] **Future** — Advanced auto-fix capabilities, more language support, real-time CVE feeds

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

Free to use, modify, and distribute. Attribution appreciated but not required.

---

## 🙏 Acknowledgments

Built with amazing open source tools:

- [Commander.js](https://github.com/tj/commander.js) — CLI framework
- [Chalk](https://github.com/chalk/chalk) — Terminal styling
- [Figlet](https://github.com/patorjk/figlet.js) — ASCII art banners
- [Simple-git](https://github.com/steveukx/git-js) — Git operations
- [Inquirer](https://github.com/SBoudrias/Inquirer.js) — Interactive prompts

---

## 👨‍💻 Author

**Kunj Shah**

- 🐙 GitHub: [@KunjShah95](https://github.com/KunjShah95)
- 📦 npm: [kunjshah](https://www.npmjs.com/~kunjshah)
- 💼 LinkedIn: [Connect with me](https://linkedin.com/in/kunjshah95)

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
