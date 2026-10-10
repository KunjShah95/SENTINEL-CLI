import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "blast-radius-gate",
  title: "The gate that asks for a rollback before the write lands",
  metaTitle: "Blast-Radius Gate for AI Agent Writes",
  description:
    "How to make an AI agent justify writes to sensitive paths: detect blast centres from path patterns, block once per path per turn, and demand a file:line plus an exact rollback.",
  date: "2026-10-14",
  readingMinutes: 12,
  tags: ["Tutorial", "Security", "Guardrails"],
  keyword: "blast radius gate ai agent",
  series: { slug: "cursor-cli-course", order: 10 },
  related: ["risk-ledger-command-shapes", "ai-coding-agent-guardrails", "ai-agent-file-permissions"],
  faq: [
    {
      q: "What is a blast centre?",
      a: "A file where a small edit has an outsized effect and a rollback is rarely just 'revert'. Database migrations, CI workflows, lockfiles, schema definitions, infrastructure and cluster config, environment secrets, and auth or billing code. The defining property is asymmetry: editing a typo in a README is cheap to get wrong, editing a migration can cost you a production database, and that difference should be visible in how the tool treats them.",
    },
    {
      q: "Why block once rather than on every write?",
      a: "Because a gate that fires every time trains people to disable it, and a disabled gate is worse than no gate because you stop looking for it. Challenging a legitimate multi-file migration once per path per turn is enough, the agent states its justification, a human reads it, and the rest of the turn proceeds. The state is per-turn deliberately: a path challenged on Monday is not challenged again on Tuesday, but a new turn re-asks, so nothing is grandfathered across days.",
    },
    {
      q: "How do you detect a sensitive path?",
      a: "Two signals, and both are cheap. The primary one is path patterns: a table of regexes covering migrations, .sql files, .github/workflows, Dockerfiles and Makefiles, lockfiles, schema definitions, auth and billing filenames, .env, terraform/infra and k8s. The secondary signal is your own onboarding survey (high churn with no test coverage), which you already computed and can reuse. Sentinel keeps the second one opt-in and unwired, because running the survey shells out to git twice and paying that on every write would be a performance regression for a marginal signal.",
    },
    {
      q: "Does blocking actually make the agent behave differently?",
      a: "Yes, and for a reason worth understanding: the block is returned as a tool result, so the model reads it as an observation and its next move must include the justification. That converts a silent, plausible edit into a stated one with evidence attached, and it puts a human-readable record of the reasoning into the transcript. The gate does not verify the justification is correct (a regex cannot do that) it verifies that one was offered, which is the part that is mechanically checkable.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Modes and the risk ledger both answer{" "}
          <strong>&ldquo;may it?&rdquo;</strong>{" "}
          This part answers a third question:{" "}
          <strong>&ldquo;how bad would it be if this were wrong?&rdquo;</strong>{" "}
          A gate for writes where the answer is &ldquo;very&rdquo; &mdash; migrations, CI, lockfiles,
          infrastructure, auth.
        </p>
        <p>
          It blocks <strong>once per path per turn</strong>, not once per write. A gate that fires every
          time trains people to switch it off, and a switched-off gate is worse than none because you
          stop noticing it. The block comes back as a tool result, so the model must{" "}
          <strong>state a justifying file:line and an exact rollback</strong> before retrying.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="The gap between modes and the ledger" />
      <p>
        You now have two controls, and they are answering different questions:
      </p>
      <CompareTable
        caption="Three controls, three axes, composed"
        head={["Control", "Question it answers", "State it keeps"]}
        rows={[
          ["Permission modes", "Is this tool allowed at all?", "Nothing, a static allowlist"],
          ["Risk ledger", "Has this kind of command earned trust here?", "Per repository, per shape"],
          ["Blast radius", "How bad is it if this specific write is wrong?", "Per turn, per path"],
        ]}
      />
      <p>
        The gap is consequence. Both existing controls treat{" "}
        <code className="font-mono text-[13px]">writeFile</code> as one thing, whether the target is a
        comment in a test fixture or a migration that will run against production.
      </p>
      <p>
        So consider a real sequence. The agent is in BUILD mode, so writes are allowed. It has run{" "}
        <code className="font-mono text-[13px]">npm test</code> twice, so that shape is green and never
        prompts. It is now about to rewrite{" "}
        <code className="font-mono text-[13px]">migrations/0042_add_users_index.sql</code>:
      </p>
      <CodeBlock
        label="terminal"
        code={`→ editFile       src/auth/session.js
→ runTests       npm test
→ writeFile      migrations/0042_add_users_index.sql     ← no prompt. mode allows it.
                                                        ← no prompt. nothing special about the path.`}
      />
      <p>
        And now a production database has an index on it, added by a model, in a turn where the human
        was watching test output rather than SQL. Nothing went wrong that the tool could have detected
        on its own. That is the problem this gate exists for, and stating it plainly is the point:{" "}
        <strong>the fix is to make the human notice</strong>, not to prevent the edit.
      </p>

      <H2 id="detect" text="Detecting a blast centre" />
      <p>
        A table of patterns, and nothing cleverer. The list is deliberately explicit because the cost
        of a false positive is one extra question and the cost of a false negative is a production
        incident.
      </p>
      <CodeBlock
        label="src/agent/blast-radius.js"
        code={`/** Path shapes where a small edit has an outsized blast radius. */
const SENSITIVE_PATTERNS = [
  [/(^|\\/)(migrations?|alembic|db\\/migrate)(\\/|$)/i, 'database migration'],
  [/\\.(sql)$/i, 'raw SQL'],
  [/(^|\\/)\\.github\\/workflows\\//i, 'CI workflow, this gates every merge'],
  [/(^|\\/)(Dockerfile|docker-compose[^/]*|Makefile)$/i, 'build or deploy definition'],
  [/(^|\\/)(package-lock\\.json|yarn\\.lock|pnpm-lock\\.yaml|Cargo\\.lock|go\\.sum|poetry\\.lock)$/i, 'lockfile'],
  [/(^|\\/)(schema\\.(prisma|sql|graphql)|.*\\.schema\\.(json|ts))$/i, 'schema definition'],
  [/(^|\\/)(auth|authentication|login|session|billing|payments?|permissions?|rbac|security)[^/]*\\.[a-z]+$/i, 'auth / billing / permissions code'],
  [/(^|\\/)(auth|authentication|billing|payments?|permissions?|rbac|security)[^/]*\\/[^/]*$/i, 'auth / billing / permissions code'],
  [/(^|\\/)\\.sentinel\\/config\\.ya?ml$|(^|\\/)sentinel\\.ya?ml$/i, 'the project\\'s own permission config'],
  [/(^|\\/)\\.env(\\.|$)/i, 'environment secrets'],
  [/(^|\\/)(terraform|infra)\\//i, 'infrastructure definition'],
  [/(^|\\/)k8s\\//i, 'cluster definition'],
];`}
      />
      <p>
        Two entries deserve comment. The{" "}
        <code className="font-mono text-[13px]">.sentinel/config.yaml</code> entry is the sharpest: a
        repository could contain a file that rewrites its own agent&rsquo;s permissions, and an agent
        that can edit that file is an agent that can disable its own gate. And the two auth patterns
        exist because{" "}
        <code className="font-mono text-[13px]">auth/session.ts</code> and{" "}
        <code className="font-mono text-[13px]">auth.ts</code> are the same directory in two common
        layouts &mdash; one pattern for the filename, one for the directory.
      </p>

      <H2 id="targets" text="Finding every path in one call" />
      <p>
        A write tool can touch several files at once, so the gate has to enumerate targets across all
        four write shapes rather than looking at one{" "}
        <code className="font-mono text-[13px]">path</code> field.
      </p>
      <CodeBlock
        label="src/agent/blast-radius.js"
        code={`/** Every path a single tool call would write. */
export function targetPaths(toolName, input) {
  if (!input) return [];
  if (toolName === 'writeFile' || toolName === 'editFile') {
    return input.path ? [String(input.path)] : [];
  }
  if (toolName === 'batchEdit') {
    return (input.operations || []).map((o) => o?.filePath).filter(Boolean).map(String);
  }
  if (toolName === 'applyPatch') {
    // A unified diff names its targets in the +++ b/ headers.
    return [...String(input.patch || '').matchAll(/^\\+\\+\\+ b\\/(.+)$/gm)].map((m) => m[1]);
  }
  return [];
}

/** Whether one path is a blast centre, and why. */
export function classifyTarget(path) {
  const p = String(path || '').replace(/\\\\/g, '/');
  const reasons = [];
  for (const [re, why] of SENSITIVE_PATTERNS) if (re.test(p)) reasons.push(why);
  return { path: p, sensitive: reasons.length > 0, reasons };
}`}
      />
      <p>
        Normalising backslashes to forward slashes first is not cosmetic. Without it,{" "}
        <code className="font-mono text-[13px]">.github\\workflows\\ci.yml</code> &mdash; which is what
        a Windows agent will produce &mdash; matches nothing, and the single most important pattern in
        the table silently stops working for every Windows user.
      </p>

      <H2 id="once" text="Blocking once, and why that is the hard part" />
      <CodeBlock
        label="src/agent/blast-radius.js"
        code={`/**
 * Per-turn gate state. \`asked\` records what has already been challenged so the
 * gate blocks once per path per turn, not once per write.
 */
export function createGateState() {
  return { asked: new Set(), justified: false };
}

/**
 * @param surveyed optional set of paths the onboarding survey flagged as
 *   high-churn-with-no-tests. Deliberately opt-in and NOT wired into the loop:
 *   \`analyzeRepo\` shells out to git twice, and paying that on every write
 *   would be a performance regression to buy a marginal extra signal.
 * @returns {null | { block: true, reason: string }}. Null means the write may
 *   proceed. A block is a request for a justification, not a refusal.
 */
export function checkBlastRadius({ toolName, input, state, surveyed = null }) {
  const radius = blastRadius(toolName, input);
  const extra = surveyed
    ? targetPaths(toolName, input)
      .map((p) => String(p).replace(/\\\\/g, '/'))
      .filter((p) => surveyed.has(p))
      .map((p) => ({ path: p, reasons: ['flagged by \`sentinel onboard\`: high churn, no test covers it'] }))
    : [];
  const targets = [...radius.targets, ...extra.filter((t) => !radius.targets.some((r) => r.path === t.path))];

  if (!targets.length) return null;

  // First time this turn for any of these paths: challenge once, listing all
  // of them. A batch edit touching three risky files gets one question.
  const firstTime = targets.some((t) => !state.asked.has(t.path));
  if (!firstTime) return null;

  for (const t of targets) state.asked.add(t.path);
  return { block: true, reason: justificationPrompt({ targets }) };
}`}
      />
      <Callout title="Why the state is per-turn and not persisted">
        <p>
          Because a gate that remembers across days is a gate that eventually remembers everything. The
          state object is created fresh in <code className="font-mono text-[13px]">runAgentTurnInner
          </code> and dies with the turn, so Monday&rsquo;s approval does not grandfather Tuesday&rsquo;s
          migration. If you disagree with that and want a longer memory, the honest place to put it is
          the risk ledger from part 9 &mdash; which is explicit, inspectable and forgettable &mdash;
          rather than hidden in a gate.
        </p>
      </Callout>

      <H2 id="prompt" text="The prompt, and what it actually asks for" />
      <p>
        The block text is the product. It asks for the two things an engineer states out loud before
        touching a file they do not own.
      </p>
      <CodeBlock
        label="src/agent/blast-radius.js"
        code={`/**
 * The prompt injected the first time a turn touches something risky. It asks
 * for the two things an FDE states out loud, and both are checkable by a human
 * reading the transcript.
 */
export function justificationPrompt(radius) {
  const L = ['Before this change lands, state two things, this path is a blast centre:'];
  for (const t of radius.targets) L.push(\`  - \\\`\${t.path}\\\` (\${t.reasons.join('; ')})\`);
  L.push('');
  L.push('1. JUSTIFICATION. The file:line that shows why this change is correct, read before you edited.');
  L.push('2. ROLLBACK. The exact command or edit that undoes it if it is wrong.');
  L.push('');
  L.push('Then repeat the same tool call. Do not paraphrase the change; state the evidence.');
  return L.join('\\n');
}

/** True when the assistant's text carries an explicit justification + rollback. */
export function looksJustified(text) {
  const t = String(text || '');
  return /\\b(justif|rollback|roll back|blast radius|undo|revert)\\w*\\b/i.test(t)
    && /[:\\n]/.test(t);
}`}
      />
      <p>And here is what that looks like in a real turn:</p>
      <CodeBlock
        label="terminal"
        code={`→ writeFile      migrations/0042_add_users_index.sql

  Before this change lands, state two things, this path is a blast centre:
    - migrations/0042_add_users_index.sql (database migration; raw SQL)

  1. JUSTIFICATION. Src/db/users.js:214 queries users by email on every
     login, and without an index that is a sequential scan over the whole
     table. I read it before editing.
  2. ROLLBACK. \`DROP INDEX CONCURRENTLY idx_users_email;\` on the same
     database. No data loss; the index is derived state.

→ writeFile      migrations/0042_add_users_index.sql   ← now permitted`}
      />
      <Callout title="Notice what the gate did not do">
        <p>
          It did not verify the justification. A regex cannot check whether{" "}
          <code className="font-mono text-[13px]">src/db/users.js:214</code> is the right line, and
          pretending otherwise would be dishonest. What it did do is make a human-readable record of
          the reasoning exist in the transcript, attached to a path that now looks risky in a review.
          That is the mechanically checkable half of the problem, and it is the half worth solving.
        </p>
      </Callout>

      <H2 id="wiring" text="Where it sits in the gate order" />
      <CodeBlock
        label="src/agent/loop.js"
        code={`  if (!isToolAllowedInMode(tc.name, mode)) {
    return { output: { error: \`Tool \${tc.name} is not available in \${mode} mode\` } };
  }

  const builtin = builtinPreToolUseGuard(tc.name, tc.input);
  if (builtin?.block) return { output: { error: builtin.reason } };
  const hookBlock = await runHooks('preToolUse', { toolName: tc.name, input: tc.input, mode });
  if (hookBlock?.block) return { output: { error: hookBlock.reason } };

  // Blast-radius gate: the first write to a migration, a CI workflow, a
  // lockfile, auth code, and friends is refused once with the justification
  // and rollback spelled out. Blocks per path per turn, so a legitimate
  // multi-file change is challenged once rather than on every write.
  if (gateState) {
    const radius = checkBlastRadius({ toolName: tc.name, input: tc.input, state: gateState });
    if (radius?.block) return { output: { error: radius.reason, blastRadius: true } };
  }

  // ... then the interactive permission prompt, which is the most expensive
  // thing in the sequence.`}
      />
      <p>
        Third, after the mode gate and after hooks, before the interactive prompt. That ordering is
        deliberate on both sides: mode first because it is the only gate the model cannot influence,
        and blast radius before the prompt because <em>this block needs no human</em> &mdash; it is an
        instruction to the model, not a question for the user. Interrupting a person for something the
        agent can answer itself is the fastest way to make them start hitting{" "}
        <code className="font-mono text-[13px]">--yes</code>.
      </p>

      <H2 id="test" text="Testing a gate that must not be annoying" />
      <p>
        Both directions matter, and the second is the one people forget: a gate that blocks legitimate
        work is a gate that gets switched off.
      </p>
      <CodeBlock
        label="__tests__/blast-radius.test.js"
        code={`import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { blastRadius, checkBlastRadius, createGateState, classifyTarget } from '../src/agent/blast-radius.js';

describe('classifyTarget', () => {
  test('flags the paths where a small edit is expensive', () => {
    for (const p of [
      'migrations/0042_add_index.sql',
      'db/migrate/20240101_init.py',
      '.github/workflows/ci.yml',
      'Dockerfile',
      'package-lock.json',
      'prisma/schema.prisma',
      'src/auth/session.ts',
      '.env.production',
      'terraform/main.tf',
      'k8s/deployment.yaml',
    ]) {
      assert.equal(classifyTarget(p).sensitive, true, \`\${p} should be sensitive\`);
    }
  });

  test('does not flag ordinary source files', () => {
    for (const p of [
      'src/components/button.tsx',
      'README.md',
      '__tests__/button.test.ts',
      'src/author.ts',            // starts with "auth" but is not auth code
    ]) {
      assert.equal(classifyTarget(p).sensitive, false, \`\${p} should not be sensitive\`);
    }
  });

  test('normalises Windows separators', () => {
    // A Windows agent writes backslashes; without normalisation the CI
    // workflow pattern silently stops matching for every Windows user.
    assert.equal(classifyTarget('.github\\\\workflows\\\\ci.yml').sensitive, true);
  });
});

describe('checkBlastRadius', () => {
  test('blocks the first write to a risky path', () => {
    const state = createGateState();
    const r = checkBlastRadius({
      toolName: 'writeFile',
      input: { path: 'migrations/0043.sql', content: 'CREATE INDEX ...' },
      state,
    });
    assert.ok(r?.block);
    assert.match(r.reason, /JUSTIFICATION/);
    assert.match(r.reason, /ROLLBACK/);
  });

  test('does not block the same path twice in one turn', () => {
    const state = createGateState();
    const input = { path: 'migrations/0043.sql', content: 'x' };
    assert.ok(checkBlastRadius({ toolName: 'writeFile', input, state })?.block);
    assert.equal(checkBlastRadius({ toolName: 'writeFile', input, state }), null);
  });

  test('a new turn re-asks: state is never persisted', () => {
    const input = { path: 'migrations/0043.sql', content: 'x' };
    assert.ok(checkBlastRadius({ toolName: 'writeFile', input, state: createGateState() })?.block);
    assert.ok(checkBlastRadius({ toolName: 'writeFile', input, state: createGateState() })?.block);
  });

  test('one question for a batch touching several risky paths', () => {
    const state = createGateState();
    const r = checkBlastRadius({
      toolName: 'batchEdit',
      input: {
        operations: [
          { filePath: 'migrations/0043.sql', oldString: 'a', newString: 'b' },
          { filePath: 'migrations/0044.sql', oldString: 'a', newString: 'b' },
        ],
      },
      state,
    });
    assert.ok(r?.block);
    assert.equal((r.reason.match(/migrations\\/00(43|44)/g) || []).length, 2);
  });

  test('finds risky paths inside an applyPatch', () => {
    const patch = [
      '--- a/src/x.ts',
      '+++ b/src/x.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '--- a/prisma/schema.prisma',
      '+++ b/prisma/schema.prisma',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\\n');
    const r = blastRadius('applyPatch', { patch });
    assert.equal(r.sensitive, true);
    assert.match(r.targets[0].path, /schema\\.prisma/);
  });

  test('does not block ordinary writes at all', () => {
    const state = createGateState();
    assert.equal(
      checkBlastRadius({ toolName: 'writeFile', input: { path: 'src/app.ts' }, state }),
      null,
    );
  });
});`}
      />
      <Callout title="The false-positive test is the important one">
        <p>
          <code className="font-mono text-[13px]">src/author.ts</code> is in the test list on purpose.
          The auth pattern is anchored on path segments, so a file that merely starts with the letters
          &ldquo;auth&rdquo; is not flagged. Every false positive you ship here becomes a prompt that
          engineers learn to click through without reading &mdash; and then your{" "}
          <code className="font-mono text-[13px]">JUSTIFICATION</code> prompts are being ignored too.
        </p>
      </Callout>

      <H2 id="verify" text="Run it" />
      <CodeBlock
        label="terminal"
        code={`# ask for a migration in BUILD mode and watch the gate fire
sentinel ask -b "add an index on users.email for the login query"

# the same turn, retried: permitted, because the gate asked once
# ...

# a fresh turn re-asks, because the state is per-turn
sentinel ask -b "also index orders.created_at"

# ask the gate directly, with no model involved
node -e "
  const { blastRadius } = await import('./src/agent/blast-radius.js');
  for (const [tool, input] of [
    ['writeFile', { path: 'migrations/0043.sql' }],
    ['writeFile', { path: 'src/db/users.js' }],
    ['editFile',  { path: '.github/workflows/ci.yml' }],
    ['editFile',  { path: 'package-lock.json' }],
  ]) {
    const r = blastRadius(tool, input);
    console.log((r.sensitive ? 'CHALLENGED ' : 'silent     '), input.path,
                r.reasons ? \`(\${r.reasons.join('; ')})\` : '');
  }
"`}
      />

      <H2 id="next" text="What part 11 adds" />
      <p>
        You can now say exactly what the agent may do, what it has earned, and which writes deserve
        your attention. What you cannot yet say is{" "}
        <strong>what it has cost you</strong> &mdash; and that is the question every non-technical buyer
        asks first. Part 11 adds per-turn cost accounting that survives the process, an engagement
        budget with a deadline and a stop condition, and the hard stop that enforces it. The argument
        for the whole feature is in{" "}
        <Link href="/blog/reduce-llm-cost" className="text-moss underline-offset-4 hover:underline">
          reducing LLM cost in a coding agent
        </Link>
        .
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "What is a blast centre?",
            a: "A file where a small edit has an outsized effect and a rollback is rarely just 'revert'. Database migrations, CI workflows, lockfiles, schema definitions, infrastructure and cluster config, environment secrets, and auth or billing code. The defining property is asymmetry: editing a typo in a README is cheap to get wrong, editing a migration can cost you a production database, and that difference should be visible in how the tool treats them.",
          },
          {
            q: "Why block once rather than on every write?",
            a: "Because a gate that fires every time trains people to disable it, and a disabled gate is worse than no gate because you stop looking for it. Challenging a legitimate multi-file migration once per path per turn is enough, the agent states its justification, a human reads it, and the rest of the turn proceeds. The state is per-turn deliberately: a path challenged on Monday is not challenged again on Tuesday, but a new turn re-asks, so nothing is grandfathered across days.",
          },
          {
            q: "How do you detect a sensitive path?",
            a: "Two signals, and both are cheap. The primary one is path patterns: a table of regexes covering migrations, .sql files, .github/workflows, Dockerfiles and Makefiles, lockfiles, schema definitions, auth and billing filenames, .env, terraform/infra and k8s. The secondary signal is your own onboarding survey (high churn with no test coverage), which you already computed and can reuse. Sentinel keeps the second one opt-in and unwired, because running the survey shells out to git twice and paying that on every write would be a performance regression for a marginal signal.",
          },
          {
            q: "Does blocking actually make the agent behave differently?",
            a: "Yes, and for a reason worth understanding: the block is returned as a tool result, so the model reads it as an observation and its next move must include the justification. That converts a silent, plausible edit into a stated one with evidence attached, and it puts a human-readable record of the reasoning into the transcript. The gate does not verify the justification is correct (a regex cannot do that) it verifies that one was offered, which is the part that is mechanically checkable.",
          },
        ]}
      />

      <Cta
        title="Check what you have built"
        body="The quiz covers every part of the course (modes, gates, ledgers and the cost rules), and names the gaps rather than the score."
        href="/blog/cursor-cli-course-quiz"
        cta="Take the quiz"
      />

      <p className="text-sm text-muted">
        The module ships in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/blob/main/src/agent/blast-radius.js"
          className="text-moss underline-offset-4 hover:underline"
        >
          src/agent/blast-radius.js
        </a>
        , with tests in{" "}
        <code className="font-mono text-[13px]">__tests__/blast-radius.test.js</code>.
      </p>
    </>
  ),
} satisfies Post;
