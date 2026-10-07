# One agent task primitive

Status: all seven mechanisms ported. `team.js` and `background.js` survive only
as shells over `task.js`. See §Status.
Replaces: seven overlapping mechanisms. See §1.

## The problem

`src/agent/` can start work seven different ways, and each invented its own
answer to four questions that are really one set of questions:

| Mechanism | Spawns | Worktree handling | Permission policy | Status lives in |
| --- | --- | --- | --- | --- |
| `spawnAgent` (`loop.js`) | one loop turn, depth ≤ 1 | none | inline `async () => 'deny'` | nowhere |
| `spawnTeammate` (`team.js`) | one loop turn, async | optional, then merge | `teammatePermission` | `team` Map |
| `bgRun` / `bgCheck` (`background.js`) | a shell command | none | inherits the `bash` tool's | `tasks` Map |
| `race` (`race.js`) | N loop turns | always, one per candidate | `teammatePermission` | local array |
| `watch` (`watch.js`) | a loop turn per trigger | none | passed in by the caller | JSON on disk |
| `mini` (`mini.js`) | a loop turn, one tool | none | n/a, bash-only | local |
| sessions (`sessions.js`) | nothing — persistence only | none | n/a | JSON per session |

Four status stores, three worktree implementations, two permission policies,
and depth limits spelled three different ways (`subagentDepth >= 1`,
`MAX_TEAMMATES`, `RACE_MAX`). Every one of those is a place the same bug gets
fixed once and missed three times.

The tell is that `race.js` and `replay.js` both import `teammatePermission`
from `team.js` — a permission policy for one feature, living inside another,
because the second feature needed it and the right home did not exist yet.

## The principle

> **A task is the only unit of concurrent work. Everything that starts work
> starts a task. There is no second mechanism.**

Not "one API for subagents and teammates". One primitive, because the
differences between the seven are all *configuration*, not behaviour:

- a subagent is a task with `await: true` and `isolation: 'none'`
- a teammate is a task with `await: false` and optional worktree isolation
- a race candidate is a task with `isolation: 'worktree'` and a scoring hook
- a background command is a task with no model and one tool

Once that is true, `race` is not a parallel-agent system at all — it is N tasks
plus a ranker. `team.js` stops existing. `spawnAgent` and `spawnTeammate`
become one tool with a flag.

## 1. The primitive

`src/agent/task.js` owns every question the seven mechanisms answered
differently.

```js
// The whole public surface.
createTask(spec) -> taskId          // start
getTask(id) -> Task | undefined
listTasks({ parent, status }) -> Task[]
cancelTask(id, reason) -> boolean   // cooperative
awaitTask(id, { timeoutMs }) -> result
onTaskEvent(fn) -> unsubscribe      // the one event stream
```

`Task` is a plain frozen object. No classes, no inheritance — it gets
serialised into trajectories and printed by the TUI, and a class hierarchy
would make both worse.

```
{
  id, kind, name, parent,
  status,            // pending | running | done | failed | cancelled
  mode, model,
  prompt, isolation, workdir, branch, baseSha,
  permission,        // the resolved policy name, not a closure
  depth, startedAt, finishedAt,
  result,            // { summary, exitCode, usage, costUsd, patch }
}
```

`permission` is stored as a **name** (`'inherit' | 'readonly' | 'teammate' |
'none'`), not a callback. Two reasons: it is inspectable from the transcript,
and a stored closure cannot be compared, logged, or asserted on.

## 2. The one permission ladder

Replaces `teammatePermission`, the inline `async () => 'deny'`, and the ad-hoc
callback passed by `watch`. Ordered most to least capable:

| Policy | Reads | Writes | Shell | Who uses it |
| --- | --- | --- | --- | --- |
| `none` | no | no | no | nothing; the explicit deny-everything rung |
| `readonly` | yes | no | read-only cmds | subagents, reviewers, scanners |
| `teammate` | yes | yes, inside its own worktree | non-destructive, inheriting lead grants | teammates, race candidates |
| `inherit` | the caller's own policy | — | — | replay, watch |

Two rules that were previously implicit and are now explicit:

- `readonly` is not "does not write". It is a list. `searchWeb` and `skill` are
  both read-only and both reach outside the project, and deriving the rule
  would grant them without anyone deciding to.
- `teammate` inherits the lead's **session grants**, never its `allowAll` set
  wholesale, and never promotes a destructive command to a standing grant.

## 3. Worktrees, once

`worktree.js` already does the hard part. What is missing is one place that
decides *whether* a task gets one, and one place that cleans up.

- `isolation: 'worktree'` is the only thing that creates a worktree.
- Cleanup happens in `cancelTask` and in `awaitTask`'s completion path, so a
  task cannot leak a worktree by being forgotten.
- A task that owns a worktree records `branch` and `baseSha`, which is all the
  merge needs. `teamMerge` becomes `awaitTask(id, { merge: 'diff' | 'apply' | 'discard' })`.

## 4. Depth and limits

One counter, threaded through the loop the way `workdir` already is. Three
different spellings today (`subagentDepth >= 1`, `MAX_TEAMMATES`, `RACE_MAX`)
become one `maxConcurrent` and one `maxDepth`.

The interesting constraint is that a subagent must not spawn a subagent. That
stays, and it is enforced by depth rather than by which tool was called — so it
holds for every mechanism at once instead of only for `spawnAgent`.

## 5. Events

One stream, consumed by the TUI, the CLI, and the trajectory recorder:

```
task.started  task.progress  task.tool  task.finished  task.failed  task.cancelled
```

`background.js` already posts to the mailbox and `team.js` already posts to
the mailbox; unifying means both post the *same* event shape, so the model sees
one kind of notification instead of two it has to interpret differently.

## 6. What gets deleted

| File | Becomes |
| --- | --- |
| `team.js` | `task.js`. `spawnTeammate` is `createTask`, `mergeTeammate` is `awaitTask({merge})` |
| `background.js` | `task.js`. A task with `kind: 'command'` and no model |
| `race.js` | N tasks + `rankCandidates`, which stays because ranking is real logic |
| `mini.js` | A task with `kind: 'agent'`, one tool, no worktree |

Nothing is deleted before its replacement passes the existing tests. That is
the whole migration order: build `task.js`, port one caller, port the next,
delete a module when its last importer is gone.

## 7. What this deliberately does not do

- **No server, no IPC.** OpenCode's server/client split exists because it is a
  hosted TUI. Sentinel's promise is `git clone && npm install && sentinel`, and
  an event stream inside the process satisfies every consumer here.
- **No plugin system.** A task kind is a plain object with a `run` function.
  That is enough for the four kinds that exist and does not commit the repo to
  a compatibility promise about a fifth.
- **Not a rewrite of `loop.js`.** The loop stays the loop. This makes the seven
  ways of *starting* it into one, which is where the duplication actually is.

## Status

The unification is complete and it has a second consumer, which is the real test of
whether a primitive is a primitive or a refactor that happened to suit one codebase.

### Sentinel

- [x] Design agreed, written down
- [x] `task.js`: registry, lifecycle, one permission ladder, one worktree policy
- [x] Tests: the four rungs, depth, concurrency cap, worktree cleanup,
      merge-twice guard, listener isolation
- [x] Port `spawnTeammate` → `createTask` (`team.js` is now a shell)
- [x] Port `bgRun` → `createTask({kind:'command'})` (`background.js` keeps only `runCommand`)
- [x] Port `spawnAgent` → `createTask({permission:'readonly'})`
- [x] Port `race` → N tasks, worktrees and teardown from the primitive
- [x] Port `watch` — each tick is a task
- [x] Port `mini` — each run is a task, and is now cancellable by id
- [x] `sentinel tasks` — inspect the registry from the CLI
- [x] Delete `team.js` and `background.js` as *owners* of behaviour; both remain
      as thin shells because six importers still use their exported names
- [x] One tool, not seven: `task(action=…)` replaces `spawnAgent`,
      `spawnTeammate`, `bgRun`, `bgCheck`, `teamStatus`, `teamMerge` and
      `sendMessage` as the name the model sees. See §8.

## 8. One tool, and what it cost to collapse

Six names did the same job with different arguments, so the model had to learn
which to reach for. They are now one tool with an `action`:

```
task(action="spawn")        -> a subagent, awaited        (was spawnAgent)
task(action="spawn-async")  -> a teammate, reports later (was spawnTeammate)
task(action="run")          -> a background command      (was bgRun)
task(action="status")       -> what is running           (was teamStatus)
task(action="check")        -> one command's output      (was bgCheck)
task(action="merge")        -> worktree work comes home  (was teamMerge)
task(action="message")      -> note to a teammate        (was sendMessage)
task(action="cancel")       -> stop one                  (new — cancelTask had no
                                                            model-facing name)
```

The compatibility layer is a table, not a second implementation:

```js
export const TASK_ACTIONS = Object.freeze({
  'spawn-async': 'spawnTeammate',
  run: 'bgRun', status: 'teamStatus', check: 'bgCheck',
  merge: 'teamMerge', message: 'sendMessage',
  cancel: null, spawn: null,
});
```

`normalizeTaskCall` rewrites a `task` call into the legacy one and takes the
identical code path. That is why the seven names still work and why there is
nothing new to keep correct — a second dispatch table would have been a second
implementation to drift.

### The one real trap

The legacy merge tool reads a field called `action`. A naive pass-through leaves
`{action: 'merge'}` in the input, the merge reads `action === 'diff'`, and
**every merge silently becomes a diff**. The new tool therefore names the field
`merge`, and the translation moves it:

```js
if (action === 'merge') {
  tc.input.action = input.merge || 'diff';
  delete tc.input.merge;
}
```

Silently, and in the safe-looking direction: a merge becomes a patch nobody
applies, which reads as "the teammate's work vanished".

### Showing one tool while dispatching seven

`buildProviderTools` filters the legacy names out; `HARNESS_TOOLS` keeps them in.
A trajectory recorded with `spawnTeammate` has to keep replaying, and a model
that learned that name last session still works — but neither should be *shown*
it, because offering both leaves the model to choose between seven spellings,
which is the problem being fixed.

`sync`/`spawn` needed extracting into one shared function, because both names now
reach it and two copies would drift.

### Why this was not a refactor

Everything above is mechanical, but the part that changes model behaviour is the
prompt: six rules become one, and the model is no longer offered the old names.
That cannot be verified by tests — only by watching what the model actually
does. The tests here assert the shape (one tool offered, every action documented,
legacy names still dispatched, no drift between the spellings) and the behaviour
is worth watching for a week.

### The reviewer — the second consumer

`sentinel review` (§8's `review` command) is the second consumer, and it exists
partly as evidence: a primitive that only suits the codebase it was extracted
from is a refactor, and one that a separate capability can use is an interface.

What it needed and did not write — a status store, a permission policy, a
cancellation path, a concurrency cap — all came from `task.js`. Its security
model is one line:

```js
const rung = readOnly ? PERMISSIONS.READONLY : PERMISSIONS.TEAMMATE;
```

Reviewing someone else's patch means reading attacker-controlled code, so it gets
the rung that stops a subagent editing files — the same code, already tested for
a different feature. `__tests__/review.test.js` asserts the rung, which is what
makes the claim checkable.

### Two design changes the ports forced

**Depth starts at 1, not 0.** The agent loop starts most tasks and is not
itself in the registry, so there is no `parent` to derive depth from. Seeding
from the creator (`depthSeed`) exposed that every task has a creator, so depth 0
meant "no creator" and never occurred. The limit now reads for what it always
meant: only the lead starts tasks, and nothing a task starts can start anything.
`maxDepth` is a per-call default, not a hard-coded rule — a caller that owns its
own supervision budget can widen it.

**A task may carry a caller-supplied id.** Background commands are `bg_*` and
teammates are addressed by name; those namespaces belong to the caller. The hint
is validated against `^[\w-]{1,64}$` because these ids reach log lines, mailbox
payloads and `sentinel tasks`.

### Why `background.js` and `team.js` still exist

`background.js` exists only for `runCommand`: a one-shot spawn that resolves
`{ exitCode, output, timedOut }`. It has no lifecycle, no status and no
delivery, so it is not a task — it is what a `kind: 'command'` task runs, and
`mini.js` uses it directly. Everything with a lifecycle moved to `task.js`.

`team.js` is down to a name, a brief and mailbox delivery. `loop.js`, `replay.js`
and three test files import its names. Deleting it is a mechanical rename at
those call sites, and doing it inside the port would have made the port
unreviewable. It is the next commit, not this one.

### What the race port changed

A candidate used to be `{ index, name, wt, model, hint }` with `createWorktree`
called by `race.js` and `removeWorktree` called in a `finally`. Now `race.js`
creates no worktree at all: it creates a task with `isolation: 'worktree'`,
reads `workdir`/`baseSha` back off the finished task for scoring, and merges the
winner with `mergeTask(id, 'apply')`. The `finally` discards whatever is left.

Teardown is the part worth noting. It used to be `for (const c of cands)
removeWorktree(c.wt)`, which is a loop that runs only if `race.js` is still
alive. Now a leaked worktree requires skipping the primitive's cleanup path, not
merely forgetting a `finally`. Four tests that build real git worktrees and
assert every one is removed still pass unchanged.

Candidates pass `maxConcurrent: RACE_MAX`. A tournament that cannot field its
own field is not a tournament, and the race is a CLI command — it is the one
caller that legitimately wants the whole budget.

### What the watch port changed

Each tick is a task, so a watcher burning money in another terminal is visible
in `sentinel tasks`, counts against the same concurrency budget as everything
else, and can be cancelled mid-turn instead of only between ticks.

The port also fixed a latent bug. `runWatcher` took its callback as
`permission = true`, but `cli/main.js` passes `onPermissionRequest` — so the
supplied value was silently dropped, and the `true` default would have thrown
`TypeError: onPermissionRequest is not a function` the moment anything actually
used it. It was invisible only because `runTurn` overrode it on the way in.

A tick refused admission is not a crash. A watcher whose budget is already full
records the refusal as an unproductive tick and backs off, which is what
`checkTriggers` returning nothing already did. Throwing would take down a
process that was correctly refusing to overspend.

### What the mini port changed, and what it deliberately did not

`runMini` is now a task shell around `runMiniLoop`. Three real consequences: it
appears in `sentinel tasks`, it counts against the shared concurrency cap, and
it is cancellable by anything holding its id. That last one is new capability —
previously the only thing that could stop a run was the caller that owned its
`AbortSignal`. The caller's signal is now bridged into `cancelTask`, because the
task owns the signal mini runs under and a silent no-op there would be worse
than the original design.

`mini` keeps its own dangerous-command guard instead of adopting a rung. This is
the one place where the ladder has no honest answer: mini is a headless
benchmark agent, so `teammate` — which allows a non-read-only shell command only
under an interactive grant — would deny every file write and make the agent
unable to do its job. "No prompts, deny the destructive patterns" is a real
policy the ladder does not have a rung for. Inventing one during a refactor
would be changing a security posture in a diff that claims to only move code,
so the rung is recorded as `inherit` and the guard stays where it was. If that
policy is wanted properly, it should be a rung with tests, as its own change.

### What the team port changed, and what it did not

`team.js` keeps its exported names, because `loop.js`, `race.js`, `replay.js`
and its own tests import them. A unification that rewrites every call site at
once is a unification nobody can review. Inside, it is now: a name, a brief, and
mailbox delivery. Status, worktrees, permissions and merging all come from
`task.js`.

Three real regressions were caught by the existing suite during this port,
which is the argument for porting one caller at a time:

1. **Double-merge was unguarded.** The old module refused to merge a teammate
   twice. `mergeTask` did not, so a retry ran `git` against a removed worktree
   and surfaced as `spawnSync git ENOENT` — a message about a missing binary
   rather than about the real problem. The guard checks `mergeState` first now.
2. **The mailbox subscription raced the task.** Subscribing after `createTask`
   returns means a task whose body resolves immediately has already emitted its
   terminal event, so the fastest possible teammate never reported back. Fixed
   by checking the task's status after subscribing.
3. **Vocabulary leaked across the boundary.** `listTeam()` returned the
   primitive's `done` where callers expect `completed`. Translated at the edge.

### One deliberate non-change

The ladder reproduces the shipped `teammatePermission` exactly, including that
a teammate *inherits* the lead's session grants. A first draft was stricter: a
teammate without worktree isolation was denied writes even when the lead had
been granted them. That is a defensible policy, but it is not this one's, and
changing a security posture during a refactor buries a real decision inside a
mechanical change. The strict variant is a one-line change if you want it.

## Verification

```
npm run release:check
  lint          clean
  typecheck     clean
  check:imports clean
  unit          709 pass, 0 fail
  tui            53 pass, 0 fail
  jest           16 pass, 0 fail
```

Fully green across all four suites.

Website (`cd website && npm run build`): exit 0, 32 posts, both series pages
static-render with all twelve PR Owl episodes linked.

## Also built on the primitive

`sentinel review` — see `src/agent/review*.js`. A reviewer is concurrent work
that produces findings which must point at real diff lines, so it is a task on
the same ladder, read-only by default, with no network and no credentials.

The four line kinds a diff can contain are the part worth remembering, because
getting one wrong produces a review that is *confidently* wrong: context has both
line numbers, added has only the right, removed has only the left, and
`\ No newline at end of file` is a directive and not a line — count it and every
subsequent number shifts by one.

## 9. The cleanup pass, and the duplication it found

A principal-engineer pass over the tree after the refactor. The interesting
outcome is not the tidy-ups — it is that the codebase had **reproduced the exact
bug this document warns about**, in the two places that matter most.

### Two diff parsers

`pr-owl/lib/diff.ts` was 273 lines of parser. `sentinel review` grew its own in
`src/agent/review-diff.js` when the capability moved into the CLI. For a while
there were two answers to "what line is this?":

- PR Owl's copy had no `fileText`, and returned `truncated` differently.
- `validateFindings` existed twice, differing on the cap (12 versus configurable)
  and on the wording of a dropped reason.

Neither is the catastrophic failure — no test failed, no comment landed on the
wrong line. That is what makes it worth writing down: **the drift was
invisible**, and it only surfaced because I ran a scan for duplicated lines
instead of trusting that two files with the same job meant the same answers.

Fixed by deleting the second copy. One implementation, one caller.
`extractJson`/`stripJson` were a *third* copy of the balanced-brace scanner and
are now one.

The test that had to change is the lesson: two tests asserted the drop-reason
wording and failed. They were asserting on a string that had moved to a shared
implementation — so they now match either phrasing, because the thing worth
pinning is **that a drop was recorded and explained**, not which file phrased it.

### Six copies of `.sentinel/`

`budget`, `outcome`, `risk-ledger` and `watch` each wrote state and each opened
with the same `mkdirSync(join(cwd, '.sentinel'), …)`. `risk-ledger` was worse:
`LEDGER_PATH = '.sentinel/risk.json'` *and* a hand-written
`join(cwd, '.sentinel', 'risk.json')` in the same file.

Six call sites for one fact, and two spellings of one filename inside a single
module. Rename the directory and a module writes state where nothing reads it —
which presents as "my budget setting keeps resetting", not as a missing
directory.

`src/utils/state-dir.js` now owns the name and the guarantee, with the
side-effect split that matters: `stateDir()` does not create, `ensureStateDir()`
does. A `doctor` check must not create the directory it is inspecting the
absence of. `__tests__/state-dir.test.js` asserts that, and asserts the four
modules land in one directory.

### Removed

`awaitTeammate` — a name-based wait over `task.js`, referenced by nothing once
`awaitTask` existed. Removing it also removed the `awaitTask` re-export that only
existed to serve it. An unused re-export is a lie about the surface.

## 10. A real race, found by the flaky test next door

`__tests__/ports.test.js` failed once inside `release:check` and passed 4/4 in
isolation. The signature of a timing bug, not a flake — so it was investigated
rather than re-run.

**`src/shared/tools/mutation-queue.js` did not serialize mutations.** The
original:

```js
const key = await queueKey(filePath);   // <-- suspension point
const prev = queues.get(key) ?? Promise.resolve();
// ... queues.set(key, chained)
```

`queues.get` and `queues.set` are adjacent, so the map was never racy. The bug
was the line above them: **`await` before acquiring a lock makes acquisition
order scheduling order, not call order.** Two callers both suspend on `realpath`
and whichever settles first takes the slot. Under light load `realpath` settles
in call order and the bug is invisible; under parallel load it inverts and two
mutations of the *same file* run concurrently — the one thing the module exists
to prevent.

**First fix was also wrong.** A synchronous admission ticket plus a global FIFO
chain is correct in isolation and still failed in-suite (`in3`/`in4` swapped):
key resolution and ticket service became two separate orderings that had to
agree. The lesson is that this class of bug is not fixed by *adding* ordering,
it is fixed by *removing the await*. Making the key synchronous with
`realpathSync` — memoised per path — means there is nothing to suspend on before
acquisition, so call order and acquisition order are the same by construction.

The cost is real and paid deliberately: a blocking call, memoised, a few
microseconds. The alternative is a data race in a lock.

Two tests added: eight concurrent callers on one file must complete in call
order regardless of path spelling, and different files must still overlap (so the
memo cannot be "fixed" by serializing everything).

## 11. A flaky test worth naming

`__tests__/mcp-server.test.js` also failed once inside `release:check` and passed
3/3 in isolation. That one is a genuine flake: it spawns a real MCP server over
stdio and waits on a 20-second wall clock, and `release:check` runs ~26 suites
in parallel, so on a loaded machine the handshake can miss its deadline.
Verified rather than assumed — the server answers `initialize` correctly when
spawned directly.

Loosening the timeout would hide it. The fix is a readiness signal rather than a
longer sleep, and it is not urgent enough to defer everything else for.

## 12. Inverting the dependency

§9 fixed the duplication by making PR Owl re-export three of Sentinel's modules.
That was the right fix and the wrong direction. PR Owl still *owned* the queue,
the policy and the trust rules, so Sentinel was the thing importing from an
example application — and the moment a rule changed, there was a question about
which copy was authoritative that no longer had an answer.

The move was to invert it. What PR Owl needed in order to be an app, and what did
not need GitHub:

| was | now |
| --- | --- |
| `pr-owl/lib/queue.ts` | `src/agent/review-queue.js` |
| `pr-owl/lib/policy.ts` | `src/agent/review-policy.js` |
| *(in `policy.ts`)* | `src/agent/review-trust.js` |
| `reviewPullRequest` | `runReview` in `src/agent/review.js` |

What stayed, because it is transport: `github.ts` (REST), `checkout.ts` (git),
`webhook.ts` (GitHub's headers), and `owl.ts` as the composition root. Every
import in `pr-owl/lib/` now points one way, at `src/`.

Three things changed shape rather than just location.

**The queue's key became opaque.** `repo#prNumber` was PR Owl's; the queue only
ever used it as an identity, so it now takes a caller-supplied `key` plus a
`payload`, and `pullRequestKey()`/`jobId()` are the two-line helpers that build
one. A queue that cannot tell a pull request from a build is a queue.

**Trust got a documented asymmetry.** `isTrustedOrigin(a, b)` — "are these the
same?" — defaults `true` when there is nothing to compare, because a local
working copy has no origin and refusing to review it would be useless.
`isUntrustedOrigin(a, b)` — "is this foreign?" — defaults `true`, because an
absent ref is a deleted fork and that is the case where you know least. Both
answers are correct to their own question, and writing that down is what stops
the pair looking like a bug and being "fixed" into one. `isUntrusted` is an alias
for the second, so `review-policy.js` reads as prose rather than as a branch on a
double negative.

**`buildBrief` was already a duplicate.** `review.js` and `policy.ts` each had
one. The one in `review.js` is now a re-export of `buildPolicyBrief`, so the
twelve-finding cap and the wording of a dropped reason cannot diverge.

Delegating `reviewPullRequest` to `runReview` was worth more than the file count
suggests. The old copy had drifted on three things that are not cosmetic: it did
not pass `subagentDepth: 1`, so a review of a stranger's patch could spawn
teammates; it did not pass the `rung`, so every call the reviewer made was
recorded as *not assessable* rather than as clean; and it lost the model's prose
when no structured summary came back, which is the whole text the reviewer spent
a second pass writing.

One deletion worth recording. `pr-owl/lib/review.ts` exported a `cancelReview()`
that called `cancelTask("pr-owl:<prKey>")` — an id no `createTask` call ever
returns, so it could not have cancelled anything. It was also never called. Dead
and wrong is worth deleting rather than documenting, so the comment explaining
why there is no cancel path says what the queue actually does instead: finish the
review you paid for, then review the newer head.


After both fixes: `release:check` was run three consecutive times end to end,
exit 0 every time.
