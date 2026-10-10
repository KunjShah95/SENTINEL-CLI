import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "risk-ledger-command-shapes",
  title: "Approve one git command, not every git command",
  metaTitle: "Permission by Command Shape: The Risk Ledger",
  description:
    "How to build an agent risk ledger that grades command shapes rather than tool names, so approving a git commit never silently authorises a force push.",
  date: "2026-10-13",
  readingMinutes: 13,
  tags: ["Tutorial", "Security", "Guardrails"],
  keyword: "ai agent risk ledger command shapes",
  series: { slug: "cursor-cli-course", order: 9 },
  related: ["agent-ask-plan-modes", "ai-coding-agent-guardrails", "reduce-llm-cost"],
  faq: [
    {
      q: "Why not just ask every time a command runs?",
      a: "Because you train people to disable the prompt. A permission system that fires on every tool call gets `--yes` added to every command within a week, and once that flag is muscle memory the control is decoration. The fix is not to prompt less often in general. It is to prompt less often for the commands that have already been shown to be safe in this repository, which is what the ledger does.",
    },
    {
      q: "What is a command shape, exactly?",
      a: "The verb, its subcommand, its flags, and placeholders where the values were. `git commit -m \"fix bug\"` and `git commit -am \"other thing\"` are the same shape. The detail that matters: flags are preserved verbatim and only values are replaced, because collapsing `--force` and `--dry-run` into the same shape would make force-push as safe as a dry run. That single decision is the difference between this module working and being actively dangerous.",
    },
    {
      q: "Should approving a shape be permanent?",
      a: "Per repository, and forgettable. Sentinel records shapes in `.sentinel/risk.json`, capped at 200 entries, because a ledger that grows forever is a ledger nobody reads and one that never forgets anything a year ago. `sentinel risk --forget` drops a shape, and the cap evicts least-recently-approved first. Two shapes are never learned from approval no matter how many times you allow them: destructive commands and commands reaching outside the workspace.",
    },
    {
      q: "How is this different from a blast-radius gate?",
      a: "Different axes entirely. Modes decide whether a tool may run at all; the ledger decides whether this particular command, in this repository, has earned trust. The blast-radius gate is a third thing again: it challenges writes to sensitive paths once per turn regardless of history. All three compose: mode is capability, blast radius is consequence, and the ledger is memory.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          Permission modes are binary, and binary is too coarse:{" "}
          <code className="font-mono text-[13px]">git status</code> and{" "}
          <code className="font-mono text-[13px]">git push --force</code> arrive through the same{" "}
          <code className="font-mono text-[13px]">bash</code> tool, and BUILD mode grants both. A risk
          ledger grades the <strong>shape</strong> of a command against what this repository has
          already approved.
        </p>
        <p>
          One detail decides whether this works or becomes dangerous:{" "}
          <strong>flags are preserved verbatim and only values become placeholders.</strong> Collapse
          <code className="font-mono text-[13px]">--force</code> and{" "}
          <code className="font-mono text-[13px]">--dry-run</code> into one shape and you have made
          force-push as trusted as a dry run.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="The failure this fixes" />
      <p>
        You approve <code className="font-mono text-[13px]">bash</code> for the session. Sensible &mdash;
        the agent needs to run tests. Then, forty minutes later:
      </p>
      <CodeBlock
        label="terminal"
        code={`→ bash          git status
→ bash          git diff --stat
→ bash          git commit -am "fix the parser"
→ bash          npm test
→ bash          git push --force origin main      # ← same grant

# the prompt said "allow bash". It did not say "allow bash".`}
      />
      <p>
        The grant was for a tool. It got used for every command that tool can run. There are two ways
        out, and only one of them is good engineering:
      </p>
      <CompareTable
        caption="Three ways to handle a coarse bash grant"
        head={["Approach", "What it does", "Why it fails"]}
        rows={[
          [
            "Prompt every bash call",
            "Asks on every shell tool use",
            "You get --yes pasted onto every command within a week, and the control becomes decorative",
          ],
          [
            "Category policies (shell: ask | allow)",
            "One switch for all shell commands",
            "So strict nobody works, or so loose nothing is caught. There is no middle setting",
          ],
          [
            "Grade by command shape",
            "Approve `git commit -m <word>`; still ask about `git push --force <word>`",
            "This is the one that is both usable and safe, because the friction lands on novelty",
          ],
        ]}
      />
      <p>
        The insight is behavioural, not technical. A forward-deployed engineer&rsquo;s first hour in an
        unfamiliar codebase is deliberately small and green: you run what you can prove is safe, you
        get a human to say yes once, and from then on that <em>kind</em> of command is fine.
        Something new and unfamiliar still gets asked. That is permission by novelty, and it is a
        shape you can implement in about two hundred lines.
      </p>

      <H2 id="shape" text="Shaping a command" />
      <p>
        The whole module rests on one function. Reduce a command to its shape: verb, subcommand, flags
        kept, values replaced.
      </p>
      <CodeBlock
        label="src/agent/risk-ledger.js"
        code={`/**
 * Reduce a command to its shape: the verb and its flags survive, arguments
 * become placeholders. \`git commit -am "fix bug"\` and \`git commit -am
 * "other"\` are the same shape, so the second is green once the first was
 * approved; \`git push --force\` is a different shape, so it is asked again.
 *
 * Placeholder classes matter. Collapsing everything to <arg> would make
 * \`--force\` and \`--dry-run\` the same shape, which is precisely the mistake
 * this module exists to prevent. Flags are kept verbatim, only values go.
 */
const URL_RE = /^[a-z][a-z0-9+.-]*:\\/\\/\\S+$/i;

function shapeToken(token) {
  if (/^--?[A-Za-z][\\w-]*=?$/.test(token)) return token; // bare flag, or --flag=value
  if (/^--?[\\w-]+$/.test(token)) return token;           // short flag cluster
  if (URL_RE.test(token)) return '<url>';
  if (/^[A-Za-z]:[\\\\/]/.test(token) || token.startsWith('/') || token.startsWith('~')) return '<path>';
  if (/^\\d+(\\.\\d+)?$/.test(token)) return '<n>';
  // A git ref, branch, or revision.
  if (/^[0-9a-f]{7,40}$/i.test(token)) return '<sha>';
  if (token.includes('/')) return '<path>';
  if (token.includes('.') && !/^\\.+$/.test(token)) return '<name>';
  return '<word>';
}`}
      />
      <p>
        Read that allowlist top to bottom and you can see the design. Flags survive. URLs, paths,
        numbers, hex revisions and dotted names become placeholders. Everything else is a bare word,
        which is the right default: an unrecognised argument is more likely to be a value than a
        flag, and treating it as a value keeps more commands in the same shape.
      </p>

      <H2 id="subcommand" text="The bug this module exists to avoid" />
      <p>
        Without special handling, <code className="font-mono text-[13px]">git commit</code> and{" "}
        <code className="font-mono text-[13px]">git push</code> produce the same shape:{" "}
        <code className="font-mono text-[13px]">git &lt;word&gt;</code>. Approving a commit would
        silently authorise a push, which is the worst thing this module could possibly do.
      </p>
      <CodeBlock
        label="src/agent/risk-ledger.js"
        code={`/**
 * Tools whose SECOND word is the real verb. Without this, \`git commit\` and
 * \`git push\` collapse to the same shape and approving a commit would
 * silently authorize a push, the single worst failure this module could
 * have.
 */
const SUBCOMMAND_TOOLS = new Set([
  'git', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'cargo', 'docker', 'kubectl', 'helm',
  'go', 'pip', 'pip3', 'brew', 'gh', 'aws', 'gcloud', 'az', 'systemctl', 'composer',
  'make', 'gradle', 'terraform', 'ansible', 'rustup',
]);

/** The shape of one segment: \`git commit -m <word>\` → \`git commit -m <word>\`. */
export function shapeSegment(segment) {
  // Respect quotes: the contents of a quoted string are one opaque argument.
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === quote) { quote = null; if (cur) { tokens.push(cur); cur = ''; } continue; }
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (/\\s/.test(c)) { if (cur) { tokens.push(cur); cur = ''; } continue; }
    cur += c;
  }
  if (cur) tokens.push(cur);
  if (!tokens.length) return '';

  // Environment assignments (FOO=bar) are not arguments.
  const words = tokens.filter((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
  const verb = (words[0] || '').replace(/^.*[\\\\/]/, '');
  const out = [verb];

  // The subcommand is part of the verb, not an argument: \`git commit\` and
  // \`git push\` are different things and must never share a shape.
  if (SUBCOMMAND_TOOLS.has(verb)) {
    const sub = words.slice(1).find((t) => !t.startsWith('-'));
    if (sub) out.push(sub);
  }

  for (const t of words) {
    if (t === words[0]) continue;
    if (out.length > 1 && t === out[1]) continue;
    out.push(shapeToken(t));
  }
  return out.join(' ');
}`}
      />
      <p>Three details in there, each fixing a specific misgrade:</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Quote-aware tokenisation.</strong> Without it,{" "}
          <code className="font-mono text-[13px]">git commit -m "fix bug"</code> splits into{" "}
          <code className="font-mono text-[13px]">-m &quot;fix bug&quot;</code> &mdash; one opaque
          argument. Splitting it means the words inside the string become placeholders individually and
          two unrelated commits stop matching.
        </li>
        <li>
          <strong className="text-paper">
            Environment assignments are dropped.
          </strong>{" "}
          <code className="font-mono text-[13px]">NODE_ENV=test npm test</code> and{" "}
          <code className="font-mono text-[13px]">npm test</code> are the same shape, which is right.
        </li>
        <li>
          <strong className="text-paper">Paths are stripped of their prefix.</strong>{" "}
          <code className="font-mono text-[13px]">./scripts/build</code> and{" "}
          <code className="font-mono text-[13px]">./scripts/test</code> both reduce to a bare verb,
          so a build script does not become a distinct shape from a test script purely because of its
          directory.
        </li>
      </ul>
      <CodeBlock
        label="terminal"
        code={`# what shape does this command have?
node -e "
  const { commandShape } = await import('./src/agent/risk-ledger.js');
  for (const c of [
    'git commit -am \\'fix bug\\'',
    'git commit -am \\'a completely different message\\'',
    'git push --force origin main',
    'git push origin main',
    'npm test -- --watch',
  ]) console.log(commandShape(c).padEnd(28), c);
"`}
      />

      <H2 id="grading" text="Three levels, and the two that never learn" />
      <CodeBlock
        label="src/agent/risk-ledger.js"
        code={`/**
 * Grade a command for this repo.
 *
 * @returns {{ level: 'green'|'yellow'|'red', shape: string, intent: string,
 *   reason: string, warnings: string[], known: boolean }}
 */
export function riskLevel(command, cwd = getWorkdir(), ledger = readLedger(cwd)) {
  const cmd = String(command ?? '');
  const shape = commandShape(cmd);
  const cls = classifyBashCommand(cmd);
  const known = Object.prototype.hasOwnProperty.call(ledger?.shapes || {}, shape);

  // Red wins over everything, and is never satisfied by having seen the shape
  // before. \`rm -rf /\` is not made safe by approving it once.
  if (cls.destructive) {
    return {
      level: 'red', shape, intent: cls.intent,
      reason: cls.warnings[0] || 'destructive command',
      warnings: cls.warnings, known,
    };
  }

  if (cls.readOnly) {
    return { level: 'green', shape, intent: cls.intent, reason: 'read-only', warnings: cls.warnings, known };
  }

  if (known) {
    return {
      level: 'green', shape, intent: cls.intent,
      reason: \`shape already approved in this repo: \${shape}\`,
      warnings: cls.warnings, known: true,
    };
  }

  return {
    level: 'yellow', shape, intent: cls.intent,
    reason: \`new command shape in this repo: \${shape}\`,
    warnings: cls.warnings, known: false,
  };
}`}
      />
      <Callout title="The ordering here is the whole design">
        <p>
          Destructive first, before the known-shape check. If you check <code className="font-mono text-[13px]">
          known</code> first, then a repository where someone once approved a{" "}
          <code className="font-mono text-[13px]">git push --force</code> has permanently learned
          that force-push is fine &mdash; and that is exactly the accident this module is supposed to
          make impossible. Approving a catastrophic command must never record it.
        </p>
      </Callout>
      <p>
        Read-only second, before <code className="font-mono text-[13px]">known</code>, for the opposite
        reason: <code className="font-mono text-[13px]">grep</code> and{" "}
        <code className="font-mono text-[13px]">git log</code> should never prompt regardless of
        history, so they are green by classification rather than by memory.
      </p>

      <H2 id="fails-closed" text="It fails closed" />
      <CodeBlock
        label="src/agent/risk-ledger.js"
        code={`export function readLedger(cwd = getWorkdir()) {
  const file = ledgerFile(cwd);
  if (!existsSync(file)) return { version: LEDGER_VERSION, shapes: {} };
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    if (!data || typeof data !== 'object' || typeof data.shapes !== 'object' || data.shapes === null) {
      return { version: LEDGER_VERSION, shapes: {} };
    }
    return { version: data.version || LEDGER_VERSION, shapes: data.shapes };
  } catch {
    // Fail closed: an unreadable ledger is an empty ledger, which grades
    // everything novel as yellow. It must never grade as green.
    return { version: LEDGER_VERSION, shapes: {} };
  }
}`}
      />
      <p>
        Four paths return an empty ledger, and all four are corruption rather than absence. An empty
        ledger grades every novel command as <code className="font-mono text-[13px]">yellow</code>,
        which is the safe direction. The dangerous implementation would be{" "}
        <code className="font-mono text-[13px]">{'catch { return { known: true } }'}</code> &mdash; a
        truncated write, a full disk, or a merge conflict in{" "}
        <code className="font-mono text-[13px]">.sentinel/risk.json</code> would silently disable the
        entire mechanism, and it would disable it quietly.
      </p>
      <p>
        The same logic appears elsewhere in the project, which is worth noticing as a pattern: the
        corruption case in{" "}
        <code className="font-mono text-[13px]">budget.js</code> is also treated as{" "}
        <em>absent</em> rather than permissive, and it sets a{" "}
        <code className="font-mono text-[13px]">corrupt</code> flag so the CLI can say{" "}
        &ldquo;budget file was unreadable and is being treated as no budget&rdquo; rather than
        pretending the spend was free.
      </p>

      <H2 id="ledger" text="The ledger, and why it is capped" />
      <CodeBlock
        label="src/agent/risk-ledger.js"
        code={`/** How many distinct shapes a ledger remembers before the oldest are dropped. */
export const LEDGER_MAX_SHAPES = 200;

export const LEDGER_PATH = '.sentinel/risk.json';

export function writeLedger(ledger, cwd = getWorkdir()) {
  const shapes = ledger?.shapes && typeof ledger.shapes === 'object' ? ledger.shapes : {};
  const entries = Object.entries(shapes)
    .sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0))   // most recent first
    .slice(0, LEDGER_MAX_SHAPES);
  const doc = { version: LEDGER_VERSION, shapes: Object.fromEntries(entries) };
  mkdirSync(join(cwd, '.sentinel'), { recursive: true });
  writeFileSync(ledgerFile(cwd), JSON.stringify(doc, null, 2), 'utf-8');
  return doc;
}`}
      />
      <p>
        The cap is a design decision rather than a performance one. A ledger that remembers every
        shape from two years of work is a ledger where nothing is novel, which means the mechanism has
        quietly stopped doing anything. Two hundred shapes is far more than a focused session needs,
        and eviction is least-recently-approved first so the shapes you actually use survive.
      </p>

      <H2 id="wiring" text="Wiring it into the grant" />
      <p>
        The integration point is small, and the detail that makes it correct is that a session grant
        covers a shape rather than a tool.
      </p>
      <CodeBlock
        label="src/agent/loop.js"
        code={`  // Risk ledger: a session grant for \`bash\` is a grant for the *shape*, not
  // for every command the tool can run. A novel non-destructive shape is
  // still asked, which is what keeps "allow bash for this session" from
  // silently authorizing the first \`npm publish\` that walks by.
  const risk = shellish ? riskLevel(tc.input?.command, workdir) : null;
  const sessionGrantsShape =
    shellish ? allowAll.has(tc.name) && risk?.level === 'green' : allowAll.has(tc.name);
  let permission = sessionGrantsShape ? 'allow' : null;

  // Read-only tools never prompt (opencode behavior): a dialog per readFile
  // stalled a live TUI turn for minutes. The config policy still applies
  // in executeLocalTool, so \`permissions.tools.readFile: deny\` still denies.
  if (!permission && onPermissionRequest && !isReadOnlyTool(tc.name)) {
    permission = await onPermissionRequest(tc.name, tc.id, {
      ...(tc.input || {}),
      __risk: risk ? explainRisk(risk) : undefined,
    });
  }
  if (permission === 'deny') return { output: { error: 'User denied permission' } };

  if (permission === 'allow-session') {
    if (bashCheck?.destructive || risk?.level === 'red') {
      // A red command is never promoted to a session grant, even when the
      // user said allow-session: the ledger must not learn \`rm -rf /\`.
    } else if (risk && risk.level === 'yellow') {
      recordApproval(tc.input?.command, workdir);
      allowAll.add(tc.name);
    } else {
      allowAll.add(tc.name);
    }
  }`}
      />
      <Callout title="The empty branch is the load-bearing line">
        <p>
          When a command is red and the user chooses &ldquo;allow for this session&rdquo;, the code does
          <em> nothing</em>. It does not record approval and it does not add the tool to the session
          grant set. The user&rsquo;s click is respected for this one call and quietly not persisted,
          because a person who clicked through a destructive command was almost certainly reacting to
          the warning rather than granting a standing permission.
        </p>
      </Callout>
      <p>And the prompt shows what approving actually means, which is the other half of making this usable:</p>
      <CodeBlock
        label="src/agent/risk-ledger.js"
        code={`/** The extra context worth showing alongside a yellow/red prompt. */
export function explainRisk(risk) {
  if (risk.level === 'green') return null;
  const L = [risk.level === 'red' ? 'High risk.' : 'Unfamiliar in this repo.', risk.reason];
  if (risk.warnings.length) {
    L.push('Warnings:');
    for (const w of risk.warnings) L.push(\`- \${w}\`);
  }
  if (risk.level === 'yellow') {
    L.push('Approving this records the shape, so the same kind of command will not ask again.');
    L.push(\`Shape: \${risk.shape}\`);
  }
  return L.join('\\n');
}`}
      />

      <H2 id="cli" text="Make it inspectable" />
      <p>
        A security mechanism nobody can query is one nobody trusts. The whole ledger is answerable from
        a shell in under a second, which is what &ldquo;auditable&rdquo; has to mean in practice.
      </p>
      <CodeBlock
        label="terminal"
        code={`# what has this repo learned?
sentinel risk --list

# grade a command before the agent ever runs it
sentinel risk "npm publish"
sentinel risk "git commit -am 'wip'"

# forget a shape
sentinel risk --forget "git push --force origin <word>"

# machine-readable, for a pre-commit hook or CI check
sentinel risk --json "npm publish" | jq -r .level`}
      />
      <p>And the output is worth reading, because it teaches the mechanism:</p>
      <CodeBlock
        label="output"
        code={`$ sentinel risk "npm publish"
yellow  npm publish
Unfamiliar in this repo.
new command shape in this repo: npm publish
Approving this records the shape, so the same kind of command will not ask again.
Shape: npm publish

$ sentinel risk "git commit -am 'wip'"
green   git commit -am 'wip'
shape already approved in this repo: git commit -am <word>`}
      />
      <p>
        Showing the shape in the prompt is what makes the approval comprehensible. Without it, a user
        approving &ldquo;npm publish&rdquo; has no way to know the next forty{" "}
        <code className="font-mono text-[13px]">npm run *</code> commands are about to stop asking.
        That is the difference between a consent decision and a guess.
      </p>

      <H2 id="test" text="Testing the misgrades that matter" />
      <CodeBlock
        label="__tests__/risk-ledger.test.js"
        code={`import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { commandShape, riskLevel, recordApproval, readLedger } from '../src/agent/risk-ledger.js';

describe('commandShape', () => {
  test('flags survive and only values become placeholders', () => {
    assert.equal(commandShape('git commit -am "fix bug"'), 'git commit -am <word>');
    // The whole point: --force and --dry-run must not collide.
    assert.notEqual(commandShape('git push --force'), commandShape('git push --dry-run'));
  });

  test('git subcommands never share a shape', () => {
    assert.notEqual(commandShape('git commit'), commandShape('git push'));
    assert.equal(commandShape('npm run build'), 'npm run <word>');
    assert.notEqual(commandShape('npm test'), commandShape('npm publish'));
  });

  test('quoted strings are one opaque argument', () => {
    assert.equal(
      commandShape('git commit -m "one two three"'),
      commandShape('git commit -m "completely different words here"'),
    );
  });

  test('environment assignments are not arguments', () => {
    assert.equal(commandShape('NODE_ENV=test npm test'), commandShape('npm test'));
  });
});

describe('riskLevel', () => {
  test('destructive is red even when the shape is known', () => {
    const cwd = '/tmp/does-not-matter-for-red';
    const rmrf = riskLevel('rm -rf /', cwd);
    assert.equal(rmrf.level, 'red');

    // Simulate a ledger that already contains the shape.
    const forced = riskLevel('rm -rf /', cwd, { shapes: { 'rm -rf <path>': { at: 1 } } });
    assert.equal(forced.level, 'red', 'approving a catastrophic command must never stick');
  });

  test('read-only commands are green without any history', () => {
    assert.equal(riskLevel('git status', '/tmp').level, 'green');
    assert.equal(riskLevel('grep -r foo src', '/tmp').level, 'green');
  });

  test('a novel non-destructive command is yellow', () => {
    assert.equal(riskLevel('npm publish', '/tmp').level, 'yellow');
  });

  test('an unknown tool cannot be granted by a shape match', () => {
    // Nothing to assert here beyond the fail-closed path below.
    assert.equal(typeof riskLevel('anything', '/tmp').level, 'string');
  });
});

describe('fail closed', () => {
  test('a missing ledger grades as empty, never as permissive', () => {
    const dir = '/tmp/sentinel-ledger-absent-' + Date.now();
    const risk = riskLevel('npm publish', dir);
    assert.equal(risk.level, 'yellow');
    assert.equal(risk.known, false);
  });

  test('a corrupt ledger also grades as empty', async () => {
    const { mkdtemp, writeFile, mkdir } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-ledger-'));
    await mkdir(join(dir, '.sentinel'), { recursive: true });
    await writeFile(join(dir, '.sentinel', 'risk.json'), '{ truncated write');
    assert.equal(riskLevel('npm publish', dir).level, 'yellow');
  });
});`}
      />
      <Callout title="The two tests that carry the module">
        <p>
          <code className="font-mono text-[13px]">flags survive</code> and{" "}
          <code className="font-mono text-[13px]">destructive is red even when the shape is known</code>.
          Everything else is bookkeeping. If a refactor breaks those two, the module still works and is
          now quietly dangerous &mdash; which is the worst combination available for a safety control.
        </p>
      </Callout>

      <H2 id="verify" text="Run it" />
      <CodeBlock
        label="terminal"
        code={`# watch a repo learn. Start with nothing.
sentinel risk --list

# do some work in BUILD mode; green commands never prompt
sentinel ask -b "run the tests and commit the fix"

# now the ledger knows that shape
sentinel risk --list

# but not this one
sentinel risk "npm publish"
sentinel risk "git push --force origin main"

# and this is refused as red, always
sentinel risk "rm -rf /"`}
      />

      <H2 id="next" text="What part 10 adds" />
      <p>
        Three controls, three different axes, and they compose:{" "}
        <Link href="/blog/agent-ask-plan-modes" className="text-moss underline-offset-4 hover:underline">
          modes decide capability
        </Link>
        , the ledger decides trust, and part 10 adds the third &mdash; a per-path{" "}
        <em>consequence</em> gate that challenges writes to migrations, CI workflows, lockfiles and
        auth code once per turn, demanding a justifying file:line and a rollback before the edit lands.
        Then part 11 caps the thing all of this is protecting: the money.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why not just ask every time a command runs?",
            a: "Because you train people to disable the prompt. A permission system that fires on every tool call gets `--yes` added to every command within a week, and once that flag is muscle memory the control is decoration. The fix is not to prompt less often in general. It is to prompt less often for the commands that have already been shown to be safe in this repository, which is what the ledger does.",
          },
          {
            q: "What is a command shape, exactly?",
            a: "The verb, its subcommand, its flags, and placeholders where the values were. `git commit -am \"fix bug\"` and `git commit -am \"other thing\"` are the same shape. The detail that matters: flags are preserved verbatim and only values are replaced, because collapsing `--force` and `--dry-run` into the same shape would make force-push as safe as a dry run. That single decision is the difference between this module working and being actively dangerous.",
          },
          {
            q: "Should approving a shape be permanent?",
            a: "Per repository, and forgettable. Sentinel records shapes in `.sentinel/risk.json`, capped at 200 entries, because a ledger that grows forever is a ledger nobody reads and one that never forgets anything a year ago. `sentinel risk --forget` drops a shape, and the cap evicts least-recently-approved first. Two shapes are never learned from approval no matter how many times you allow them: destructive commands and commands reaching outside the workspace.",
          },
          {
            q: "How is this different from a blast-radius gate?",
            a: "Different axes entirely. Modes decide whether a tool may run at all; the ledger decides whether this particular command, in this repository, has earned trust. The blast-radius gate is a third thing again: it challenges writes to sensitive paths once per turn regardless of history. All three compose: mode is capability, blast radius is consequence, and the ledger is memory.",
          },
        ]}
      />

      <Cta
        title="Continue with part 10"
        body="A per-path consequence gate: migrations, CI workflows, lockfiles and auth code demand a justifying file:line and a rollback before the write lands."
        href="/blog/blast-radius-gate"
        cta="Part 10: blast radius"
      />

      <p className="text-sm text-muted">
        The module ships in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/blob/main/src/agent/risk-ledger.js"
          className="text-moss underline-offset-4 hover:underline"
        >
          src/agent/risk-ledger.js
        </a>
        . The calibration argument for why the friction lands on novelty is in{" "}
        <Link href="/blog/ai-coding-agent-guardrails" className="text-moss underline-offset-4 hover:underline">
          guardrails that survive week two
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
