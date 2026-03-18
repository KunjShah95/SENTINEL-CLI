# 🛡️ Sentinel — The AI-Powered Code Security Guardian

**Sentinel** is a local-first, privacy-focused code security platform that automates security audits, code reviews, and dependency checks. Built for modern DevOps, it uses multi-agent AI to detect and fix vulnerabilities before they reach production.

[![npm version](https://img.shields.io/npm/v/sentinel-cli.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/sentinel-cli)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Marketplace-white?logo=github&style=flat-square)](https://github.com/marketplace/actions/sentinel-pr-review)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen?style=flat-square)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🔥 Quick Start (60 Seconds)

Get Sentinel running in your project with just three commands:

```bash
# 1. Install & Verify
npm install -g sentinel-cli && sentinel --version

# 2. Configure API Keys (Interactive)
sentinel auth

# 3. Run Your First Security Audit
sentinel security-audit
```

---

## 📽️ Sentinel in Action

![Sentinel CLI Demo Output](sentinel_cli_demo_screenshot_1773798442687.png)

---

## ⚡ Add to CI in 3 Lines

Automate your PR reviews in seconds. Add this to `.github/workflows/sentinel.yml`:

```yaml
- uses: actions/checkout@v4
- uses: KunjShah95/Sentinel-CLI@main
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

---

## 🚀 Why Sentinel?

- **Local-First & Private**: Your code never leaves your machine. Prompts are generated locally.
- **Multi-Agent AI**: Scanner → Fixer → Validator pipeline for 10x higher accuracy.
- **20+ Built-in Analyzers**: Security, Quality, Bugs, Performance, Accessibility, and more. [See Analyzers List](docs/analyzers.md)
- **Multi-LLM Support**: Use OpenAI, Google Gemini, Groq, or Anthropic.
- **Auto-Fix**: One-line command to resolve common security and quality issues.
- **Baseline Caching**: Intelligent scans that only analyze changed code for near-instant results.

---

## 📚 Resources

| Guide | Description |
|-------|-------------|
| [📖 Commands List](docs/commands.md) | Full CLI reference |
| [🔐 Analyzers Reference](docs/analyzers.md) | List of all 20+ security and quality checks |
| [🗺️ Roadmap](ROADMAP.md) | Check what's coming in v2.0 |
| [🤝 Contributing](CONTRIBUTING.md) | 5-minute local dev setup guide |
| [🤖 AI Providers](docs/providers.md) | How to configure LLM keys |

---

## 🛠️ Installation

```bash
# Globally
npm install -g sentinel-cli

# Without Install
npx sentinel-cli security-audit
```

[Read the full documentation](https://github.com/KunjShah95/SENTINEL-CLI/wiki)

---

## 🛡️ License

MIT — Created by [Kunj Shah](https://github.com/KunjShah95). Be part of the guardian network — help us make code safer for everyone! ⭐️ Star us if it helps you!
