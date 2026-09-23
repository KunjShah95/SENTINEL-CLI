# Claude-Code Harness Adaptation Plan

How Sentinel adopts the Claude-Code agent-harness architecture — mapped
mechanism by mechanism from the open sources (the Medium article is
paywalled; this plan is built from the primary materials instead):

- Anthropic Agent SDK: agent-loop docs (tools, hooks, subagents, compaction)
- `claude-code-from-source.com` Ch.5: the `query()` generator, state
  transitions, microcompact, error-recovery escalation ladder
- `sidbharath.com/blog/the-anatomy-of-claude-code` (Mar 2026, rev. Aug 2026):
  `buildEffectiveSystemPrompt()`, skill loading, tool registry,
  permission layers, `isConcurrencySafe()` batching, plan mode, task
  system, AgentTool recursion, coordinator/worker teams
- `shareAI-lab/learn-claude-code` (s01–s17): one mechanism per chapter
  around a single loop — the shape this plan copies
- `decodingai.com` Decode series: headless harness, steering queue,
  Pydantic-AI-thin loop, LSP/codeMap channel, sandbox + permissions

## Principle (from all sources, and Sentinel's own CONTRIBUTING)

The model is the driver, the harness is the vehicle. One loop owns
everything; mechanisms attach to it. Sentinel stays Pi-minimal: each
adaptation is a small module + tool, never a framework.

## Map: Claude Code mechanism → Sentinel adaptation → status

| # | Mechanism | Sentinel adaptation | Status |
|---|---|---|---|
| 1 | Single `query()` async generator with backpressure | `runAgentTurnInner` (already a generator) + `runAgentTurn` trajectory wrapper | ✅ kept as the center; no parallel runner added |
| 2 | Composable `buildEffectiveSystemPrompt()` sections | `src/agent/prompt.js`: header / environment / project-context / mode / rules / skills sections, each its own builder | ✅ done |
| 3 | Environment section (`computeSimpleEnvInfo`) | `buildEnvironmentSection()`: cwd, OS, git branch | ✅ done |
| 4 | Project knowledge (CLAUDE.md at every level) | `src/agent/context-files.js`: SENTINEL.md → CLAUDE.md → AGENTS.md → .sentinel/context.md, 3k-char cap, injected into prompt | ✅ done (runtime twin of TUI loader) |
| 5 | Skills: list names cheap, expand on `Skill` call | `src/agent/skills.js` + `skill` tool; `.sentinel/skills/*/SKILL.md`; ships `reproduce-fix-verify` | ✅ done |
| 6 | Task system (TaskCreate/Update, JSON on disk) | `src/agent/tasks.js` + `todoWrite`/`todoRead` tools; `.sentinel/todos.json`; full-list overwrite semantics | ✅ done |
| 7 | Subagents: same loop, fresh `messages[]`, restricted tools | `spawnAgent` tool in loop: fresh history, PLAN-or-BUILD, permission-deny inside, depth ≤ 1 (no chains) | ✅ done |
| 8 | `isConcurrencySafe()` batching (≤10 parallel reads) | `batchToolCalls()`: consecutive read-only calls → `Promise.all` (cap 10); writes serial | ✅ done |
| 9 | Permission layers (trust → hooks → mode) | order is now: builtin guard → registered hooks → `onPermissionRequest` → mode check (in `executeLocalTool`) | ✅ done |
| 10 | PreToolUse / PostToolUse / Stop hooks | `src/agent/hooks.js`: `on()/runHooks()`, dangerous-command + secrets guard, audit JSONL, `checkStop()` Ralph-Wiggum retry (max 2) | ✅ done |
| 11 | Forced verification before stop | Stop hook: changed-files-without-tests blocks stop once, injects test reminder | ✅ done (BUILD/SWE only) |
| 12 | Loop detection (per-file edit counts) | `loopHint()`: ≥3 edits to one file → reconsider reminder in history | ✅ done |
| 13 | Trajectory capture for trace→eval loop | `.sentinel/trajectories/*.jsonl` (already shipped); audit log added | ✅ extended |
| 14 | Coordinator/worker agent teams + mailbox | ❌ deferred — needs multi-session infra; `spawnAgent` covers bounded delegation | planned |
| 15 | Background agents / cron | ❌ deferred — TUI lists them in help text but no runtime exists | planned |
| 16 | Steering queue + priority gate (Decode) | ❌ deferred — TUI is turn-based; revisit with interactive steering | planned |
| 17 | LSP symbol channel | ⚠️ partial — `codeMap` tool exists; full LSP server deferred | partial |
| 18 | Tool-schema deferral / ToolSearch | ❌ deferred — 19 tools fit comfortably in context today | planned |
| 19 | Microcompact / 4-layer compaction | ✅ done — `microcompactMessages()` in `context.js`: tombstones superseded tool results (same tool+input or duplicate `toolCallId`) before summary compaction; runs inside `compactMessages` and as a TUI gate before the summary path | partial |

## What changed (files)

- `src/agent/context-files.js`, `skills.js`, `tasks.js`, `hooks.js` (new)
- `src/agent/context.js`: `microcompactMessages()` + `MICROCOMPACT_TOMBSTONE` (pure, copy-on-write)
- `src/tui/lib/context-compactor.ts`: microcompact step 0 inside `compactMessages`, typed `microcompactMessages` export
- `src/tui/hooks/use-agent-chat.ts`: microcompact gate ahead of the auto-compact effect
- `src/agent/prompt.js`: composable sections (was one flat string)
- `src/agent/loop.js`: `batchToolCalls`, `loopHint`, `executeOneTool`
  (hooks → permission → subagent-or-local → audit), stop-hook retry,
  `subagentDepth`, `todoWrite/todoRead/skill/spawnAgent` provider schemas
- `src/shared/tools/{schemas,index}.js`: 4 new tools + impls
  (`spawnAgent` executes in loop.js, not here — avoids a require cycle)
- `src/shared/schemas/mode.js`: `todoRead`/`skill` read-only
- `.sentinel/skills/reproduce-fix-verify/SKILL.md`: first shipped skill
- `__tests__/harness.test.js` (15 tests), `agent-loop.test.js` +4
  (parallel reads, subagent summary, dangerous-command block, stop retry)

## Verification

`npm run release:check` (lint + typecheck + imports + 129 unit + 9 jest),
`npm run bench` (14/14), `npm run eval:check` (oracles valid).
Microcompact adds 7 jest tests (`agent-context.jest.test.js`).

## Next (when a failure demands it — eval-driven, not speculative)

1. Measure microcompact efficacy: turns-per-compaction and tokens saved
   per session on long SWE tasks (`SENTINEL_NO_TRAJECTORY` off, compare
   `.sentinel/trajectories/*.jsonl` before/after). Extend to 4-layer
   compaction only if the numbers say so.
1. Measure microcompact efficacy: turns-per-compaction and tokens saved
   per session on long SWE tasks (`SENTINEL_NO_TRAJECTORY` off, compare
   `.sentinel/trajectories/*.jsonl` before/after). Extend to 4-layer
   compaction only if the numbers say so.
2. Agent teams: only when single-subagent delegation proves insufficient.
3. Steering queue: only with an interactive use case that turn-taking blocks.
