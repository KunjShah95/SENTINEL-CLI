# PR Owl

An autonomous AI code reviewer that lives on your pull requests.

PR Owl is a GitHub App. It receives a `pull_request` event, checks out the
branch, asks an agent to read the change **with its own tools**, and posts
inline comments on the specific lines it objects to.

It is built on [Sentinel](../), which is the point — and the dependency runs one
way. **The review logic is Sentinel's; this app is the transport.** The queue
that coalesces heads, the policy that decides whether a change is worth a model
call, and the trust rules that classify an origin all live in `src/agent/`:

```
src/agent/review-queue.js    coalescing queue + key helpers
src/agent/review-policy.js   "should this be reviewed, and under what authority"
src/agent/review-trust.js    trusted vs untrusted origin
src/agent/review.js          runReview, finding validation, the brief
```

`lib/queue.ts` and `lib/policy.ts` here are re-export shims. A reviewer is
concurrent work, and none of those files know what GitHub is — which is why they
are in the library and this directory is not.

What stays here is the half that genuinely needs GitHub: `github.ts` (REST),
`checkout.ts` (git), `webhook.ts` (signature headers), and `owl.ts` as the
composition root.

Underneath all of it is Sentinel's task primitive, so the reviewer needs no
status store, no permission policy and no cancellation of its own. It is one
`createTask` call:

```js
const { id } = createTask({
  kind: 'agent',
  owner: 'pr-owl',
  permission: readOnly ? 'readonly' : 'teammate',
  mode: 'REVIEW',
  cwd: repoDir,
  run: async ({ signal, permission }) => { /* run the agent */ },
});
```

The permission rung is the security model, and it is the same rung a subagent
gets. A pull request from a fork has an attacker-controlled head commit, so it is
reviewed `readonly`; a pull request from your own branch gets `teammate`. That
decision is one line, and it is enforced by the same code that stops any other
task from writing files.

---

## What it does

1. GitHub delivers a `pull_request` webhook.
2. The signature is verified against the **raw request bytes**.
3. Policy decides whether this PR is worth a model call at all.
4. The queue decides when. Ten branches rebased after a rename produce one review
   of the newest head, not ten reviews of ten intermediate heads.
5. The repository is cloned (once, then cached) and the PR's head checked out.
6. An agent task runs in `REVIEW` mode with the changed files as its working tree.
7. Findings are validated against the diff, then posted as one GitHub review.

## Why it clones instead of applying the patch

Because the agent is better with a repository than with a diff.

A patch gives the model the changed lines and nothing else. From there it cannot
grep for the callers of the function it is reviewing, cannot read the module that
imports it, and cannot tell whether a line it is commenting on is dead code. A
checkout hands it the whole repository and the diff is just the working tree.

The cost is a clone, which is bounded by caching one clone per repository and
fetching into it.

## Why inline comments are the hard part

GitHub's review API does not accept "this line looks wrong". It accepts a path,
a line number and a side, and it rejects the **entire review** with a 422 if a
single position does not land inside the diff's hunks. One hallucinated line
number takes the three real findings down with it.

So the diff has to become structured data — see `lib/diff.ts`, which re-exports
Sentinel's parser from `src/agent/review-diff.js`. Four things are easy to
conflate and all four are covered by tests:

| | right line | left line |
| --- | --- | --- |
| context | yes | yes |
| added | yes | — |
| removed | — | yes |
| `\ No newline at end of file` | **neither** — it is a directive, not a line | |

Counting that marker as a line shifts every subsequent comment by one and
produces a review that GitHub accepts and that is subtly wrong.

## Configuration

| Variable | Required | Default | |
| --- | --- | --- | --- |
| `PR_OWL_APP_ID` | yes | — | GitHub App id |
| `PR_OWL_PRIVATE_KEY` | yes | — | PEM; literal `\n` is fine |
| `PR_OWL_WEBHOOK_SECRET` | yes | — | the webhook's secret |
| `PR_OWL_INSTALLATION_ID` | no | `0` | fetched on first run if unset |
| `PR_OWL_CACHE_DIR` | no | `$TMPDIR/pr-owl-repos` | one clone per repo |
| `PR_OWL_CONCURRENCY` | no | `2` | simultaneous reviews |
| `PR_OWL_MAX_QUEUED` | no | `50` | waiting jobs |
| `PR_OWL_JOB_TIMEOUT_MS` | no | `480000` | a hung review is abandoned |
| `PR_OWL_MODEL` | no | Sentinel's default | any model in the registry |

The model is whatever Sentinel supports, including a local one — an Ollama model
means the code never leaves the machine, which is the only configuration in which
an autonomous reviewer is uncontroversial on a private repository.

## Running it

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 93 tests, no network, no credentials
```

Tunnel the port, add the webhook URL to your GitHub App, and set the secret.

```bash
ngrok http 3000
```

Subscribe to `pull_request` for `opened`, `synchronize` and `reopened`. Not
`edited`: a description typo should not cost a model call.

## What it will not do

These are decisions, not omissions.

**It does not run fork code.** A fork PR is reviewed `readonly`, and by default
it is skipped entirely. Read-only means read-only: the rung denies every shell
command that is not a read.

**It does not block on one critical finding.** Two are required. A single
critical finding is often a false positive on a subtle change, and a bot that
blocks a PR on a false positive loses a team's trust permanently — which costs
far more than the bug it prevented.

**It does not ask the model to be thorough.** That instruction reliably produces
noise. The brief asks for findings it can point at — file, line, reason — and
accepts that some will be missed.

**It does not post a review it could not place.** Unplaceable findings are
dropped, counted, and reported on the check run. Silently discarding them would
hide a parsing bug.

**It does not survive a restart.** The queue is in memory. A deploy loses
queued reviews; two instances do not share a queue. Both are acceptable for a
reviewer — a missed review is re-requested by a human, a duplicated one is a bug
someone notices. `lib/storage.ts` is where a durable queue goes.

## Layout

```
lib/
  webhook.ts   signature verification, event filtering
  policy.ts    should this PR be reviewed at all
  queue.ts     bounded concurrency, head coalescing
  checkout.ts  clone once, fetch after that
  github.ts    five REST calls, no SDK
  diff.ts      unified diff -> commentable line positions
  review.ts    the task, and the last gate before posting
  owl.ts       the composition root — the only file with real credentials
app/api/
  webhooks/route.ts   verify, then enqueue, then 202
  reviews/route.ts    what the reviews are doing
```

`owl.ts` is the composition root and it is one module on purpose. A DI container
for an app this size is a layer of indirection you have to understand before
changing anything, and module-level singletons that construct themselves on
import hide the ordering constraints that actually bite.

## Tests

```
npm test        # 124 tests
```

No network and no credentials. The interesting ones:

- `webhook.test.ts` — verifying a re-serialised body, comparing a digest with
  `===`, and the `for` loop over all actions that reviews a PR every time someone
  fixes a typo.
- `diff.test.ts` — the four line kinds above.
- `queue.test.ts` — a push that lands mid-review. It must be reviewed *after*,
  not dropped: GitHub does not redeliver, so dropping it means never reviewed,
  silently.
- `integration.test.ts` — that a review is a task, and that a fork gets
  `readonly`.

## Licence

MIT, same as Sentinel.
