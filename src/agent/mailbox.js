/**
 * Mailboxes — the delivery channel between the loop and anything running
 * beside it (ported from learn-claude-code s08 notification queue + s13
 * MessageBus).
 *
 * Background commands and teammates never write into another agent's
 * messages[]. They post to a named mailbox; each agent's loop drains its
 * own box right before the next model call and injects the batch as one
 * user message. "Pending" tracks work an agent is still owed so the loop
 * can wait instead of ending a turn with results in flight.
 */
const boxes = new Map(); // name -> message[]
const waiters = new Map(); // name -> Set<() => void>
const pending = new Map(); // owner -> Set<id>

function wake(name) {
  const set = waiters.get(name);
  if (!set) return;
  waiters.delete(name);
  for (const fn of set) fn();
}

export function post(to, msg) {
  const name = String(to || 'lead');
  if (!boxes.has(name)) boxes.set(name, []);
  boxes.get(name).push({ ts: new Date().toISOString(), ...msg });
  wake(name);
}

export function drain(name = 'lead') {
  const msgs = boxes.get(name) || [];
  boxes.delete(name);
  return msgs;
}

export function mailCount(name = 'lead') {
  return (boxes.get(name) || []).length;
}

export function trackPending(owner, id) {
  if (!pending.has(owner)) pending.set(owner, new Set());
  pending.get(owner).add(id);
}

export function resolvePending(owner, id) {
  pending.get(owner)?.delete(id);
}

export function hasPending(owner = 'lead') {
  return (pending.get(owner)?.size || 0) > 0;
}

/** Resolve when mail arrives for `name`, on timeout, or on abort. */
export function waitForMail(name = 'lead', { timeoutMs = 15 * 60_000, signal } = {}) {
  if (mailCount(name) > 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const state = { timer: null };
    const done = (got) => {
      clearTimeout(state.timer);
      signal?.removeEventListener?.('abort', onAbort);
      waiters.get(name)?.delete(onMail);
      resolve(got);
    };
    const onMail = () => done(true);
    const onAbort = () => done(false);
    if (!waiters.has(name)) waiters.set(name, new Set());
    waiters.get(name).add(onMail);
    // Deliberately NOT unref'd: when the only thing outstanding is this wait,
    // the timer is what keeps the loop alive. Unref'ing it lets Node exit
    // with the promise unsettled — the agent turn would end silently with
    // background work still in flight.
    state.timer = setTimeout(() => done(false), timeoutMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/** Render a drained batch as one model-readable block. */
export function formatNotifications(msgs) {
  const lines = msgs.map((m) => {
    if (m.type === 'background') {
      return `- background ${m.id} [${m.status}] \`${m.command}\` (exit ${m.exitCode})\n${m.output}`;
    }
    if (m.type === 'teammate_result') {
      const where = m.worktree ? ` (worktree ${m.worktree}, branch ${m.branch})` : '';
      return `- teammate ${m.from} finished [${m.status}]${where}\n${m.text}`;
    }
    return `- message from ${m.from}: ${m.text}`;
  });
  return `<notifications>\n${lines.join('\n')}\n</notifications>`;
}

export function resetMailboxes() {
  boxes.clear();
  waiters.clear();
  pending.clear();
}
