import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "terminal-cli-commander",
  title: "Building the command surface with Node.js and Commander",
  metaTitle: "Build a Node.js CLI With Commander",
  description:
    "How to build a real CLI command surface with Commander: subcommands, variadic arguments, flag descriptions, exit codes, and the small conventions that make a CLI worth typing twice.",
  date: "2026-10-06",
  readingMinutes: 11,
  tags: ["Tutorial", "Node.js", "CLI"],
  keyword: "nodejs cli commander",
  series: { slug: "cursor-cli-course", order: 2 },
  related: ["chalk-figlet-terminal-banner", "cursor-cli-course-overview", "mcp-server-for-coding-agents"],
  faq: [
    {
      q: "Why use Commander instead of parsing process.argv myself?",
      a: "Because the help text and the parser must not disagree. With Commander, the declaration that makes `--budget <usd>` required to have a value is the same declaration that generates the `--help` line, so the two cannot drift. Hand-rolled argv parsing works right up until someone adds a flag to one place and forgets the other, which is the single most common way a CLI becomes untrustworthy.",
    },
    {
      q: "Should every action be its own subcommand?",
      a: "One line of test: if a user could plausibly want two of them in one invocation, they are one command. `sentinel risk 'git push'` and `sentinel risk 'npm publish'` are the same command with a different argument, not two commands. Splitting by argument rather than by verb produces a command list nobody can hold in their head.",
    },
    {
      q: "How should a CLI signal failure?",
      a: "Exit non-zero, print the reason to stderr, and keep stdout clean. That contract is what lets `sentinel ask ... || echo failed` and `sentinel doctor && sentinel ask ...` work at all. It is also what makes the tool scriptable into someone else's CI without a wrapper, which is the difference between a demo and a tool.",
    },
    {
      q: "Where do I put shared flag definitions?",
      a: "In a function, not a constant. Commander options carry state, once you attach them to a command, reusing the same Option instance across commands causes subtle leakage. A factory that returns fresh options per command costs three lines and removes the entire class of bug.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Commander is worth using for one reason above all others:{" "}
          <strong>the parser and the help text are the same declaration</strong>, so they cannot
          disagree. Everything else is convenience.
        </p>
        <p>
          Two conventions do most of the work.{" "}
          <strong>stdout is data, stderr is everything else</strong> &mdash; so answers can be piped
          while progress, costs and warnings stay visible. And <strong>exit codes are the API</strong>:
          zero means the tool did what you asked, anything else means it did not.
        </p>
      </KeyTakeaways>

      <H2 id="setup" text="Ten minutes to a working skeleton" />
      <p>
        This part needs no model access and no API key. By the end you have a command that parses
        correctly, lies to you nowhere, and exits with codes a shell can act on.
      </p>
      <CodeBlock
        label="terminal"
        code={`mkdir owl && cd owl
npm init -y
npm install commander
node -e "const p=require('./package.json');p.type='module';p.bin={owl:'bin/owl.js'};require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
mkdir bin src/agent`}
      />
      <p>
        <code className="font-mono text-[13px]">"type": "module"</code> is not optional decoration.
        Everything in this course is ESM, and mixing{" "}
        <code className="font-mono text-[13px]">require</code> with{" "}
        <code className="font-mono text-[13px]">import</code> in one project is a class of error you
        do not want to meet while debugging an agent loop.
      </p>

      <H2 id="program" text="The program object" />
      <p>
        Start at the top, because the first three decisions are the ones you will not revisit
        cheaply: the name, whether the version comes from one place, and which command runs with no
        arguments.
      </p>
      <CodeBlock
        label="bin/owl.js"
        code={`#!/usr/bin/env node
/**
 * owl, a terminal coding agent.
 *
 *   owl                 interactive chat (the default command)
 *   owl ask "..."       one-shot question, streamed answer
 *   owl doctor          pre-flight checks
 *   owl -V, --version
 */
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// One source of truth for the version. Reading package.json beats a second
// literal that drifts on the first release you cut from a tag.
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const program = new Command();

program
  .name('owl')
  .description('An AI coding agent for the terminal')
  .version(VERSION, '-V, --version', 'output the version number');

// isDefault means "run this when no subcommand is given", which is how you get
// \`owl\` to start a chat while \`owl --help\` still works.
program
  .command('chat', { isDefault: true })
  .description('Start an interactive chat')
  .action(async () => {
    const { runChat } = await import('../src/agent/chat.js');
    await runChat();
  });`}
      />
      <Callout title="Dynamic imports are not premature cleverness here">
        <p>
          Each action loads its own module. For a CLI this buys real startup time &mdash;{" "}
          <code className="font-mono text-[13px]">owl doctor</code> does not pay to parse the agent
          loop &mdash; and it keeps a crash in one command from taking down the others, because the
          failing module never got imported by the others.
        </p>
      </Callout>

      <H2 id="ask" text="The one command that matters: variadic arguments" />
      <p>
        Users will type quoted and unquoted prompts interchangeably. If you declare{" "}
        <code className="font-mono text-[13px]">&lt;question&gt;</code> singular, then{" "}
        <code className="font-mono text-[13px]">owl ask why is this test failing</code> loses
        everything after the first word. Variadic plus a join is the fix, and it takes one line.
      </p>
      <CodeBlock
        label="bin/owl.js"
        code={`program
  .command('ask [question...]')
  .description('Ask a question and stream the answer (read-only by default)')
  .option('-m, --model <id>', 'Model id (defaults to the cheap one)')
  .option('-b, --build', 'Allow file edits and shell commands')
  .option('-y, --yes', 'Auto-approve tools; destructive commands are still denied')
  .option('-q, --quiet-cost', 'Do not print the token/cost summary')
  .option('--budget <usd>', 'Stop the turn once it has cost this much USD')
  .action(async (questionParts, options) => {
    const question = (questionParts || []).join(' ').trim();
    if (!question) {
      // Usage errors go to stderr and exit 1: a pipeline should not consume
      // this, and a shell \`||\` should fire.
      console.error('Usage: owl ask "your question"');
      process.exit(1);
    }

    // PLAN by default. Read-only is not a setting the user has to remember.
    const mode = options.build ? 'BUILD' : 'PLAN';

    const { runAgentTurn } = await import('../src/agent/loop.js');
    for await (const ev of runAgentTurn({ question, mode, model: options.model })) {
      if (ev.event === 'text') process.stdout.write(ev.data.delta);
      else if (ev.event === 'tool_call') process.stderr.write(\`\\x1b[2m→ \${ev.data.toolName}\\x1b[0m\\n\`);
      else if (ev.event === 'finish') {
        process.stderr.write(\`\\x1b[2m\${ev.data.usage.inputTokens} in / \${ev.data.usage.outputTokens} out\\x1b[0m\\n\`);
      } else if (ev.event === 'error') {
        console.error(\`\\x1b[31m\${ev.data.message}\\x1b[0m\`);
        process.exitCode = 1;
      }
    }
  });`}
      />
      <p>
        Note the separation: <code className="font-mono text-[13px]">delta</code> goes to stdout, and
        everything else goes to stderr. That is not pedantry. It means this works:
      </p>
      <CodeBlock
        label="terminal"
        code={`# pipe the answer somewhere, still see progress and cost
owl ask "what does src/agent/loop.js do?" > answer.md

# fail the script if the turn errored
owl ask -b "fix the typo" || echo "the agent did not finish"`}
      />

      <H2 id="exit-codes" text="Exit codes are the API" />
      <p>
        This is the part tutorials skip and users depend on. Three rules, applied consistently:
      </p>
      <CompareTable
        caption="Exit code conventions for a coding agent CLI"
        head={["Code", "Meaning", "When"]}
        rows={[
          ["0", "The tool did what you asked", "Answer printed, goal verified, all pre-flight checks passed"],
          ["1", "It did not", "Provider error, a failed check, a write the mode forbids"],
          ["2", "You asked for something impossible", "No question given, mutually exclusive flags"],
          [
            "124",
            "It ran out of time",
            "Reserved to match timeout(1), so a caller can distinguish it from a real failure",
          ],
        ]}
      />
      <p>
        There is a subtlety worth copying:{" "}
        <code className="font-mono text-[13px]">process.exitCode = 1</code> rather than{" "}
        <code className="font-mono text-[13px]">process.exit(1)</code> inside the loop.{" "}
        <code className="font-mono text-[13px]">process.exit()</code> kills the process immediately,
        which truncates buffered stdout &mdash; you lose the last few hundred characters of the
        answer on exactly the turns you most wanted to read.
      </p>

      <H2 id="flags" text="Flag hygiene" />
      <p>
        Four conventions that cost nothing and make a CLI feel considered.
      </p>
      <H3 id="f1" text="Short flags for what you type, long flags for scripts" />
      <p>
        <code className="font-mono text-[13px]">-m</code> for model because you will type it dozens of
        times; <code className="font-mono text-[13px]">--budget</code> spelled out because it will
        appear in a CI file someone else reads. Never make the short form the only form.
      </p>
      <H3 id="f2" text="requiredOption fails before your handler runs" />
      <CodeBlock
        label="bin/owl.js"
        code={`program
  .command('verify [task...]')
  .requiredOption('-c, --check <cmd>', 'Command that must exit 0 for the work to be accepted')
  .action(async (taskParts, options) => {
    // Commander has already exited 1 with a usage message if --check is missing.
  });`}
      />
      <H3 id="f3" text="Build flags in a function, never a shared constant" />
      <CodeBlock
        label="bin/owl.js"
        code={`// Wrong: the same Option instance attached to two commands leaks state.
const BUDGET = new Option('--budget <usd>', 'cap the spend');

// Right: fresh options per command.
function budgetOption() {
  return new Option('--budget <usd>', 'cap the spend for this run').default('1.00');
}`}
      />
      <H3 id="f4" text="Describe the flags that change what is allowed" />
      <p>
        <code className="font-mono text-[13px]">--yes</code> is the flag that needs the most care in
        its help text, because it is the one that removes a gate. Write what it does{" "}
        <em>not</em>: &ldquo;With <code className="font-mono text-[13px]">--build</code>:
        auto-approve tools including the shell; destructive commands are still denied.&rdquo; A user
        reading only <code className="font-mono text-[13px]">--help</code> should not be able to
        misunderstand it.
      </p>

      <H2 id="verify" text="Check it works" />
      <CodeBlock
        label="terminal"
        code={`# the version is read from package.json, so it cannot drift
owl -V

# --help is generated from the declarations above
owl --help
owl ask --help

# a usage error must be non-zero and must not pollute stdout
owl ask; echo "exit=$?"`}
      />
      <p>
        That last one is the test. If it prints{" "}
        <code className="font-mono text-[13px]">exit=0</code>, your exit handling is wrong and every
        script that wraps this tool is silently lying.
      </p>

      <H2 id="next" text="What part 3 adds" />
      <p>
        You have a correct command surface that tells you nothing about whether it works. Part 3
        makes it look like a tool people keep open &mdash; a banner, a spinner, colours that
        disappear when you pipe &mdash; which is unglamorous and disproportionately effective, because
        a CLI that looks broken gets abandoned before anyone discovers its features.
      </p>
      <p>
        Then part 4 adds <code className="font-mono text-[13px]">doctor</code>, which is the command
        that turns &ldquo;why is this not working?&rdquo; from a guess into a list.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why use Commander instead of parsing process.argv myself?",
            a: "Because the help text and the parser must not disagree. With Commander, the declaration that makes `--budget <usd>` required to have a value is the same declaration that generates the `--help` line, so the two cannot drift. Hand-rolled argv parsing works right up until someone adds a flag to one place and forgets the other, which is the single most common way a CLI becomes untrustworthy.",
          },
          {
            q: "Should every action be its own subcommand?",
            a: "One line of test: if a user could plausibly want two of them in one invocation, they are one command. `sentinel risk 'git push'` and `sentinel risk 'npm publish'` are the same command with a different argument, not two commands. Splitting by argument rather than by verb produces a command list nobody can hold in their head.",
          },
          {
            q: "How should a CLI signal failure?",
            a: "Exit non-zero, print the reason to stderr, and keep stdout clean. That contract is what lets `sentinel ask ... || echo failed` and `sentinel doctor && sentinel ask ...` work at all. It is also what makes the tool scriptable into someone else's CI without a wrapper, which is the difference between a demo and a tool.",
          },
          {
            q: "Where do I put shared flag definitions?",
            a: "In a function, not a constant. Commander options carry state, once you attach them to a command, reusing the same Option instance across commands causes subtle leakage. A factory that returns fresh options per command costs three lines and removes the entire class of bug.",
          },
        ]}
      />

      <Cta
        title="Continue with part 3"
        body="Make it look like a tool people keep open: a banner, a spinner, and colour that respects a pipe."
        href="/blog/chalk-figlet-terminal-banner"
        cta="Part 3: the banner"
      />

      <p className="text-sm text-muted">
        Prefer to read the finished version?{" "}
        <Link href="/docs/development" className="text-moss underline-offset-4 hover:underline">
          The development guide
        </Link>{" "}
        covers lint, typecheck and the release check that gates a publish.
      </p>
    </>
  ),
} satisfies Post;
