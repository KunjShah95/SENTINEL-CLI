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
src/cli/main.js          headless command surface (ask, goal, mini, race, onboard, help)
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

### Keybinds — opencode-compatible

Action IDs and default chords mirror [opencode v2](https://opencode.ai/v2/docs/cli/keybinds),
so muscle memory carries over: leader is `Ctrl+X`, the palette is `Ctrl+P`, `Esc` interrupts.

| Chord | Action |
| ----- | ------ |
| `Enter` | Send. `Shift+Enter` / `Ctrl+J` insert a newline — the prompt is multi-line |
| `↑` `↓` | Walk prompt history |
| `Ctrl+A` `Ctrl+E` | Start / end of line (`Ctrl+U` / `Ctrl+K` delete to them, `Ctrl+W` a word) |
| `Ctrl+P` | Command palette |
| `PageUp` / `PageDown` | Scroll the transcript a page (`Ctrl+Alt+U`/`D` half a page, `Ctrl+Alt+Y`/`E` a line) |
| `Ctrl+G` / `Ctrl+Alt+G` | Jump to the first message / back to the live edge |
| `Ctrl+M` | Toggle mode |
| `Ctrl+L` | Session log viewer |
| `Ctrl+/` | Help |
| `Ctrl+X` then… | `m` models · `n` new session · `b` sidebar · `l` sessions · `s` status · `c` compact · `u`/`r` undo/redo · `x` export · `e` editor · `t`/`d` thinking/details · `q` quit |

Press `Ctrl+X` on its own for a live cheat sheet of whatever is currently bound.
The transcript scrolls and follows the live edge: streaming fills the view on its own,
a message that arrives while you are reading history leaves your place, and sending a
message returns you to the bottom. The footer shows `⇅ N` when you are N lines up.
Overrides go in `cli.keybinds` in `~/.sentinel.json`; see `src/tui/keybinds.ts` for the
full action list and `src/tui/components/dialogs/help-dialog.tsx` for the in-app reference.

## `sentinel outcome` — vague ask in, judgeable contract out

A request like "the sync is flaky" is not a goal: nothing can verify it, so
any agent working on it is guessing. `outcome` turns it into a contract:

```
CURRENT STATE   what happens today, with the file:line that proves it
TARGET          one measurable delta, not a list of wishes
VERIFICATION    the exact command, and what its exit code means
BLAST RADIUS    what a rollback would touch
ROLLBACK        the concrete undo
UNKNOWNS        what the model had to assume — asked, not guessed
```

```bash
sentinel outcome "the sync is flaky" --plan   # write the contract only
sentinel outcome "the sync is flaky"           # write it, then work to it
sentinel outcome "..." --no-save               # do not touch .sentinel/
```

The contract is persisted to `.sentinel/outcome.json`. The worker is briefed
with the whole contract *including the unknowns it inherited*, so it knows which
parts of the plan were shaky going in. Then `goal.js`'s tool-less evaluator
judges the work against the contract rather than a sentence.

The evaluator has a third verdict, `unknown`, for when the contract itself
cannot be judged — an unmeasurable TARGET, or VERIFICATION never run. That
verdict is terminal: retrying identical work cannot make an unjudgeable
condition judgeable, so the turn ends and says which field is the problem.

## `sentinel watch` — the standing FDE

Everything else here runs once and ends. An FDE is there on Tuesday when the
thing they shipped on Monday starts failing. `watch` is that difference:

```bash
sentinel watch "keep the sync green" \
  -t "command:npm test" -t git --goal "npm test exits 0"

# from another terminal, mid-run:
sentinel steer "also check the retry path"
```

| Trigger | Fires when |
| ------- | ---------- |
| `command:<cmd>` | the command exits **non-zero** — you are woken by breakage, not by green |
| `command:<cmd> --when always` | regardless of exit code |
| `file:<path>` | its mtime moves |
| `git` | HEAD moves |
| `interval:<ms>` | time passes |
| `once` | immediately, then never |

**Steering** is the part that makes this a presence rather than a cron job. The
queue is a file (`.sentinel/steer.jsonl`), so `sentinel steer` works from
another terminal, in another process, and the instruction lands on the *next*
tick as a priority over the original task. That is roadmap item #16.

Three guards make an unattended loop safe to leave running:

- **The engagement budget is checked before every single wakeup.** A standing
  loop that ignores its ceiling is just a way to spend money quietly.
- **Backoff.** A tick that does not make progress doubles its wait, up to 15
  minutes, and five in a row stops the loop. "Progress" is deliberately weak:
  the goal was met, or the agent said it wrote something. A tick that only
  read files has not moved the engagement.
- **Failures are recorded, not fatal.** A provider that throws ends that tick,
  not the watch.

State lives in `.sentinel/watch-state.json` (ticks, backoff, last trigger).

## Blast-radius gate

A forward-deployed engineer does not decide a change is safe because the tool
said yes. On a path they do not own, they state the file and line that justifies
the change and name the rollback before touching anything. Sentinel now does
that automatically for the paths where being wrong is expensive:

| Challenged | Why |
| ---------- | --- |
| `db/migrate/**`, `*.sql` | a migration is rarely undone by reverting it |
| `.github/workflows/**` | this gates every merge |
| `prisma/schema.*`, `*schema.json` | changing a schema changes everything under it |
| `package-lock.json`, `yarn.lock`, … | a lockfile edit is invisible in review |
| `src/auth/**`, `src/billing/**`, `**/rbac*` | the code you cannot roll back |
| `Dockerfile`, `docker-compose*`, `Makefile` | build and deploy definitions |
| `infra/`, `terraform/`, `k8s/` | infrastructure definition |
| `.sentinel/config.yaml` | the project's own permission config |

The gate **blocks once per path per turn**. The first write is refused with the
requirement spelled out — the file:line that justifies it, and the exact
rollback — and the agent's next move must include both before the write lands.
After that the path is open for the rest of the turn.

That is deliberate, and it matches the Stop hook's forced-verification pattern.
A gate that blocks forever trains people to disable it; a gate that asks once
and records the answer is a habit.

The trade is explicitly toward over-asking: `lib/auth-utils.js` gets challenged
even though it is a utility, because the cost of a false positive is one prompt
and the cost of missing real billing code is not recoverable.

## `sentinel budget` — spend that outlives the process

`maxCostUsd` guards a single turn and `cost.js` totals are in-memory, so neither
can answer the only question a buyer asks: *what has this cost so far*. An
engagement is the FDE-shaped unit — a budget, a deadline, a stop condition —
persisted per project so a week's work is still measured on Friday.

```bash
sentinel budget --usd 25 --deadline 2h --condition "npm test exits 0"
sentinel budget            # active  ░░░░░░░░  $12.40 of $25.00 (50%) · 1h 59m left
sentinel budget --history  # recent turns and their spend
sentinel budget --clear    # remove the ceiling; spend history is kept
```

Once set, `ask`, `goal`, and `outcome` all honour it — you set it once and every
later run is gated. The loop checks after each model call and stops hard at the
ceiling rather than letting one more call land first.

State lives in two gitignored files: `.sentinel/budget.json` (the ceiling) and
`.sentinel/spend.jsonl` (one append-only line per turn, so a crash mid-write
loses one row, not the log).

Two deliberate choices: spend recorded **before** the budget was set does not
count against it, and a turn that finishes in the same millisecond the budget
was created **does** — a ceiling should fail toward charging you, not away.

## `sentinel handoff` — the runbook, not the diff

Every turn is already recorded to `.sentinel/trajectories/*.jsonl`. That data
has been write-only. `handoff` turns a recording into the artifact an
engagement is actually judged on — something the customer's team can pick up:

```bash
sentinel handoff --list          # runs that can be handed off
sentinel handoff <runId>         # write .sentinel/HANDOFF.md
sentinel handoff <runId> --stdout
sentinel handoff a b c --stdout  # several runs, merged
```

The runbook has five sections: what changed, **what was verified**, **what was
tried and rejected**, claims to distrust, and what is still fragile.

The second and third are the point. "A green test does not prove the fix is the
right one" and "we tried patching the parser incrementally and it broke on
nested arrays" are exactly what the next person needs and exactly what nobody
writes down. Dead ends are derived mechanically: any command shape that failed,
or that ran three or more times, plus any claim the receipts system could not
back with a passing command.

**No model, no API key.** The model already ran once; asking it to summarize
its own run again is how confident, unverifiable prose gets into a runbook.
A run where nothing exited 0 says so in bold.

## Risk ledger — permission by novelty

"Allow bash for this session" is one grant covering `git status` and
`npm publish` alike, which is either uselessly strict or uselessly loose. The
ledger records command **shapes** per repo in `.sentinel/risk.json` and grades
each one:

| Level | Meaning |
| ----- | ------- |
| `green` | provably read-only, or a shape already approved in this repo |
| `yellow` | a new shape that is not destructive → asked, with the shape named |
| `red` | destructive, or reaches outside the workspace → always asked, never remembered as safe |

```bash
sentinel risk                     # list approved shapes
sentinel risk "npm publish"       # how would this grade here?
sentinel risk --forget "npm publish"
```

Two properties matter more than the grading itself:

- **Flags are kept, values are not.** `git commit -m "a"` and
  `git commit -m "b"` are one shape, so the second does not ask. But
  `git push --force` is a *different* shape from `git push`, and
  `--force` is never collapsed into a placeholder.
- **The subcommand is part of the verb.** `git commit` and `git push` never
  share a shape, so approving a commit cannot authorize a push. Same for
  `npm run` vs `npm publish`, `docker build` vs `docker push`.

A missing or corrupt ledger is treated as empty, which grades everything novel
as `yellow`. An approving ledger that does not exist is not consent.

The lead still sees a shell command the first time — the ledger narrows what is
asked, it does not remove asking.

## `sentinel onboard` — the week-one survey

A new engineer's first days go to comprehension, not commits. `onboard` answers
the questions a new joiner actually asks, from files already on disk:

```bash
sentinel onboard                       # print the survey
sentinel onboard --json                # raw structured data
sentinel onboard --remember            # store a project memory record
sentinel onboard --todos               # seed .sentinel/todos.json with the gaps
sentinel onboard -o ONBOARDING.md      # write it to a file to commit
```

It reports entry points, what gates the merge (workflow names and triggers),
test topology, churn hotspots from git history, ownership per directory, and
**risk areas** — source files that change constantly with no test covering
them. Generated files (lockfiles, bundles) are reported separately rather than
crowding out real source, and deleted-but-churned files are shown as history
rather than as places to go make changes.

Exit code is non-zero when the survey finds anything a new engineer should know
first, so it works as a CI check.

**No model, no API key, no network.** The survey is deterministic filesystem and
`git log` analysis, so it runs anywhere and gives the same answer twice.

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

### v3.3.0 — `sentinel doctor`

- `sentinel doctor` — pre-flight checks before the first turn: Node runtime (against the Node 20
  floor), working directory, data-dir writability, provider credentials, host memory, and the shell
  tool layer (including that destructive patterns are still classified)
- Exits non-zero only on a real failure; warnings are information for a human, so the Windows PATH
  note does not make the command useless
- Offline by default — `--network` opts into probing local model servers, because a health check
  that needs the internet to tell you the internet is down is useless
- `--json` for scripting
- Provider check counts the config store as well as the environment, since that is what the runtime
  actually reads; key values are never printed, only provider and variable names
- `engines.node >= 20` is now declared in the package manifest

**Website**
- `/series` courses with an episode pager, plus a batch of keyword-mapped posts

### v3.2.1 — TUI overlays were broken

**The bug:** dialogs (provider setup, model picker, theme picker, logs, help, permission) and the
command palette were rendered as a normal-flow sibling *after* the session. The session filled the
terminal, so every one of them was pushed off the bottom of the screen. Worst case was first run:
with no provider key set, the setup dialog opened invisibly while the prompt was already disabled,
so the app looked completely frozen — nothing you typed did anything.

**Fixed**
- Dialogs and the command palette are now absolutely positioned overlays sized to the terminal,
  painted over the session (opencode's modal behaviour) instead of below it
- The root is pinned to the terminal size, so the prompt and footer stay put instead of being
  pushed off by a long conversation
- Toasts render as a pinned strip; previously every success and error message was drawn
  underneath the app and never seen
- The provider picker and model picker window their lists to what fits, so entries are no longer
  squeezed or clipped out of a short terminal
- `Esc` no longer stops the running turn while a dialog or the palette is open
- Dialog context value is memoized; a fresh identity every render drove a `setState` loop
  ("Maximum update depth exceeded")
- Removed the duplicated dialog title (the overlay already frames it)
- Added `npm run tui:probe`, a headless harness that renders the real TUI and prints the frame a
  user sees — this is what caught the above, since the snapshot tests only render a fixture

### v3.2.0 — The forward-deployed engineer

**New commands**
- `race` — best-of-N: N agents solve the task in parallel git worktrees; your `--check` command picks the winner
- `watch` / `steer` — a standing agent that keeps working when tests fail, a file changes or a commit lands, steerable from another terminal
- `goal` — work in BUILD mode until a shell condition is verified (e.g. "npm test exits 0")
- `outcome` — turn a vague ask into a verifiable contract (CURRENT / TARGET / VERIFICATION / BLAST RADIUS / ROLLBACK)
- `replay` — re-run recorded turns against the current harness and model, then diff behavior
- `handoff` — generate a runbook from recorded runs: what changed, what was verified, what was rejected
- `budget` — set the engagement budget, deadline and stop condition
- `risk` — grade a command against this repo, backed by a ledger that learns
- `onboard` — deterministic repo survey: entry points, what gates the merge, churn, ownership, risk
- `mini` — one-tool bash-only agent for small, scriptable tasks

**Agent**
- Blast-radius gate: a risky write is blocked or re-asked based on measured impact
- Harness ports: skills, todos, subagents and hooks
- Stop hook fires only when the project actually has tests (no more "run the tests" in a repo with none)
- A solo lead can no longer message itself; it answers the user directly

**TUI**
- Theme picker, shared chat components and a render-snapshot harness
- GFM tables render correctly in markdown
- Provider errors are one readable line with a next step (401 → `/setup`, 429 → wait or `/model`, …)
- Working-directory recovery: the TUI runs its tools in your project even when its own package.json is malformed
- Session files written by older builds no longer crash the session panel

**Website**
- Docs refresh, SEO foundation and a keyword-mapped blog

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
