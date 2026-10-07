import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-post-the-review",
  title: "Posting the review, and choosing when to block a merge",
  metaTitle: "PR Owl Part 10: Posting the Review",
  description:
    "Submitting the review to GitHub, computing COMMENT versus REQUEST_CHANGES yourself rather than letting the model decide, and reporting dropped findings on a check run.",
  date: "2026-10-07",
  readingMinutes: 9,
  tags: ["Tutorial", "GitHub", "API", "Code Review"],
  keyword: "github pull request review api request changes",
  series: { slug: "pr-owl-course", order: 10 },
  related: ["pr-owl-diff-parser", "pr-owl-review-failure-modes", "pr-owl-review-policy"],
  faq: [
    {
      q: "Why does the reviewer never approve a pull request?",
      a: "Because approval is a claim that a human should make. An auto-approve means a merge button becomes green without a person having read anything, which converts a suggestion into a control. PR Owl can comment on any number of lines and can block a merge when it is confident; it never says a change is fine.",
    },
    {
      q: "Why is the blocking threshold two critical findings rather than one?",
      a: "Empirically, because a single critical finding is often a false positive on a subtle change. A bot that blocks a pull request on a false positive does lasting damage: the team learns to click through it, and then it blocks a real one too. Two independent criticals are much harder to explain away. It is a tunable and `CRITICALS_TO_BLOCK` is one constant.",
    },
    {
      q: "What does the check run actually add?",
      a: "A visible, per-commit record that a review happened and what it concluded — including findings that were dropped as unplaceable. Without it, a review that crashed mid-way is indistinguishable from a review that found nothing, and a skipped pull request is indistinguishable from one nobody pushed.",
    },
    {
      q: "How do I test the posting code?",
      a: "You do not test the HTTP call, you test everything either side of it: which findings survive validation, what the review body says, and which event is chosen for a given set of findings. Those are pure functions with 27 tests and no network. The `fetch` itself is five lines whose failure mode is an exception you already handle.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          The severity-to-event decision is{" "}
          <strong>computed in your code, not asked of the model</strong>. A model that
          chooses its own strength eventually picks the strong one.
        </p>
        <p>
          Two critical findings are required to block a merge, never one — and the reviewer
          never approves, because approval should be a human&rsquo;s claim.
        </p>
      </KeyTakeaways>

      <H2 id="five" text="Five API calls, no SDK" />
      <p>
        The GitHub surface is small, and keeping it small is what makes the app auditable.
      </p>
      <CodeBlock
        label="pr-owl/lib/github.ts"
        code={`export function getFiles(repo, prNumber, token) {
  return gh(\`/repos/\${repo}/pulls/\${prNumber}/files?per_page=100\`, token);
}

export function createReview(repo, prNumber, input, token) {
  return gh(\`/repos/\${repo}/pulls/\${prNumber}/reviews\`, token, {
    method: 'POST', body: JSON.stringify(input),
  });
}

export function createCheckRun(repo, input, token) {
  return gh(\`/repos/\${repo}/check-runs\`, token, {
    method: 'POST', body: JSON.stringify({ ...input, status: 'in_progress' }),
  });
}

export function updateCheckRun(repo, checkId, input, token) {
  return gh(\`/repos/\${repo}/check-runs/\${checkId}\`, token, {
    method: 'PATCH', body: JSON.stringify(input),
  });
}`}
      />
      <p>
        Every call carries an explicit timeout. A reviewer that hangs is
        indistinguishable from one that crashed, and both hold a queue worker — so{" "}
        <code className="font-mono text-[13px]">AbortSignal.timeout</code> is on the
        default rather than optional.
      </p>
      <Callout title="Why no Octokit">
        <p>
          An SDK for the REST API is a dependency that has to be kept current, and its value
          here is typing a response shape that is one{" "}
          <code className="font-mono text-[13px]">fetch</code> and a type alias away. The
          cost is real: this is an app that reads code strangers wrote, and every
          dependency is a supply-chain question someone has to answer.
        </p>
      </Callout>

      <H2 id="token" text="Installation tokens, and why they are cached" />
      <CodeBlock
        label="pr-owl/lib/github.ts"
        code={`export async function installationToken(opts): Promise<string> {
  const now = opts.now ?? Date.now;
  if (cached && cached.expiresAt > now()) return cached.token;

  const jwt = await signAppJwt(opts.appId, opts.privateKey, now);
  const res = await fetch(
    \`https://api.github.com/app/installations/\${opts.installationId}/access_tokens\`,
    { method: 'POST', headers: { authorization: \`Bearer \${jwt}\`, /* ... */ },
      signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(\`mint token: \${res.status}\`);

  const body = await res.json();
  // Cache for most of its life, not all of it.
  cached = { token: body.token, expiresAt: new Date(body.expires_at).getTime() - 60_000 };
  return cached.token;
}`}
      />
      <p>
        Minting one per request would be a rate-limit bug waiting to happen: GitHub limits
        the number of{" "}
        <em>tokens</em> you mint as well as the number of calls you make, and the token
        limit is the one that produces a 403 nobody can explain. The 60-second margin is
        for clock skew between the runner and GitHub.
      </p>
      <p>
        The JWT itself is RS256-signed with{" "}
        <code className="font-mono text-[13px]">iat</code> backdated 60 seconds, which is
        also clock skew. WebCrypto needs bare DER rather than PEM armour, which is why
        there is a{" "}
        <code className="font-mono text-[13px]">pemToDer</code> helper in the same file.
      </p>

      <H2 id="event" text="The event, decided by you" />
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`const CRITICALS_TO_BLOCK = 2;

const postable = outcome.findings.filter((f) =>
  isCommentable(files.find((x) => x.path === f.path)!, f.line, f.side));
const criticals = postable.filter((f) => f.severity === 'critical').length;

await createReview(job.repo, job.prNumber, {
  commitId: job.headSha,
  body: summarise(outcome.summary, postable),
  event: criticals >= CRITICALS_TO_BLOCK ? 'REQUEST_CHANGES' : 'COMMENT',
  comments: postable.map((f) => ({
    path: f.path, line: f.line, side: f.side, body: inlineBody(f),
  })),
}, token);`}
      />
      <p>
        The model is asked for a severity per finding. It is not asked what the review
        should <em>do</em>. That separation is the whole point:{" "}
        <strong>the model judges, you decide the consequence</strong>. A model that could
        approve a pull request would eventually approve one.
      </p>
      <CompareTable
        caption="The three review events, and which PR Owl ever sends"
        head={["Event", "Effect on the merge button", "PR Owl"]}
        rows={[
          ["COMMENT", "none — just comments", "the default"],
          ["REQUEST_CHANGES", "blocked until resolved", "two or more criticals"],
          ["APPROVE", "mergeable", "never, by design"],
        ]}
      />
      <p>
        Never approving is a position, and it is the one I would defend. Approval turns a
        suggestion into a control: the merge button goes green, so someone merges, and
        nobody has read anything. PR Owl is a second pair of eyes. It can say something is
        wrong and it can block a merge it is confident about; it does not get to say a
        change is fine.
      </p>
      <Callout title="Why two criticals and not one">
        <p>
          Because a single critical finding on a subtle change is frequently a false
          positive, and the damage from a bot that blocks a pull request on a false positive
          is not recoverable by being right next time. The team learns to dismiss it, and
          then it dismisses a real one. Two independent criticals are much harder to argue
          with, and the threshold is one constant if your repository disagrees.
        </p>
      </Callout>

      <H2 id="body" text="The review body" />
      <p>
        The most common way a generated reviewer looks broken is posting its own JSON as the
        review body. The model was asked for a structured payload, so the payload is what
        comes back, and if you post the response verbatim the review reads:
      </p>
      <CodeBlock
        label="what a review looks like when this is not handled"
        code={`## PR Owl
No defects found.
{"findings":[{"path":"src/app.js","line":42,"message":"this can be null"}]}`}
      />
      <p>
        The fix is to cut the payload out with the{" "}
        <em>same scanner that parsed it</em>, which was the second real bug in this code.
        The first version stripped it with a separate regex,{" "}
        <code className="font-mono text-[13px]">/\[[\s\S]*?&quot;findings&quot;[\s\S]*?\]/</code>,
        which assumed the object form. A bare-array payload{" "}
        <code className="font-mono text-[13px]">{'[{"path": …}]'}</code> has no{" "}
        <code className="font-mono text-[13px]">"findings"</code> key, so the pattern did not
        match and the JSON was posted verbatim. Two scanners written separately is how a
        payload ends up removed by one and not the other.
      </p>

      <H2 id="check" text="The check run" />
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`if (check) {
  await updateCheckRun(job.repo, check.id, {
    status: 'completed',
    conclusion: criticals >= CRITICALS_TO_BLOCK ? 'failure'
               : postable.length ? 'neutral' : 'success',
    output: {
      title: \`\${postable.length} finding(s), \${criticals} critical\`,
      summary: \`PR Owl reviewed \${job.headSha.slice(0, 7)}.
                 \${outcome.dropped.length} finding(s) dropped as unplaceable.\`,
    },
  }, token);
}`}
      />
      <p>
        Three conclusions, and the middle one is the interesting choice: a review that ran
        and found things is{" "}
        <code className="font-mono text-[13px]">neutral</code>, not{" "}
        <code className="font-mono text-[13px]">failure</code>. Required status checks that
        fail on any finding make contributors route around the tool rather than read it.
      </p>
      <p>
        The dropped count goes in the summary on purpose. If the parser starts rejecting
        valid positions — the kind of bug from part 9 that produces no visible failure — the
        check run is where it shows up, and that is the difference between noticing in a day
        and noticing in a quarter.
      </p>

      <H2 id="order" text="The order in the job" />
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`  const ghFiles = await getFiles(job.repo, job.prNumber, token);
  const files = parsePatches(ghFiles.map((f) => f.patch));
  const additions = ghFiles.reduce((n, f) => n + (f.additions ?? 0), 0);

  // Policy runs BEFORE the clone: a PR we will not review must not cost a
  // checkout. Cheapest-first, and the checks in part 4 are pure.
  const decision = decide(request, config.policy);
  if (!decision.review) {
    config.log('skipped', { repo: job.repo, pr: job.prNumber, reason: decision.reason });
    return { summary: \`skipped: \${decision.reason}\` };
  }

  const check = await createCheckRun(job.repo, { name: 'PR Owl', head_sha: job.headSha }, token)
    .catch(() => null);   // a missing check must not lose the review

  try {
    const { dir } = await checkoutPr(/* ... */);
    const outcome = await reviewPullRequest(job, { /* ... */ });
    // ...
  } catch (e) {
    if (check) await updateCheckRun(/* ... */, { conclusion: 'neutral' }, token).catch(() => {});
    throw e;
  }`}
      />
      <p>
        Four decisions in that sequence. Policy before clone, because a rejected pull
        request should not cost a checkout. The check run wrapped in{" "}
        <code className="font-mono text-[13px]">.catch(() =&gt; null)</code> because a
        review without a check run is far more useful than no review at all — the check is
        observability, and observability is never control flow. The failure path completes
        the check rather than leaving it stuck{" "}
        <code className="font-mono text-[13px]">in_progress</code> forever. And the failure
        is rethrown so the queue records it as{" "}
        <code className="font-mono text-[13px]">failed</code> rather than{" "}
        <code className="font-mono text-[13px]">done</code> with an empty summary — which
        would be indistinguishable from a clean review.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why does the reviewer never approve a pull request?",
            a: "Because approval is a claim that a human should make. An auto-approve means a merge button becomes green without a person having read anything, which converts a suggestion into a control. PR Owl can comment on any number of lines and can block a merge when it is confident; it never says a change is fine.",
          },
          {
            q: "Why is the blocking threshold two critical findings rather than one?",
            a: "Empirically, because a single critical finding is often a false positive on a subtle change. A bot that blocks a pull request on a false positive does lasting damage: the team learns to click through it, and then it blocks a real one too. Two independent criticals are much harder to explain away. It is a tunable and `CRITICALS_TO_BLOCK` is one constant.",
          },
          {
            q: "What does the check run actually add?",
            a: "A visible, per-commit record that a review happened and what it concluded — including findings that were dropped as unplaceable. Without it, a review that crashed mid-way is indistinguishable from a review that found nothing, and a skipped pull request is indistinguishable from one nobody pushed.",
          },
          {
            q: "How do I test the posting code?",
            a: "You do not test the HTTP call, you test everything either side of it: which findings survive validation, what the review body says, and which event is chosen for a given set of findings. Those are pure functions with 27 tests and no network. The `fetch` itself is five lines whose failure mode is an exception you already handle.",
          },
        ]}
      />

      <Cta
        title="Next: how it gets uninstalled"
        body="Part 11 is the list of failure modes that matter — the ones that produce no error, no log line, and a reviewer that quietly stopped working."
        href="/blog/pr-owl-review-failure-modes"
        cta="Start part 11"
      />

      <p className="text-sm text-muted">
        The &ldquo;observability is never control flow&rdquo; pattern is the same one used in{" "}
        <Link href="/blog/cli-doctor-preflight-checks" className="text-moss underline-offset-4 hover:underline">
          the doctor pre-flight
        </Link>
        , and the check-run reasoning continues in{" "}
        <Link href="/blog/evaluate-coding-agent" className="text-moss underline-offset-4 hover:underline">
          evaluating a coding agent
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
