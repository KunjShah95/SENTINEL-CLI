import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "chat-cli-async-generators",
  title: "One agent, three front ends: async generators as the interface",
  metaTitle: "Chat CLI With Async Generators",
  description:
    "Why an agent loop should yield events instead of printing: async generators let a terminal UI, a JSON pipeline and an MCP server share one implementation, and make cancellation free.",
  date: "2026-10-11",
  readingMinutes: 12,
  tags: ["Tutorial", "Node.js", "Architecture"],
  keyword: "chat cli async generators",
  series: { slug: "cursor-cli-course", order: 7 },
  related: ["first-agent-turn-claude-agent-sdk", "live-agent-loop-tracking", "mcp-server-for-coding-agents"],
  faq: [
    {
      q: "Why not just have the agent loop call console.log?",
      a: "Because the moment you need a second consumer you have to undo it. A loop that prints cannot also produce JSON for a pipeline, feed an MCP server, or be driven by a test without a human watching. Yielding typed events costs about the same code and makes every consumer a `for await` loop. The test is simple: if you cannot run your agent headless and diff its output, you cannot regression-test it.",
    },
    {
      q: "How does this make cancellation free?",
      a: "Break out of a `for await` loop and JavaScript calls the generator's `.return()`, which runs its `finally` blocks. So cancelling a turn means `break`ing in the consumer, no abort flag threaded through five layers, no orphaned child process, no half-written file. The one thing you still need is an AbortSignal to stop the HTTP request itself, because the socket does not know about your loop.",
    },
    {
      q: "Should the TUI be React, or can it be plain readline?",
      a: "A full-screen TUI that repaints needs something that owns the terminal, and Ink over React is the cheapest thing that works. The important architectural point is that the choice is *contained*: `use-agent-chat.ts` is the only file that knows Ink exists, and it consumes the same events as the CLI and the MCP server. Write the loop against a plain interface first, and the front end becomes a replaceable detail.",
    },
    {
      q: "What about backpressure, what if the consumer is slow?",
      a: "For a terminal UI it does not matter, because a human reads slower than tokens arrive. But the loop is an async generator, so a slow consumer naturally applies backpressure: it just stops pulling, the HTTP stream's reader stops being drained, and the provider's socket buffer fills. That is the correct behaviour and it is free. Where you need to be careful is unbounded buffering inside your own loop, never accumulate an answer into a growing string when you can yield deltas.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          The single highest-leverage decision in an agent CLI is whether the loop{" "}
          <strong>prints</strong> or <strong>yields</strong>. Yielding typed events costs about the
          same code and turns every front end into a five-line <code className="font-mono text-[13px]">
          for await</code> loop.
        </p>
        <p>
          Two things you get for free from async generators:{" "}
          <strong>cancellation</strong>: breaking out of the loop runs the generator&rsquo;s
          <code className="font-mono text-[13px]">finally</code> blocks, so no orphaned processes, 
          and <strong>backpressure</strong>, because a slow consumer stops pulling and the socket
          buffer does the rest.
        </p>
      </KeyTakeaways>

      <H2 id="problem" text="The shape you start with, and when it hurts" />
      <p>
        Every agent starts by printing, because printing is how you see whether anything works. The
        problem appears the second you need the same agent somewhere else.
      </p>
      <CodeBlock
        label="src/agent/loop.js: the version that hurts"
        code={`export async function runAgentTurn(opts) {
  for (let iter = 0; iter < 25; iter++) {
    const res = await callModel(opts);
    process.stdout.write(res.text);                  // (a) prints

    if (!res.toolCalls.length) break;

    for (const tc of res.toolCalls) {
      const out = await execute(tc);
      console.error(\`→ \${tc.name}\`);                // (b) prints
      opts.onTool?.(tc, out);                        // (c) a callback
    }
  }
  console.error('done');                             // (d) prints
}`}
      />
      <p>
        Three separate problems, and notice that none of them are visible until you need the second
        consumer:
      </p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted marker:text-ink-700">
        <li>
          <strong className="text-paper">Output is not data.</strong>{" "}
          <code className="font-mono text-[13px]">runAgentTurn</code> returns{" "}
          <code className="font-mono text-[13px]">undefined</code>. There is nothing to write to a
          file, pipe to jq, or assert on in a test.
        </li>
        <li>
          <strong className="text-paper">The callback is a second API.</strong>{" "}
          <code className="font-mono text-[13px]">onTool</code> handles tools but not text or errors,
          so every new consumer needs a new callback and you are back to the same problem.
        </li>
        <li>
          <strong className="text-paper">Cancellation is manual.</strong> To stop a turn you need a
          flag the loop checks, plus one that the tool executor checks, plus one the provider checks.
          Three places to forget.
        </li>
      </ul>

      <H2 id="contract" text="The contract, in full" />
      <p>
        This is the entire public surface. Five event types, each a plain object with no class and no
        closure over loop internals.
      </p>
      <CodeBlock
        label="src/agent/loop.js"
        code={`/**
 * The agent loop, ONE turn of user input to completion.
 *
 * Streams model output, executes tool calls in-process, feeds results back,
 * and repeats until the model stops calling tools (or MAX_ITERATIONS).
 * Yields ChatEvent-shaped events: { event, data } where event is one of
 *   'text' | 'reasoning' | 'tool_call' | 'tool_result' | 'finish' | 'error' | 'done'
 *
 * This replaces the deleted Hono server's /chat route, no HTTP, no process
 * boundary: the TUI and CLI call it directly.
 */
export async function* runAgentTurn(opts = {}) {
  // ... yields, never prints
  yield { event: 'text', data: { delta: ev.text } };
  yield { event: 'tool_call', data: { toolCallId, toolName, input } };
  yield { event: 'tool_result', data: { toolCallId, ok, output } };
  yield { event: 'finish', data: { usage, costUsd, model } };
  yield { event: 'error', data: { message } };
  yield { event: 'done', data: {} };
}`}
      />
      <p>
        The design rule that makes this hold up:{" "}
        <strong>the loop must not know who is reading</strong>. No{" "}
        <code className="font-mono text-[13px]">isTTY</code> checks, no{" "}
        <code className="font-mono text-[13px]">process.stdout.write</code>, no colour. Those belong
        to the consumer. Part 3 made this mistake easy to avoid, and part 7 is where it pays off.
      </p>

      <H2 id="consumers" text="Three consumers, one loop" />
      <p>
        Here is the entire argument. These are the only three front ends in the project, and none of
        them contains agent logic.
      </p>
      <H3 id="c1" text="The headless CLI" />
      <CodeBlock
        label="src/cli/main.js"
        code={`.option('-b, --build', 'Allow file edits and shell commands (BUILD mode)')
.action(async (questionParts, options) => {
  const question = (questionParts || []).join(' ').trim();
  const mode = options.build ? 'BUILD' : 'PLAN';

  for await (const ev of runAgentTurn({ history: [...], mode, model })) {
    // Text to stdout: it is the data. Everything else to stderr: it is decoration.
    if (ev.event === 'text') process.stdout.write(ev.data.delta);
    else if (ev.event === 'tool_call') process.stderr.write(\`\\x1b[2m→ \${ev.data.toolName}\\x1b[0m\\n\`);
    else if (ev.event === 'finish') {
      process.stderr.write(\`\\x1b[2m\${ev.data.usage.inputTokens} in / \${ev.data.usage.outputTokens} out · \${formatUsd(ev.data.costUsd)}\\x1b[0m\\n\`);
    } else if (ev.event === 'error') {
      console.error(\`\\x1b[31m\${ev.data.message}\\x1b[0m\`);
      process.exitCode = 1;
    }
  }
});`}
      />
      <H3 id="c2" text="A JSON pipeline" />
      <CodeBlock
        label="src/cli/main.js"
        code={`// One flag turns the same loop into a machine-readable stream. No second
// implementation, no "headless mode" to keep in sync.
if (options.json) {
  for await (const ev of runAgentTurn(opts)) {
    process.stdout.write(JSON.stringify(ev) + '\\n');
  }
} else {
  await renderHuman(runAgentTurn(opts));
}`}
      />
      <CodeBlock
        label="terminal"
        code={`# count the tool calls in any turn, with no jq gymnastics
sentinel ask --json "how many tools are exposed?" \\
  | grep tool_call | wc -l

# find every turn that errored, across a project's history
sentinel ask --json "..." 2>/dev/null | grep '"event":"error"'`}
      />
      <H3 id="c3" text="An MCP server" />
      <p>
        The third consumer is the one that justifies the design most clearly, because an MCP tool
        must return a single string to its client. With a yielding loop that is a matter of folding
        events into text, and the folding lives in the server rather than in the agent.
      </p>
      <CodeBlock
        label="mcp/sentinel-mcp-server.js"
        code={`// An MCP tool is a single string, so the loop's events get folded here.
// The agent itself has no idea this is how it is being consumed.
async function foldEvents(source) {
  let answer = '';
  for await (const ev of source) {
    if (ev.event === 'text') answer += ev.data.delta;
    else if (ev.event === 'error') throw new Error(ev.data.message);
  }
  return answer;
}

server.tool('sentinel_ask', { question: z.string() }, async ({ question }) => ({
  content: [{ type: 'text', text: await foldEvents(runAgentTurn({ ... })) }],
}));`}
      />

      <H2 id="cancel" text="Cancellation without a flag" />
      <p>
        The best property of async generators, and the one that is invisible until you need it.
        Breaking out of a <code className="font-mono text-[13px]">for await</code> loop calls the
        generator&rsquo;s <code className="font-mono text-[13px]">.return()</code>, which runs its{" "}
        <code className="font-mono text-[13px]">finally</code> blocks.
      </p>
      <CodeBlock
        label="src/agent/loop.js"
        code={`export async function* runAgentTurnInner(opts = {}) {
  let spawned = [];
  try {
    for (let iter = 0; iter < maxIterations; iter++) {
      // ...
      for await (const ev of streamCompletion({ /* ... */ })) {
        // ...
      }
      // ...
    }
    yield { event: 'finish', data: { usage, costUsd, model } };
  } finally {
    // Runs on normal completion, on break, AND on throw. This is the whole
    // argument for using a generator instead of returning an array.
    for (const child of spawned) killTree(child);
  }
}`}
      />
      <p>So the consumer cancels by breaking, and cleanup is guaranteed:</p>
      <CodeBlock
        label="src/tui/hooks/use-agent-chat.ts"
        code={`// Ctrl-C or Esc in the TUI: stop pulling events, and the loop's finally
// kills anything it spawned. No abort flag threaded through every layer.
const onCancel = useCallback(() => {
  setCancelled(true);
}, []);

// ...and in the CLI, Ctrl-C needs the process-level half too:
process.on('SIGINT', () => {
  // Abort the HTTP request: the socket does not know about our loop.
  controller.abort();
  // The generator's finally runs as the for-await unwinds.
});`}
      />
      <Callout title="The part people forget">
        <p>
          Breaking the loop cleans up your{" "}
          <em>JavaScript</em>, not the{" "}
          <em>socket</em>. The HTTP request is a separate resource held by the fetch, and it needs an{" "}
          <code className="font-mono text-[13px]">AbortSignal</code> threaded into the provider call.
          Both halves are needed: the signal stops the request, the generator&rsquo;s{" "}
          <code className="font-mono text-[13px]">finally</code> cleans up what the request left
          behind.
        </p>
      </Callout>

      <H2 id="backpressure" text="Backpressure, for free" />
      <p>
        If the consumer is slower than the tokens &mdash; a TUI repainting, a rate-limited pipe, a
        test collecting events &mdash; a yielding loop handles it correctly without a line of code.
        The consumer stops calling <code className="font-mono text-[13px]">next()</code>, the loop
        stops pulling from the reader, and the provider&rsquo;s socket buffer fills. Nothing is lost;
        the producer simply waits.
      </p>
      <p>
        Where you <em>do</em> need care is your own buffering. Accumulating the whole answer into a
        string and printing at the end defeats the entire mechanism, and re-introduces the &ldquo;silent
        for 40 seconds&rdquo; problem from part 3. Yield the delta; let the consumer decide whether to
        accumulate.
      </p>
      <CodeBlock
        label="wrong, and right"
        code={`// Wrong: buffers the entire turn, prints nothing until the end.
let answer = '';
for await (const ev of stream) if (ev.type === 'text') answer += ev.text;
process.stdout.write(answer);

// Right: the delta goes out as it arrives; accumulation is the caller's choice.
for await (const ev of stream) {
  if (ev.type === 'text') process.stdout.write(ev.text);
}`}
      />

      <H2 id="test" text="Testing three front ends with one stub" />
      <p>
        The payoff. Because the loop takes <code className="font-mono text-[13px]">createStream</code>
        as a parameter, a test drives it with no network and no key, and asserts on the event stream
        rather than on scraped stdout.
      </p>
      <CodeBlock
        label="__tests__/agent-loop.test.js"
        code={`import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAgentTurnInner } from '../src/agent/loop.js';

function scriptedStream(script) {
  return async function* () {
    for (const ev of script) yield ev;
  };
}

const ask = (script, opts = {}) => runAgentTurnInner({
  history: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  model: 'test-model',
  createStream: scriptedStream(script),
  trajectory: false,
  ...opts,
});

const collect = async (source) => {
  const out = [];
  for await (const ev of source) out.push(ev);
  return out;
};

describe('the event contract', () => {
  test('yields text deltas, then finish and done, in that order', async () => {
    const out = await collect(ask([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'there' },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } },
    ]));

    assert.deepEqual(
      out.filter((e) => e.event === 'text').map((e) => e.data.delta),
      ['Hello ', 'there'],
    );
    assert.equal(out.at(-2).event, 'finish');
    assert.equal(out.at(-1).event, 'done');
  });

  test('finish always carries usage and a model id', async () => {
    const out = await collect(ask([{ type: 'text', text: 'hi' }]));
    const finish = out.find((e) => e.event === 'finish');
    assert.ok(finish.data.usage, 'cost accounting must never receive a missing field');
    assert.ok(finish.data.model);
  });

  test('the loop yields rather than printing: stdout stays empty', async () => {
    const writes = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
    try {
      await collect(ask([{ type: 'text', text: 'should not be printed' }]));
    } finally {
      process.stdout.write = realWrite;
    }
    assert.deepEqual(writes, [], 'the loop must not write to stdout');
  });
});`}
      />
      <p>
        That third test is the guard rail for the whole architectural decision. Once someone adds a
        convenient <code className="font-mono text-[13px]">console.log</code> to the loop for
        debugging, it fails immediately &mdash; which is exactly when you want to find out.
      </p>

      <H2 id="gotchas" text="Three async-generator gotchas" />
      <CompareTable
        caption="Async generator pitfalls when a loop becomes an event stream"
        head={["Pitfall", "What happens", "Fix"]}
        rows={[
          [
            "Promise vs generator confusion",
            "runAgentTurn looks synchronous, so callers await it and get the generator object back, no events, no error",
            "Name it for what it is. Sentinel returns runAgentTurn, not runAgentTurnAsync, but the return type is AsyncGenerator and the docs say so",
          ],
          [
            "Errors thrown inside the loop",
            "A throw unwinds the consumer's for-await and they must catch it separately from the error event",
            "Prefer yielding { event: 'error' } for anything the user caused; reserve throws for programmer errors",
          ],
          [
            "Cleanup in finally never runs",
            "You break out of the loop and an orphaned child process survives",
            "Register the child inside the generator's scope so finally can see it; assert it in a test that breaks early",
          ],
        ]}
      />

      <H2 id="next" text="What part 8 adds" />
      <p>
        The loop yields, three front ends share it, and cancelling is clean. What it does not yet have
        is a way to say{" "}
        <em>this agent may not write files</em>. Part 8 is permission modes: a small set of named
        allowlists, enforced in the loop rather than in the prompt, including the{" "}
        <code className="font-mono text-[13px]">FIX</code> mode that grants writes while withholding
        the shell &mdash; the one mode that makes &ldquo;let it edit but do not let it execute&rdquo; real
        rather than a promise.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Why not just have the agent loop call console.log?",
            a: "Because the moment you need a second consumer you have to undo it. A loop that prints cannot also produce JSON for a pipeline, feed an MCP server, or be driven by a test without a human watching. Yielding typed events costs about the same code and makes every consumer a `for await` loop. The test is simple: if you cannot run your agent headless and diff its output, you cannot regression-test it.",
          },
          {
            q: "How does this make cancellation free?",
            a: "Break out of a `for await` loop and JavaScript calls the generator's `.return()`, which runs its `finally` blocks. So cancelling a turn means `break`ing in the consumer, no abort flag threaded through five layers, no orphaned child process, no half-written file. The one thing you still need is an AbortSignal to stop the HTTP request itself, because the socket does not know about your loop.",
          },
          {
            q: "Should the TUI be React, or can it be plain readline?",
            a: "A full-screen TUI that repaints needs something that owns the terminal, and Ink over React is the cheapest thing that works. The important architectural point is that the choice is *contained*: `use-agent-chat.ts` is the only file that knows Ink exists, and it consumes the same events as the CLI and the MCP server. Write the loop against a plain interface first, and the front end becomes a replaceable detail.",
          },
          {
            q: "What about backpressure, what if the consumer is slow?",
            a: "For a terminal UI it does not matter, because a human reads slower than tokens arrive. But the loop is an async generator, so a slow consumer naturally applies backpressure: it just stops pulling, the HTTP stream's reader stops being drained, and the provider's socket buffer fills. That is the correct behaviour and it is free. Where you need to be careful is unbounded buffering inside your own loop, never accumulate an answer into a growing string when you can yield deltas.",
          },
        ]}
      />

      <Cta
        title="Continue with part 8"
        body="Permission modes as code: a small set of named allowlists the model cannot argue its way past."
        href="/blog/agent-ask-plan-modes"
        cta="Part 8: permission modes"
      />

      <p className="text-sm text-muted">
        The reference for what each mode can do is{" "}
        <Link href="/docs/modes" className="text-moss underline-offset-4 hover:underline">
          the modes documentation
        </Link>
        .
      </p>
    </>
  ),
} satisfies Post;
