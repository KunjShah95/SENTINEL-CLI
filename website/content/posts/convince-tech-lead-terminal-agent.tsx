import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "convince-tech-lead-terminal-agent",
  title: "The cautious tech lead asks three questions. Answer those.",
  metaTitle: "Convincing a Cautious Tech Lead to Adopt an Agent",
  description:
    "How to answer a sceptical tech lead about running a terminal coding agent on a production repo — the questions they actually ask, and what you can honestly offer instead of a demo.",
  date: "2026-10-16",
  readingMinutes: 12,
  tags: ["Adoption", "Architecture", "Engineering Management"],
  keyword: "adopt ai coding agent engineering team",
  series: { slug: "cursor-cli-course", order: 12 },
  related: ["cursor-cli-course-overview", "ai-coding-agent-guardrails", "evaluate-coding-agent"],
  faq: [
    {
      q: "What if the tech lead's objection is fundamentally about trust in vendors?",
      a: "Then it is not an objection you should argue away, because it may be correct for your context — regulated data, a contractual no-training requirement, a procurement process that takes six months. The answer that works is to show what the agent looks like with a local model: point it at Ollama or LM Studio and no request leaves the machine. That does not satisfy a vendor objection about the model, but it satisfies the operational one, which is usually the real blocker, and it lets the conversation move to tooling where you have actual leverage.",
    },
    {
      q: "How do I pitch this to someone who has been burned by an AI tool before?",
      a: "Do not pitch it as AI. Pitch it as a permission system, because that is what they actually need to govern, and what they have no equivalent for today. The interesting claim is not 'the model is smart' — it is 'every action this tool takes passes through an allowlist I can print and read'. That framing sidesteps the hype objection entirely, and it happens to be the part of the system that is hardest to build well.",
    },
    {
      q: "What if they want a pilot?",
      a: "Good — agree immediately and make it concrete, because a pilot is the only thing that settles this argument. The mistake is proposing a time-boxed trial without a success criterion, which just delays the decision. Propose instead: one repository, one named owner, PLAN mode only for two weeks, with three things measured — questions answered without help, time saved on unfamiliar-codebase tasks, and zero writes outside the pilot repository. A pilot that cannot fail is not a pilot.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A cautious tech lead is not a skeptic to be overcome. They are asking{" "}
          <strong>&ldquo;what is the blast radius of this being wrong, and who absorbs it?&rdquo;</strong>{" "}
          Answer that question with code you can show, and the rest is logistics.
        </p>
        <p>
          The framing that works: <strong>do not pitch it as AI, pitch it as a permission system.</strong>
          &ldquo;Every action passes through an allowlist you can print&rdquo; is the novel claim, it
          sidesteps the hype objection entirely, and it is the part that is genuinely hard to build.
        </p>
      </KeyTakeaways>

      <H2 id="reality" text="Why you are having this conversation" />
      <p>
        Someone on your team is already using one of these. They are not using it because they read a
        blog post; they are using it because it answered a question about an unfamiliar service in
        thirty seconds that would otherwise have cost them an afternoon of reading. That usage is
        going to appear in your repo whether or not you approve it, and &ldquo;prohibit it&rdquo; is not
        an outcome available to you.
      </p>
      <p>
        So the real decision is not whether your organisation adopts a terminal coding agent. It is
        whether that adoption is governed or accidental. Those are very different positions to be in
        eighteen months from now, and choosing between them is cheap this month.
      </p>
      <Callout title="The honest framing for the opening">
        <p>
          &ldquo;I want to show you something and then argue against it, because there are three
          reasons not to adopt this and I think two of them are good ones. If you disagree with my
          ranking, that&rsquo;s the useful conversation.&rdquo;
        </p>
      </Callout>

      <H2 id="q1" text="Question one: what can it actually do to my repository?" />
      <p>
        This is not a soft question, so do not answer it with reassurance. Answer it with the mode
        table and let them interrogate it.
      </p>
      <CodeBlock
        label="src/shared/schemas/mode.js"
        code={`export function isToolAllowedInMode(toolName, mode) {
  if (mode === Mode.BUILD || mode === Mode.SWE) return true;

  if (mode === Mode.PLAN || mode === Mode.REVIEW || mode === Mode.SCAN) {
    return isReadOnlyTool(toolName) || toolName === 'diffFile';
  }

  if (mode === Mode.FIX) {
    // FIX mode: read + write tools, but no shell
    return toolName !== 'bash' && toolName !== 'runTests';
  }

  return true;
}`}
      />
      <p>
        Then hand them the one command that makes it checkable, because the answer to &ldquo;can I
        trust this&rdquo; is a query they can run themselves:
      </p>
      <CodeBlock
        label="terminal"
        code={`$ node -e "
  const { isToolAllowedInMode } = await import('./src/shared/schemas/mode.js');
  const tools = ['readFile','grep','writeFile','editFile','bash','runTests'];
  console.log('tool'.padEnd(12), ['PLAN','FIX','BUILD'].map(m=>m.padEnd(6)).join(''));
  for (const t of tools) {
    console.log(t.padEnd(12),
      ['PLAN','FIX','BUILD'].map(m => (isToolAllowedInMode(t,m)?'yes':'no ').padEnd(6)).join(''));
  }
"
tool         PLAN   FIX    BUILD
readFile     yes    yes    yes
grep         yes    yes    yes
writeFile    no     yes    yes
editFile     no     yes    yes
bash         no     no     yes
runTests     no     no     yes`}
      />
      <p>
        Thirty lines of source, printed on demand, no documentation required. That is the whole answer
        to question one, and it lands better than any policy document because it is verifiable in the
        room.
      </p>

      <H2 id="q2" text="Question two: what stops it running something harmful?" />
      <p>
        Three layers, and the order matters as much as the existence. Say the order out loud, because
        &ldquo;there are checks&rdquo; is not an answer while &ldquo;the mode gate runs first, and it is the
        only one the model cannot influence&rdquo; is.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Mode gate.</strong> The only control the model has no
          influence over, because the loop dispatches the tool, not the model.
        </li>
        <li>
          <strong className="text-paper">Risk ledger.</strong> Grades the{" "}
          <em>shape</em> of each shell command against what this repository has already approved. A
          session grant for <code className="font-mono text-[13px]">git commit</code> never authorises{" "}
          <code className="font-mono text-[13px]">git push --force</code>.
        </li>
        <li>
          <strong className="text-paper">Blast-radius gate.</strong> Challenges the first write to a
          migration, CI workflow, lockfile, infrastructure or auth path once per turn, demanding a
          justifying file:line and an exact rollback.
        </li>
        <li>
          <strong className="text-paper">The interactive prompt</strong>, for anything not already
          proven safe here.
        </li>
      </ol>
      <p>And the four commands they will actually want:</p>
      <CodeBlock
        label="terminal"
        code={`# what has this repo learned?
sentinel risk --list

# how does this specific command grade, right now?
sentinel risk "npm publish"
sentinel risk "git push --force origin main"

# what does the agent think it has already proven?
sentinel budget`}
      />

      <H2 id="q3" text="Question three: what does it cost, and who pays?" />
      <p>
        The question that decides budgets, and the one every non-technical stakeholder asks first. The
        answer is that cost is a first-class, persisted, capped quantity &mdash; not a surprise on an
        invoice.
      </p>
      <CodeBlock
        label="terminal"
        code={`$ sentinel budget --usd 25 --deadline 2h --condition "npm test exits 0"
Engagement budget set in .sentinel/budget.json:
  budget     $25.00
  deadline   2026-10-16T18:00:00.000Z (1h 59m left)
  condition  npm test exits 0
  since      2026-10-16T16:00:00.000Z

$ sentinel budget
active  ████████░░░░░░░░░░░░  $6.12 of $25.00 (24%), 1h 58m left
  budget     $25.00
  remaining  $18.88
  spent      $6.1184 over 7 turn(s) this engagement
  lifetime   $41.02 over 23 turn(s) (.sentinel/spend.jsonl)`}
      />
      <p>
        Two things to point out, because both are what turns a wary lead into a sponsor. First,{" "}
        <strong>the ceiling is enforced, not advisory</strong>: the loop stops hard when the budget is
        exhausted, and setting it once gates every later run. Second,{" "}
        <strong>the default model is a free tier</strong>, so most usage costs nothing at all &mdash;
        which is a fact you can demonstrate in thirty seconds rather than argue for.
      </p>

      <H2 id="three-reasons" text="Now the part that wins: argue against it" />
      <p>
        Give the three reasons not to adopt. Rank them honestly. This is the move that separates a
        proposal a lead trusts from one they tolerate, because a lead who finds the objection you
        buried is now checking all your other claims.
      </p>
      <CompareTable
        caption="Three reasons not to adopt, ranked honestly"
        head={["Reason", "Verdict", "What to say"]}
        rows={[
          [
            "The model can be confidently wrong",
            "Real, and not solved by anything on this list",
            "The controls reduce blast radius; they do not improve judgement. This is why the permission model is code and not a prompt — but do not oversell it",
          ],
          [
            "It will train people to accept unreviewed writes",
            "Real, and a team-level risk rather than a tool risk",
            "The interactive prompt is per-tool, and the gate is per-path. The mitigation is reviewing diffs as a habit, which no tool can do for you",
          ],
          [
            "A tool with shell access on a production repo is a supply-chain risk",
            "Legitimate, and the one to resolve before deploying",
            "Offer FIX mode for unattended work — edits with no shell — and run the pilot on a repository with a working restore procedure",
          ],
        ]}
      />
      <Callout title="Rank your objections by how much they actually matter">
        <p>
          If your first objection is the vendor and your third is that the model hallucinates, you have
          told the lead your priorities are the wrong way round. Most people rank them in reverse,
          because the first one is easier to say out loud.
        </p>
      </Callout>

      <H2 id="pilot" text="The proposal that gets accepted" />
      <p>
        Not &ldquo;let everyone try it&rdquo;. A pilot with a success criterion and a kill switch, narrow
        enough to be obviously reversible.
      </p>
      <CodeBlock
        label="the ask"
        code={`Repository:   one service, restore-from-backup verified in the last 30 days
Mode:        PLAN only (read-only). No writes, so the failure mode is
             a wasted afternoon, not an incident.
Owner:       one named engineer, who is also the person who reports back
Duration:    two weeks
Measured:    (a) unfamiliar-codebase questions answered without help
             (b) hours spent on those questions before, from git history
             (c) zero writes — trivially true, and stated anyway so it is checked

Kill switch: delete .sentinel/ and remove the binary. No server, no database,
             no data to migrate out.`}
      />
      <Callout title="The sentence that does the most work">
        <p>
          &ldquo;There is no server and no database, so if this goes badly the cleanup is{" "}
          <code className="font-mono text-[13px]">rm -rf ~/.sentinel</code>.&rdquo; It reframes the
          whole decision from &ldquo;can we afford to be wrong&rdquo; to &ldquo;how quickly can we be
          wrong&rdquo;, which is a much easier question to answer yes to.
        </p>
      </Callout>

      <H2 id="undisqualify" text="Who should not adopt this" />
      <p>
        Being useful means disqualifying people, and this is where credibility is actually earned.
        If any of these are true, say so and stop:
      </p>
      <ul className="list-disc space-y-2 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">
            Your security team requires centrally reviewed, logged agent access.
          </strong>{" "}
          This tool has no team dashboard, no SSO and no audit log. That is a platform product and you
          want one. Claiming otherwise is how you lose the room.
        </li>
        <li>
          <strong className="text-paper">
            Nobody on the team scripts, and the whole team lives inside one editor.
          </strong>{" "}
          You will lose time before you gain any.
        </li>
        <li>
          <strong className="text-paper">
            An API key on a laptop is a policy violation.
          </strong>{" "}
          That decision was made before you installed anything. A local model does not change it, and
          should not be offered as if it does.
        </li>
        <li>
          <strong className="text-paper">
            The team wants it to work unattended on unreviewed changes, tonight.
          </strong>{" "}
          Not this. Not yet, and probably not this tool.
        </li>
      </ul>
      <p>
        None of those make the tool bad. They make it a different product for a different team, and
        saying so out loud is what makes the rest of your argument credible.
      </p>

      <H2 id="finish" text="The close" />
      <p>Three things, in this order:</p>
      <ol className="list-decimal space-y-2 pl-5 text-muted marker:text-moss">
        <li>
          <strong className="text-paper">Read the mode table with them.</strong> Not the README, not
          the blog post. Thirty lines they can interrogate.
        </li>
        <li>
          <strong className="text-paper">Show the refusals.</strong> Ask it to fix something in read-only
          mode and let them watch it explain what it would do and decline. A tool you have watched say
          no is trusted differently from a tool you have been told says no.
        </li>
        <li>
          <strong className="text-paper">Name the pilot, not the rollout.</strong> One repository, one
          owner, read-only, two weeks, three measurements.
        </li>
      </ol>
      <p>
        That is the whole argument, and it does not require you to claim the model is reliable. It
        requires you to show that every action passes through a boundary the team can read, that the
        cost is capped, and that turning it off is one command. Those are claims a sceptical engineer
        can verify in an afternoon, which is exactly what you want when you are asking someone to
        change how they work.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What if the tech lead's objection is fundamentally about trust in vendors?",
            a: "Then it is not an objection you should argue away, because it may be correct for your context — regulated data, a contractual no-training requirement, a procurement process that takes six months. The answer that works is to show what the agent looks like with a local model: point it at Ollama or LM Studio and no request leaves the machine. That does not satisfy a vendor objection about the model, but it satisfies the operational one, which is usually the real blocker, and it lets the conversation move to tooling where you have actual leverage.",
          },
          {
            q: "How do I pitch this to someone who has been burned by an AI tool before?",
            a: "Do not pitch it as AI. Pitch it as a permission system, because that is what they actually need to govern, and what they have no equivalent for today. The interesting claim is not 'the model is smart' — it is 'every action this tool takes passes through an allowlist I can print and read'. That framing sidesteps the hype objection entirely, and it happens to be the part of the system that is hardest to build well.",
          },
          {
            q: "What if they want a pilot?",
            a: "Good — agree immediately and make it concrete, because a pilot is the only thing that settles this argument. The mistake is proposing a time-boxed trial without a success criterion, which just delays the decision. Propose instead: one repository, one named owner, PLAN mode only for two weeks, with three things measured — questions answered without help, time saved on unfamiliar-codebase tasks, and zero writes outside the pilot repository. A pilot that cannot fail is not a pilot.",
          },
        ]}
      />

      <Cta
        title="That is the course"
        body="Twelve parts, from an empty directory to a governed agent with a cost ceiling. The code is MIT licensed and every command in it is one you can run."
        href="/series/cursor-cli-course"
        cta="Back to part 1"
      />

      <p className="text-sm text-muted">
        The comparison against AI IDEs and hosted agents is on{" "}
        <Link href="/compare" className="text-moss underline-offset-4 hover:underline">
          the compare page
        </Link>
        , and the mode reference is in{" "}
        <Link href="/docs/modes" className="text-moss underline-offset-4 hover:underline">
          docs/modes
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
