import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "cli-doctor-preflight-checks",
  title: "Writing the doctor command your users will actually run",
  metaTitle: "Pre-Flight Checks: The Doctor Command",
  description:
    "How to write a doctor command for an AI CLI: check the runtime, prove the data directory is writable, confirm credentials without printing them, and exit non-zero on real failures only.",
  date: "2026-10-08",
  readingMinutes: 12,
  tags: ["Tutorial", "Developer Experience", "Diagnostics"],
  keyword: "cli doctor command pre-flight checks",
  series: { slug: "cursor-cli-course", order: 4 },
  related: ["chalk-figlet-terminal-banner", "terminal-cli-commander", "ai-coding-agent-guardrails"],
  faq: [
    {
      q: "Why does a coding agent need a doctor command when a normal CLI does not?",
      a: "Because of how many independent things can be wrong, and how late they surface. A broken CLI fails on its first line, where the stack trace is useful. An agent CLI can pass its startup, take a key, build a prompt, and then fail when a tool tries to write to a directory that is read-only — after you have spent money and two minutes. A pre-flight collapses all of that into one second and one list.",
    },
    {
      q: "Should doctor contact the model provider?",
      a: "Not by default. A health check that needs the internet to tell you the internet is broken is useless, and it burns an API call and can rate-limit you. Check that a key is present by default; probe the endpoint behind an opt-in flag. The presence of a credential and the validity of that credential are genuinely different questions and belong in different runs.",
    },
    {
      q: "How do I check a directory is writable portably?",
      a: "Write to it. `fs.access(path, fs.constants.W_OK)` is a permissions check, and permissions are not the same as capability — a mounted filesystem, a container with a read-only mount, an ACL, or a full disk all pass a permissions check and fail an actual write. Write a uniquely named temp file, then remove it. Sentinel does exactly this, and the test asserts the probe file is not left behind.",
    },
    {
      q: "Should warnings make the command exit non-zero?",
      a: "No. Only failures should. Warnings exist for conditions that are information for a human but not blockers: the PATH separator note on Windows, low memory, an unrecognised directory. If a warning exits non-zero, then on any platform with a routine warning the command always fails, people wrap it in `|| true`, and the check silently stops running — which is worse than not shipping it.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          An agent has more ways to be unusable than a normal program, and each one surfaces{" "}
          <strong>minutes into a turn</strong> instead of immediately. A pre-flight moves every one
          of them to the front, costs a second, and prints a list.
        </p>
        <p>
          Three rules make it trustworthy: <strong>check by doing, not by asking</strong> (write to
          the directory, classify a command); <strong>never print a credential</strong>, only the
          variable name; and <strong>exit non-zero only on a real failure</strong>, or nobody will
          wire it into their setup.
        </p>
      </KeyTakeaways>

      <H2 id="why" text="What actually breaks, and when you find out" />
      <p>
        Here is the honest list of failures, ordered by how long they take to surface. The right-hand
        column is the whole argument for writing this command.
      </p>
      <CompareTable
        caption="Failure modes of an agent CLI and when the user finds out"
        head={["Failure", "Surfaces", "Cost of finding out late"]}
        rows={[
          [
            "Node older than the code requires",
            "At import time, as a syntax error deep in a module",
            "Confusing stack trace naming a file they have never opened",
          ],
          [
            "Data directory not writable",
            "On the first checkpoint write",
            "The turn has already been billed; the work is lost",
          ],
          [
            "No provider key",
            "On the first HTTP request",
            "A confusing 401 rather than 'you have not set a key'",
          ],
          [
            "Provider key present but wrong",
            "Same 401, one layer further down",
            "Looks identical to 'no key', sends them down the wrong path",
          ],
          [
            "Wrong working directory",
            "The agent confidently summarises an empty directory",
            "The worst case: a plausible, confident, wrong answer",
          ],
          [
            "Not a git repo",
            "On any tool that shells out to git",
            "Traceback from inside a child process",
          ],
          [
            "Too little memory for a large repo",
            "Twenty minutes in, as an OOM kill",
            "The whole turn is lost with nothing to show",
          ],
          [
            "Tool layer silently not gating",
            "Never — this one does not announce itself",
            "A safety control you believed in was decorative",
          ],
        ]}
      />
      <p>
        That last row is why <code className="font-mono text-[13px]">doctor</code> includes a
      self-test of the guard rails rather than only the environment. A control that fails open is
      worse than a control that is absent, because you stop looking for it.
      </p>

      <H2 id="design" text="Severity, and the one exit-code rule" />
      <CodeBlock
        label="src/agent/doctor.js"
        code={`export const LEVELS = Object.freeze(['pass', 'warn', 'fail', 'skip']);`}
      />
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <code className="font-mono text-[13px] text-paper">pass</code> — verified working.
        </li>
        <li>
          <code className="font-mono text-[13px] text-paper">warn</code> — real, but not a blocker.
          Low memory. A PATH note on Windows. An empty directory.
        </li>
        <li>
          <code className="font-mono text-[13px] text-paper">fail</code> — the tool cannot work.
        </li>
        <li>
          <code className="font-mono text-[13px] text-paper">skip</code> — not checked, and the
          output says so and says why.
        </li>
      </ul>
      <Callout title="The rule I got wrong the first time" tone="warn">
        <p>
          I initially made <code className="font-mono text-[13px]">warn</code> fail the run, on the
          theory that anything worth reporting is worth blocking on. That made the command exit 1 on
          every Windows machine, because of the PATH note. The correct rule is narrower and I would
          have reached it faster by asking what the exit code is <em>for</em>:
        </p>
      </Callout>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`return {
  cwd: resolve(cwd),
  checks,
  // Only \`fail\` blocks. A \`warn\` is information for a human — the Windows PATH
  // note, low memory, an unrecognised directory — and exiting non-zero on those
  // would make the command useless, so nobody would run it.
  ok: checks.every((c) => c.level !== 'fail'),
  counts: LEVELS.reduce((acc, lvl) => {
    acc[lvl] = checks.filter((c) => c.level === lvl).length;
    return acc;
  }, {}),
};`}
      />
      <p>
        The exit code is for scripts. If a check ever fires spuriously, every{" "}
        <code className="font-mono text-[13px]">owl doctor &amp;&amp; owl ask ...</code> in a
        developer&rsquo;s shell profile stops working, and they will delete it rather than debug it.
      </p>

      <H2 id="check-by-doing" text="Check by doing" />
      <p>
        The data-directory check is the template for the rest. Do not{" "}
        <code className="font-mono text-[13px]">fs.access(W_OK)</code> &mdash; that asks the
        operating system about permissions, and permissions are not capability. Write a file.
      </p>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`/**
 * The project data directory. Checked by writing, not by stat: a directory can
 * exist, be owned by you, and still be read-only.
 */
export function checkDataDir(cwd = process.cwd()) {
  const dir = join(cwd, '.owl');
  const probe = join(dir, \`.doctor-\${process.pid}-\${Date.now()}.tmp\`);

  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return check(
      'data-dir',
      'Project data directory',
      'fail',
      \`cannot create \${dir}: \${e.message}\`,
      'Check the directory permissions, or run the agent outside a read-only checkout.',
    );
  }

  try {
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });       // leave nothing behind
  } catch (e) {
    return check(
      'data-dir',
      'Project data directory',
      'fail',
      \`\${dir} exists but is not writable: \${e.message}\`,
      'Sessions, checkpoints and the risk ledger all live here, so nothing will persist until this is fixed.',
    );
  }

  return check('data-dir', 'Project data directory', 'pass', \`writable · \${dir}\`);
}`}
      />
      <p>
        Two details worth copying. The probe filename includes the pid and a timestamp, so two
        concurrent doctors &mdash; which happens the moment you wire this into CI &mdash; cannot
        collide on the same path. And the file is removed, which is why the test asserts the
        directory is empty afterwards: a health check that litters is a health check people stop
        running.
      </p>

      <H2 id="credentials" text="Credentials: presence, never value" />
      <p>
        Check the environment only. Deliberately do not read the config file here &mdash; a pre-flight
        that silently merges a stale config into its report is harder to reason about than one that
        tells you exactly which process environment will be used. And show the variable{" "}
        <em>name</em>.
      </p>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`export const PROVIDER_ENV = Object.freeze({
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  // ...one per provider, so the mapping is auditable in one place
});

export function checkProviders(env = process.env) {
  const present = Object.entries(PROVIDER_ENV)
    .filter(([, varName]) => {
      const v = env[varName];
      return typeof v === 'string' && v.trim().length > 0;
    })
    .map(([provider, varName]) => ({ provider, varName }));

  if (present.length) {
    const list = present.map((p) => \`\${p.provider} (\${p.varName})\`).join(', ');
    return check(
      'providers',
      'Provider credentials',
      'pass',
      \`\${present.length} set · \${list}\`,
      'Keys are never read back or printed; only the variable names are shown.',
    );
  }

  return check(
    'providers',
    'Provider credentials',
    'fail',
    'no provider API key found in the environment',
    'Export one, e.g. \`export GROQ_API_KEY=gsk_...\`, or run Ollama locally which needs no key.',
  );
}`}
      />
      <p>
        Two consequences of naming rather than showing. The report is safe to paste into a bug, and a
        test can assert it &mdash; Sentinel&rsquo;s suite runs the full report with a canary key and
        fails if the value appears anywhere in the output. And a whitespace-only key is treated as
        absent, because{" "}
        <code className="font-mono text-[13px]">API_KEY=" "</code> set by a broken CI step is a real
        failure mode that a truthiness check would pass.
      </p>

      <H2 id="selftest" text="Test the control, not just the environment" />
      <p>
        The most valuable check here has nothing to do with your machine. It asserts the shell
        classifier still refuses the catastrophic commands, because a guard rail that has quietly
        stopped matching is invisible until the day it matters.
      </p>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`/** The tool layer's two non-negotiables: classification runs, and the red gate works. */
export function checkTooling() {
  const probes = [
    'git status',
    'ls -la',
    'npm test',
    'git commit -m "x"',
    'rm -rf /',
    'echo hi > out.txt',
  ];

  const classified = probes.filter((c) => classifyBashCommand(c).intent !== undefined);
  if (classified.length !== probes.length) {
    return check('tooling', 'Tool layer', 'fail',
      'bash command classification is not classifying',
      'Every shell tool call depends on this; without it nothing can be gated.');
  }

  // The destructive classifier is the control that keeps an agent out of trouble.
  const rmrf = classifyBashCommand('rm -rf /');
  if (!rmrf.destructive) {
    return check('tooling', 'Tool layer', 'fail',
      'destructive pattern table is not matching',
      '\`rm -rf /\` must classify as destructive for the red gate to work.');
  }

  return check('tooling', 'Tool layer', 'pass',
    \`classified \${probes.length} probe command(s); destructive patterns armed\`);
}`}
      />

      <H2 id="working-dir" text="The check that catches the worst bug" />
      <p>
        Not enough is wrong, but the most expensive failure is a confident answer about the wrong
        directory. Look for markers and say what you found.
      </p>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`export function checkWorkdir(cwd = process.cwd()) {
  const dir = resolve(cwd);
  if (!existsSync(dir)) {
    return check('workdir', 'Working directory', 'fail',
      \`\${dir} does not exist\`, 'cd to a real directory first.');
  }

  const markers = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', '.git', 'src'];
  const found = markers.filter((m) => existsSync(join(dir, m)));

  if (!found.length) {
    // warn, not fail: an empty scratch directory is a legitimate place to work.
    return check('workdir', 'Working directory', 'warn',
      \`\${dir} has no project markers\`,
      'It may be empty or not a repo root. Tools still work; expect fewer useful results.');
  }

  return check('workdir', 'Working directory', 'pass',
    \`\${dir} · \${found.slice(0, 3).join(', ')}\`);
}`}
      />

      <H2 id="network" text="The network probe is opt-in" />
      <p>
        Local model servers need a round trip to check. That makes them the one check you cannot do
        offline, so they are skipped by default and say so in the output.
      </p>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`export async function checkLocalModels(entries) {
  const reachable = [];
  const unreachable = [];

  for (const [name, host] of entries) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 1200);
      const res = await fetch(host, { signal: ac.signal });
      clearTimeout(timer);
      // Any HTTP answer means something is listening and speaking HTTP.
      (res.ok || res.status ? reachable : unreachable).push(\`\${name} (\${host})\`);
    } catch {
      unreachable.push(\`\${name} (\${host})\`);
    }
  }

  if (reachable.length) return check('local-models', 'Local model servers', 'pass', \`up · \${reachable.join(', ')}\`);
  if (!unreachable.length) return check('local-models', 'Local model servers', 'skip', 'not probed');

  // warn: a hosted provider is a perfectly good reason for Ollama to be down.
  return check('local-models', 'Local model servers', 'warn',
    \`not reachable · \${unreachable.join(', ')}\`,
    'Expected if you use a hosted provider. To run fully offline, start \`ollama serve\`.');
}`}
      />
      <p>
        The abort timer matters more than the fetch. A server that accepts the connection and then
        hangs would otherwise turn a one-second pre-flight into a thirty-second one, which is the
        fastest way to make someone stop running the command.
      </p>

      <H2 id="wiring" text="Wiring it, and the flag that makes it scriptable" />
      <CodeBlock
        label="bin/owl.js"
        code={`program
  .command('doctor')
  .description('Check the runtime, data directory, provider keys and tool layer')
  .option('-d, --dir <path>', 'Project to check (default: cwd)')
  .option('--network', 'Also probe local model servers over HTTP (Ollama, LM Studio)')
  .option('--json', 'Print the report as JSON')
  .action(async (options) => {
    const { runDoctor, renderDoctor } = await import('../src/agent/doctor.js');
    const cwd = path.resolve(options.dir || process.cwd());

    const report = await runDoctor({ cwd, probeNetwork: !!options.network });

    if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + '\\n');
    else console.log(renderDoctor(report));

    process.exit(report.ok ? 0 : 1);
  });`}
      />
      <p>
        <code className="font-mono text-[13px]">--json</code> is what lets you use this in CI rather
        than only by hand:
      </p>
      <CodeBlock
        label="ci"
        code={`- run: node bin/owl.js doctor --json
  id: agent-preflight
  continue-on-error: false

- run: node bin/owl.js doctor --network --json > doctor.json
  if: always()
  continue-on-error: true   # upload the report either way; it is the artifact you want`}
      />

      <H2 id="verify" text="The output, and what it looks like on a real machine" />
      <CodeBlock
        label="terminal"
        code={`$ node bin/owl.js doctor
owl doctor · /home/you/projects/myapp
✓ Node runtime — v22.23.2
✓ Working directory — /home/you/projects/myapp · package.json, .git, src
✓ Project data directory — writable · /home/you/projects/myapp/.owl
✗ Provider credentials — no provider API key found in the environment
  Export one, e.g. \`export GROQ_API_KEY=gsk_...\`, or run Ollama locally which needs no key.
✓ Host resources — linux 6.8.0 · 32 GB RAM (24 GB free)
✓ Tool layer — classified 6 probe command(s); destructive patterns armed
! Shell PATH — PATH separator ":" on linux
· Local model servers — not probed (--network)

5 passed · 1 warning(s) · 1 failed · 1 skipped
Not ready. Fix the failures above before starting a turn.
$ echo $?
1`}
      />
      <p>And once a key is exported:</p>
      <CodeBlock
        label="terminal"
        code={`$ export GROQ_API_KEY=gsk_...
$ node bin/owl.js doctor
...
6 passed · 1 warning(s) · 0 failed · 1 skipped
Ready. Try \`owl ask "what is this project?"\`
$ echo $?
0`}
      />

      <H2 id="tests" text="Testing a diagnostic" />
      <p>
        A health check has an obvious failure mode: it only ever gets exercised on the machine of
        whoever wrote it, where everything passes. Four techniques fix that.
      </p>
      <CodeBlock
        label="__tests__/doctor.test.js"
        code={`import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, chmod } from 'node:fs/promises';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

// 1. A temp directory per test, so tests never touch the real project and never
//    collide with each other.
async function tempDir(prefix = 'owl-doctor-') {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('checkDataDir', () => {
  test('passes and creates .owl on demand', async () => {
    const dir = await tempDir();
    try {
      const c = checkDataDir(dir);
      assert.equal(c.level, 'pass');
      // 2. Assert the *absence* of litter, not just the return value.
      const entries = await readdir(join(dir, '.owl'));
      assert.deepEqual(entries, []);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails when .owl exists but is a file', async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, '.owl'), 'not a directory');
      const c = checkDataDir(dir);
      assert.equal(c.level, 'fail');
      assert.match(c.detail, /cannot create/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('fails when the directory is read-only', async (t) => {
    // 3. Skip when the precondition does not hold, rather than asserting
    //    something the platform will not deliver.
    if (platform() === 'win32') return t.skip('POSIX mode bits only');
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      return t.skip('root bypasses permission bits');
    }
    const dir = await tempDir();
    try {
      const data = join(dir, '.owl');
      await mkdir(data);
      await chmod(data, 0o500);
      assert.equal(checkDataDir(dir).level, 'fail');
    } finally {
      await chmod(join(dir, '.owl'), 0o700).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// 4. Assert the exit code of the real binary, because "it printed something" and
//    "it exits correctly" are different contracts and scripts depend on the second.
it('exits 0 when healthy and 1 when a check fails', async () => {
  const dir = await tempDir();
  const ok = await run(process.execPath, [bin, 'doctor', '--json', '-d', dir], {
    env: { ...process.env, GROQ_API_KEY: 'gsk_x' },
  });
  assert.equal(JSON.parse(ok.stdout).ok, true);

  await assert.rejects(
    () => run(process.execPath, [bin, 'doctor', '--json'], {
      env: stripKeys(process.env),
    }),
    (e) => e.code === 1,
  );
});`}
      />
      <Callout title="And one test for the thing that matters most">
        <p>
          The suite also runs the whole report with a canary key and asserts the value appears
          nowhere in the output. It is the cheapest test in the file and the one that would have
          caught the worst possible regression: a diagnostic that helpfully prints your API key into
          a CI log.
        </p>
      </Callout>

      <H2 id="next" text="What part 5 adds" />
      <p>
        The tool can now tell you it is broken, and it still cannot do anything. Part 5 is the turn
        itself: a streaming client over raw{" "}
        <code className="font-mono text-[13px]">fetch</code> that normalises three different provider
        wire formats into one set of events, and a loop that feeds tool results back until the model
        stops asking. That is where the course stops being a CLI tutorial and starts being an agent.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why does a coding agent need a doctor command when a normal CLI does not?",
            a: "Because of how many independent things can be wrong, and how late they surface. A broken CLI fails on its first line, where the stack trace is useful. An agent CLI can pass its startup, take a key, build a prompt, and then fail when a tool tries to write to a directory that is read-only — after you have spent money and two minutes. A pre-flight collapses all of that into one second and one list.",
          },
          {
            q: "Should doctor contact the model provider?",
            a: "Not by default. A health check that needs the internet to tell you the internet is broken is useless, and it burns an API call and can rate-limit you. Check that a key is present by default; probe the endpoint behind an opt-in flag. The presence of a credential and the validity of that credential are genuinely different questions and belong in different runs.",
          },
          {
            q: "How do I check a directory is writable portably?",
            a: "Write to it. `fs.access(path, fs.constants.W_OK)` is a permissions check, and permissions are not the same as capability — a mounted filesystem, a container with a read-only mount, an ACL, or a full disk all pass a permissions check and fail an actual write. Write a uniquely named temp file, then remove it. Sentinel does exactly this, and the test asserts the probe file is not left behind.",
          },
          {
            q: "Should warnings make the command exit non-zero?",
            a: "No. Only failures should. Warnings exist for conditions that are information for a human but not blockers: the PATH separator note on Windows, low memory, an unrecognised directory. If a warning exits non-zero, then on any platform with a routine warning the command always fails, people wrap it in `|| true`, and the check silently stops running — which is worse than not shipping it.",
          },
        ]}
      />

      <Cta
        title="Continue with part 5"
        body="A streaming client over raw fetch, normalising three provider wire formats, and the loop that feeds tool results back."
        href="/blog/first-agent-turn-claude-agent-sdk"
        cta="Part 5: your first turn"
      />

      <p className="text-sm text-muted">
        The command in this post ships in Sentinel.{" "}
        <Link href="/docs/development" className="text-moss underline-offset-4 hover:underline">
          Run it against the real thing
        </Link>{" "}
        with <code className="font-mono text-[13px]">node bin/sentinel.js doctor</code>.
      </p>
    </>
  ),
} satisfies Post;
