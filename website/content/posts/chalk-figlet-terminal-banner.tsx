import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "chalk-figlet-terminal-banner",
  title: "Terminal output that survives being piped into a file",
  metaTitle: "Terminal UI With Chalk and Figlet",
  description:
    "Using Chalk and Figlet to make a CLI look finished — and the TTY, NO_COLOR and buffering rules that stop your banner from ending up inside someone else's data file.",
  date: "2026-10-07",
  readingMinutes: 10,
  tags: ["Tutorial", "CLI", "Chalk", "Terminal"],
  keyword: "chalk figlet terminal cli",
  series: { slug: "cursor-cli-course", order: 3 },
  related: ["terminal-cli-commander", "cursor-cli-course-overview", "frontend-ui-engineering"],
  faq: [
    {
      q: "Should I really put an ASCII banner on a developer tool?",
      a: "Probably not in the header, and definitely not by default. A banner is fine in `--help`, in `doctor`, and behind a `--verbose` flag; it is noise when someone runs the tool forty times a day. The argument for it is narrower than it looks: a tool that identifies itself clearly in a wall of CI output is easier to attribute. This is why Sentinel prints a one-line label rather than Figlet art.",
    },
    {
      q: "How do I stop colour codes ending up in a redirected file?",
      a: "Check `process.stdout.isTTY` before writing colour, and respect the `NO_COLOR` convention plus `FORCE_COLOR`. Chalk does the second two for you automatically; the TTY check is yours because chalk deliberately does not disable colour just because you redirected, since `FORCE_COLOR` exists for tools that pipe into a pager. The rule that matters: ANSI codes go to stderr if they are decoration, and to stdout only when the thing itself is the data.",
    },
    {
      q: "Does a spinner work over SSH and in CI?",
      a: "Only if you gate it on the same TTY check. A spinner in a non-TTY produces a file full of frame characters, one per refresh, which then lands in a CI artifact and gets grepped by someone debugging the build two weeks later. Either suppress it, or switch to a single static line and let the terminal show its own cursor.",
    },
    {
      q: "Figlet or not?",
      a: "Figlet is a good fit for a splash screen on first run and a bad fit for a command you run daily. It is also a font-rendering dependency for what is ultimately a string, so if you want the same look with no dependency, a small hand-drawn block glyph set is usually less code than the font file. The real question is whether the tool needs to introduce itself at all.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          The lesson is not &ldquo;add a banner.&rdquo; It is{" "}
          <strong>every visual affordance needs a non-interactive fallback</strong>, and the test is
          brutal: <code className="font-mono text-[13px]">owl ask "x" &gt; out.txt</code> must produce
          a file with no escape codes and no spinner frames in it.
        </p>
        <p>
          Chalk handles the colour half of that for free, including{" "}
          <code className="font-mono text-[13px]">NO_COLOR</code>. The TTY check is yours to write,
          because chalk will not disable colour just because you redirected &mdash; which is correct
          behaviour, and still leaves a bug in your code.
        </p>
      </KeyTakeaways>

      <H2 id="tty-first" text="Start with the TTY check, not with the colour" />
      <p>
        Every decorative decision in this part hangs off one boolean. Write it first and everything
        else becomes a two-line branch.
      </p>
      <CodeBlock
        label="src/agent/tty.js"
        code={`/**
 * Whether we are talking to a human at a terminal.
 *
 * Two separate questions get conflated here, so keep them apart:
 *   isTTY     — is there a terminal on the other end at all?
 *   supportsColor — will it render ANSI, and did the user ask us not to?
 *
 * Chalk answers the second (including NO_COLOR and FORCE_COLOR). The first is
 * ours to check, and it is the one that decides whether a spinner may exist.
 */
export const isTTY = Boolean(process.stdout.isTTY && process.stderr.isTTY);

/** True only when it is a terminal AND we are allowed to draw. */
export const canAnimate = isTTY && process.env.CI !== 'true';

/**
 * Cheap, JSON-safe log lines. In CI these go to stdout because a build log with
 * no newlines is miserable to read.
 */
export const log = {
  /** The answer itself. Nothing decorative is ever written here. */
  out: (s) => process.stdout.write(s + '\\n'),
  /** Progress, costs, warnings, banners. Safe to discard. */
  note: (s) => process.stderr.write(s + '\\n'),
  /** Failures. Also surfaced in the exit code. */
  fail: (s) => process.stderr.write(s + '\\n'),
};`}
      />
      <Callout title="Why decoration belongs on stderr">
        <p>
          Because <code className="font-mono text-[13px]">stdout</code> is a data channel and someone
          downstream is going to treat it as one. A banner, a spinner and a cost line are all
          information <em>about</em> the run, not the run. Putting them on stderr means{" "}
          <code className="font-mono text-[13px]">owl ask "x" &gt; answer.md</code> produces a
          document instead of a terminal transcript, and it stays that way the moment someone adds{" "}
          <code className="font-mono text-[13px]">| jq</code> or{" "}
          <code className="font-mono text-[13px]">| pbcopy</code> to the pipeline.
        </p>
      </Callout>

      <H2 id="chalk" text="Chalk, and the one thing it will not do for you" />
      <CodeBlock
        label="src/agent/style.js"
        code={`import chalk from 'chalk';

// Chalk already respects NO_COLOR, FORCE_COLOR and TERM=dumb, so there is no
// configuration to do. What it deliberately does NOT do is disable colour
// because stdout is a pipe: FORCE_COLOR exists for tools that pipe into a pager.
// That is the right default for a library and the wrong default for a CLI that
// writes files, which is why we gate ourselves.

export const ui = {
  dim: (s) => (isTTY ? chalk.dim(s) : s),
  bold: (s) => (isTTY ? chalk.bold(s) : s),
  green: (s) => (isTTY ? chalk.green(s) : s),
  red: (s) => (isTTY ? chalk.red(s) : s),
  yellow: (s) => (isTTY ? chalk.yellow(s) : s),
  gray: (s) => (isTTY ? chalk.gray(s) : s),
  /** Status marks. The glyph, not the colour, carries the meaning. */
  pass: (s) => (isTTY ? chalk.green('✓') + ' ' + s : '[ok] ' + s),
  warn: (s) => (isTTY ? chalk.yellow('!') + ' ' + s : '[warn] ' + s),
  fail: (s) => (isTTY ? chalk.red('✗') + ' ' + s : '[fail] ' + s),
};`}

      />
      <p>
        Note the last three. A green checkmark means nothing to someone whose terminal is monochrome
        or whose screen reader announced a glyph; a word does. Sentinel&rsquo;s{" "}
        <code className="font-mono text-[13px]">doctor</code> renders exactly this way:
      </p>
      <CodeBlock
        label="src/agent/doctor.js"
        code={`const COLOR = { pass: '\\x1b[32m', warn: '\\x1b[33m', fail: '\\x1b[31m', skip: '\\x1b[90m' };
const MARK = { pass: '✓', warn: '!', fail: '✗', skip: '·' };
const RESET = '\\x1b[0m';

export function renderDoctor(report) {
  const lines = [];
  for (const c of report.checks) {
    lines.push(\`\${COLOR[c.level]}\${MARK[c.level]}\${RESET} \${c.title} — \${c.detail}\`);
    if (c.hint && c.level !== 'pass') lines.push(\`  \${chalk.gray(c.hint)}\`);
  }
  return lines.join('\\n');
}`}
      />
      <p>
        The summary line is plain words as well, because it is the part someone pastes into an issue:
      </p>
      <CodeBlock
        label="output"
        code={`5 passed · 1 warning(s) · 1 failed · 1 skipped`}
      />

      <H2 id="figlet" text="Figlet, honestly" />
      <p>
        Figlet renders a string as block letters from a bundled font. It is genuinely good at splash
        screens and genuinely bad at a tool you run daily, mostly because the output is 6 lines tall
        and the information density is negative.
      </p>
      <CodeBlock
        label="terminal"
        code={`npm install figlet
node -e "import('figlet').then(f=>console.log(f.default.textSync('owl',{font:'Standard'}).toString()))"`}
      />
      <p>Which gives you this, for the cost of a font file and about a megabyte:</p>
      <CodeBlock
        label="output"
        code={`  ____        _    
 / _ \\ \      / /   
| | | | \\ \\ /\\ / /   
| |_| |  \\ V  V / 
 \\___/ \\_/\\_/ /_/ `}
      />
      <Callout title="What Sentinel does instead" tone="warn">
        <p>
          It ships no Figlet banner at all. The TUI renders a one-line label with the version and the
          active mode &mdash; <code className="font-mono text-[13px]">Sentinel v3.2.0 · PLAN</code>{" "}
          &mdash; because the thing you need after the fifth invocation is the mode, not the logo.
          Getting that decision from a tool is the point of part 3; the conclusion happens to be less
          decoration than you started with.
        </p>
      </Callout>
      <p>
        If you do want a splash, gate it three ways: first run only, interactive only, and behind a
        flag.
      </p>
      <CodeBlock
        label="src/agent/splash.js"
        code={`import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MARKER = join(process.env.HOME || '.', '.owl-splashed');

/**
 * Show the banner at most once per machine, never when piped, never in CI,
 * and never when the caller asked for machine-readable output.
 */
export function shouldSplash({ json, quiet }) {
  if (json || quiet) return false;
  if (process.env.CI) return false;
  if (!process.stdout.isTTY) return false;
  if (existsSync(MARKER)) return false;
  return true;
}`}
      />

      <H2 id="spinner" text="A spinner you have to earn" />
      <p>
        A spinner is a claim: &ldquo;this is still working.&rdquo; That claim is false during a 4-second
        call, and the failure mode when it is false is worse than having no spinner at all. So gate it
        on the same TTY boolean, and give it a deadline.
      </p>
      <CodeBlock
        label="src/agent/progress.js"
        code={`const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DELAY_MS = 400;   // show nothing at all before this

/**
 * @param {string} label   what it is doing
 * @param {number} delay   silence before the first frame
 * @returns {{ update(s: string): void; stop(): void }}
 */
export function spinner(label, delay = DELAY_MS) {
  if (!canAnimate) {
    // Non-interactive: one static line, no cursor tricks, no frames.
    return { update() {}, stop() {} };
  }
  let frame = 0;
  let timer = null;
  let current = label;

  const draw = () => {
    process.stderr.write(\`\\r\\x1b[2K\${chalk.gray(FRAMES[frame++ % FRAMES.length])} \${chalk.gray(current)}\`);
  };

  timer = setTimeout(function tick() {
    draw();
    timer = setTimeout(tick, 80);
  }, delay);

  return {
    update(next) {
      current = next;
    },
    stop() {
      clearTimeout(timer);
      // Erase the line. Without this the last frame stays in your scrollback.
      process.stderr.write('\\r\\x1b[2K');
    },
  };
}`}
      />
      <p>
        The <code className="font-mono text-[13px]">delay</code> is the important part. Most turns
        answer in under two seconds, and a spinner that flashes for 300ms and vanishes reads as a
        glitch. Do not draw anything until something has actually taken long enough to notice.
      </p>
      <p>
        Note also that a hand-rolled spinner is 25 lines and zero dependencies. Sentinel replaced{" "}
        <code className="font-mono text-[13px]">ink-spinner</code> with exactly this, for the same
        reason it writes its own Markdown table renderer in the TUI: fewer packages to audit in a
        tool whose whole pitch is that you can read all of it.
      </p>

      <H2 id="table" text="Tables without a dependency" />
      <p>
        You will need aligned output for <code className="font-mono text-[13px]">doctor</code> and for
        every list command. It is another 20 lines and it respects the colour rules you just set up.
      </p>
      <CodeBlock
        label="src/agent/table.js"
        code={`/**
 * Pad to the widest cell. Display width, not .length — the box-drawing and
 * unicode marks people use in file paths would otherwise skew every column.
 */
function width(s) {
  return [...String(s)].reduce((n, ch) => n + (/[\\u1100-\\u115F\\u2E80-\\uA4CF\\uAC00-\\uD7A3\\uF900-\\uFAFF\\uFE30-\\uFE6F\\uFF00-\\uFF60\\uFFE0-\\uFFE6]/.test(ch) ? 2 : 1), 0);
}

export function table(rows, { head } = {}) {
  const all = head ? [head, ...rows] : rows;
  const cols = Math.max(...all.map((r) => r.length));
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - width(s)));

  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(...all.map((r) => width(r[i] ?? ''))),
  );
  const line = (cells) => cells.map((c, i) => pad(c ?? '', widths[i])).join('  ').trimEnd();

  return [
    head ? chalk.gray(line(head)) : null,
    head ? chalk.gray(widths.map((w) => '─'.repeat(w)).join('  ')) : null,
    ...rows.map(line),
  ].filter(Boolean).join('\\n');
}`}
      />

      <H2 id="verify" text="The three-command test" />
      <p>
        Every decoration decision above is verified by these, and they take ten seconds. If any of them
        leaves junk in a file, the code is wrong.
      </p>
      <CodeBlock
        label="terminal"
        code={`# 1. interactive: colour, alignment, no escape codes in the visible output
node bin/owl.js doctor

# 2. redirected: the file must contain no ESC characters and no spinner frames
node bin/owl.js ask "what is 2+2?" > out.txt
grep -c $'\\x1b' out.txt      # must be 0
grep -c '[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]' out.txt  # must be 0

# 3. CI: NO_COLOR is honoured, and nothing animates
NO_COLOR=1 CI=true node bin/owl.js doctor 2>&1 | cat -v | grep -c '\\^\['  # must be 0`}
      />
      <Callout title="This is the whole part, in three commands">
        <p>
          Everything above is a means to those three greps returning zero. A CLI that animates in a
          pipe is a CLI that has already broken someone&rsquo;s CI, and it will be blamed for the
          build rather than for the animation.
        </p>
      </Callout>

      <H2 id="next" text="What part 4 adds" />
      <p>
        The surface is now pleasant and correct. It is also still completely useless, because it has
        no idea whether it can work on this machine. Part 4 adds{" "}
        <code className="font-mono text-[13px]">doctor</code>: the runtime check, the writable data
        directory, provider credentials, and a proof that the shell classifier still refuses{" "}
        <code className="font-mono text-[13px]">rm -rf /</code>. Roughly 150 lines, and it turns
        &ldquo;why is this not working?&rdquo; into a list.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Should I really put an ASCII banner on a developer tool?",
            a: "Probably not in the header, and definitely not by default. A banner is fine in `--help`, in `doctor`, and behind a `--verbose` flag; it is noise when someone runs the tool forty times a day. The argument for it is narrower than it looks: a tool that identifies itself clearly in a wall of CI output is easier to attribute. This is why Sentinel prints a one-line label rather than Figlet art.",
          },
          {
            q: "How do I stop colour codes ending up in a redirected file?",
            a: "Check `process.stdout.isTTY` before writing colour, and respect the `NO_COLOR` convention plus `FORCE_COLOR`. Chalk does the second two for you automatically; the TTY check is yours because chalk deliberately does not disable colour just because you redirected, since `FORCE_COLOR` exists for tools that pipe into a pager. The rule that matters: ANSI codes go to stderr if they are decoration, and to stdout only when the thing itself is the data.",
          },
          {
            q: "Does a spinner work over SSH and in CI?",
            a: "Only if you gate it on the same TTY check. A spinner in a non-TTY produces a file full of frame characters, one per refresh, which then lands in a CI artifact and gets grepped by someone debugging the build two weeks later. Either suppress it, or switch to a single static line and let the terminal show its own cursor.",
          },
          {
            q: "Figlet or not?",
            a: "Figlet is a good fit for a splash screen on first run and a bad fit for a command you run daily. It is also a font-rendering dependency for what is ultimately a string, so if you want the same look with no dependency, a small hand-drawn block glyph set is usually less code than the font file. The real question is whether the tool needs to introduce itself at all.",
          },
        ]}
      />

      <Cta
        title="Continue with part 4"
        body="The command that turns 'why is this not working?' into a list, before you start an agent turn."
        href="/blog/cli-doctor-preflight-checks"
        cta="Part 4: doctor"
      />

      <p className="text-sm text-muted">
        New to the series?{" "}
        <Link
          href="/blog/cursor-cli-course-overview"
          className="text-moss underline-offset-4 hover:underline"
        >
          Part 1 has the brief
        </Link>
        . Or skip to the{" "}
        <Link href="/docs/quickstart" className="text-moss underline-offset-4 hover:underline">
          finished tool
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
