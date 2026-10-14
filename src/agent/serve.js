/**
 * `sentinel agent serve` — the second consumer of a run.
 *
 * The CLI prints a run. This forwards one over Server-Sent Events, and the two
 * share no code past `startRun`. That is the design claim being tested: if the
 * server had to reach into the loop, or reimplement a budget check, or special-
 * case an event, then the "one primitive, interchangeable consumers" story was
 * a refactor that happened to have one caller, and the fix would be to move that
 * capability down rather than to duplicate it here.
 *
 * So the rule for this file is narrow: no agent behaviour. It starts runs, it
 * carries events, it carries cancellation. Every decision about *when* a run
 * stops is `startRun`'s, and the only thing added here is `POST /runs/:id/cancel`
 * routing a stop request to the same controller Ctrl-C uses in the terminal.
 *
 * Deliberately absent: authentication, multi-tenancy, replay from an offset,
 * concurrent-run quotas. Each is a product decision that would need a threat
 * model, and guessing at them here would be worse than not shipping them. What
 * is shipped binds to loopback, because a process that can run shell commands
 * should not be reachable from the network by accident.
 */
import { createServer } from 'node:http';
import { startRun } from './run.js';

/** Loopback only. See the note above. */
export const DEFAULT_HOST = '127.0.0.1';
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function isLoopback(host) {
  return LOOPBACK.has(host);
}

/**
 * Encode one event as an SSE frame.
 *
 * The event name is carried twice — as `event:` and inside the JSON — because
 * a browser client wants the first and a curl user reading a log wants the
 * second, and picking one means half the consumers write a parser they did not
 * have to.
 */
export function sseFrame(event, data) {
  return `event: ${event.event}\ndata: ${JSON.stringify({ event: event.event, ...data })}\n\n`;
}

/**
 * @param {object} [opts]
 * @param {Function} [opts.startRun]  Injected in tests.
 * @param {object} [opts.runOpts]     Defaults for every run this server starts.
 * @returns {import('node:http').Server}
 */
export function createAgentServer(opts = {}) {
  const { startRun: spawn = startRun, runOpts = {} } = opts;

  /** id -> { run, events[], summary, finished, subscribers:Set<res> } */
  const runs = new Map();

  const publish = (id, event) => {
    const entry = runs.get(id);
    if (!entry) return;
    // Buffered, not just forwarded. A client that connects a second late would
    // otherwise miss the run's opening — which is exactly the difference between
    // a consumer equivalent to the terminal and one that only sometimes sees it.
    entry.events.push(event);
    const frame = sseFrame(event, event.data ?? {});
    for (const res of entry.subscribers) res.write(frame);
  };

  const json = (res, code, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
    res.end(payload);
  };

  const readJson = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      // A run description is a task string and some numbers. Anything larger is
      // a mistake or an attack, and either way there is no reason to buffer it.
      if (raw.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean); // ['runs', id, action]

    // ── POST /runs ────────────────────────────────────────────────────────
    if (req.method === 'POST' && parts[0] === 'runs' && parts.length === 1) {
      const body = await readJson(req);
      if (!body || typeof body.task !== 'string' || !body.task.trim()) {
        json(res, 400, { error: 'task is required' });
        return;
      }
      const id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const entry = { events: [], subscribers: new Set(), summary: null, finished: false, run: null };
      runs.set(id, entry);

      entry.run = spawn(body.task, {
        ...runOpts,
        ...pickRunOpts(body),
        onEvent: (ev) => publish(id, ev),
      });
      entry.run.done.then((summary) => {
        entry.summary = summary;
        entry.finished = true;
        const frame = sseFrame({ event: 'summary' }, { ...summary, runId: id });
        for (const sub of entry.subscribers) {
          sub.write(frame);
          sub.end();
        }
        entry.subscribers.clear();
      });

      json(res, 202, { runId: id });
      return;
    }

    // ── GET /runs/:id/events ──────────────────────────────────────────────
    if (req.method === 'GET' && parts[0] === 'runs' && parts.length === 3 && parts[2] === 'events') {
      const entry = runs.get(parts[1]);
      if (!entry) {
        json(res, 404, { error: 'no such run' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      // Replay first, then subscribe — in that order, so no event can slip
      // between the two and be delivered twice.
      for (const ev of entry.events) res.write(sseFrame(ev, ev.data ?? {}));
      if (entry.finished) {
        res.write(sseFrame({ event: 'summary' }, { ...entry.summary, runId: parts[1] }));
        res.end();
        return;
      }
      entry.subscribers.add(res);
      // A disconnected client is normal, not exceptional: closing the tab, a
      // proxy timeout, a curl with a short read timeout. The run continues.
      req.on('close', () => entry.subscribers.delete(res));
      return;
    }

    // ── POST /runs/:id/cancel ─────────────────────────────────────────────
    if (req.method === 'POST' && parts[0] === 'runs' && parts.length === 3 && parts[2] === 'cancel') {
      const entry = runs.get(parts[1]);
      if (!entry) {
        json(res, 404, { error: 'no such run' });
        return;
      }
      if (entry.finished) {
        json(res, 409, { error: 'already finished', stoppedBy: entry.summary?.stoppedBy });
        return;
      }
      entry.run.cancel();
      json(res, 202, { cancelled: true });
      return;
    }

    // ── GET /runs/:id ─────────────────────────────────────────────────────
    if (req.method === 'GET' && parts[0] === 'runs' && parts.length === 2) {
      const entry = runs.get(parts[1]);
      if (!entry) {
        json(res, 404, { error: 'no such run' });
        return;
      }
      json(res, 200, entry.finished
        ? { runId: parts[1], status: 'finished', ...entry.summary }
        : { runId: parts[1], status: 'running', events: entry.events.length });
      return;
    }

    json(res, 404, { error: 'not found' });
  });

  return server;
}

/** The run knobs a caller may set per request. Anything else is ignored. */
function pickRunOpts(body) {
  const out = {};
  if (typeof body.model === 'string') out.model = body.model;
  if (body.mode === 'PLAN' || body.mode === 'BUILD') out.mode = body.mode;
  for (const key of ['maxCostUsd', 'maxTurns', 'maxTokens', 'maxTimeMs']) {
    const v = Number(body[key]);
    if (Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}
