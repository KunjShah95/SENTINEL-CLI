# ◈ Sentinel

> A minimalist AI coding assistant for the terminal — Pi-style. Multi-LLM, local tools, sessions, MCP. No servers, no telemetry, no bloat.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Sentinel is a coding agent that lives in your terminal. It streams answers from your
choice of LLM, reads and edits your files through a sandboxed local tool set, manages
chat sessions as plain JSON on disk, and optionally exposes itself to other AI tools
over MCP. That's the whole product.

## Why

Most terminal AI assistants either do everything (scanners, CI gates, dashboards,
PR bots) or are a hosted service. Sentinel does one thing well: **a fast, cheap,
transparent coding chat in your terminal**, in the spirit of [pi](https://github.com/badlogic/pi-mono).

- **No servers.** The agent loop runs in-process. Sessions are JSON files.
- **No telemetry.** Nothing leaves your machine except LLM API calls.
- **No build step.** Plain ESM JavaScript + a thin TypeScript TUI, run via `tsx`.
- **Multi-LLM.** One streaming client covers OpenAI-compatible endpoints
  (OpenAI, Groq, Mistral, DeepSeek, xAI, Together, Fireworks, OpenRouter,
  Ollama, LM Studio) plus native Anthropic and Gemini protocols.
- **Cost-aware.** Every turn prints tokens and USD. Free models default to $0.

## Install

```bash
git clone https://github.com/KunjShah95/SENTINEL-CLI.git
cd SENTINEL-CLI
npm install
npm link        # optional: puts `sentinel` on your PATH
```

Requires Node 20+.

## Quick start

```bash
# 1. Give it a key — Groq's free tier is the zero-cost default
export GROQ_API_KEY=gsk_...

# 2. Chat
sentinel

# 3. Or one-shot from scripts/CI
sentinel ask "why is this test failing?"
sentinel ask -b "fix the typo in src/index.js"    # BUILD mode: may edit files
```

Local models (Ollama, LM Studio) need no key at all:

```bash
ollama serve                    # default host http://localhost:11434
sentinel                        # auto-discovers installed models
```

## What's inside

```
bin/sentinel.js          entry point (TUI / ask / mcp / --version)
src/cli/main.js          headless command surface (ask, version, help)
src/agent/               the agent: loop, providers, tools glue, cost, sessions, prompt
src/shared/tools/        sandboxed local tools: read, write, edit, glob, grep, bash…
src/shared/models/       model registry + live discovery from provider APIs
src/config/              config store (~/.sentinel.json > $XDG > project-local)
src/tui/                 the Ink (React) terminal UI
mcp/                     MCP stdio server (health, ask, review-diff)
__tests__/               unit tests (node:test + jest)
```

### The agent loop

`src/agent/loop.js` is the whole brain: one turn of user input → stream from the
provider → execute tool calls in-process (sandboxed to the project directory) →
feed results back → repeat until done or `MAX_ITERATIONS`. It yields typed events
(`text`, `tool_call`, `tool_result`, `finish`, `error`) that both the TUI and the
CLI consume.

### Tools

`readFile`, `writeFile`, `editFile`, `batchEdit`, `listDirectory`, `glob`, `grep`,
`bash`, `diffFile`, `undoLastChange`, `redoLastUndo`, `searchWeb`.

- Writes are sandboxed to the project root (path traversal rejected).
- `bash` runs with a timeout and output cap.
- PLAN/REVIEW modes refuse non-read-only tools; BUILD mode allows everything.
- Every write creates a checkpoint — `/undo` and `/redo` work across turns.

### Modes

| Mode | File edits | Shell | Use for |
| ------ | ----------- | ------- | --------- |
| `BUILD` | ✓ | ✓ | actually making changes |
| `PLAN` | ✗ | ✗ | questions, code review, exploration |
| `REVIEW` | ✗ | ✗ | diff review with review-focused prompt |

Toggle with `Ctrl+M` or `/mode` inside the TUI.

## TUI commands

`/help` `/model [id]` `/models` `/session [list|switch|delete]` `/commit`
`/diff` `/undo` `/redo` `/export` `/health` `/compact` `/setup` `/editor`
`/thinking` `/details` `/clear` `/new`

Plus `! <cmd>` for shell passthrough and `@agent <msg>` for agent personas.
`Ctrl+X` opens the leader-key menu; `Ctrl+S` toggles the session panel.

## MCP server

Expose Sentinel to Claude Desktop, Cursor, or any MCP client:

```bash
sentinel mcp
```

Tools: `sentinel_health`, `sentinel_ask`, `sentinel_review_diff`.
Transport is stdio — add it to your client config:

```json
{
  "mcpServers": {
    "sentinel": { "command": "npx", "args": ["-y", "sentinel-cli", "mcp"] }
  }
}
```

## Configuration

Keys resolve in order: **env var → `~/.sentinel.json` → project `.sentinel.json`**.

| Provider | Env var |
| ---------- | --------- |
| Groq (free tier) | `GROQ_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Gemini | `GEMINI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Together / Fireworks / Perplexity | `TOGETHER_API_KEY` / `FIREWORKS_API_KEY` / `PERPLEXITY_API_KEY` |
| Ollama / LM Studio | `OLLAMA_HOST` / `LMSTUDIO_HOST` (no key needed) |

The TUI `/setup` dialog writes the config file for you. See `.env.example`.

## Cost control

- Default model is a **free-tier** model (`openai/gpt-oss-20b` via Groq).
- Context auto-compaction keeps long sessions under the 40k-token budget.
- `sentinel ask` prints `in/out tokens · $ · model` after every run; `-q` silences it.
- Tool results are truncated hard (20k chars) before they hit your context.

## Development

```bash
npm run lint         # eslint
npm run typecheck    # tsc over the TUI
npm test             # node:test suites + jest suite
npm run release:check  # all three
```

## Changelog

### v3.1.0 — Bug-fix release

**Provider fixes**
- Ollama models no longer get a 404 — `ollama/model:tag` prefix is stripped before the API call
- Anthropic input token count was always 0 — now captured from `message_start` event
- `sentinel_ask` MCP tool no longer throws `Unsupported model: undefined` when model param is omitted

**TUI / slash commands**
- `/help` was silently ignored — now registered and works
- Slash command autocomplete rewritten: `↑↓` navigate, Tab complete, Esc dismiss, single-match Enter executes immediately
- `!shell` commands now clear the input bar after execution
- `/diff file.ts` now correctly passes the path as a file, not a branch
- `/export` and `/share` no longer overwrite each other (unique timestamps in filenames)
- `/commit` no longer races the mode toggle against the running stream
- `/redo` now correctly restores the post-edit state (was restoring pre-edit — effectively a no-op)
- Model picker `j`/`k` vim keys no longer block typing in the search box
- Model picker navigation stays highlighted past item 17 (scroll window added)

**Agent loop**
- `diffFile` schema field renamed `newString → newContent` to match the implementation
- SWE mode: assistant messages with `tool_calls` but empty text content are no longer dropped (broke multi-turn loops)
- SWE mode: assistant messages with `undefined`/`null` content but valid `tool_calls` now preserved correctly
- `spawnAgent` subagent no longer silently fails with `Unsupported model: undefined`
- `batchEdit` uses pre-validated file content for each operation — no more stale reads mid-batch
- Tool messages with missing `tool_call_id` in SWE mode are skipped instead of sending a bad API request

**Permissions & security**
- `ask` policy now correctly blocks tools in headless CLI mode instead of silently allowing everything
- Tool permission priority was inverted (category defaults overrode per-tool policies) — fixed
- FIX mode was blocking `searchWeb` instead of `runTests` — fixed

**Sessions & state**
- Messages with `null` or `undefined` id no longer collide in the session store (silent message loss)
- `autoCompact` interval no longer resets every time the agent starts/stops streaming
- Compaction loop guard added — `setMessages` no longer re-triggers compaction immediately
- `microcompactMessages` moved from render-time to `useMemo` (eliminates O(n²) per-render cost)
- `submit` callback no longer re-created on every streamed delta

**Dialogs**
- `DialogProvider` no longer double-handles Escape (called `close()` twice alongside child dialog)
- Stop button (Escape while loading) now wired and functional

## License

MIT © Kunj Shah. See [LICENSE](LICENSE).
