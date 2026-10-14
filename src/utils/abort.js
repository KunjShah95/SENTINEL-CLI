/**
 * One cancellation source, composed with a deadline.
 *
 * The agent already has exactly one way to be stopped: the `AbortSignal` its
 * caller passed in. Every HTTP call honours it, because `providers.js` hands it
 * straight to `fetch`. Tool execution did not, which meant Ctrl-C could abort the
 * model stream but leave a `bash` child process running with nobody left to read
 * its output. One signal that only reaches half the work is worse than no
 * signal, because the caller is told it stopped.
 *
 * This is the one place a deadline and that signal are merged, so a tool cannot
 * accidentally honour the deadline and ignore the abort (or the reverse). The
 * reason is preserved rather than flattened to a boolean: "the user pressed
 * Ctrl-C" and "the fetch took 30s" want different messages, and a caller that
 * cannot tell them apart reports the wrong one to the user.
 *
 * `AbortSignal.any` would express the merge in one line, but it landed in Node
 * 20.3 and this package supports Node 20.0, so the four lines are hand-rolled.
 */

/**
 * Compose `outer` with a timeout into one signal.
 *
 * @param {AbortSignal|null|undefined} outer  The caller's cancellation source.
 * @param {number|null} timeoutMs             Optional deadline.
 * @returns {{signal: AbortSignal, aborted: () => boolean, timedOut: () => boolean, dispose: () => void}}
 */
export function composeAbort(outer = null, timeoutMs = null) {
  const controller = new AbortController();
  let aborted = false;
  let timedOut = false;

  const onOuterAbort = () => {
    aborted = true;
    controller.abort(outer?.reason);
  };

  if (outer) {
    if (outer.aborted) onOuterAbort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }

  const timer = timeoutMs
    ? setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs)
    : null;

  return {
    signal: controller.signal,
    aborted: () => aborted,
    timedOut: () => timedOut,
    /**
     * Drop the timer and the listener. Without this every completed request
     * leaves a pending timeout holding the event loop open, and a long agent
     * turn accumulates one per tool call.
     */
    dispose() {
      if (timer) clearTimeout(timer);
      if (outer && !aborted) outer.removeEventListener('abort', onOuterAbort);
    },
  };
}

/**
 * A run that stopped because its clock ran out.
 *
 * A named error rather than a bare `abort()`, because "cancelled" and "out of
 * time" reach the user through the same signal and the difference is the whole
 * point: one is something you did, the other is something the run did. A
 * deadline that aborts indistinguishably from Ctrl-C teaches users that the
 * timer is unreliable, which is the opposite of having one.
 */
export class DeadlineExceeded extends Error {
  constructor(ms) {
    super(`time budget of ${ms}ms exceeded`);
    this.name = 'DeadlineExceeded';
    this.ms = ms;
  }
}

/**
 * Read an abort signal as a stop reason.
 *
 * Returns `{ kind, message }`, where `kind` is one of `running` (not stopped),
 * `interrupted` (the user), `deadline` (the run's own budget) or `aborted`
 * (something else aborted it, and we do not get to guess which). The three stop
 * kinds are never merged, because the caller reports them to a human and they
 * call for different responses — one is something you did, one is a fault, and
 * one is unknown.
 */
export function abortReason(signal) {
  if (!signal?.aborted) return { kind: 'running', message: 'Running.' };
  const reason = signal.reason;
  if (reason instanceof DeadlineExceeded) {
    return { kind: 'deadline', message: `Stopped: ${reason.message}.` };
  }
  // `controller.abort()` with no argument yields a DOMException named AbortError,
  // which is what a Ctrl-C and an Esc keypress look like by the time they arrive.
  if (!reason || reason.name === 'AbortError') {
    return { kind: 'interrupted', message: 'Interrupted.' };
  }
  return { kind: 'aborted', message: reason?.message ? String(reason.message) : 'Aborted.' };
}
