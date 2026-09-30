import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "ai-coding-agent-guardrails",
  title: "Guardrails for AI coding agents: a design that survives week two",
  metaTitle: "Guardrails for AI Coding Agents",
  description:
    "How to design AI coding agent guardrails engineers keep switched on: layered controls, once-per-path gating, and the friction traps that get them disabled.",
  date: "2026-09-30",
  readingMinutes: 13,
  tags: ["Security", "Architecture", "Guardrails"],
  keyword: "ai coding agent guardrails",
  related: ["ai-agent-file-permissions", "open-source-ai-coding-agents", "evaluate-coding-agent"],
  faq: [
    {
      q: "What are guardrails in an AI coding agent?",
      a: "Code-enforced limits on what the agent may do, independent of what the system prompt says. In practice there are four kinds: permission modes that map to tool allowlists, path sandboxing that keeps reads and writes inside the project, refusals for secret files and catastrophic commands, and higher friction on paths where a mistake is expensive — migrations, CI workflows, lockfiles, auth, billing, infrastructure. Only the last kind is usually built, and it is the one that decides whether the agent is trusted with a real repository.",
    },
    {
      q: "Why do agent guardrails get disabled?",
      a: "Because they are calibrated for correctness instead of for adoption. A guardrail that fires on every write trains people to reach for the override within days, and once the override is muscle memory the control is decorative. The fix is to over-ask only where the cost of being wrong is asymmetric, and to ask once per path per turn rather than once per write, so the correct agent behaviour is the path of least resistance.",
    },
    {
      q: "Should an AI agent be allowed to edit migrations and CI workflows?",
      a: "Yes, with a gate. Refusing outright is the wrong control, because it makes the agent useless for exactly the tasks people most want help with. The gate refuses the first write to a risky path in a turn and requires a justifying file:line plus an exact rollback; after that the path is open for the rest of the turn. The agent still does the work, and the justification gets recorded where a reviewer can see it.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Guardrails do not fail because they are too weak. They fail because they are{" "}
          <strong>calibrated for correctness instead of adoption</strong> — fire too often, and
          engineers disable them within a week, which converts every control you built into
          decoration.
        </p>
        <p>
          The working shape: cheap paths are silent, expensive paths ask{" "}
          <strong>once per path per turn</strong>, and every gate is code. A refusal must state the
          requirement, not just deny the write.
        </p>
      </KeyTakeaways>

      <H2 id="adoption" text="The problem is friction, not safety" />
      <p>
        Every guardrail in an agent is a tax on the human. One extra keystroke here, one lost
        minute of context there, one turn where the agent stops and asks instead of shipping. The
        tax is defensible on a migration. It is indefensible on a typo fix, and a design that
        charges the same tax everywhere gets switched off.
      </p>
      <p>
        So the question that actually matters is not &ldquo;does this block dangerous
        writes?&rdquo; — it always does, on the tenth attempt. The question is{" "}
        <strong>&ldquo;will it still be enabled next month?&rdquo;</strong> That reframes guardrail
        design from a security exercise into a product exercise, and it changes the answers.
      </p>
      <p>
        Two corollaries worth stating up front, because they invert the usual instinct:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Fewer controls, better controls.</strong> Six layered checks
          that all hold beat fifteen that one developer worked around.
        </li>
        <li>
          <strong className="text-paper">A block that is wrong is a bug, not a false
          positive.</strong> Nobody turns off a control that has never once been annoying. They turn
          off the one that blocked them four times for nothing.
        </li>
      </ul>
      <p>
        The threat model these controls answer is set out in{" "}
        <Link href="/blog/ai-agent-file-permissions" className="underline-offset-4 hover:underline">
          designing file permissions for an AI coding agent
        </Link>
        . This post is about the part that decides whether any of it gets used.
      </p>

      <H2 id="layers" text="Four layers, and only the last one is interesting" />
      <p>
        Put every control in one place and the order becomes obvious, because three of the four are
        table stakes and one is the whole design problem.
      </p>

      <H3 id="l1" text="Layer 1 — expectations, not enforcement" />
      <p>
        The system prompt tells the agent to stay inside the project. This is documentation, not a
        control, and it is worth keeping for the same reason any interface has a label: it aligns
        the model with the boundary you are about to enforce, so the gate is a formality rather
        than a fight. Never count it as a layer.
      </p>

      <H3 id="l2" text="Layer 2 — modes as allowlists" />
      <p>
        A review mode that cannot write is worth more than a sandbox you have to trust. Use
        allowlists so the failure mode is closed: a tool you forgot to think of is refused rather
        than permitted. This layer is easy to build, which is exactly why it is easy to get wrong
        quietly — assert it in tests, because nothing else will tell you it regressed.
      </p>

      <H3 id="l3" text="Layer 3 — canonicalised paths, refused secrets" />
      <p>
        Resolve every path to its real location before comparing, and refuse secrets and
        catastrophic commands in every mode including the read-only ones. Nothing about this is
        subtle once you have read the{" "}
        <Link href="/blog/ai-agent-file-permissions" className="underline-offset-4 hover:underline">
          threat model post
        </Link>
        , and it does not generate friction, so there is no adoption cost to worry about.
      </p>

      <H3 id="l4" text="Layer 4 — the expensive-path gate" />
      <p>
        This is the one that gets skipped, and the one that carries the actual risk. Layers 1 to 3
        are uniform: everything outside the root is refused, everything inside is fair game. But
        the cost of being wrong is wildly non-uniform across the paths <em>inside</em> the root, and
        a uniform sandbox cannot express that.
      </p>
      <CodeBlock
        label="where a wrong write actually costs something"
        code={`db/migrate/**, *.sql          a migration is rarely undone by reverting it
.github/workflows/**           this gates every merge
prisma/schema.*, *schema.json changing a schema changes everything under it
package-lock.json, yarn.lock   a lockfile edit is invisible in review
src/auth/**, src/billing/**    the code you cannot roll back
Dockerfile, docker-compose*    build and deploy definitions
infra/, terraform/, k8s/      infrastructure definition
.sentinel/config.yaml          the project's own permission config`}
      />
      <p>
        A typo in a comment costs nothing. A migration that quietly drops a column costs a restore,
        and it is the kind of restore that happens at 2 a.m. with a customer waiting. That asymmetry
        — one keystroke versus one incident — is the entire justification for a separate control,
        and it is why the trade should be explicitly{" "}
        <strong>toward over-asking</strong> on these globs. A utility file inside an auth directory
        should still get challenged. Nobody minds being asked once about a file that turned out to
        be harmless; everybody minds the alternative.
      </p>

      <H2 id="once-per-path" text="The once-per-path rule" />
      <p>
        This is the single most important implementation detail, and getting it wrong in either
        direction produces the two failure modes people actually see.
      </p>
      <CompareTableGate />
      <p>
        The mechanism is deliberately boring: hold a set of challenged paths on the run, populate it
        when the gate refuses, test membership on every write, and clear the set at the turn
        boundary.
      </p>
      <CodeBlock
        label="the whole gate"
        code={`const CHALLENGED = new Set(); // per run, cleared at the turn boundary

function isExpensive(relPath) {
  return EXPENSIVE.some((rx) => rx.test(relPath));
}

function gateWrite(relPath, justification) {
  if (!isExpensive(relPath)) return { ok: true };

  // already paid for this path in this turn
  if (CHALLENGED.has(relPath)) return { ok: true };

  // the agent supplied both required fields, so record and proceed
  if (justification?.fileLine && justification?.rollback) {
    CHALLENGED.add(relPath);
    return { ok: true, recorded: justification };
  }

  return { ok: false, reason: BLOCK_MESSAGE };
}`}
      />
      <p>Three properties of that shape are deliberate and worth naming:</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">It is scoped to the run, not the repo.</strong> Gating the
          same path on every turn forever trains people to pre-empt the gate by saying &ldquo;yes,
          yes&rdquo; without reading. A once-per-turn cost is paid once.
        </li>
        <li>
          <strong className="text-paper">It opens on a complete answer, not on a confirmation.</strong>{" "}
          &ldquo;yes&rdquo; is not a justification. Requiring a specific file and a specific undo
          converts a rubber stamp into a two-second act of reasoning — and sometimes into the moment
          the agent realises it is about to do the wrong thing.
        </li>
        <li>
          <strong className="text-paper">The answer is recorded.</strong> Once the file:line and the
          rollback are in the trajectory, the next person — or the next session — can see why the
          change was made instead of reconstructing it.
        </li>
      </ul>

      <H2 id="refusal" text="Design the refusal message, not just the refusal" />
      <p>
        A denial that says &ldquo;blocked: not allowed&rdquo; is a dead end. The agent cannot
        proceed, cannot satisfy the requirement, and will either retry blindly or give up. A
        refusal is an interface, and it has to carry three things: what happened, why this path is
        treated differently, and precisely what would let it through.
      </p>
      <CodeBlock
        label="gate output"
        code={`◆ blocked  db/migrate/0042_add_index.sql
  a migration is rarely undone by reverting it
  required: justifying file:line · exact rollback
✓ opened   for the rest of this turn`}
      />
      <p>
        The middle line is doing more work than it looks. It explains the{" "}
        <em>category</em> of risk — irreversibility — rather than asserting a policy, which is what
        makes it survive contact with a model that has never seen this tool before. &ldquo;Required:
        justifying file:line · exact rollback&rdquo; is equally important: it is a contract the
        agent can satisfy on its next turn without guessing.
      </p>
      <div className="pt-2">
        <Callout title="Test the message, not just the block" tone="warn">
          A gate that blocks correctly but explains badly produces retry loops, and a retry loop
          looks like a model failure in every log you will read. If a run is burning turns on a
          refusal, suspect the wording before the model.
        </Callout>
      </div>

      <H2 id="learnable" text="Make it learnable, but keep memory separate" />
      <p>
        Some friction should disappear over time. If an engineer approves the same CI workflow
        change every week, asking forever is just noise. But approval memory and the safety gate are
        different concerns and should not be the same mechanism:
      </p>
      <CompareTableMemory />
      <p>
        The rule that keeps this from becoming a backdoor: the gate is per-turn and asks about{" "}
        <em>this specific change</em>; the ledger is per-repo and asks about{" "}
        <em>this kind of command</em>. Approving{" "}
        <code className="font-mono text-[13px]">git commit -m "a"</code> must never authorise{" "}
        <code className="font-mono text-[13px]">npm publish</code>, and no amount of prior approval
        should let an agent modify a migration without saying why this time. If a repo-level
        &ldquo;trusted path&rdquo; list grows over time, the gate has been laundered into a
        suggestion — and that is the moment to delete the feature.
      </p>

      <H2 id="antipatterns" text="Six ways to build a guardrail that gets switched off" />
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">One global toggle.</strong> &ldquo;Allow this agent to
          edit files&rdquo; covers a typo fix and a migration identically, so it is either useless
          or reckless. Granularity is what makes a control tolerable.
        </li>
        <li>
          <strong className="text-paper">A denylist of tools.</strong> A tool you forgot to list is
          permitted. Allowlists fail closed; denylists fail into your incident.
        </li>
        <li>
          <strong className="text-paper">Prompt-only enforcement.</strong> The most common and the
          most damaging, because it looks like a control in a demo and is absent in production.
        </li>
        <li>
          <strong className="text-paper">Blocking every write.</strong> Maximum safety, zero
          adoption, and the fastest route to an agent nobody trusts with anything real.
        </li>
        <li>
          <strong className="text-paper">Placeholder-normalising flags.</strong> Collapsing{" "}
          <code className="font-mono text-[13px]">--force</code> into a generic flag means{" "}
          <code className="font-mono text-[13px]">git push --force</code> matches an approved{" "}
          <code className="font-mono text-[13px]">git push</code>. Normalise values, never risk.
        </li>
        <li>
          <strong className="text-paper">Fail open on error.</strong> If an approval ledger is
          missing, grade everything novel as &ldquo;ask&rdquo;. An approving ledger that does not
          exist is not consent.
        </li>
      </ol>

      <H2 id="testing" text="Prove they hold" />
      <p>
        Guardrails are the part of an agent most likely to regress silently, because they only fire
        in situations you are not looking at. They belong in the capability gate suite, next to the
        tool tests, and they need assertions on the failure path — not just the happy path.
      </p>
      <CodeBlock
        label="the four assertions that matter"
        code={`it("refuses a write outside the root", ...)          // traversal + absolute path
it("refuses a symlink that points out of the tree", ...)     // the bug that survives review
it("refuses a PLAN-mode write tool", ...)                    // allowlist fails closed
it("asks, when the approval ledger is absent", ...)          // fail closed, not open
it("asks once per path per turn, then opens it", ...)        // the friction contract
it("still asks on turn two for a new migration", ...)        // memory is not a bypass`}
      />
      <p>
        That last one is the one teams skip, and it is the one that tells you whether the gate is a
        control or a formality. The full harness, including the reproduce-first workflow these
        assertions belong to, is in the{" "}
        <Link href="/docs/swe" className="underline-offset-4 hover:underline">
          SWE workflow docs
        </Link>{" "}
        and in{" "}
        <Link href="/blog/evaluate-coding-agent" className="underline-offset-4 hover:underline">
          how to evaluate a coding agent
        </Link>
        .
      </p>

      <H2 id="metrics" text="Measure the thing that actually predicts failure" />
      <p>
        &ldquo;Number of blocked writes&rdquo; is a vanity metric — a healthy project with dangerous
        habits can post a high number, and a broken gate can post zero. The signals worth watching
        are these:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Disable rate.</strong> The only metric that is unambiguously
          bad. If anyone turns a guardrail off, the design failed, not the user.
        </li>
        <li>
          <strong className="text-paper">Retries after a block.</strong> The agent asking again
          without supplying what was requested means the refusal message is broken, not the agent.
        </li>
        <li>
          <strong className="text-paper">Justifications that are vague.</strong> A{" "}
          <code className="font-mono text-[13px]">file:line</code> pointing at a test file, or a
          rollback of &ldquo;revert the commit&rdquo;, is a rubber stamp with extra steps.
        </li>
        <li>
          <strong className="text-paper">Near misses.</strong> Times the gate stopped a change that
          was genuinely about to be wrong. This is the number that justifies the whole system, and
          it is the one to bring to a code review.
        </li>
      </ul>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What are guardrails in an AI coding agent?",
            a: "Code-enforced limits on what the agent may do, independent of what the system prompt says. In practice there are four kinds: permission modes that map to tool allowlists, path sandboxing that keeps reads and writes inside the project, refusals for secret files and catastrophic commands, and higher friction on paths where a mistake is expensive — migrations, CI workflows, lockfiles, auth, billing, infrastructure. Only the last kind is usually built, and it is the one that decides whether the agent is trusted with a real repository.",
          },
          {
            q: "Why do agent guardrails get disabled?",
            a: "Because they are calibrated for correctness instead of for adoption. A guardrail that fires on every write trains people to reach for the override within days, and once the override is muscle memory the control is decorative. The fix is to over-ask only where the cost of being wrong is asymmetric, and to ask once per path per turn rather than once per write, so the correct agent behaviour is the path of least resistance.",
          },
          {
            q: "Should an AI agent be allowed to edit migrations and CI workflows?",
            a: "Yes, with a gate. Refusing outright is the wrong control, because it makes the agent useless for exactly the tasks people most want help with. The gate refuses the first write to a risky path in a turn and requires a justifying file:line plus an exact rollback; after that the path is open for the rest of the turn. The agent still does the work, and the justification gets recorded where a reviewer can see it.",
          },
        ]}
      />

      <Cta
        title="Read the gate in the source"
        body="Every control described here is a few hundred readable lines, with the once-per-path state machine in one function. No servers, no telemetry."
        href="/docs/tools"
        cta="Tool reference"
      />
    </>
  ),
} satisfies Post;

function CompareTableGate() {
  const rows: [string, string, string][] = [
    [
      "Once per write",
      "Asks every time",
      "Fires on every edit in a migration. Becomes noise in a single turn, and the override becomes habit.",
    ],
    [
      "Once per path per turn",
      "Asks, then opens the path for the rest of the turn",
      "One cost per risky decision. Correct agent behaviour stays the path of least resistance.",
    ],
    [
      "Once per path per repo",
      "Opens the path forever after one approval",
      "A migration approved in March edits a different migration in July with no one watching.",
    ],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Gate granularity compared</caption>
        <thead>
          <tr className="border-b border-ink-800">
            {["Granularity", "Behaviour", "Why it fails or holds"].map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-ink-800/60 last:border-0">
              <td className="px-3 py-2.5 align-top font-medium text-paper">{r[0]}</td>
              <td className="px-3 py-2.5 align-top text-moss">{r[1]}</td>
              <td className="px-3 py-2.5 align-top text-muted">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareTableMemory() {
  const rows: [string, string, string][] = [
    ["Gate", "Per run", "This specific change, right now"],
    ["Risk ledger", "Per repo", "This kind of command, going forward"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Gate memory compared with the risk ledger</caption>
        <thead>
          <tr className="border-b border-ink-800">
            {["Mechanism", "Scope", "Question it asks"].map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2.5 font-mono text-xs uppercase tracking-wide text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-ink-800/60 last:border-0">
              <td className="px-3 py-2.5 align-top font-medium text-paper">{r[0]}</td>
              <td className="px-3 py-2.5 align-top text-moss">{r[1]}</td>
              <td className="px-3 py-2.5 align-top text-muted">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
