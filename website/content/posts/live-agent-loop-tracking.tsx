import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "live-agent-loop-tracking",
  title: "Watch every move: recording the agent loop as JSONL",
  metaTitle: "Live Agent Loop Tracking With JSONL",
  description:
    "How to make an agent loop inspectable: record every event to JSONL as it happens, wrap the generator so logging can never break the turn, and turn past runs into a regression suite.",
  date: "2026-10-10",
  readingMinutes: 13,
  tags: ["Tutorial", "Observability", "Evals"],
  keyword: "live agent loop tracking",
  series: { slug: "cursor-cli-course", order: 6 },
  related: ["evaluate-coding-agent", "first-agent-turn-claude-agent-sdk", "reduce-llm-cost"],
  faq: [
    {
      q: "Why JSONL instead of a proper tracing library?",
      a: "Three reasons, in order of how much they matter. It is append-only, so a crash mid-turn leaves a complete record of everything before the crash rather than a truncated buffer. It is dependency-free, which matters more than it sounds for a tool whose pitch is that you can read all of it. And it is greppable, so debugging becomes `grep tool_result .sentinel/trajectories/*.jsonl` instead of a query language. You can export it to OpenTelemetry later without touching the producers.",
    },
    {
      q: "How do I record events without risking the turn?",
      a: "Wrap the generator rather than instrumenting its body. `withTrajectory(source)` yields every event through untouched and does its logging on the way past, so there is nothing to forget to add when a new event type appears. Then make every write best-effort: a disk full must not kill a turn that has already spent money, because the output you care about is on the user's screen.",
    },
    {
      q: "What should I actually look at when a turn goes wrong?",
      a: "The tool calls that produced an error, in order, with their inputs. Not the text the model wrote. The model is usually correct about what it was trying to do. Start from `summarizeEvents`, which already reduces a trace to the tool sequence, the files written, the errors and the finish state, and diff that against a run that worked.",
    },
    {
      q: "Does recording every turn cost anything at runtime?",
      a: "A synchronous append per event, which is microseconds for the line sizes involved, plus a 4,000-character truncation per data payload so a 30,000-character tool result does not become a 30,000-character line. The truncation is the part that matters: without it, one `cat` of a file directory produces a trace file measured in megabytes and the logging becomes the performance problem it was meant to help you diagnose.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          You cannot debug behaviour you cannot see. Recording every loop event to JSONL costs
          microseconds and turns an agent from a black box into{" "}
          <strong>a diffable artefact</strong> &mdash; which is the only thing that makes the replay
          regression suite in part 12 possible.
        </p>
        <p>
          Two rules make it safe. <strong>Wrap the generator, don&rsquo;t instrument its body</strong>,
          so there is nothing to forget when you add an event type. And{" "}
          <strong>make every write best-effort</strong> &mdash; a full disk must not kill a turn that
          has already been billed.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="What &ldquo;it did something weird&rdquo; looks like without a trace" />
      <p>
        You run an agent on a real task. It produces a plausible answer and one file is wrong. You
        know which file. You have no idea what it read on the way there, which of forty tool calls
        touched it, or whether it ever ran the tests.
      </p>
      <p>From here, every option is bad:</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Re-run with the same prompt.</strong> Non-deterministic. You
          will get a different result and learn nothing, and you have now spent the money twice.
        </li>
        <li>
          <strong className="text-paper">Add print statements.</strong> Which change the timing, which
          changes nothing about the model, and which you will forget to remove.
        </li>
        <li>
          <strong className="text-paper">Ask the model what it did.</strong> It will confidently
          narrate a plausible sequence. This is the worst option because it feels like evidence.
        </li>
      </ul>
      <p>
        The fix is boring and takes an afternoon: write the events down as they happen. Sentinel has
        done this since early, and it is the foundation for everything in{" "}
        <Link href="/docs/swe" className="text-moss underline-offset-4 hover:underline">
          the SWE workflow
        </Link>{" "}
        and for{" "}
        <code className="font-mono text-[13px]">sentinel replay</code>.
      </p>

      <H2 id="shape" text="The record shape" />
      <p>
        One JSON object per line, one file per run, keyed by a run id that doubles as a trace id. The
        design goal is that a future exporter can map it 1:1 onto OpenTelemetry spans without
        touching anything that produces it.
      </p>
      <CodeBlock
        label="src/agent/trajectory.js"
        code={`/**
 * Trajectory logging, every agent turn recorded as JSONL.
 *
 * Why: traces are the raw material for all eval work (trace first, derive
 * evals from real failures). One small JSONL file per run under
 * \`.sentinel/trajectories/\`. Graders, the eval runner, and humans read
 * these, never the model.
 *
 * Record shape (OpenTelemetry-flavored, file-first, no SDK dependency):
 *   { ts, runId (=traceId), seq, event, data?, model?, mode?,
 *     usage?, costUsd? }
 * \`data\` payloads are truncated (tool outputs can be 20-30k chars).
 * The JSONL maps 1:1 to OTel spans (runId→trace_id, event→span event);
 * a future \`sentinel eval export --otlp\` can ship it to Langfuse /
 * Arize Phoenix / LangSmith without changing producers.
 *
 * Disabled with SENTINEL_NO_TRAJECTORY=1.
 */
const DATA_CHAR_CAP = 4000;

function truncateData(data) {
  if (data === undefined) return undefined;
  try {
    const s = typeof data === 'string' ? data : JSON.stringify(data);
    return s.length > DATA_CHAR_CAP ? s.slice(0, DATA_CHAR_CAP) + '…[truncated]' : s;
  } catch {
    return '[unserializable]';
  }
}`}
      />
      <Callout title="Why truncation is a correctness feature, not an optimisation">
        <p>
          Without it, one <code className="font-mono text-[13px]">listDirectory</code> on a large
          directory writes a line measured in hundreds of kilobytes. Fifty of those is a 10 MB file per
          run, and the logging overhead starts showing up as slower tool calls &mdash; which is the
          exact symptom you installed tracing to investigate. 4,000 characters is enough to see what
          happened and small enough to ignore.
        </p>
      </Callout>

      <H2 id="wrapper" text="Wrap the generator, don&rsquo;t instrument it" />
      <p>
        The structural decision. Rather than adding a log call at every yield site in the loop &mdash;
        which means every future event type silently goes unrecorded &mdash; wrap the generator and
        let the logging happen on the way past.
      </p>
      <CodeBlock
        label="src/agent/trajectory.js"
        code={`/**
 * Wrap an event generator: every yielded {event, data} is appended as one
 * JSONL line, then passed through untouched. Never throws, logging must
 * not break the turn it observes.
 */
export async function* withTrajectory(source, { runId = newRunId(), model, mode, prompt, goal } = {}) {
  if (process.env.SENTINEL_NO_TRAJECTORY === '1') {
    yield* source;
    return;
  }

  let file = null;
  try {
    const dir = trajectoryDir();
    mkdirSync(dir, { recursive: true });
    file = join(dir, \`\${runId}.jsonl\`);
  } catch {
    file = null;   // unwritable dir is not a reason to fail the turn
  }

  let seq = 0;

  // Header: the task itself (untruncated up to 20k), so \`sentinel replay\`
  // can re-run the same turn against another model or prompt version.
  if (file && prompt) {
    try {
      appendFileSync(file, JSON.stringify({
        ts: new Date().toISOString(), runId, seq: seq++, event: 'start',
        data: JSON.stringify({ prompt: String(prompt).slice(0, 20_000), goal }), model, mode,
      }) + '\\n');
    } catch { /* best-effort */ }
  }

  let usage;
  let costUsd;
  for await (const ev of source) {
    if (ev?.event === 'finish') {
      usage = ev.data?.usage;
      costUsd = ev.data?.costUsd;
    }
    if (file) {
      try {
        appendFileSync(
          file,
          JSON.stringify({
            ts: new Date().toISOString(),
            runId,
            seq: seq++,
            event: ev?.event,
            data: truncateData(ev?.data),
            model,
            mode,
            ...(ev?.event === 'finish' ? { usage, costUsd } : {}),
          }) + '\\n'
        );
      } catch {
        // Logging is best-effort by design.
      }
    }
    yield ev;
  }
}`}
      />
      <p>
        Four things to copy, each of which is a bug you otherwise ship:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Every write is in its own try/catch.</strong> Disk full,
          permissions, a path that stopped existing mid-turn. None of them should kill a turn whose
          output is already on the user&rsquo;s screen.
        </li>
        <li>
          <strong className="text-paper">The header carries the prompt.</strong> Untruncated to
          20,000 characters, unlike everything else. Without it the trace is a recording of an
          effect with no cause, and replay cannot re-run it.
        </li>
        <li>
          <strong className="text-paper">
            <code className="font-mono text-[13px]">usage</code> and{" "}
            <code className="font-mono text-[13px]">costUsd</code> land on the finish line
          </strong>
          , not a separate event, so a summary that reads the last line gets the cost for free.
        </li>
        <li>
          <strong className="text-paper">An env var to turn it off.</strong> Not just for privacy.
          Replay deliberately re-roots trajectories per task, and a recursive loop would otherwise
          record its own replays forever.
        </li>
      </ul>

      <H2 id="wire" text="Wiring it into the loop" />
      <p>
        Two exported entry points, because one caller manages its own recording. The outer one adds
        the trajectory; the inner one is what the replay harness calls so it can point the output at a
        specific file.
      </p>
      <CodeBlock
        label="src/agent/loop.js"
        code={`/**
 * Run one full agent turn with trajectory logging.
 *
 * Same contract as runAgentTurnInner, plus per-turn JSONL recording (see
 * trajectory.js). Set \`opts.trajectory: false\` or SENTINEL_NO_TRAJECTORY=1
 * to skip. The inner generator stays exported for callers that manage
 * their own recording (e.g. the eval runner, which re-roots trajectories
 * per task).
 */
export async function* runAgentTurn(opts = {}) {
  if (opts.trajectory === false) {
    yield* runAgentTurnInner(opts);
    return;
  }
  const runId = typeof opts.trajectory === 'string' ? opts.trajectory : newRunId();
  yield* withTrajectory(runAgentTurnInner(opts), {
    runId,
    model: opts.model,
    mode: opts.mode,
    prompt: lastUserText(opts.history),
    goal: opts.goal,
    outcome: opts.outcome ? contractBrief(opts.outcome) : undefined,
  });
}`}
      />
      <p>
        That is the whole integration. Because the wrapper is transparent, the loop does not know it
        is being recorded, and no test of the loop has to change.
      </p>

      <H2 id="summarize" text="Reduce a trace to something diffable" />
      <p>
        Raw JSONL is for machines. The thing you actually compare is a summary: tool sequence, files
        written, errors, whether it finished, what it cost.
      </p>
      <CodeBlock
        label="src/agent/replay.js"
        code={`const WRITE_TOOLS = new Set(['writeFile', 'editFile', 'batchEdit', 'applyPatch']);

function writtenPaths(toolName, input) {
  if (!WRITE_TOOLS.has(toolName) || !input) return [];
  if (toolName === 'batchEdit') return (input.operations || []).map((o) => o?.filePath).filter(Boolean);
  if (toolName === 'applyPatch') return [...String(input.patch || '').matchAll(/^\\+\\+\\+ b\\/(.+)$/gm)].map((m) => m[1]);
  return input.path ? [input.path] : [];
}

/** Summarize a recorded or live event stream into comparable features. */
export function summarizeEvents(events) {
  const out = {
    prompt: '', goal: undefined, mode: undefined, model: undefined,
    tools: [], files: [], errors: [], finished: false, costUsd: 0, receipts: [],
  };
  const files = new Set();
  const failedIds = new Set();
  const calls = [];

  for (const ev of events) {
    const data = parseData(ev.data);
    if (ev.event === 'start') {
      out.prompt = data?.prompt || '';
      out.goal = data?.goal;
      out.mode = ev.mode;
      out.model = ev.model;
    } else if (ev.event === 'tool_call') {
      calls.push({ id: data?.toolCallId, name: data?.toolName, input: data?.input });
      out.tools.push(data?.toolName);
    } else if (ev.event === 'tool_result' && data?.error) {
      failedIds.add(data.toolCallId);
    } else if (ev.event === 'error') {
      out.errors.push(String(data?.message || data));
    } else if (ev.event === 'finish') {
      out.finished = true;
      out.costUsd = ev.costUsd ?? data?.costUsd ?? 0;
    } else if (ev.event === 'receipts' && data && !data.blocking) {
      out.receipts = (data.claims || []).map((c) => \`\${c.kind}:\${c.status}\`);
    }
  }

  for (const c of calls) {
    // A failed call may have written nothing; do not credit it with files.
    if (failedIds.has(c.id)) continue;
    for (const p of writtenPaths(c.name, c.input)) files.add(String(p).replace(/\\\\/g, '/'));
  }
  out.files = [...files].sort();
  return out;
}`}
      />
      <p>
        The <code className="font-mono text-[13px]">failedIds</code> pass is the subtlety. A{" "}
        <code className="font-mono text-[13px]">writeFile</code> that the sandbox refused appears in
        the tool list but wrote nothing, so a naive summary reports a file that does not exist and
        every subsequent diff is noise. Correlate calls with results by id before concluding a file
        changed.
      </p>

      <H2 id="inspect" text="Inspecting a run" />
      <CodeBlock
        label="terminal"
        code={`# what runs are recorded, newest first
ls -t .sentinel/trajectories/*.jsonl | head

# the raw event stream for one run
cat .sentinel/trajectories/9f3c1a2b7d4e5081.jsonl | head -5

# the tool sequence, the fastest answer to "what did it actually do?"
grep -o '"event":"tool_call"' -c .sentinel/trajectories/*.jsonl

# find every turn that hit a guard rail
grep -l 'blastRadius' .sentinel/trajectories/*.jsonl

# total spend across every recorded run
grep -o '"costUsd":[0-9.]*' .sentinel/trajectories/*.jsonl \\
  | cut -d: -f2 | paste -sd+ | bc`}
      />
      <p>
        That last one deserves a note. Because the cost lands on the finish line, the total spend of
        every run you have ever done is a shell pipeline over a directory of JSON files, with no
        database and no dashboard. This is the payoff for choosing a boring format.
      </p>

      <H2 id="test" text="Testing the recorder" />
      <p>
        The failure modes are all about writing, so the tests are all about a directory that cannot
        be written to.
      </p>
      <CodeBlock
        label="__tests__/trajectory.test.js"
        code={`import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withTrajectory } from '../src/agent/trajectory.js';

let dir;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sentinel-traj-'));
  process.env.SENTINEL_TRAJECTORY_DIR = dir;
});
after(async () => {
  delete process.env.SENTINEL_TRAJECTORY_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function* scripted(events) {
  for (const ev of events) yield ev;
}

describe('withTrajectory', () => {
  test('passes every event through untouched', async () => {
    const source = [
      { event: 'text', data: { delta: 'hi' } },
      { event: 'finish', data: { usage: { inputTokens: 3, outputTokens: 1 }, costUsd: 0.001 } },
    ];
    const out = [];
    for await (const ev of withTrajectory(scripted(source), { runId: 'testrun', prompt: 'q' })) {
      out.push(ev);
    }
    assert.deepEqual(out, source);
  });

  test('records one JSONL line per event, with cost on the finish line', async () => {
    for await (const _ of withTrajectory(
      scripted([
        { event: 'text', data: { delta: 'a' } },
        { event: 'finish', data: { usage: { inputTokens: 3, outputTokens: 1 }, costUsd: 0.25 } },
      ]),
      { runId: 'costrun', prompt: 'q', model: 'm', mode: 'PLAN' },
    )) { /* drain */ }

    const lines = (await readFile(join(dir, 'costrun.jsonl'), 'utf8')).trim().split('\\n').map(JSON.parse);
    assert.equal(lines[0].event, 'start');
    assert.ok(lines.some((l) => l.event === 'text'));
    const finish = lines.find((l) => l.event === 'finish');
    assert.equal(finish.costUsd, 0.25, 'cost must be on the finish line, not a separate event');
  });

  test('truncates a huge tool result rather than writing it whole', async () => {
    for await (const _ of withTrajectory(
      scripted([{ event: 'tool_result', data: { output: 'x'.repeat(50_000) } }]),
      { runId: 'bigrun' },
    )) { /* drain */ }

    const lines = (await readFile(join(dir, 'bigrun.jsonl'), 'utf8')).trim().split('\\n').map(JSON.parse);
    assert.match(lines[0].data, /\\[truncated\\]/);
    assert.ok(lines[0].data.length < 5000, 'a trace line must stay small');
  });

  test('still yields the source when the trajectory dir cannot be created', async () => {
    process.env.SENTINEL_TRAJECTORY_DIR = join(dir, 'nope', '\\0bad', 'path');
    const out = [];
    for await (const ev of withTrajectory(scripted([{ event: 'text', data: { delta: 'x' } }]), {
      runId: 'failrun',
    })) out.push(ev);
    assert.equal(out.length, 1, 'logging must never break the turn it observes');
  });
});`}
      />
      <Callout title="The last test is the one that matters">
        <p>
          It asserts the property that justifies the whole design: an unwritable trajectory directory
          produces no file and no exception, and the turn still completes. If that test ever fails,
          a permissions problem on someone&rsquo;s machine has become an outage on their machine.
        </p>
      </Callout>

      <H2 id="verify" text="Run it" />
      <CodeBlock
        label="terminal"
        code={`# a real turn, recorded
sentinel ask "list the exported functions in src/agent/budget.js"

# the trace it just wrote
ls -t .sentinel/trajectories/*.jsonl | head -1

# summarise it without writing any code
node -e "
  const { loadTrajectory } = await import('./src/agent/replay.js');
  const t = loadTrajectory(process.argv[1]);
  console.log(JSON.stringify(t.summary, null, 2));
" $(ls -t .sentinel/trajectories/*.jsonl | head -1)`}
      />

      <H2 id="next" text="What part 7 adds" />
      <p>
        The loop yields events and writes a trace, but a{" "}
        <code className="font-mono text-[13px]">for await</code> loop is not a chat. Part 7 builds
        the interactive surface on top of the same generator &mdash; an async generator as the
        interface between the agent and whatever is drawing it, which is what lets a terminal UI, a{" "}
        <code className="font-mono text-[13px]">--json</code> pipeline and an MCP server share one
        implementation.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why JSONL instead of a proper tracing library?",
            a: "Three reasons, in order of how much they matter. It is append-only, so a crash mid-turn leaves a complete record of everything before the crash rather than a truncated buffer. It is dependency-free, which matters more than it sounds for a tool whose pitch is that you can read all of it. And it is greppable, so debugging becomes `grep tool_result .sentinel/trajectories/*.jsonl` instead of a query language. You can export it to OpenTelemetry later without touching the producers.",
          },
          {
            q: "How do I record events without risking the turn?",
            a: "Wrap the generator rather than instrumenting its body. `withTrajectory(source)` yields every event through untouched and does its logging on the way past, so there is nothing to forget to add when a new event type appears. Then make every write best-effort: a disk full must not kill a turn that has already spent money, because the output you care about is on the user's screen.",
          },
          {
            q: "What should I actually look at when a turn goes wrong?",
            a: "The tool calls that produced an error, in order, with their inputs. Not the text the model wrote. The model is usually correct about what it was trying to do. Start from `summarizeEvents`, which already reduces a trace to the tool sequence, the files written, the errors and the finish state, and diff that against a run that worked.",
          },
          {
            q: "Does recording every turn cost anything at runtime?",
            a: "A synchronous append per event, which is microseconds for the line sizes involved, plus a 4,000-character truncation per data payload so a 30,000-character tool result does not become a 30,000-character line. The truncation is the part that matters: without it, one `cat` of a file directory produces a trace file measured in megabytes and the logging becomes the performance problem it was meant to help you diagnose.",
          },
        ]}
      />

      <Cta
        title="Continue with part 7"
        body="Turn the event generator into a chat interface that streams, cancels and shares one implementation across three front ends."
        href="/blog/chat-cli-async-generators"
        cta="Part 7: async generators"
      />

      <p className="text-sm text-muted">
        The recorder ships in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/blob/main/src/agent/trajectory.js"
          className="text-moss underline-offset-4 hover:underline"
        >
          src/agent/trajectory.js
        </a>
        . Turn it off with <code className="font-mono text-[13px]">SENTINEL_NO_TRAJECTORY=1</code>.
      </p>
    </>
  ),
} satisfies Post;
