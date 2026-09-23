/**
 * Trajectory JSONL → OWASP trace converter.
 *
 * Sentinel records turns as JSONL (see src/agent/trajectory.js):
 *   { ts, runId, seq, event, data?, model?, mode?, usage?, costUsd? }
 * `data` is a truncated JSON string of the {event, data} payload.
 *
 * OWASP trace contract needs:
 *   { messages: [{role, content}], tool_calls: [{name, args}], events: [{type, id?}] }
 */
export function trajectoryJsonlToTrace(jsonlText) {
  const trace = { messages: [], tool_calls: [], events: [] };
  if (!jsonlText || typeof jsonlText !== 'string') return trace;
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let rec;
    try { rec = JSON.parse(trimmed); } catch { continue; }
    const event = rec?.event;
    let data = rec?.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* keep raw string */ }
    }
    if (event === 'text' && typeof data?.delta === 'string') {
      trace.messages.push({ role: 'assistant', content: data.delta });
    } else if (event === 'tool_call' && data) {
      trace.tool_calls.push({
        name: data.toolName ?? data.name ?? 'unknown',
        args: data.input ?? data.args ?? {},
        id: data.toolCallId ?? data.id,
      });
    } else if (event === 'tool_result' && data) {
      // Tool outputs may carry goal markers or secrets — keep as event text
      // so memory_isolation can scan them without re-emitting raw secrets.
      const out = data.output ?? data.error ?? '';
      const s = typeof out === 'string' ? out : JSON.stringify(out);
      if (s) trace.events.push({ type: 'tool_result', id: data.toolCallId ?? '', content: s.slice(0, 2000) });
    } else if (event === 'finish' && data?.model) {
      trace.events.push({ type: 'finish', id: String(data.model) });
    }
  }
  return trace;
}

/**
 * Build an OWASP trace directly from collected runAgentTurn events
 * (used by the live adapter — no JSONL round-trip needed).
 */
export function eventsToTrace(agentEvents, { userMessage = '', goalEventId = null } = {}) {
  const trace = {
    messages: userMessage ? [{ role: 'user', content: userMessage }] : [],
    tool_calls: [],
    events: [],
  };
  for (const ev of agentEvents ?? []) {
    if (ev?.event === 'text' && typeof ev?.data?.delta === 'string') {
      trace.messages.push({ role: 'assistant', content: ev.data.delta });
    } else if (ev?.event === 'tool_call' && ev?.data) {
      trace.tool_calls.push({
        name: ev.data.toolName ?? 'unknown',
        args: ev.data.input ?? {},
        id: ev.data.toolCallId,
      });
    } else if (ev?.event === 'tool_result' && ev?.data) {
      const out = ev.data.output ?? ev.data.error ?? '';
      const s = typeof out === 'string' ? out : JSON.stringify(out);
      trace.events.push({ type: 'tool_result', id: ev.data.toolCallId ?? '', content: String(s).slice(0, 2000) });
    }
  }
  // Goal commitment: explicit is better than inferred. Callers pass the goal
  // the agent actually committed to (or null if it never committed).
  if (goalEventId) trace.events.push({ type: 'goal', id: goalEventId });
  return trace;
}
