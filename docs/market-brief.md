# Market brief and decision

Written after the refactor, as a principal engineer would: look at where the
category is going before deciding what to build next.

**Status: read this before building §5.** The brief recommends against building
`capgrant`-style capability grants, which is a large part of what Sentinel's
permission ladder looks like from the outside. That recommendation stands and the
reasoning is in §4 and §5. The immediate engineering work is in §6 and is
independent of the strategy.

**Sources and their reliability.** Claims below come from web search on
2026-10-05. Star counts and benchmark numbers are as-of dates quoted by
third-party blogs, not measured here. The Reddit threads are quoted from search
snippets, not read in full. The arXiv paper is cited by title and abstract only.
Treat every number as indicative and re-verify before acting on it.

---

## 1. Where the category actually is

Open-source terminal agents, by attention (Sept 2026, per StackPicks via
GitHub API):

| Agent | Stars | Licence | Last push |
| --- | --- | --- | --- |
| OpenCode (`anomalyco/opencode`) | ~208k | MIT | daily |
| Claude Code | ~140k | proprietary | daily |
| Gemini CLI / Antigravity | ~106k | Apache-2.0 | Google sunset the free tier Jun 18 2026 |
| Codex CLI | ~104–125k | Apache-2.0 | daily |
| Cline | ~65k | Apache-2.0 | active |
| Aider | ~48k | Apache-2.0 | last push May 2026 |
| Kilo Code, Zed, Goose, OpenHands, Pi | smaller | mixed | mixed |

Two structural facts worth naming:

- **The leader is OpenCode, which is MIT, ships daily, and supports 75+
  providers.** Competing with it on breadth is not a plan.
- **The whole category churned inside six months.** Roo Code shut down May 2026,
  Continue joined Cursor and went read-only, Gemini CLI's free tier ended.
  Aider's last push was May. Governance and funding changes, not just releases.

The benchmark ceiling is not a differentiator either: GPT-5.6 Sol scores 89.5%
and Claude Opus 5 scores 89.1% on Terminal-Bench 2.1 — half a point apart. One
source makes the point that actually matters:

> Same model, different harness: 16 percentage points (77% → 93%).
> If results feel inconsistent, the harness is the first place to look.

## 2. What developers are actually complaining about

The loudest, most consistent thread across r/AI_Agents, r/ClaudeAI and
r/ClaudeCode is **permission fatigue**, and it is not a complaint about safety:

> "Every meaningful step came with a permission prompt. Somewhere around the
> twentieth one I stopped reading them… That isn't oversight, it's just clicking."

> "I literally have to babysit it like a hawk waiting for the inevitable
> disruption."

> "I can't ask 'what does this actually touch?' or 'what breaks if I pick the
> other option?' before I commit. So I approve blind."

Three specific mechanisms are named repeatedly:

1. **Prefix matching doesn't generalise.** `git status` allowed, then
   `git status -s` prompts again. Heredocs and `cd x && …` compound commands
   re-prompt despite `git` being allowed.
2. **The prompt has no context.** You are asked to approve a command without
   the plan it belongs to, so there is nothing to judge.
3. **Approvals don't carry.** Approving one shape does not generalise to the
   next session.

And the failure mode with several agents running is not compute — it is the human:

> "If you run a few coding agents at the same time, the limit is not compute,
> its you."

The top-voted proposed fix in that thread is the interesting one:

> "A better unit of consent is a capability envelope: approve the plan plus
> allowed repo paths."

## 3. Everyone else is an orchestrator

Product Hunt 2026 launches in this space are overwhelmingly **wrappers around
agents that already exist**: cmux (Ghostty-based terminal, #14), Parallel Code
(ten agents, ten worktrees), 1Code (YC, Claude Code SDK), Projekt, Shepherd,
Codentis, HAR, VEXI. They compete on panes, phone monitoring, diff review and
session persistence.

Two of them compete *with* each other on exactly the pain above, and that
competition is the tell: Shepherd's founder, asked about cross-pane content,
wrote:

> "I don't consider model judgment alone a sufficient security boundary.
> Cross-pane content should still be treated as untrusted data, and I'm
> exploring stronger safeguards such as read-only defaults, **provenance
> labels**, per-pane permissions, and confirmation before acting."

That is a guardrail vendor admitting they do not have provenance labelling yet.

## 4. The space that is *already* crowded — and should be avoided

"Capability envelopes" are being actively standardised. I went looking for the
obvious move and found it is contested:

- **IETF draft AIDP** (`draft-vandoulas-aidp-03`) — intent envelopes, capability
  constraints, approval gates, delegation lifecycle states.
- **capgrant** (npm) — scoped expiring grants, append-only JSONL registry,
  delegation that can only narrow, an `audit` command that scores scope.
- **contenox**, **entanglement**, **PraisonAI**, **Aura** — all ship durable
  agent-scoped approval grants. One ADR is titled "Approval scope and persisted
  grants" and is essentially our design, written down well.

So **"we have permission modes and durable grants" is not a differentiator.**
Anyone shipping an agent in 2026 has one. Entering there means competing with an
IETF draft on its home turf.

## 5. The lead worth taking

Searching for the fix surfaced a paper I had not expected:

**"Approval Laundering: Systematizing Approval–Execution Binding Failures in
AI-Coding-Agent Harnesses"** (arXiv 2609.38983, 30 Sept 2026).

Its claim is that harnesses rest their entire security boundary on an assumption
nobody checked: **that the action a human approved (`A`) is the action the
harness executes (`A′`)**. They instrument Claude Code's `PreToolUse` hook and
measure a "Bound-Gap Rate" over six failure classes — **Scope, Argument,
Temporal, Tool, Delegation, Semantic** — with 19–2020 runs each.

The two findings that matter for a decision:

1. **This is not a model problem.** It is the harness's own enforcement
   substituting a broader, later or differently-scoped action for the approved
   one, *without asking again*.
2. **The proposed defence fails, and the paper says so.** Their Approval Token
   eliminates Delegation laundering, but leaves **Scope laundering entirely
   unaffected** and shows **no significant reduction in Argument laundering**
   (`p=1`). Their explanation: those two classes "leave every recorded dispatch
   field unchanged and diverge only in downstream effect, one process level
   below what a field-only verifier can observe."

They report that as a structural finding rather than papering over it. That is a
rare and useful kind of result.

### Why this is open, and why Sentinel is positioned for it

Nobody has productised it. Prevention at the tool-call boundary **structurally
cannot** fix Scope or Argument classes, because the divergence happens below it.
What can address them is **after the fact**: an auditor that replays what was
granted against what was executed.

Sentinel happens to already hold three of the four inputs that audit needs, and
holds them because they were built for a different reason:

| Audit needs | Sentinel has | Built for |
| --- | --- | --- |
| Authority as a **named value**, not a closure | `PERMISSIONS` ladder — inspectable, comparable, printable | stopping a subagent editing files |
| Child authority **clamped to parent** | `resolvePermission()` — a task may never hold a rung above its parent's | stopping delegation escalation |
| **Command shapes**, not raw commands | risk ledger records `commandShape()` | grading repeat commands |
| Per-call decisions recorded | receipts + trajectory JSONL | auditing claims |

That last column is the point: **none of this was built to pass an audit.** It
was built because seven mechanisms each needed their own permission policy and
the duplication was a bug risk. The refactor that removed the duplication
produced, incidentally, the substrate an auditor needs.

The Delegation class — a subagent holding authority the approver never granted
— is defended *structurally* by the parent clamp. That is precisely what the
paper says a keyed capability token is for.

### The decision

**Do not compete on breadth, model support, or permission UX.** Those are
OpenCode's, an IETF working group's, and six Product Hunt launches'.

**Build `sentinel audit`: replay a recorded run and report bound-gaps** — every
tool call whose actual scope, arguments, timing or authority differs from what
was approved. Report them. Do not try to prevent them; the paper is explicit that
you cannot, at that layer.

**Status: built.** `src/agent/audit-trail.js` + `src/agent/audit.js`,
`sentinel audit`, 30 tests. See §8 for what it found, including two bugs it
surfaced in itself.

Three reasons this is the right call rather than a clever one:

1. **It is grounded in code that already exists and is tested.** The ladder, the
   clamp and the ledger all have tests. This is a read-only reporting tool over
   existing artefacts.
2. **The credibility comes from the finding, not the tool.** Publishing the
   taxonomy and a reference auditor is worth more than shipping a feature, and
   the category demonstrably rewards that: the projects that got stars shipped
   something auditable, not something better-polished.
3. **It is the honest position given the repo's size.** Sentinel is not going to
   out-ship a 208k-star daily release. It can be the reference implementation of
   a vulnerability class that is documented, recent, and unowned.

### What I would not do

- **Do not rebrand the permission ladder as the feature.** It is good and it is
  not novel; every competitor has one and one of them has an IETF draft.
- **Do not chase Terminal-Bench.** The models decide that number, and the leader
  is half a point ahead on the default model.
- **Do not add another wrapper.** cmux, Parallel Code, 1Code and Projekt already
  compete on panes and phone notifications, and none of them is losing for lack
  of a fourth pane manager.
- **Do not add a vector database to PR Owl** to match a series description I
  wrote earlier. The clone-and-read-the-repo approach is what makes the reviewer
  work; a retriever is a worse version of the same idea.

## 6. Immediate engineering, independent of the strategy

Two things on this list are worth doing whatever the market does:

1. ~~**`sentinel review` needs a `sentinel audit` sibling.**~~ Done — see §8.
2. **The flaky `mcp-server` test needs a readiness signal**, not a longer
   timeout. It spawns a real server and waits on a wall clock. Still open.

## 7. What would change this decision

- If **capgrant or the AIDP draft** ships an audit command, the differentiator is
  gone and this becomes "contribute upstream" instead of "build it".
- If **OpenCode adopts provenance labelling** (Shepherd named it as a goal),
  the gap closes from the other direction.
- If the **Bound-Gap Rate turns out not to reproduce** against a second harness,
  the premise is weaker and this is a much smaller project.

## 8. `sentinel audit` — built, and what it cost

Two files: `src/agent/audit-trail.js` (writes) and `src/agent/audit.js` (reads).
`sentinel audit [runId]` audits the most recent run; `--last N`, `--list`,
`--json`. Exit 2 on a finding, 0 on a clean run, 1 on no trail. No model, no
network, no credentials — it is a reader over recorded JSONL.

### The thing that had to be built first

§5 listed four inputs the audit needs. Three were genuinely there. The fourth
was not, and its absence is worth stating plainly:

    { ts, toolName, ok }        // hooks.js — what shipped

That answers "did it run", not "was this approved". An auditor given only that
cannot compute a single bound-gap, because `A` is never recorded — so the brief's
first instinct, "audit over existing artefacts", was half right. The artefacts
existed; the *binding* did not.

So the loop now writes both halves, paired by tool call id:

    { stage: 'grant',    tool, input, shape, intent, workdir, decision, rung }
    { stage: 'dispatch', tool, input, shape, intent, workdir, ok }

`shape` and `intent` come from `risk-ledger.js` and `bash-validation.js` — the
§5 claim that "the ledger records `commandShape()`" was correct, and it is the
reason this was days not weeks. Reusing those two functions rather than writing a
third command-analysis pass is the difference between an auditor that agrees with
the enforcement it audits and one that disagrees with it in ways nobody notices.

### Six classes, and the two it refuses to claim

| Class | Detected from | Verdict |
| --- | --- | --- |
| Scope | workdir, intent escalation, destructive-under-non-destructive, extra paths | reported |
| Argument | same shape, different input | reported |
| Temporal | gap > 30s, plus the writes that landed between | reported |
| Tool | granted name vs dispatched name | reported |
| Delegation | child rung > parent rung, parent link resolved at record time | reported |
| **Semantic** | — | **not assessable, and says so** |

Semantic is the class the paper singles out: those divergences leave every
recorded dispatch field unchanged and appear only downstream. `renderAudit`
prints `not assessable from recorded fields: Semantic` on every report. It is in
the taxonomy with a zero count, which is the honest representation — the
alternative is a report that implies coverage it does not have, from a tool whose
entire premise is that unverified coverage is the bug.

### One finding per call, not six

Each detector chain returns on first match, so a substituted `readFile` → `rm -rf /`
reports one Tool gap rather than also reporting the Scope, Argument and Temporal
consequences of the same substitution. The paper measures a Bound-Gap *Rate*, and
a rate is only comparable across harnesses if one divergence counts once.

### Three bugs this found, all of them real

1. **`spawnSubagentTask` could not have worked.** Adding a record inside the
   task body referenced the outer `const { id } = createTask(...)`. `createTask`
   starts the body *synchronously*, so this read `id` in its temporal dead zone —
   `Cannot access 'id' before initialization`, on every subagent spawn. It had
   been latent because nothing referenced `id` there before. Only the end-to-end
   test that actually spawns one surfaced it.
2. **The audit caught itself.** `append()` created `.sentinel/` and appended into
   `.sentinel/audit/`, which did not exist — so every write hit `ENOENT` inside a
   `try/catch` that swallows errors. The tool recorded nothing and reported a
   clean run. The catch that makes the audit safe was the same catch hiding the
   audit being broken. Found by running it, not by testing it.
3. **A subagent's calls were unattributed.** `executeOneTool` reads
   `opts.parentTaskId` to attribute a record, and the subagent's turn never
   received it — so every subagent call recorded `taskId: null` and the
   Delegation class had no parent to compare against. Threaded through
   `runAgentTurnInner` now.

### What is honest about the numbers so far

Bound-Gap Rate is only meaningful across comparable runs, and there are none yet.
The one recurring non-zero result is a *design* fact, not a defect: the unified
`task` tool is granted as `task` and dispatches `teamStatus`/`bgRun`/`teamMerge`.
That is a real Tool-class divergence under a field-only reading, and the auditor
reports it every time. Whether it is a *finding* depends on a question the audit
log cannot answer — was the approver shown the translation? Two answers, opposite
verdicts:

- **Shown** (an approval dialog naming the resolved action): the grant record
  should carry the resolved name, and the Tool class goes quiet.
- **Not shown**: every `task` call is a genuine finding and the rate is high by
  construction.

The auditor is written so either resolution is a one-line change to what the
grant record contains. It has deliberately not been resolved here, because
choosing is a design decision about approval UX and it should not be settled
inside a diff that also adds the mechanism.

### Verification

    npm run release:check
      lint          clean
      typecheck     clean
      check:imports clean (119 files)
      unit          709 pass, 0 fail   (49 new: 20 queue, 29 policy)
      tui            53 pass, 0 fail
      jest           16 pass, 0 fail
      pr-owl         93 pass, 0 fail   (queue + policy moved into src/agent/)
    npm run bench   15/15

Manual: `sentinel audit --list`, `sentinel audit <runId>`, and a missing run id
(exit 1, `No audit trail for: …`) all behave as documented.
