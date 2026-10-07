import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-clone-the-repo",
  title: "Clone the repository instead of applying the patch",
  metaTitle: "PR Owl Part 6: Cloning the Repo, Not the Patch",
  description:
    "Why an AI reviewer that can grep is a reviewer, and one that cannot is guessing — plus the clone cache, the force-checkout that stops the second review failing, and why a pull request must not leave hooks behind.",
  date: "2026-10-06",
  readingMinutes: 8,
  tags: ["Tutorial", "Git", "Checkout", "Code Review"],
  keyword: "clone repo for ai code review",
  series: { slug: "pr-owl-course", order: 6 },
  related: ["pr-owl-review-queue", "pr-owl-review-as-a-task", "local-llm-coding-agent"],
  faq: [
    {
      q: "Isn't cloning every pull request enormously wasteful?",
      a: "It is not, because the clone is cached and only the fetch is per-review. One repository is cloned once; after that each review is a fetch of a single commit plus a checkout, which is a few seconds. Cloning fresh every time would be genuinely wasteful, and the reason the cache is per-repository rather than per-pull-request is that a review needs a base branch to compare against.",
    },
    {
      q: "Why the shallow fetch depth of 50?",
      a: "Because a review needs enough history to be useful and few enough commits to be fast. The agent reads code, not history, so it does not need the full log — but a base-branch comparison does want more than a single commit, and `--filter=blob:none` keeps the initial clone from downloading every blob in the repository.",
    },
    {
      q: "What does the forced checkout protect against?",
      a: "Two things. The cache directory is reused, so without `--force` the second review of a repository fails on a dirty tree the first one left behind. And `git clean` removes untracked files — including anything a previous review's agent wrote — so the diff the agent reads is the diff that is actually in the pull request.",
    },
    {
      q: "Is running anything from the checked-out code safe?",
      a: "No, which is why PR Owl never does it. Part 8 is about exactly this: a fork's head commit is attacker-controlled, so its package.json, its test command and its build script are all attacker-controlled too. The checkout is only ever read from.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Handing an agent a patch gives it the changed lines and nothing else. Handing it a
          <strong> checkout gives it the repository</strong>, and the changed files are
          just the working tree.
        </p>
        <p>
          The difference shows up in the quality of the findings: from a patch, a model
          cannot grep for the callers of the function it is reviewing, cannot read the
          module that imports it, and cannot tell whether the line it wants to comment on
          is dead code.
        </p>
      </KeyTakeaways>

      <H2 id="choice" text="Two ways to give a model the change" />
      <CompareTable
        caption="A patch and a checkout, for a reviewer that has to be right"
        head={["", "Apply the patch", "Check out the branch"]}
        rows={[
          ["Context", "the changed lines", "the whole repository"],
          ["Can it grep for callers?", "no", "yes"],
          ["Can it read the importing module?", "no", "yes"],
          ["Can it tell dead code from live code?", "no", "yes"],
          ["Cost per review", "one API call", "a fetch and a checkout"],
          ["Needs a cache", "no", "yes — one clone per repository"],
          ["Can anything execute the code?", "no, by construction", "yes, if you let it"],
        ]}
      />
      <p>
        The last row is the one that decides the fork policy in part 8, and it is worth
        being precise about: a checkout is not automatically dangerous, it is{" "}
        <em>capable</em> of being dangerous. Nothing in PR Owl executes what it checks out.
      </p>
      <p>
        The rows above the last one are the reason for the choice. A reviewer given only a
        patch is not reasoning about code, it is reasoning about a fragment of code — and
        the most common false positive it produces is commenting on a function that has
        three callers, all of which pass the argument the reviewer thinks is missing.
      </p>

      <H2 id="implementation" text="The checkout" />
      <CodeBlock
        label="pr-owl/lib/checkout.ts"
        code={`export async function checkoutPr(
  repoUrl: string,
  headSha: string,
  opts: CheckoutOptions,
): Promise<{ dir: string; reused: boolean }> {
  const slug = repoUrl
    .replace(/^https:\\/\\/github\\.com\\//, '')
    .replace(/\\.git$/, '')
    .replace(/\\//g, '-');
  const dir = join(opts.cacheDir, slug);
  mkdirSync(opts.cacheDir, { recursive: true });

  const git = (args: string[], cwd?: string) =>
    exec('git', args, { cwd, timeout: opts.timeoutMs ?? 120_000,
                        maxBuffer: 32 * 1024 * 1024 });

  let reused = false;
  try {
    await git(['rev-parse', '--git-dir'], dir);
    reused = true;
  } catch {
    rmSync(dir, { recursive: true, force: true });
    await git(['clone', '--filter=blob:none', '--no-checkout', repoUrl, dir]);
  }

  await git(['fetch', '--depth', '50', 'origin',
    \`+refs/heads/\${opts.baseRef}:refs/remotes/origin/\${opts.baseRef}\`, headSha], dir);
  await git(['checkout', '--force', '--detach', headSha], dir);
  await git(['reset', '--hard', headSha], dir);
  await git(['clean', '-fdx', '-e', 'node_modules'], dir);

  return { dir, reused };
}`}
      />

      <H3 id="why-each-flag" text="Why each flag is there" />
      <CodeBlock
        label="the flags, one at a time"
        code={`// --filter=blob:none --no-checkout
// Clones the commit graph without file contents, and does not check out a
// branch. A review never needs the blobs of 40,000 commits, and it never
// wants main checked out — it wants a specific commit.

// --depth 50, with an explicit refspec
// One review needs one commit. A base-branch comparison needs a little
// history. The refspec pins the base branch to a remote-tracking ref so the
// comparison does not depend on which branch happens to be checked out.

// --force --detach
// The cache directory is REUSED. Without --force the second review of a
// repository fails on a dirty tree left behind by the first, and the error
// mentions a path you have never heard of.

// reset --hard
// The working tree must be exactly the pull request. Anything the previous
// review's agent wrote is a change that is not in the diff, and the reviewer
// will comment on it.

// clean -fdx -e node_modules
// Untracked files go too, or a previous review's scratch file becomes part of
// what the next reviewer reads. node_modules is excluded because re-installing
// it on every review would cost more than the review.`}
      />

      <H2 id="reuse" text="The cache, and where it lives" />
      <CodeBlock
        label="pr-owl/lib/owl.ts"
        code={`    cacheDir: process.env.PR_OWL_CACHE_DIR || join(tmpdir(), 'pr-owl-repos'),`}
      />
      <p>
        One directory per repository, named by slug, living in the system temp directory
        by default. The naming has to be reversible enough to be safe:{" "}
        <code className="font-mono text-[13px]">replace(/\//g, '-')</code> turns{" "}
        <code className="font-mono text-[13px]">acme/api</code> into{" "}
        <code className="font-mono text-[13px]">acme-api</code>, which means{" "}
        <code className="font-mono text-[13px]">acme/api</code> and{" "}
        <code className="font-mono text-[13px]">acme-api</code> collide.
      </p>
      <Callout title="That collision is not hypothetical, and it is worse than it looks">
        <p>
          If a repository were named <code className="font-mono text-[13px]">acme/api</code>{" "}
          and another <code className="font-mono text-[13px]">acme-api</code>, both map to{" "}
          <code className="font-mono text-[13px]">acme-api</code>. The second review would
          find an existing clone, treat it as its own, and review{" "}
          <em>the wrong repository&rsquo;s pull request</em> — commenting on one codebase
          with line numbers from another. That is the worst failure this app has, and it is
          prevented by hashing the full name rather than slugifying it:
        </p>
        <CodeBlock
          label="pr-owl/lib/checkout.ts"
          code={`import { createHash } from 'node:crypto';

// A slug is not injective: \`acme/api\` and \`acme-api\` both become \`acme-api\`.
const dir = join(opts.cacheDir,
  createHash('sha256').update(repoUrl).digest('hex').slice(0, 16));`}
        />
      </Callout>

      <H2 id="task-cwd" text="Handing the directory to the task" />
      <p>
        The checkout directory becomes the task&rsquo;s{" "}
        <code className="font-mono text-[13px]">cwd</code>, which is how the agent&rsquo;s
        tools end up reading the pull request without anyone configuring a path.
      </p>
      <CodeBlock
        label="pr-owl/lib/review.ts"
        code={`  const { id, rejected } = createTask({
    kind: 'agent',
    cwd: opts.repoDir,
    // The repository is already checked out into a directory PR Owl owns. A
    // worktree here would be a second copy of a tree nothing will merge.
    isolation: 'none',
    // ...
    run: async ({ signal, permission }) => {
      for await (const ev of runAgentTurn({
        workdir: opts.repoDir,
        mode: 'REVIEW',
        signal,
        onPermissionRequest: permission,
        // ...
      })) { /* ... */ }
    },
  });`}
      />
      <p>
        <code className="font-mono text-[13px]">isolation: 'none'</code> is deliberate and
        easy to get wrong by reflex. Sentinel&rsquo;s default for a teammate is a fresh
        git worktree, which is exactly right when several agents edit one repository
        concurrently. Here there is nothing to merge — the tree was created for this review
        and discarded with it — so a worktree would be a second copy of a directory
        nothing owns.
      </p>

      <H2 id="verify" text="Prove it works" />
      <CodeBlock
        label="terminal"
        code={`export PR_OWL_CACHE_DIR=/tmp/pr-owl
node --import tsx -e "
  import('./pr-owl/lib/checkout.ts').then(async ({ checkoutPr }) => {
    const { dir, reused } = await checkoutPr(
      'https://github.com/KunjShah95/SENTINEL-CLI.git',
      'HEAD',
      { cacheDir: process.env.PR_OWL_CACHE_DIR, baseRef: 'main' },
    );
    console.log({ dir, reused });
    console.log((await import('node:fs')).readdirSync(dir).slice(0, 8));
  });
"
// first run  -> { dir: '/tmp/pr-owl/<hash>', reused: false }
// second run -> { dir: '/tmp/pr-owl/<hash>', reused: true }  <- the cache works`}
      />

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Isn't cloning every pull request enormously wasteful?",
            a: "It is not, because the clone is cached and only the fetch is per-review. One repository is cloned once; after that each review is a fetch of a single commit plus a checkout, which is a few seconds. Cloning fresh every time would be genuinely wasteful, and the reason the cache is per-repository rather than per-pull-request is that a review needs a base branch to compare against.",
          },
          {
            q: "Why the shallow fetch depth of 50?",
            a: "Because a review needs enough history to be useful and few enough commits to be fast. The agent reads code, not history, so it does not need the full log — but a base-branch comparison does want more than a single commit, and `--filter=blob:none` keeps the initial clone from downloading every blob in the repository.",
          },
          {
            q: "What does the forced checkout protect against?",
            a: "Two things. The cache directory is reused, so without `--force` the second review of a repository fails on a dirty tree the first one left behind. And `git clean` removes untracked files — including anything a previous review's agent wrote — so the diff the agent reads is the diff that is actually in the pull request.",
          },
          {
            q: "Is running anything from the checked-out code safe?",
            a: "No, which is why PR Owl never does it. Part 8 is about exactly this: a fork's head commit is attacker-controlled, so its package.json, its test command and its build script are all attacker-controlled too. The checkout is only ever read from.",
          },
        ]}
      />

      <Cta
        title="Next: the review is a task"
        body="Part 7 is the payoff for the task primitive — a review as one createTask call, visible and cancellable like everything else."
        href="/blog/pr-owl-review-as-a-task"
        cta="Start part 7"
      />

      <p className="text-sm text-muted">
        The worktree-versus-checkout distinction is covered in{" "}
        <Link href="/blog/live-agent-loop-tracking" className="text-moss underline-offset-4 hover:underline">
          live loop tracking
        </Link>
        , and running a model against a local checkout without sending the code anywhere
        is the subject of{" "}
        <Link href="/blog/local-llm-coding-agent" className="text-moss underline-offset-4 hover:underline">
          the local LLM post
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
