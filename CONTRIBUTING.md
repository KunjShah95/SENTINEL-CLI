# 🤝 Contributing to Sentinel CLI

Sentinel is built for developers, by developers, and every contribution — no matter how small — moves the needle. Let's make code safer together.

---

## ⚡ 5-Minute Quick Start

Sentinel is a **Node.js** project (Vanilla JS + Node 18+). No complex build steps are required for core development.

### 1. Fork and Clone
```bash
git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd SENTINEL-CLI
```

### 2. Install & Link (Testing Globally)
```bash
npm install
npm link
# Sentinel is now globally available on your machine (sentinel ...)
```

### 3. Setup Your Environment (Optional - for AI features)
```bash
cp .env.example .env
# Add any API key (e.g., GEMINI_API_KEY) to test AI agents
```

### 4. Verify Local Execution
```bash
sentinel --version
sentinel security-audit --dry-run
```

---

## 🧪 Running Tests

Sentinel uses **Jest** for unit and integration testing. **Please ensure all tests pass before submitting a PR.**

```bash
# Run all tests
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Run a specific test file
npx jest __tests__/securityAnalyzer.test.js

# Check test coverage (target: >=80% for new code)
npm run test:coverage
```

---

## 📦 Project Structure

- `src/analyzers/` — Core security & quality scanners (add new ones here!)
- `src/agents/` — Multi-agent AI pipeline (scanner, fixer, validator)
- `src/core/` — Command-line logic & bot orchestrator
- `src/llm/` — LLM provider routing (OpenAI, Gemini, Groq, etc.)
- `src/integrations/` — GitHub Action, Jira, Slack, & Discord logic
- `src/tui/` — Modern terminal UI & dashboard
- `__tests__/` — Jest test suites

---

## 🛡️ What Makes a Good PR?

1. **Issue-First**: All PRs must link to an open issue. Open an issue first to discuss the change before submitting code.
2. **Focus**: One feature or fix per PR. Avoid giant "all-in-one" PRs.
3. **Issue Link**: Reference the issue you're fixing in the PR description (e.g., "Fixes #123").
4. **Tests**: New features or logic MUST include unit tests in `__tests__/`.
5. **Docs**: If you're changing behavior, update `README.md` or files in `docs/`.
6. **Coding Standards**: Stick to the project's formatting: `npm run lint`.
7. **No Secrets**: NEVER commit real API keys or tokens.

---

## 🏷️ Looking for Tasks?

Check out our [Open Issues](https://github.com/KunjShah95/SENTINEL-CLI/issues) and look for labels like:
- `good first issue` — Scoped, well-defined tasks for beginners.
- `help wanted` — High-impact features that need community work.
- `roadmap` — Items tied to our v2.0 goals.

---

## 🌟 What Kinds of Contributions Are Welcome?

We welcome genuine contributions from human developers. Here are the areas where contributions are most valuable:

### Highly Welcome (Safe, Easy to Review)
- **New Analyzers** (`src/analyzers/`) — Self-contained security scanners that integrate with the existing framework
- **New Language Support** — Adding detection capabilities for new programming languages
- **Documentation Improvements** — Better docs, examples, and guides
- **Tests** — Improving test coverage and adding new test cases

### Requires Prior Discussion
- Changes to `src/core/`, `src/llm/`, or `src/rag/` — These are the sensitive, high-complexity areas
- New integrations with external services
- Breaking changes to existing APIs
- Performance optimizations

**Important:** Before making changes to core infrastructure, please open an issue first to discuss your approach.

---

## 🤖 AI-Generated Contribution Policy

I welcome genuine contributions from human developers. AI-generated PRs submitted without human review are closed without comment.

If you used an AI assistant to help write code (that's totally fine!), please:
1. Review the code yourself
2. Test it locally
3. Explain the change in your own words in the PR description

AI-generated PRs that skip these steps create noise and slow down development for everyone.

---

## 📅 Monthly Office Hours

Join us for monthly office hours! We post a pinned discussion titled "[Month] Office Hours — ask anything, suggest features, share how you're using Sentinel."

This is a great way to:
- Get direct feedback on ideas
- Connect with other users
- Fast-track your contributions by building relationships with the maintainer

Check the [Discussions](https://github.com/KunjShah95/SENTINEL-CLI/discussions) tab for the latest office hours thread.

---

## 🛡️ Security Vulnerabilities

**Do not open a public issue for security bugs.** Please follow the process in [SECURITY.md](SECURITY.md) to report them privately.

_Thank you for making Sentinel better for everyone!_ 🛡️
