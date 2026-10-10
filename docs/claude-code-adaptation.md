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
| 5 | Skills: list names cheap, expand on `Skill` call | `src/agent/skills.js` + `skill` tool; `skills/*/SKILL.md` (shipped) plus `.sentinel`/`.claude`/`.codex`/`.agents`/`.opencode`; arguments via `$1`/`$ARGUMENTS`; stacked via `names`; bundled scripts via the separate `runSkillScript` tool; `/name` for explicit invocation; `skills` on `spawnAgent` and `spawnTeammate` | ✅ done |
| 6 | Task system (TaskCreate/Update, JSON on disk) | `src/agent/tasks.js` + `todoWrite`/`todoRead` tools; `.sentinel/todos.json`; full-list overwrite semantics | ✅ done |
| 7 | Subagents: same loop, fresh `messages[]`, restricted tools | `spawnAgent` tool in loop: fresh history, PLAN-or-BUILD, permission-deny inside, depth ≤ 1 (no chains) | ✅ done |
| 8 | `isConcurrencySafe()` batching (≤10 parallel reads) | `batchToolCalls()`: consecutive read-only calls → `Promise.all` (cap 10); writes serial | ✅ done |
| 9 | Permission layers (trust → hooks → mode) | order is now: builtin guard → registered hooks → `onPermissionRequest` → mode check (in `executeLocalTool`) | ✅ done |
| 10 | PreToolUse / PostToolUse / Stop hooks | `src/agent/hooks.js`: `on()/runHooks()`, dangerous-command + secrets guard, audit JSONL, `checkStop()` Ralph-Wiggum retry (max 2) | ✅ done |
| 11 | Forced verification before stop | Stop hook: changed-files-without-tests blocks stop once, injects test reminder | ✅ done (BUILD/SWE only) |
| 12 | Loop detection (per-file edit counts) | `loopHint()`: ≥3 edits to one file → reconsider reminder in history | ✅ done |
| 13 | Trajectory capture for trace→eval loop | `.sentinel/trajectories/*.jsonl` (already shipped); audit log added | ✅ extended |
| 14 | Coordinator/worker agent teams + mailbox | ✅ done — `team.js` + `mailbox.js`: named background teammates on the same loop, results/messages injected before the next model call, optional git-worktree isolation (see Part 2) | done |
| 15 | Background agents / cron | ⚠️ partial — background commands (`bgRun`/`bgCheck`, `background.js`) done; cron deferred (needs a long-lived host) | partial |
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
- `reproduce-fix-verify`: first skill, at `skills/reproduce-fix-verify/SKILL.md`. Shipped — see Part 3.
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
2. Agent teams: shipped (Part 2); measure before adding task-board claiming.
3. Steering queue: only with an interactive use case that turn-taking blocks.

# Part 2 — ports from four reference repos (Sept 2026)

Sources, cloned and read: `shareAI-lab/learn-claude-code` (s08–s17),
`instructkr/claw-code` (Rust runtime + mock parity harness),
`badlogic/pi-mono` (coding-agent core), `SWE-agent/mini-swe-agent`.
Same rule as Part 1: small module + tool, attached to the one loop.

| Source | Mechanism | Sentinel module / surface |
|---|---|---|
| learn-claude-code s08/s11 | Background commands + notification queue | `src/agent/background.js` (async spawn, tree-kill on timeout), tools `bgRun` / `bgCheck` |
| learn-claude-code s13 | Mailbox delivery drained before each model call | `src/agent/mailbox.js`; loop waits on pending work instead of ending the turn |
| learn-claude-code s09–s13, claw-code team registry | Named teammates on the same loop, lead ↔ teammate messages | `src/agent/team.js`, tools `spawnTeammate` / `sendMessage` / `teamStatus`; depth 1; ≤4 running |
| learn-claude-code s12 | Worktree task isolation | `spawnTeammate({isolation:"worktree"})` → `.sentinel/worktrees/<name>` on branch `sentinel/<name>-*`; tools resolve paths via `runInWorkdir` (AsyncLocalStorage, `src/shared/tools/workdir.js`) |
| learn-claude-code s09 | Memory: one file per record + index | `src/agent/memory.js`, `.sentinel/memory/*.md` + `MEMORY.md`; index only in the prompt; tools `memoryWrite` / `memoryDelete` |
| learn-claude-code s17 | Goal loop: Stop hook judged by a separate tool-less model call | `src/agent/goal.js`; `runAgentTurn({goal})`; CLI `sentinel goal "<condition>"` |
| claw-code bash_validation.rs | Read-only / write / state / destructive classification | `src/agent/bash-validation.js`; destructive commands are re-asked even after "allow bash for session"; warnings attached to results; drives teammate auto-approval |
| claw-code mock parity harness | Scripted scenarios against a deterministic fake provider | `__tests__/parity.test.js` (17 scenarios, incl. teams, worktree, goal, background, mini) |
| pi-mono file-mutation-queue.ts | Per-file serialization of writes | `src/shared/tools/mutation-queue.js`, wraps writeFile/editFile/batchEdit/applyPatch |
| pi-mono truncate.ts | Line/byte-bounded head/tail truncation | `src/shared/tools/truncate.js`; bash/runTests now keep the TAIL (errors, test summaries) |
| pi-mono session tree | Fork a session at a message, keep lineage | `sessions.fork()` / `sessions.lineage()` |
| pi-mono prompt-templates.ts | `/name args` Markdown templates, bash-style `$1 $@ ${@:N}` | `src/agent/prompt-templates.js`; `sentinel prompts`; expanded in `ask` / `goal` |
| mini-swe-agent | Bash-only agent, fresh subshell per action, submit sentinel, step/cost limits | `src/agent/mini.js`; `sentinel mini "<issue>" -o traj.json` (trajectory_format `mini-swe-agent-1.1`) |

Permission rules (new): harness tools obey the config policy when no
approval was obtained (`bgRun` defaults to `ask` like `bash`). Teammates
cannot prompt anyone: reads and provably read-only bash are allowed,
destructive bash is always denied, file edits are allowed only inside an
isolated worktree, and everything else needs a session grant from the
lead — a headless lead's teammates defer to the config policy, never more.

Not ported: cron (s12), workflow runtime (s16), claw-code LSP/MCP
lifecycle lanes.

# Part 3 — beyond the references

The CodeCrafters "Build your own Claude Code" syllabus (13 stages: LLM comms,
tool advertisement and execution, agent loop, write, bash; then skills —
advertise, invoke, arguments, stack, bundled script, model-selects, subagent) is
implemented and verified by `npm run verify:stages`, which exercises each stage
through the same public entry points the model uses, with a mock provider and no
network. One line per stage; non-zero exit on any failure. Stage *titles* come
from the course overview — the per-stage test specs are behind a GitHub login and
were never read, so it asserts the capability each title names, not the course's
own acceptance criteria. It is deliberately outside `release:check`, because two
stages shell out and would assert something about the host as well as the code.

| Feature | What it does | Where |
|---|---|---|
| Skill in a subagent | `spawnAgent({skills: [{name, args}]})` loads a workflow into the delegated agent's first message instead of leaving the model to describe it in prose. Bodies are fenced and named so the subagent can tell following a workflow from improvising one. An unknown skill is a refusal, never a silent skip | `buildSkillPreamble` / `normalizeSkillNames` in `src/agent/loop.js` |
| `/name` for skills and templates alike | One syntax, one argument parser. A prompt template wins on collision — a project that had `/review` before skills existed must not have it silently change meaning. Otherwise a skill, then passthrough, so `/help` and `/steer` survive | `src/agent/slash-commands.js`; `expandSlashCommand` in the CLI and TUI |
| `allowed-tools` | A skill's declaration narrows the rest of its turn by **refusing** calls it excludes, naming the binding skill and listing what is permitted. It does not narrow the advertised toolset: a skill loads mid-turn, so removing tools the model was already shown makes the next call fail against a list it has never seen. Two loaded skills intersect, so an unrestricted one cannot hand a restricted one its restriction back; a stacked `names: [...]` load is not a way to opt out. The `skill` tool itself is always permitted, and the scope ends with the turn | `src/agent/skill-scope.js`; `skillAllowedTools` in `src/agent/skills.js` |
| `sentinel skills run <name> [args…]` | Starts a turn with a skill already loaded, so `/name` is reachable from a shell, a script, or CI rather than only from a composer. `--print` shows the expansion and exits without a model call | `src/cli/main.js`; expansion via `src/agent/slash-commands.js` |
| `disable-model-invocation` | Withholds a skill from the system-prompt listing and from the `sentinel_skills` MCP listing, while leaving it reachable by `/name`, by `sentinel skills run`, and by exact-name expand. Needed hyphenated frontmatter keys — the old key pattern was `/^([A-Za-z]+):/`, which silently discarded `disable-model-invocation`, `allowed-tools` and `argument-hint` rather than reading them | `parseSkillFile` in `src/agent/skills.js`; `formatSkillListing(..., {includeHidden})`; `mcp/sentinel-mcp-server.js` |
| Stacked skills | `skill({names: [...]})` loads several in one call, in the caller's order. Two separate tool calls used to return as two unordered parallel results, so which body landed first was a race. Dedupe by name; an unknown name fails the whole call rather than half-loading | `skillImpl` in `src/shared/tools/index.js`; `normalizeSkillNames` in `src/agent/skill-delegation.js` |
| Skill arguments | `skill({name, args})` substitutes into `$1`, `$ARGUMENTS`, `${1:-default}` in the body. Reuses `substituteArgs` from `prompt-templates.js` rather than forking it, so `/name` and the `skill` tool cannot disagree about what `$1` means. Accepts an array or a bare string — small models send both | `applySkillArgs` / `normalizeSkillArgs` in `src/agent/skills.js` |
| Skill scripts | A skill may ship `scripts/*.sh\|js\|py\|ps1`. `runSkillScript({name, script, args})` runs one through the same sandbox `bash` uses. Path must resolve inside the skill directory; traversal and absolute paths are refused at resolution, before the shell | `resolveSkillScript`, `skillScriptCommand` in `src/agent/skills.js`; `runSkillScriptImpl` in `src/shared/tools/index.js` |
| `runSkillScript` is not a field on `skill` | `skill` is read-only and reads ten directories including `~/.claude/skills` and `~/.opencode/skills` — registry-sourced code. Execution hanging off a read-only tool would give a PLAN-mode turn the ability to run it. It is classified `shell` instead, refused in FIX, and graded by the risk ledger on the exact string that executes | `SHELL_TOOL_NAMES` in `src/shared/schemas/mode.js`; `commandFor` in `src/agent/gates.js` |
| Tool input validation | `toolInputSchemas` (~200 lines) was written and never called. `validateToolInput` now runs it in the loop before the permission prompt, and again in `executeLocalTool` for direct callers. Turning it on exposed a real bug: `str()` projected the bare string instead of `{ [field]: value }`, so every `readFile` would have received `'src/x.js'` where it expected `{ path }` | `validateToolInput` / `coerceToolInput` in `src/shared/tools/index.js` |
| Async shell | `bash`/`runTests` spawn instead of `execSync` (same bwrap / sandbox-exec wrappers) — teammates and notifications keep running during long commands | `runSandboxedAsync()` in `src/shared/tools/sandbox.js` |
| Teammate merge-back | `teamMerge` diff / apply / discard. Apply = binary patch vs the worktree's base commit, plain apply then 3-way fallback, checkpointed first (so `undoLastChange` reverts it), worktree + branch removed. Harness state (`.sentinel/audits`, checkpoints, trajectories…) is excluded from the patch | `src/agent/worktree.js`, `mergeTeammate()` |
| **race** (best-of-N) | N candidates solve one task in parallel worktrees, each with a different approach hint and optionally a different model (round-robin → local model tournament). Your check command scores them: passes → test balance → smaller diff → cheaper. Only the winner is applied; all worktrees removed | `src/agent/race.js`, `sentinel race "<task>" --check "npm test" -n 3 -m a,b` |
| Doom-loop guard | Same tool + same input 3× in a turn → "change approach" hint; 5× → turn ends | `doomLoopCheck()` in `loop.js` |
| Budget guard | Hard USD ceiling per turn, checked after every model call | `maxCostUsd` / `SENTINEL_MAX_COST_USD` / `--budget` |
| Steering | Typing while a turn runs redirects it: the message goes to the lead mailbox and lands before the next model call | TUI input stays enabled; `steer()` in `api-client.ts`; `/steer` |
| Headless auto-approve | `ask --build -y` / `goal -y`: everything approved except destructive shell commands, which are denied | `autoApprove()` in `src/cli/main.js` |
| TUI | `/goal`, `/fork` (real session branching; panel `f` key), `/steer`, prompt templates, harness notices as dim lines; loading a session now actually continues in it | `session.tsx`, `use-agent-chat.ts` |

Verification: `__tests__/{ports,parity,features}.test.js` — mock provider,
temp git repos, no key/network. Run `npm test`.

## Skills ship in `skills/`, and `skills/` comes first

`reproduce-fix-verify` lives at `skills/reproduce-fix-verify/SKILL.md` — tracked,
and included in the npm tarball via `files`. It was previously at
`.sentinel/skills/`, which is gitignored, so it existed and worked locally and in
no clone. That is what let this document describe a skill a reader did not have.

Two things had to change for the fix to be real:

1. **`skills/` is FIRST in `skillDirs`, not last.** An untracked copy at
   `.sentinel/skills/reproduce-fix-verify` shadowed the shipped one, so the skill
   that shipped was the one that never ran. A shipped baseline that sits at the
   bottom of the precedence list is unreachable as soon as any other registry
   claims the name. `__tests__/harness.test.js` asserts the shipped copy wins.
2. **`package.json` `files` includes `skills/**/*`.** A tracked directory that is
   not in `files` is still absent from the published package, which would have
   reproduced the original problem one level up.

`harness.test.js` asserts the file exists, so removing `skills/` is a red test
rather than a silent drift.

# Part 4 — TUI in the style of opencode + MiniMax Code, receipts, replay, routing

Sources: `sst/opencode` packages/tui (MIT) and `MiniMax-AI/minimax-code`
packages/tui (MIT). Both render with other engines (opentui/Solid with a
native core; pi-tui), so their component code cannot run under Ink. What
was taken: opencode's 33 theme files **verbatim** (`src/tui/themes/opencode/`,
license included) and a re-implementation of its theme resolver; opencode's
layout and component behavior re-created in Ink; MiniMax's activity line,
capacity meter, todo panel, tips and /context.

| Piece | Origin | Sentinel |
|---|---|---|
| 33 themes + resolver (defs, refs, dark/light, ANSI-256, short hex) | opencode `theme/assets`, `resolveTheme()` | `themes/opencode-loader.ts`; 43 themes total, **OpenCode is the default**; `/theme` picker previews live |
| `┃` split border, user message on panel bg, error bar | opencode `SplitBorder`, `UserMessage` | `components/oc/primitives.tsx`, `messages/*` |
| Inline tool rows (`→ Read`, `← Edit`, `✱ Grep`, `◈`, `%`, `⚙`), `~ pending…`, strikethrough when denied | opencode `InlineToolRow` + per-tool renderers | `components/oc/tool-display.ts` (pure) |
| Shell / todos as left-barred blocks with `# title` | opencode `BlockTool`, `Shell`, `TodoWrite` | same |
| `▣ Build · model · 8.4s` turn footer, collapsed "Thinking:" line | opencode `AssistantMessage`, `ReasoningPart` | `messages/bot-message.tsx` |
| Prompt: agent-colored bar, element bg, `Build · model provider` meta row | opencode `component/prompt` | `input-bar.tsx` |
| Footer: `~/dir:branch` left, status items right | opencode `routes/session/footer.tsx` | `oc/chrome.tsx` `Footer` |
| Home: two-tone block logo | opencode `routes/home.tsx`, `logo.ts` | `oc/chrome.tsx` `Home` |
| Activity line: spinner · phase · elapsed (after 1.5s) · tok/s · `enter steer · esc stop` | MiniMax `shell/activity-line.ts` | `oc/chrome.tsx` `ActivityLine` |
| `[████░░░░]` capacity meter, `/context` breakdown | MiniMax `capacity-meter.ts`, `context-visualization.ts` | `CapacityBar`, `lib/context-report.ts` |
| Live todo panel, rotating tips | MiniMax `todo-panel.ts`, `tips.ts` | `TodoPanel`, `Tip` |

Also fixed on the way: the search list only ever rendered its first 6 rows
and swallowed `j`/`k` keystrokes; the footer cost was a fake $3/M estimate
(now real provider usage).

`npm run tui:snapshot [theme] [--home] [--ansi]` renders a fixture frame
without a TTY; `__tests__/tui.test.mjs` asserts the layout and renders
every theme.

| Feature | What it does | Where |
|---|---|---|
| **Receipts** | Every tool result is hashed into a ledger. Claims in the final answer ("all tests pass", "build succeeds", "lint is clean", "no type errors") are resolved against it: supported / stale (edited after the green run) / contradicted / unsupported. Unbacked claims block the stop once (verify or retract); the turn ends with a receipts event showing `r7 \`npm test\` exit 0 · sha 3f2a…` | `src/agent/receipts.js` |
| **Replay evals** | Trajectories now record the prompt. `sentinel replay <runId> \| --last N [-m model]` re-runs past turns with the current harness in a throwaway worktree and reports regressions: stopped finishing, new errors, lost verified claims, plus file-set diff, tool-sequence similarity (LCS) and cost delta | `src/agent/replay.js` |
| **Cost-aware routing** | `--route <cheap-model>` / `SENTINEL_ROUTE_MODEL`: after a batch of read-only tools the cheap model continues exploring; the main model makes the first call, every call after a write/shell, and re-plans after 3 cheap calls. Usage and cost are tracked per model | `pickIterationModel()` in `loop.js` |

Routing is opt-in and its quality impact is unmeasured — use `replay` to
compare routed vs unrouted runs on your own trajectories before relying
on it.
