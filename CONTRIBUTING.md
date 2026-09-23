# Contributing to Sentinel

Sentinel is intentionally small (~4k lines). The bar for adding code is high:
a feature must fit the "minimalist coding assistant" charter or it belongs in a plugin/fork.

## Ground rules

1. **No new dependencies** unless the dependency removes more code than it adds.
2. **No servers, no telemetry, no accounts.** Everything runs locally; the only
   network calls are LLM providers (and the opt-in `searchWeb` tool).
3. **Plain ESM JavaScript** for `src/agent`, `src/shared`, `src/cli`, `bin`.
   TypeScript is allowed only inside `src/tui` (Ink UI).
4. **Keep the tool sandbox.** Anything touching the filesystem goes through
   `src/shared/tools/index.js` and stays inside the project root.

## Workflow

```bash
git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd SENTINEL-CLI
npm install

# make your change, then:
npm run release:check   # lint + typecheck + tests
```

All checks must pass. Tests use `node:test` (`__tests__/*.test.js`, plain-JS
modules) and one jest suite for the agent-context module.

## What we will merge

- Bug fixes in the agent loop, tools, providers, or TUI
- New local tools (sandboxed, read/write policy respected)
- New provider endpoints that fit the existing `providers.js` table
- Accessibility/UX fixes in the TUI

## What we will not merge

- Security scanners, CI pipelines, PR bots (this was tried — see git history — and removed)
- Server components, databases, or hosted anything
- Config surface beyond `~/.sentinel.json`
