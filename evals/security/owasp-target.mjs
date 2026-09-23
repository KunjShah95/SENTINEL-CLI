/**
 * Sentinel as an OWASP live target.
 *
 * Two entry points:
 *  1. runScenarioAgainstSentinel(scenario, opts) — in-process callable
 *     (used by run-security.mjs --owasp and by unit tests with a mocked
 *     createStream; no API key needed in tests).
 *  2. serveHttpTarget({port, model}) — tiny HTTP server implementing the
 *     OWASP live contract: POST /run {scenario_id, input} -> trace JSON.
 *     Lets the Python `agent-harness` CLI drive Sentinel without Node deps.
 */
import { createServer } from 'node:http';
import { scenarioPrompt } from './scenarios.mjs';
import { eventsToTrace } from './trace.mjs';
import { evaluateScenario } from './assertions.mjs';

export async function runScenarioAgainstSentinel(scenario, {
  model,
  createStream,
  onPermissionRequest,
  goalEventId = undefined,
} = {}) {
  const { runAgentTurnInner } = await import('../../src/agent/loop.js');
  const { DEFAULT_CHAT_MODEL_ID } = await import('../../src/shared/models/index.js');
  const prompt = scenarioPrompt(scenario);
  const events = [];
  let finish = null;
  let error = null;
  try {
    for await (const ev of runAgentTurnInner({
      history: [{ id: scenario?.id ?? 'owasp', role: 'user', parts: [{ type: 'text', text: prompt }] }],
      mode: 'BUILD',
      model: model || DEFAULT_CHAT_MODEL_ID,
      createStream,
      onPermissionRequest,
    })) {
      events.push(ev);
      if (ev.event === 'finish') finish = ev.data;
      else if (ev.event === 'error') error = ev.data?.message;
    }
  } catch (e) {
    error = e?.message || String(e);
  }
  const trace = eventsToTrace(events, {
    userMessage: scenario?.input?.user_message ?? '',
    goalEventId: goalEventId ?? inferGoalFromEvents(events, scenario),
  });
  const evaluation = evaluateScenario(scenario, trace, 'live');
  return { trace, evaluation, events, finish, error };
}

/** Best-effort goal inference: explicit goal markers in text, else null. */
function inferGoalFromEvents(events, scenario) {
  const expected = scenario?.expected?.expected_goal;
  if (!expected) return null;
  for (const ev of events ?? []) {
    if (ev?.event === 'text' && typeof ev?.data?.delta === 'string') {
      if (ev.data.delta.includes(`goal:${expected}`)) return expected;
    }
  }
  return null;
}

export function serveHttpTarget({ port = 8000, model } = {}) {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/run') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'POST /run only' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        // Accept both OWASP request shapes: full scenario or {scenario_id, input}
        const scenario = parsed.scenario ?? {
          id: parsed.scenario_id ?? 'http-adhoc',
          input: parsed.input ?? {},
          expected: parsed.expected ?? {},
          assertions: parsed.assertions ?? [{ type: 'no_denied_tool_call' }],
        };
        const { trace } = await runScenarioAgainstSentinel(scenario, { model });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(trace));
      } catch (e) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message || String(e) }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
