# Forward-Deployed Engineer project ideas

Brainstorm for SENTINEL-CLI, grounded in what already exists in the repo.

## What an FDE actually does

A forward-deployed engineer is embedded with a customer's team and owns an
*outcome*, not a ticket. The mechanics that distinguish FDE work from ordinary
coding:

1. **Cold-read the codebase.** Week one is comprehension, not commits.
2. **Translate a vague ask into a verifiable outcome.** "Sync is flaky" becomes
   "P95 < 2s, zero dropped rows over 10k accounts, proven by `npm run sync-test`".
3. **Learn the org, not just the code.** Who owns billing, which deploys are
   scary, whose sign-off is required.
4. **Earn trust with small safe wins.** Destructive actions are gated by novelty
   and blast radius, not by a blanket permission toggle.
5. **Hand off.** The engagement ends when the customer's team can do it without
   you. The artifact is a runbook, not a diff.

Each idea below maps one of these onto a concrete Sentinel surface.

---

## 1. `sentinel onboard` — the cold-read (flagship) — SHIPPED

**FDE mechanic:** #1.

Read an unfamiliar repo and produce a real architecture map, not a file listing.
Writes `.sentinel/ONBOARDING.md`, seeds `.sentinel/todos.json`, and writes one
`project` memory record.

Contents, each derived from something already computable:

| Section | Source |
| --- | --- |
| Entry points | `bin` field, `scripts` in package.json, `cmd_*`, `if __name__` |
| Dependency shape | `codeMap` + import check (`scripts/check-imports.mjs`) |
| Test topology | `glob **/*.test.*`, which dirs have no tests |
| CI surface | `.github/workflows/*`, what actually gates merge |
| Churn hotspots | `git log --numstat` per file, top-N |
| Ownership | `git log --format=%an` per top-level dir |
| Risk areas | hot files with no test coverage |
| Tribal knowledge | gaps between README claims and what the code does |

Implementation: `src/agent/onboard.js`, pure analysis functions +
`withTrajectory`-wrapped synthesis turn. Reads only — runs in PLAN mode.

**Why first:** every other idea needs this output. It is also the single most
repeated manual step for anyone new to a repo, which makes it the most
demo-able.

## 2. `sentinel outcome "<vague ask>"` — outcome contract — SHIPPED

**FDE mechanic:** #2.

Same shape as `goal.js` but harder: instead of judging a boolean condition,
run a short interview loop that produces a structured contract persisted to
`.sentinel/outcome.json`:

```
CURRENT STATE   what happens today, with the file+line that proves it
TARGET          one measurable delta
VERIFICATION    the exact command that proves it, and its exit code
BLAST RADIUS    files/services a rollback would touch
ROLLBACK        the concrete undo
UNKNOWNS        what the model had to guess (feeds the interview back)
```

`goal.js` then evaluates *this contract* instead of a one-line condition, and
`parseVerdict` gains an `unknown` verdict that re-opens the interview. Small,
pure, highly testable module. Pairs naturally with #1.

Shipped as `src/agent/outcome.js` plus `sentinel outcome`, with
`runAgentTurn({ outcome })` briefing the worker from the contract.

## 3. Risk ledger — permission by novelty, not by category — SHIPPED

**FDE mechanic:** #4.

`bash-validation.js` already computes `intent` and `readOnly` but only acts on
`destructive`. The unused half is the opportunity: persist per-repo command
history and gate on novelty.

```
riskLevel(command, cwd, ledger) ->
  green   same shape as something approved before in this repo
  yellow  new shape, non-destructive -> ask, with a suggested check
  red     destructive or writes outside the repo -> always ask, show blast radius
```

Ledger lives at `.sentinel/risk.json`. An FDE's first hour is deliberately small
green commands; the ledger encodes that without hardcoding it.

Shipped as `src/agent/risk-ledger.js` plus `sentinel risk`, wired into
`executeOneTool` so an `allow-session` grant covers a *shape*, not a tool.

## 4. `sentinel handoff` — institutionalization — SHIPPED

**FDE mechanic:** #5.

Trajectories in `.sentinel/trajectories/*.jsonl` are currently write-only. That
is exactly the raw material for the FDE's final deliverable: a runbook for the
customer's team.

Generated from a real run: what changed and why, what was tried and rejected
(with the reason), what is still fragile, what to watch after handoff, and the
open questions a human must answer. Extends to `sentinel replay <runId>` to
re-execute a run against a new model — which also becomes the trace→eval loop
the roadmap has been deferring.

Shipped as `src/agent/handoff.js` plus `sentinel handoff`, built on the existing
`replay.js` loaders and the receipts verdicts.

## 5. Stakeholder / ownership map

**FDE mechanic:** #3.

Mine `git log` authorship per directory, cross-reference `CODEOWNERS`, and let
the agent annotate roles. Output `.sentinel/stakeholders.md`, injected as a
prompt section via `prompt.js`. Then extend `teammatePermission` so a teammate
touching a high-blast-radius path needs an explicit grant from the lead naming
the owner.

Cheap first version (git + CODEOWNERS only), high signal, no model calls.

## 6. Best-of-N with a stated verdict

**FDE mechanic:** #4, and already 80% built.

`race.js` is fully implemented and **not wired to any CLI or slash command**.
That is the cheapest win on this list. The FDE framing is what makes it
interesting: an FDE never ships the cleverest fix, they ship the one the
customer can maintain. So `sentinel race "<task>" --check "<cmd>"` should end in
a `verdict.md` that ranks candidates by *what passed and what the team can
maintain*, not by raw success.

## 7. Standing FDE — the persistent loop

**FDE mechanic:** all of them, over time.

Roadmap items #15 (`partial`) and #16 (`deferred`) are exactly this: a presence
that reacts to PRs, issues, and failing checks, with a steering queue to accept
interrupts. Right now FDE work is one-shot per session. This is the item that
would make the FDE framing honest rather than metaphorical — and it is also the
most expensive, which is why it belongs last.

## 8. Engagement budget — SHIPPED

`maxCostUsd` is per-turn. An FDE engagement has a shape: `$X`, `N` hours, stop
when verification passes. Make the budget legible to a non-technical buyer —
`sentinel ask --budget 5.00 --deadline 2h` — with a running burn-down printed
like a project tracker. `cost.js` totals are currently in-memory only, so this
also wants a small persistence fix.

Shipped as `src/agent/budget.js` plus `sentinel budget`, with
`runAgentTurn({ engagement: true })` checking the ceiling and deadline after
every model call.

## 9. Blast-radius gate before any change — SHIPPED

For systems the agent does not own, require a read-back before writing: name
the file and line that justifies the change, and state the rollback. Cheap
version is a pre-flight turn gated on `blast_radius > threshold`; expensive
version is a second model call that must agree with the first. This is the
mechanism that makes "safe" mean something.

Shipped as `src/agent/blast-radius.js`, wired as a PreToolUse gate in
`executeOneTool`. It blocks once per path per turn, then allows the retry.

## 10. Multi-repo workspace

An FDE works across a customer's services, not one directory. `sentinel fde
<workspace>` reads a `.sentinel/workspace.json` manifest of repos, gives one
memory layer scoped to the *customer* rather than the cwd, and makes cross-repo
`grep` a first-class tool. Last, because it needs #1 to be useful first.

---

## Recommended order

| # | Idea | Cost | Depends on | Status |
| --- | --- | --- | --- | --- |
| 6 | Race wiring + verdict | ~1 session | — | done — `sentinel race` already wired |
| 5 | Ownership map | ~1 session | — | **done** (folded into #1) |
| 1 | `onboard` | ~2–3 sessions | — | **shipped** — `src/agent/onboard.js`, `sentinel onboard` |
| 2 | Outcome contract | ~2 sessions | 1 | **shipped** — `src/agent/outcome.js`, `sentinel outcome` |
| 3 | Risk ledger | ~2 sessions | — | **shipped** — `src/agent/risk-ledger.js`, `sentinel risk` |
| 4 | Handoff + replay | ~2 sessions | 1 | **shipped** — `src/agent/handoff.js`, `sentinel handoff` |
| 8 | Engagement budget | ~1 session | — | **shipped** — `src/agent/budget.js`, `sentinel budget` |
| 9 | Blast-radius gate | ~2 sessions | 3 | **shipped** — `src/agent/blast-radius.js` |
| 7 | Standing FDE loop | multi-week | 1, 2, 9 | planned |
| 10 | Multi-repo workspace | multi-week | 1 | planned |

## What handoff actually shipped

`src/agent/handoff.js` reads a trajectory and emits a runbook with five
sections. Dead ends are derived mechanically — any shell shape that failed, any
call repeated three or more times — and unsupported claims come straight from
the receipts verdicts, so "all tests pass" with no passing command is listed
under **claims to distrust** rather than repeated as fact.

Two decisions worth defending:

- **No model.** The model already ran once. Asking it to summarize its own run
  is how confident, unverifiable prose gets into a runbook — the exact failure
  the receipts system exists to catch. Everything here is a pure function of
  the recording, so it is testable without a key and cannot hallucinate.
- **`grep` is not a navigation tool.** The first version excluded `readFile`,
  `listDirectory`, `glob` *and* `grep` from attempt aggregation, on the theory
  that anything that reads is not an attempt. That is wrong: running the same
  search three times is a real dead end and is precisely the pattern worth
  handing on. Only pure navigation is excluded, and non-shell tools now get a
  `tool + primary-arg` signature so `grep foo` and `grep bar` stay distinct.

Verified end to end by recording a real turn through `withTrajectory` and
generating a runbook from it: it correctly reported that *nothing* was verified
and flagged the run's "All tests pass" claim as unsupported.

**Next: #7, the standing FDE loop**, or **#10, multi-repo**. Both are
multi-week and both are honest answers to "what is a forward-deployed engineer,
as opposed to a person running a few commands." #7 is the more valuable of the
two: today FDE work is one-shot per session, and the roadmap's deferred items
(#15 cron, #16 steering queue) are exactly the pieces that would make it a
standing presence rather than a good one-shot. #10 assumes the customer runs
several services, which is the less common case.

## What the blast-radius gate actually shipped

`src/agent/blast-radius.js` classifies a write target as a blast centre —
migrations, CI workflows, lockfiles, schemas, deploy and infra definitions,
auth and billing code, the project's own permission config — and blocks the
first write to it per turn, demanding the file:line that justifies the change
and the exact rollback. Wired into `executeOneTool` as a PreToolUse gate.

One design decision worth defending: **it blocks once, not forever.** A gate
that refuses the same path on every write trains people to disable it, which
costs more safety than the gate bought. This mirrors the Stop hook's
forced-verification pattern already in the codebase — block once, inject the
requirement, let the agent satisfy it.

Two bugs the tests caught:

- **Directory segments were not matched.** The auth/billing pattern required the
  sensitive name to be in the *filename*, so `src/billing/invoice.ts` sailed
  through while `src/auth/session.js` was caught. Missing real billing code is
  the expensive direction to fail in.
- **A test asserted the wrong trade-off.** I originally wrote that
  `lib/auth-utils.js` should *not* be challenged, on the grounds that it is a
  utility rather than the payment gateway. It is challenged, and that is
  correct: the cost of over-asking is one prompt, the cost of a false negative
  is an outage. The test was corrected and the trade-off is now written down
  rather than left implicit.

The onboarding survey's risk areas can be fed into the gate via the optional
`surveyed` set, but that is deliberately **not** wired into the loop:
`analyzeRepo` shells out to git twice, and paying that on every write would be
a performance regression to buy a marginal signal.

## What the engagement budget actually shipped

`src/agent/budget.js` persists a ceiling, a deadline, and a stop condition to
`.sentinel/budget.json`, and appends one line per turn to `.sentinel/spend.jsonl`.
`sentinel budget` shows a burn bar and a line a non-technical buyer can read:
`$12.40 of $25.00 (50%) · 1h 59m left`. `ask`, `goal`, and `outcome` all opt in
via `engagement: true`, so setting a budget once gates every later run.

One boundary bug worth recording, because the direction of the failure matters:
spend was filtered with `ts > startedAt`, so a turn finishing in the same
millisecond the budget was created was silently excluded from the engagement.
Under-counting spend is the wrong direction for a ceiling to fail in, so the
filter is `>=`. The general rule here is the same as the risk ledger's: a
mechanism that fails closed must fail toward *more* caution, never less.

The spend log is append-only JSONL rather than a rewritten JSON document for the
same reason trajectories are — a crash mid-write costs one row, not the file.

## What the risk ledger actually shipped

`src/agent/risk-ledger.js` reduces a command to a shape, grades it green /
yellow / red, and persists approvals to `.sentinel/risk.json` (bounded, LRU).
`executeOneTool` now treats an `allow-session` grant as a grant for the *shape*,
and `sentinel risk` exposes grading, listing, and forgetting.

The one bug worth writing down, because it was the worst available failure:

**The subcommand was being collapsed into an argument.** The first
implementation kept only the first token as the verb, so `git commit -m x` and
`git push` both shaped to `git <word> <word>`. Approving a commit would have
silently authorized a push — the precise outcome the module exists to prevent.
Tools whose second word is the real verb (`git`, `npm`, `docker`, `cargo`, …)
now keep it, and there are named regression tests for it.

Also worth recording: the first two versions of the *tests* asserted behavior
the code had never had — that a read-only command never prompts, and that a
different-but-still-read-only shape re-asks. Both are wrong, and the code was
right. The lead should still see a shell command the first time, and a session
grant already covers `git status --short` once `git status` is approved. The
tests were corrected to match, not the code bent to match the tests.

**Next: #4, handoff and replay.** `.sentinel/trajectories/*.jsonl` is currently
write-only. That is exactly the raw material for the FDE's final deliverable: a
runbook for the customer's team — what changed, what was tried and rejected, what
is still fragile, what to watch. `sentinel replay` now exists, so this is
`trajectory → runbook` on top of a working replay.

## What `outcome` actually shipped

`src/agent/outcome.js` holds the six contract fields, their validation, the
`parseContract` brace-walker (a non-greedy regex truncates the payload when a
string value contains `{`), the interview loop, and the worker brief.
`goal.js` gained a third verdict and a contract-aware evaluator prompt;
`runAgentTurn({ outcome })` briefs the worker from the contract and passes a
flat brief to the judge. Persisted to `.sentinel/outcome.json`.

Two design bugs the tests caught, both worth recording:

1. **The `unknown` verdict was not terminal.** It was routed into the ordinary
   "not met, keep going" branch, so an unjudgeable contract burned all eight
   goal checks on identical work. It now ends the turn and names the field that
   cannot be judged. An unjudgeable condition cannot be made judgeable by
   trying harder.
2. **A walk-away requester recorded a question nobody answered.** The interview
   pushed `{question, answer}` before checking for a null answer, so the
   transcript claimed an exchange that never happened — and that transcript is
   what the model is re-prompted with.

Adding the `unknown` field to `parseVerdict`'s return also broke two existing
`deepEqual` assertions on the whole verdict object. That surface change is
correct, so those tests were updated rather than the field dropped.

## What `onboard` actually shipped

`src/agent/onboard.js` (read-only, deterministic, no model or API key) plus
`sentinel onboard` in the CLI. `analyzeRepo()` returns entry points, CI
workflows and triggers, test topology, churn hotspots, ownership, risk areas,
and the commands the repo advertises. `renderOnboarding()`, `memoryBody()` and
`suggestTodos()` render that for humans, for `--remember`, and for `--todos`.

Four defects the survey found in Sentinel itself while being built, which is
the best evidence the concept works:

1. **Windows path separators.** The filesystem walk produced `src\a.js` and git
   produced `src/a.js`, so every test-proximity comparison failed silently and
   the survey reported zero untested hot files on its own repo. Now everything
   is normalized to POSIX before comparison.
2. **Lockfiles dominated churn.** `package-lock.json` outranked every source
   file, burying the real hotspots. Generated files are now tallied separately
   and reported as a share of churn.
3. **`__tests__/` counted as coverage-by-sibling, not coverage-by-directory.**
   With all tests in a root `__tests__/`, every source directory looked untested
   — the opposite of the truth. Coverage is now reported as `shared`,
   `per-directory`, or `none`.
4. **One human, two git identities.** `KunjShah95` and `KUNJ SHAH` counted as
   two contributors, overstating the bus factor. Identity keys now normalize
   separators, case, and a trailing numeric suffix.

The survey's own findings on Sentinel: bus factor of 1 across all 12 mapped
areas, 13 hot source files with no test covering them, 47% of measured churn in
generated files, and five heavily-churned files that no longer exist.

**Next: #3, the risk ledger.** `bash-validation.js` already computes
`readOnly` and `destructive`, but the loop only acts on `destructive` — the
`readOnly` half is computed and discarded. Gating on *novelty* against a
persisted per-repo command ledger encodes the FDE instinct that the first hour
is deliberately small and green, without hardcoding it.

