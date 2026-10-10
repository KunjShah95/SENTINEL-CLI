import Link from "next/link";
import { Callout, CodeBlock } from "@/components/CodeBlock";
import { CompareTable, Cta, Faq, H2, H3, KeyTakeaways } from "@/components/Post";
import type { Post } from "@/lib/site";

export default {
  slug: "first-agent-turn-claude-agent-sdk",
  title: "Your first agent turn, streamed over raw fetch",
  metaTitle: "Your First AI Agent Turn With Streaming",
  description:
    "Build a streamed agent turn over raw fetch: parse SSE, normalise three provider wire formats into one event shape, and feed tool results back until the model stops asking.",
  date: "2026-10-09",
  readingMinutes: 14,
  tags: ["Tutorial", "Agents", "Streaming", "LLM"],
  keyword: "first ai agent turn streaming",
  series: { slug: "cursor-cli-course", order: 5 },
  related: ["cursor-cli-course-overview", "reduce-llm-cost", "agents-sdk"],
  faq: [
    {
      q: "Do I need the Claude Agent SDK for this, or is raw fetch better?",
      a: "Raw fetch is better for learning and better for a product with more than one provider. The SDK is excellent and it is what I would reach for to ship something tomorrow, it ships file and shell tools, permission modes and hooks that would otherwise be weeks of work. But it hides exactly the two things this part exists to teach: how a tool call is actually assembled from a stream, and why three providers disagree about how to spell it. Once you have read this part, the SDK stops being magic and starts being a convenience.",
    },
    {
      q: "Why normalise provider responses into one event shape?",
      a: "Because the alternative is a switch statement in every consumer. The moment you have a terminal UI, a JSON pipeline and an MCP server, you have three places that each need to understand Anthropic's `content_block_delta` events and OpenAI's `choices[0].delta`. Normalising once at the client boundary means a provider bug is a one-file fix and the loop never learns a provider exists. Sentinel yields five event types (text, reasoning, tool_call, usage, error), and that set has not changed as providers were added.",
    },
    {
      q: "What is the most common SSE bug?",
      a: "Not flushing the buffer after the stream ends. Servers routinely close the connection without a trailing blank line, so the final frame, which usually carries `finish_reason` and the token usage, is still sitting in your accumulator. Drop it and you lose the cost accounting for every single turn. It is worth writing the test that asserts usage is present after a stream that ends without a trailing newline, because that is exactly the case your dev server will never produce.",
    },
    {
      q: "How many tool-call iterations should one turn allow?",
      a: "Bounded, and the bound is a hard stop rather than a suggestion. Sentinel allows 25 for a normal turn and 60 for SWE-bench-style multi-file work, because the number is a claim about how long you are willing to be wrong in a loop. Also bound the request: a turn that accumulates 30k of tool output builds a request the provider will reject, which kills the whole turn rather than one step. Sentinel tombstones old tool results past a character budget while always keeping the task head and the recent tail.",
    },
  ],
  body: () => (
    <>
      <KeyTakeaways>
        <p>
          A turn is a loop, and the loop is not the interesting part. The interesting part is the{" "}
          <strong>client boundary</strong>: one function that turns a provider&rsquo;s wire format into{" "}
          <em>your</em> event shape. Everything downstream (the loop, the UI, the cost accounting) 
          then works against one contract instead of three dialects.
        </p>
        <p>
          The bug you will certainly hit:{" "}
          <strong>flushing the SSE buffer after the stream ends.</strong> Servers routinely close
          without a trailing blank line, and the frame that carries{" "}
          <code className="font-mono text-[13px]">finish_reason</code> and the token usage is still in
          your accumulator. Drop it and you lose the cost of every turn you ever run.
        </p>
      </KeyTakeaways>

      <H2 id="shape" text="The event contract comes first" />
      <p>
        Before any HTTP, decide what your client yields. Sentinel emits exactly five types, and this
        is the whole public surface of the provider layer:
      </p>
      <CodeBlock
        label="src/agent/providers.js"
        code={`/**
 * Unified multi-provider LLM streaming client, raw fetch, no SDKs.
 *
 * Covers OpenAI-compatible endpoints (OpenAI, Groq, Mistral, DeepSeek, xAI,
 * Together, Fireworks, Perplexity, OpenRouter, Ollama, LM Studio, Copilot)
 * plus native Anthropic and Google Gemini wire protocols.
 *
 * Yields normalized events:
 *   { type: 'text', text }                  incremental text
 *   { type: 'reasoning', text }             incremental reasoning/thinking
 *   { type: 'tool_call', id, name, input }  complete tool call
 *   { type: 'usage', usage }                { inputTokens, outputTokens } or null
 *   { type: 'error', message }              fatal provider error
 */`}
      />
      <p>
        Five types, and the fifth is the one people forget. <code className="font-mono text-[13px]">
        error</code> has to be an event rather than a thrown exception, because a provider that
        fails mid-stream has already emitted text you showed the user &mdash; you cannot un-print it.
        An exception unwinds past your terminal and leaves a half-written answer with no explanation.
      </p>

      <H2 id="sse" text="The SSE reader, including the flush that matters" />
      <CodeBlock
        label="src/agent/providers.js"
        code={`/** Read an SSE response body, yielding parsed { type:'frame', json } events. */
async function* sse(res) {
  if (!res.ok || !res.body) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      /* ignore */
    }
    yield { type: 'error', message: formatProviderError(res.status, detail, res.statusText) };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    // Frames are separated by a blank line, so a frame can straddle chunks.
    while ((idx = buf.indexOf('\\n\\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      yield* parseFrame(frame);
    }
  }

  // Flush: servers may end the stream without a trailing blank line, 
  // without this, the final event (often finish_reason + usage) is lost.
  buf += decoder.decode();
  if (buf.trim()) yield* parseFrame(buf);

  function* parseFrame(frame) {
    for (const line of frame.split('\\n')) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') {
          try {
            yield { type: 'frame', json: JSON.parse(data) };
          } catch {
            /* skip malformed frame */
          }
        }
      }
    }
  }
}`}
      />
      <Callout title="Two details in there that are easy to get wrong" tone="warn">
        <p>
          The <code className="font-mono text-[13px]">stream: true</code> flag on the decoder
          matters: a multi-byte character can straddle a chunk boundary, and without it you emit
          replacement
          characters in the middle of a code block. And the final flush is not defensive coding &mdash;
          it is the only reason your cost accounting works.
        </p>
      </Callout>

      <H2 id="openai" text="OpenAI-compatible: reassembling a tool call from fragments" />
      <p>
        This is the part that is genuinely fiddly. A tool call arrives split across many deltas: the
        name in one chunk, then the JSON arguments a few characters at a time. You must accumulate by
        index and only parse once the stream finishes.
      </p>
      <CodeBlock
        label="src/agent/providers.js"
        code={`async function* streamOpenAICompat({ provider, model, messages, tools, apiKey, signal }) {
  const base = OPENAI_COMPAT[provider]();
  const res = await fetch(\`\${base}/chat/completions\`, {
    method: 'POST',
    headers: headersFor(provider, apiKey),
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
    }),
    signal,
  });

  const pending = new Map(); // index -> { id, name, args }
  let sawUsage = false;

  for await (const ev of sse(res)) {
    if (ev.type === 'error') {
      yield ev;
      return;
    }
    const choice = ev.json?.choices?.[0];
    const usage = ev.json?.usage;
    if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
      sawUsage = true;
      yield {
        type: 'usage',
        usage: {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
        },
      };
    }

    const delta = choice?.delta;
    if (!delta) continue;
    if (delta.reasoning_content) yield { type: 'reasoning', text: delta.reasoning_content };
    else if (delta.reasoning) yield { type: 'reasoning', text: delta.reasoning };
    if (delta.content) yield { type: 'text', text: delta.content };

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const i = tc.index ?? 0;
        if (!pending.has(i)) {
          pending.set(i, { id: tc.id || \`call_\${i}_\${Date.now()}\`, name: '', args: '' });
        }
        const slot = pending.get(i);
        if (tc.id) slot.id = tc.id;
        // Name and arguments both arrive in fragments: append, never replace.
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }

    if (choice?.finish_reason) {
      for (const [i, slot] of pending) yield makeToolCall(slot, i);
      pending.clear();
    }
  }

  // Flush again: some servers end without a finish_reason.
  for (const [i, slot] of pending) yield makeToolCall(slot, i);
  if (!sawUsage) yield { type: 'usage', usage: null };
}`}
      />
      <p>
        Three things to copy. <strong>Append, never replace</strong>, for both the name and the
        arguments &mdash; the second fragment of{" "}
        <code className="font-mono text-[13px]">readFile</code> is not the whole function name.{" "}
        <strong>Emit tool calls only at the end</strong>, because the arguments are not valid JSON
        until the last fragment lands. And{" "}
        <strong>always emit a usage event</strong>, even when the provider omits one, so downstream
        cost accounting never has to handle a missing field.
      </p>
      <CodeBlock
        label="src/agent/providers.js"
        code={`function makeToolCall(slot, i) {
  let input = {};
  try {
    input = slot.args ? JSON.parse(slot.args) : {};
  } catch {
    // Truncated stream. Keep the raw text so the model can see what happened
    // rather than receiving a silently empty input.
    input = { _raw: slot.args };
  }
  return { type: 'tool_call', id: slot.id || \`call_\${i}\`, name: slot.name, input };
}`}
      />

      <H2 id="anthropic" text="Anthropic native: the same events, different vocabulary" />
      <p>
        Anthropic does not use deltas-with-indexes. It has typed lifecycle events and one active
        block at a time. The normalisation is mechanical, and writing it out is the fastest way to
        see why a client layer is worth having.
      </p>
      <CodeBlock
        label="src/agent/providers.js"
        code={`async function* streamAnthropic({ model, messages, tools, apiKey, system, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: headersFor('anthropic', apiKey),
    body: JSON.stringify({
      model,
      system,
      messages,
      max_tokens: 8192,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
    }),
    signal,
  });

  let tool = null;
  for await (const ev of sse(res)) {
    if (ev.type === 'error') {
      yield ev;
      return;
    }
    const j = ev.json;

    if (j.type === 'content_block_start') {
      if (j.content_block?.type === 'tool_use') {
        tool = { id: j.content_block.id, name: j.content_block.name, args: '' };
      }
    } else if (j.type === 'content_block_delta') {
      const d = j.delta;
      if (d.type === 'text_delta') yield { type: 'text', text: d.text };
      else if (d.type === 'thinking_delta') yield { type: 'reasoning', text: d.thinking };
      else if (d.type === 'input_json_delta' && tool) tool.args += d.partial_json;
    } else if (j.type === 'content_block_stop' && tool) {
      let input = {};
      try {
        input = tool.args ? JSON.parse(tool.args) : {};
      } catch {
        input = { _raw: tool.args };
      }
      yield { type: 'tool_call', id: tool.id, name: tool.name, input };
      tool = null;
    } else if (j.type === 'message_start' && j.message?.usage) {
      // Anthropic reports input tokens up front and output tokens at the end.
      yield { type: 'usage', usage: { inputTokens: j.message.usage.input_tokens || 0, outputTokens: 0 } };
    }
  }
}`}
      />
      <Callout title="The structural difference worth internalising">
        <p>
          OpenAI lets you have several tool calls in flight, indexed. Anthropic streams one content
          block at a time, so the accumulator is a single variable rather than a Map. Both are
          reasonable designs; they just mean your normalising function is the only place that has to
          know the difference. That is the entire argument for a client boundary.
        </p>
      </Callout>

      <H2 id="errors" text="Turning an HTTP failure into one readable line" />
      <p>
        The provider response body is almost never what you want to show a user. It is JSON-wrapped,
        sometimes doubly. And a bare <code className="font-mono text-[13px]">401</code> costs your
        user ten minutes.
      </p>
      <CodeBlock
        label="src/agent/providers.js"
        code={`const HTTP_HINTS = {
  401: 'Check the API key for this provider: run /setup.',
  403: 'The key is valid but not allowed to use this model: run /setup or pick another with /model.',
  402: 'The provider refused on billing or quota. Pick another model with /model (local Ollama models are free) or add credits.',
  404: 'This model id is not served by the provider. /models lists what is available.',
  429: 'Rate limited. Wait a moment, or switch with /model.',
};

/**
 * Turn a failed provider response into one readable line plus a next step.
 * Most providers wrap the reason as {"error":{"message":...}}; show just that.
 */
export function formatProviderError(status, detail, statusText) {
  let reason = (detail || '').trim();
  try {
    const j = JSON.parse(reason);
    const msg = j?.error?.message ?? j?.message ?? (typeof j?.error === 'string' ? j.error : null);
    if (msg) reason = String(msg);
  } catch {
    /* not JSON: keep the raw text */
  }
  const hint = HTTP_HINTS[status];
  return \`Provider HTTP \${status}: \${reason || statusText}\${hint ? \`
→ \${hint}\` : ''}\`;
}`}
      />
      <p>
        Note the difference between 401 and 403, because it is the one people hit constantly:{" "}
        <strong>401 is &ldquo;your key is wrong&rdquo;, 403 is &ldquo;your key is right and you are not
        allowed to use this model&rdquo;</strong>. The second happens when you copy a model id from a
        provider you do not have a subscription for. Without the hint, both look identical and people
        spend an hour re-checking a key that was never the problem.
      </p>

      <H2 id="loop" text="The loop, with the two bounds that matter" />
      <CodeBlock
        label="src/agent/loop.js"
        code={`const MAX_ITERATIONS = 25;
const SWE_ITERATIONS = SWE_MAX_ITERATIONS; // 60: SWE tasks are multi-file
const TOOL_RESULT_CAP = 20000;
const LOOP_REQUEST_CHAR_BUDGET = 200_000; // ~50k tokens: safe for all providers
const LOOP_KEEP_TAIL = 6;                 // never trim the active context

export async function* runAgentTurnInner(opts = {}) {
  const { history = [], mode = 'BUILD', model, goal } = opts;

  const messages = historyToMessages(history);
  const tools = buildProviderTools(mode);
  const maxIterations = mode === 'SWE' ? SWE_ITERATIONS : MAX_ITERATIONS;

  for (let iter = 0; iter < maxIterations; iter++) {
    const toolCalls = [];
    let text = '';

    // One provider call. Streams text straight through to the consumer.
    for await (const ev of streamCompletion({ modelId: model, messages, tools, system })) {
      if (ev.type === 'text') {
        text += ev.text;
        yield { event: 'text', data: { delta: ev.text } };
      } else if (ev.type === 'tool_call') {
        toolCalls.push(ev);
      }
    }

    // Nothing to do: the model is finished.
    if (!toolCalls.length) break;

    // Execute each call, gate first, and append results as tool messages.
    messages.push({ role: 'assistant', content: text, tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const result = await executeOneTool({ tc, mode });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: result.output });
      yield { event: 'tool_result', data: { toolName: tc.name, ok: !result.output?.error } };
    }

    // A 60-iteration turn accumulating tool output builds a request the
    // provider rejects, which kills the whole turn, not one step.
    messages = trimMessagesForBudget(messages, LOOP_REQUEST_CHAR_BUDGET);
  }
}`}
      />
      <p>
        Both bounds are load-bearing, and the second one is the one people learn by suffering. A
        generous iteration cap plus unbounded tool output produces a request that hits the
        provider&rsquo;s context limit, and the error you get says nothing about which of your last
        forty tool results was the problem.
      </p>
      <CodeBlock
        label="src/agent/loop.js"
        code={`/**
 * Bound in-turn request growth. A 60-iteration SWE turn accumulating 30k
 * tool outputs would otherwise build a megabyte request the provider
 * rejects, killing the whole turn. Oldest tool results are replaced with
 * a tombstone; task head + recent tail are always kept. Pure (no mutation).
 */
export function trimMessagesForBudget(messages, budget = LOOP_REQUEST_CHAR_BUDGET) {
  const size = (list) => JSON.stringify(list).length;
  if (size(messages) <= budget) return messages;

  const out = messages.map((m) => ({ ...m }));
  const tombstone = (m) => {
    const next = { ...m, content: '[trimmed: budget]' };
    // History tool_calls args (e.g. a whole writeFile body) count toward the
    // bound too, truncate them, keeping ids so result linkage still parses.
    if (Array.isArray(next.tool_calls)) {
      next.tool_calls = next.tool_calls.map((tc) => {
        const args = tc?.function?.arguments;
        if (typeof args === 'string' && args.length > 1000) {
          return { ...tc, function: { ...tc.function, arguments: \`\${args.slice(0, 1000)}…[trimmed]\` } };
        }
        return tc;
      });
    }
    return next;
  };

  // Pass 1: tombstone old tool outputs, keep task head + recent tail intact.
  for (let i = 1; i < out.length - LOOP_KEEP_TAIL; i++) {
    if (size(out) <= budget) break;
    const m = out[i];
    if (m.role === 'tool' && m.content !== '[trimmed: budget]') out[i] = tombstone(m);
  }
  // Pass 2: guarantee the bound, trim the largest remaining message oldest-first.
  // ...\${size(out) <= budget ? '' : 'still over'}
}`}
      />
      <p>
        The detail worth stealing: tool call{" "}
        <em>arguments</em> in history count toward the request size too. A single{" "}
        <code className="font-mono text-[13px]">writeFile</code> of a 40,000-character file is in the
        request forever after, so trimming only tool <em>results</em> is not enough. Keep the call id
        when you truncate, or the result can no longer be linked back and the provider rejects the
        message ordering.
      </p>

      <H2 id="test" text="Testing a stream without a network" />
      <p>
        The seam that makes this testable is one parameter: the loop accepts{" "}
        <code className="font-mono text-[13px]">createStream</code>, and every test passes a stub.
      </p>
      <CodeBlock
        label="__tests__/agent-loop.test.js"
        code={`import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAgentTurnInner } from '../src/agent/loop.js';

// A scripted model. One turn of text, then one tool call, then a final answer.
function scriptedStream(script) {
  return async function* () {
    for (const ev of script) yield ev;
  };
}

describe('runAgentTurnInner', () => {
  test('streams text deltas through to the consumer', async () => {
    const out = [];
    for await (const ev of runAgentTurnInner({
      history: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      model: 'test-model',
      createStream: scriptedStream([
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'there' },
        { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } },
      ]),
      trajectory: false,
    })) out.push(ev);

    const text = out.filter((e) => e.event === 'text').map((e) => e.data.delta).join('');
    assert.equal(text, 'Hello there');
    assert.equal(out.at(-1).event, 'done');
  });

  test('a provider error is an event, not a throw', async () => {
    const out = [];
    for await (const ev of runAgentTurnInner({
      history: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      model: 'test-model',
      createStream: scriptedStream([
        { type: 'text', text: 'partial answer' },
        { type: 'error', message: 'Provider HTTP 401: bad key' },
      ]),
      trajectory: false,
    })) out.push(ev);

    // The text we already printed stays printed; the error explains it.
    assert.ok(out.some((e) => e.event === 'text'));
    const err = out.find((e) => e.event === 'error');
    assert.match(err.data.message, /401/);
  });
});`}
      />
      <Callout title="Write the unflushed-stream test">
        <p>
          The one test worth adding beyond these: a stream whose last frame is not followed by a blank
          line, asserting the usage event still arrives. It is the bug from the top of this part, it
          will not reproduce against your dev server, and it silently costs you money on every
          request in production.
        </p>
      </Callout>

      <H2 id="verify" text="Run it" />
      <CodeBlock
        label="terminal"
        code={`export GROQ_API_KEY=gsk_...

# read-only by default: no writes possible, whatever the model decides
sentinel ask "what does src/agent/loop.js do?"

# a real tool call, with the call printed to stderr as it happens
sentinel ask "how many tools does this repo expose?"

# every turn prints its cost, so the client layer is verifiable by eye
sentinel ask -q "say hi"`}
      />
      <p>
        If the cost line at the end of a turn is missing or zero, your SSE flush is broken. That is
        the fastest smoke test for this entire part, and it is why{" "}
        <code className="font-mono text-[13px]">usage</code> is an event rather than an optional
        field.
      </p>

      <H2 id="next" text="What part 6 adds" />
      <p>
        Right now the loop emits events and the CLI prints a few of them. That is enough to use and
        not enough to trust. Part 6 records every event to disk as JSONL and makes the loop
        inspectable after the fact &mdash; which is the prerequisite for the replay-based regression
        suite in{" "}
        <Link href="/blog/evaluate-coding-agent" className="text-moss underline-offset-4 hover:underline">
          evaluating an agent without fooling yourself
        </Link>
        . You cannot debug behaviour you cannot see.
      </p>

      <H2 id="faq" text="Frequently asked questions" />
      <Faq
        items={[
          {
            q: "Do I need the Claude Agent SDK for this, or is raw fetch better?",
            a: "Raw fetch is better for learning and better for a product with more than one provider. The SDK is excellent and it is what I would reach for to ship something tomorrow, it ships file and shell tools, permission modes and hooks that would otherwise be weeks of work. But it hides exactly the two things this part exists to teach: how a tool call is actually assembled from a stream, and why three providers disagree about how to spell it. Once you have read this part, the SDK stops being magic and starts being a convenience.",
          },
          {
            q: "Why normalise provider responses into one event shape?",
            a: "Because the alternative is a switch statement in every consumer. The moment you have a terminal UI, a JSON pipeline and an MCP server, you have three places that each need to understand Anthropic's `content_block_delta` events and OpenAI's `choices[0].delta`. Normalising once at the client boundary means a provider bug is a one-file fix and the loop never learns a provider exists. Sentinel yields five event types (text, reasoning, tool_call, usage, error), and that set has not changed as providers were added.",
          },
          {
            q: "What is the most common SSE bug?",
            a: "Not flushing the buffer after the stream ends. Servers routinely close the connection without a trailing blank line, so the final frame, which usually carries `finish_reason` and the token usage, is still sitting in your accumulator. Drop it and you lose the cost accounting for every single turn. It is worth writing the test that asserts usage is present after a stream that ends without a trailing newline, because that is exactly the case your dev server will never produce.",
          },
          {
            q: "How many tool-call iterations should one turn allow?",
            a: "Bounded, and the bound is a hard stop rather than a suggestion. Sentinel allows 25 for a normal turn and 60 for SWE-bench-style multi-file work, because the number is a claim about how long you are willing to be wrong in a loop. Also bound the request: a turn that accumulates 30k of tool output builds a request the provider will reject, which kills the whole turn rather than one step. Sentinel tombstones old tool results past a character budget while always keeping the task head and the recent tail.",
          },
        ]}
      />

      <Cta
        title="Continue with part 6"
        body="Record every loop event to JSONL so a turn can be inspected, diffed and replayed after the fact."
        href="/blog/live-agent-loop-tracking"
        cta="Part 6: loop tracking"
      />

      <p className="text-sm text-muted">
        All of the code above runs in{" "}
        <a
          href="https://github.com/KunjShah95/SENTINEL-CLI/blob/main/src/agent/providers.js"
          className="text-moss underline-offset-4 hover:underline"
        >
          src/agent/providers.js
        </a>
        . Free tiers are enough for every command in this part.
      </p>
    </>
  ),
} satisfies Post;
