import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "ai-agent-file-permissions",
  title: "Designing file permissions for an AI coding agent",
  metaTitle: "Designing File Permissions for an AI Coding Agent",
  description:
    "A threat model and eight-layer defence for coding agent file access: path sandboxing, symlink escapes, secret refusal, risk grading and the blast-radius gate.",
  date: "2026-09-29",
  updated: "2026-09-30",
  readingMinutes: 12,
  tags: ["Security", "Architecture", "Sandboxing"],
  keyword: "ai agent file permissions",
  related: [
    "ai-coding-agent-guardrails",
    "open-source-ai-coding-agents",
    "reduce-llm-cost",
    "mcp-server-for-coding-agents",
  ],
  faq: [
    {
      q: "How do you stop an AI coding agent from reading files outside the project?",
      a: "Resolve every path to its real location before comparing it, then compare against the project root, string prefix checks are bypassable. `root.includes(path)` is defeated by `../secrets` and by a symlink pointing outside the tree. Canonicalise first, reject on the resolved path, and treat an unreadable or unresolvable path as a refusal rather than as a pass. Sentinel does this at the tool boundary so it applies to every mode, including the ones you think are read-only.",
    },
    {
      q: "Is a system prompt enough to stop an agent from doing damage?",
      a: "No, and treating it as a control is the most common security mistake in agent tooling. A prompt is a suggestion to a model that may be wrong, distracted, or talking to itself in a long context; it is not an enforcement boundary. Only the code between the model's request and the filesystem is enforcement. Prompts are useful for informing behaviour, and useless as the only thing standing between a hallucinated path and your production config.",
    },
    {
      q: "Should an agent ask before every file write?",
      a: "No. A gate that fires on every write trains people to disable it, usually within a day. Ask once per risky path per turn, then open the path for the rest of that turn, and record the justification. The cost of a false positive is one keystroke; the cost of a real mistake on a migration is not recoverable, so the design should err heavily toward over-asking on the paths that are expensive to get wrong.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Prompts are not permissions. The only enforcement boundary is the code between the
          model&rsquo;s tool request and the filesystem, so that is where every control belongs.
        </p>
        <p>
          Sandboxing is one layer, not the answer. A complete design is eight layers: read-only
          modes, canonicalised path checks, secret and dangerous-command refusal, risk grading by
          command shape, a once-per-path blast-radius gate, checkpoints, output caps, and a
          standing loop that answers for its own spend.
        </p>
      </KeyTakeaways>

      <H2 id="threat-model" text="Start with the threat model, not the feature list" />
      <p>
        &ldquo;Sandbox the agent&rdquo; is not a requirement, it is a candidate solution. Write down
        what you are actually defending against first. For a coding agent running with your
        developer&rsquo;s credentials on a laptop, the realistic set is short and specific:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Read escape.</strong> The agent reads{" "}
          <code className="font-mono text-[13px]">~/.ssh</code>,{" "}
          <code className="font-mono text-[13px]">.env</code> or an API key file and puts the
          contents into a prompt that leaves the machine.
        </li>
        <li>
          <strong className="text-paper">Write escape.</strong> A path traversal or symlink puts a
          write outside the project, into a directory that happens to be mounted.
        </li>
        <li>
          <strong className="text-paper">Destructive command.</strong> Not a bug in the agent, a
          <em> correct</em> execution of <code className="font-mono text-[13px]">rm -rf</code> on a
          path the model mis-resolved.
        </li>
        <li>
          <strong className="text-paper">Unreviewed high-blast-radius change.</strong> A migration,
          a CI workflow, a lockfile or an auth file edited in a way that looks fine in a diff and
          is catastrophic in production.
        </li>
        <li>
          <strong className="text-paper">Unattended spend.</strong> Not a security hole exactly, but
          a standing loop with no ceiling is a way to spend money quietly.
        </li>
      </ul>
      <p>
        Notice what is absent: &ldquo;the model turns hostile&rdquo;. Prompt injection through
        repository content is real, but it is an amplifier of these five, not a separate category.
        If the controls below hold, an injected instruction reads no more than the operator&rsquo;s
        own.
      </p>

      <H2 id="layer-1" text="Layer 1: the prompt is not a control" />
      <p>
        Almost every agent ships a system prompt that says something like &ldquo;never write outside
        the project directory&rdquo;. Treat that as documentation. A model is a prediction
        function over a context window; it can be wrong, it can be talked out of a rule by content
        it just read, and on a long context the rule is competing for attention with a thousand
        lines of code.
      </p>
      <p>
        The correct mental model: <strong>the prompt sets expectations, the code enforces
        boundaries</strong>. Every layer below is code. If a control only exists as text, it is
        not a control.
      </p>

      <H2 id="layer-2" text="Layer 2: read-only modes that are actually read-only" />
      <p>
        A mode that is meant to review code should not be able to write code, and the way to
        guarantee that is an allowlist, not a denylist. Denylists fail open: a tool you forgot to
        list is permitted. Allowlists fail closed: a tool you did not think about is refused.
      </p>
      <CodeBlock
        label="mode → allowlist"
        code={`PLAN    read, list, glob, grep, codeMap, web, diff, todos, skills
REVIEW  read, list, glob, grep, codeMap, web, diff, todos, skills
BUILD   everything
SCAN    read-only + a test runner
FIX     build tools minus the shell
SWE     full loop, 60-iteration budget, verbatim tool history`}
      />
      <p>
        The tell for a real implementation is whether the check happens in one place, above the
        tool, rather than being re-implemented per tool. Enforcement that lives in each handler is
        enforcement that one handler will eventually forget.
      </p>

      <H2 id="layer-3" text="Layer 3: canonicalise, then compare" />
      <p>
        This is the layer most sandboxes get wrong, and the bug is always the same shape:{" "}
        <code className="font-mono text-[13px]">path.startsWith(root)</code>{" "}
        evaluated on the string the model sent.
      </p>
      <CodeBlock
        label="the naive version"
        code={`function isInside(root, path) {
  return path.startsWith(root);   // defeated by ../ and by symlinks
}`}
      />
      <CodeBlock
        label="the version that holds"
        code={`import { realpath } from "node:fs/promises";
import path from "node:path";

async function isInside(root, candidate) {
  // 1. make the path absolute against the project root
  const abs = path.resolve(root, candidate);

  // 2. canonicalise BOTH sides. This is what defeats symlink escapes
  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(abs).catch(() => abs), // unresolvable => treat as the raw abs path
  ]);

  // 3. compare with a separator so /repo-evil cannot pass as /repo
  return realTarget === realRoot || realTarget.startsWith(realRoot + path.sep);
}`}
      />
      <p>
        Two details carry the weight. You must canonicalise the <em>root</em> too, because the
        project itself is often reached through a symlink, {" "}
        <code className="font-mono text-[13px]">/tmp</code> to{" "}
        <code className="font-mono text-[13px]">/private/tmp</code> on macOS is the classic case, and
        comparing a canonical path against a symlinked one refuses everything. And the comparison
        needs the trailing separator, or{" "}
        <code className="font-mono text-[13px]">/repo-backup</code> passes a{" "}
        <code className="font-mono text-[13px]">/repo</code> prefix check.
      </p>
      <p>
        Symlink escape deserves a worked example, because it is the bug that survives code review.
        A project contains{" "}
        <code className="font-mono text-[13px]">docs/link → ../../etc</code>. Every read the model
        attempts as <code className="font-mono text-[13px]">docs/link/passwd</code> is textually
        inside the root, so a string check passes it, and the content of a system file enters the
        context and then the model call. Canonicalisation is what makes{" "}
        <code className="font-mono text-[13px]">realTarget</code>{" "}
        come back as <code className="font-mono text-[13px]">/etc/passwd</code> and get refused.
      </p>
      <div className="pt-2">
        <Callout title="Unresolvable is not permitted" tone="warn">
          When a path cannot be canonicalised, refuse the operation and say why. Treating an error as
          a pass is how &quot;fail open&quot; gets into a sandbox.
        </Callout>
      </div>

      <H2 id="layer-4" text="Layer 4: refuse secrets and the obvious footguns" />
      <p>
        Path sandboxing answers &ldquo;where may it write&rdquo;. It does not answer &ldquo;which of
        the legal paths should be off limits in every mode&rdquo;. Two categories need a hard deny:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Secret material</strong>:{" "}
          <code className="font-mono text-[13px]">.env</code>,{" "}
          <code className="font-mono text-[13px]">*.pem</code>,{" "}
          <code className="font-mono text-[13px]">*.key</code>,{" "}
          <code className="font-mono text-[13px]">id_rsa</code>,{" "}
          <code className="font-mono text-[13px]">.npmrc</code>, cloud credential files. A read
          refusal is the point. The model does not need the value, and anything it reads can end
          up in a provider request.
        </li>
        <li>
          <strong className="text-paper">Inescapable commands</strong>:{" "}
          <code className="font-mono text-[13px]">rm -rf /</code>, fork bombs,{" "}
          <code className="font-mono text-[13px]">mkfs</code>,{" "}
          <code className="font-mono text-[13px]">shutdown</code>,{" "}
          <code className="font-mono text-[13px]">dd</code> to a device. These are refused before
          execution, in every mode, including the ones that allow shell.
        </li>
      </ul>
      <p>
        Note the asymmetry: refusing a secret <em>read</em> is safe and cheap, because nothing
        legitimate needs the value. Refusing a command is a judgement call, so keep the list
        deliberately short and unmistakable rather than clever, a denylist that blocks{" "}
        <code className="font-mono text-[13px]">rm</code> is a denylist that gets disabled.
      </p>

      <H2 id="layer-5" text="Layer 5: grade by command shape, not by command" />
      <p>
        &ldquo;Allow bash for this session&rdquo; is one grant covering{" "}
        <code className="font-mono text-[13px]">git status</code> and{" "}
        <code className="font-mono text-[13px]">npm publish</code> alike. Either uselessly strict or
        uselessly loose. The fix is to record the <em>shape</em> of the command, per repository, and
        grade each new one.
      </p>
      <CodeBlock
        label="bash"
        code={`$ sentinel risk
green   git status                     approved shape
green   git commit -m <msg>            approved shape
yellow  npm run bench                  new, not destructive
red     git push --force               always asked`}
      />
      <p>Three properties make the grading trustworthy:</p>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Keep flags, drop values.</strong>{" "}
          <code className="font-mono text-[13px]">git commit -m &quot;a&quot;</code> and{" "}
          <code className="font-mono text-[13px]">-m &quot;b&quot;</code> are one shape, so the second
          does not ask. But <code className="font-mono text-[13px]">--force</code> is not a value, it
          is a different verb, and it is never collapsed into a placeholder.
        </li>
        <li>
          <strong className="text-paper">The subcommand is part of the verb.</strong> Approving{" "}
          <code className="font-mono text-[13px]">git commit</code> must never authorise{" "}
          <code className="font-mono text-[13px]">git push</code>. Same for{" "}
          <code className="font-mono text-[13px]">npm run</code> vs{" "}
          <code className="font-mono text-[13px]">npm publish</code>,{" "}
          <code className="font-mono text-[13px]">docker build</code> vs{" "}
          <code className="font-mono text-[13px]">docker push</code>.
        </li>
        <li>
          <strong className="text-paper">A missing ledger means nothing is approved.</strong> A
          corrupt or absent risk file must grade everything novel as <code>yellow</code>. An
          approving ledger that does not exist is not consent.
        </li>
      </ol>

      <H2 id="layer-6" text="Layer 6: a blast-radius gate that asks once" />
      <p>
        Sandbox rules are uniform: everything outside the root is refused. But the cost of being
        wrong is wildly non-uniform. A typo in a comment costs nothing; a migration that quietly
        drops a column costs a restore. So add a second, orthogonal check on the paths where being
        wrong is expensive.
      </p>
      <CompareTableBlast />
      <p>
        The gate <strong>blocks once per path per turn</strong>. The first write to{" "}
        <code className="font-mono text-[13px]">db/migrate/</code> is refused with the requirement
        spelled out, and the agent must supply a justifying{" "}
        <code className="font-mono text-[13px]">file:line</code> and an exact rollback before the
        write lands. After that the path is open for the rest of the turn.
      </p>
      <CodeBlock
        label="gate output"
        code={`◆ blocked  db/migrate/0042_add_index.sql
  a migration is rarely undone by reverting it
  required: justifying file:line · exact rollback
✓ opened   for the rest of this turn`}
      />
      <p>
        This design is deliberate and it is the difference between a gate that survives week two
        and one that gets switched off on day one. <strong>A gate that blocks forever trains people
        to disable it. A gate that asks once and records the answer builds a habit.</strong> The
        trade is explicitly toward over-asking: a utility file in an auth directory still gets
        challenged, because a false positive costs one prompt and a missed billing change does not
        come back. The full design (refusal wording, memory boundaries, the metrics that predict
        failure) is in{" "}
        <Link
          href="/blog/ai-coding-agent-guardrails"
          className="underline-offset-4 hover:underline"
        >
          guardrails for AI coding agents
        </Link>
        .
      </p>

      <H2 id="layer-7-8" text="Layers 7 and 8: reversibility, and cost of unattended loops" />
      <p>
        <strong>Checkpoints.</strong> Every write is recorded, and undo works across turns, not just
        within one. The turn that breaks something is rarely the turn that looks like it did, so
        per-turn undo is not enough.
      </p>
      <p>
        <strong>Budgets.</strong> A standing loop that wakes on every failed test is a presence, not
        a cron job, and it is a way to spend money quietly unless the ceiling is checked before
        every wakeup. Pair it with backoff (double the wait on a tick that made no progress, stop
        after five) and record failures rather than treating them as fatal.
      </p>
      <CodeBlock
        label="bash"
        code={`sentinel watch "keep the sync green" -t "command:npm test" -t git
sentinel budget --usd 25 --deadline 2h`}
      />

      <H2 id="checklist" text="The review checklist" />
      <p>
        If you are auditing an agent, or building one, these are the questions. Each has a yes/no
        answer that takes a minute to verify in the source.
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted marker:text-moss">
        <li>Is enforcement in code, or only in the system prompt?</li>
        <li>Does the sandbox canonicalise both the root and the target?</li>
        <li>Does it compare with a path separator, or is <code>/repo-backup</code> inside <code>/repo</code>?</li>
        <li>Are modes allowlists, and do they fail closed?</li>
        <li>Are secret reads and catastrophic commands refused in every mode?</li>
        <li>Does command approval key on shape, with the subcommand included?</li>
        <li>Does a missing approval ledger mean &ldquo;ask&rdquo; rather than &ldquo;allow&rdquo;?</li>
        <li>Is the expensive-path gate once-per-path, not once-per-write?</li>
        <li>Does undo cross turn boundaries?</li>
        <li>Does an unattended loop check its budget before every wakeup?</li>
      </ol>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "How do you stop an AI coding agent from reading files outside the project?",
            a: "Resolve every path to its real location before comparing it, then compare against the project root, string prefix checks are bypassable. `root.includes(path)` is defeated by `../secrets` and by a symlink pointing outside the tree. Canonicalise first, reject on the resolved path, and treat an unreadable or unresolvable path as a refusal rather than as a pass. Sentinel does this at the tool boundary so it applies to every mode, including the ones you think are read-only.",
          },
          {
            q: "Is a system prompt enough to stop an agent from doing damage?",
            a: "No, and treating it as a control is the most common security mistake in agent tooling. A prompt is a suggestion to a model that may be wrong, distracted, or talking to itself in a long context; it is not an enforcement boundary. Only the code between the model's request and the filesystem is enforcement. Prompts are useful for informing behaviour, and useless as the only thing standing between a hallucinated path and your production config.",
          },
          {
            q: "Should an agent ask before every file write?",
            a: "No. A gate that fires on every write trains people to disable it, usually within a day. Ask once per risky path per turn, then open the path for the rest of that turn, and record the justification. The cost of a false positive is one keystroke; the cost of a real mistake on a migration is not recoverable, so the design should err heavily toward over-asking on the paths that are expensive to get wrong.",
          },
        ]}
      />

      <Cta
        title="Read the enforcement, not the promise"
        body="Every control on this list is in the source, in a few hundred lines you can read in one sitting. Clone it and check."
        href="/docs/tools"
        cta="Tool reference"
      />
    </>
  ),
} satisfies Post;

function CompareTableBlast() {
  const rows = [
    ["db/migrate/**, *.sql", "A migration is rarely undone by reverting it"],
    [".github/workflows/**", "This gates every merge"],
    ["prisma/schema.*, *schema.json", "Changing a schema changes everything under it"],
    ["package-lock.json, yarn.lock", "A lockfile edit is invisible in review"],
    ["src/auth/**, src/billing/**, **/rbac*", "The code you cannot roll back"],
    ["Dockerfile, docker-compose*, Makefile", "Build and deploy definitions"],
    ["infra/, terraform/, k8s/", "Infrastructure definition"],
    [".sentinel/config.yaml", "The project's own permission config"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Paths challenged by the blast-radius gate and why</caption>
        <thead>
          <tr className="border-b border-ink-800">
            {["Path", "Why it is challenged"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-ink-800/60 last:border-0">
              <td className="px-3 py-2.5 align-top font-mono text-[13px] text-moss">{r[0]}</td>
              <td className="px-3 py-2.5 align-top text-muted">{r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
