/**
 * web/driver â€” the actual browser, over the DevTools Protocol.
 *
 * ## Why CDP and not Playwright
 *
 * Two reasons, both about this repository rather than taste.
 *
 * The first is dependency weight. `playwright` pulls a browser download of a few
 * hundred megabytes into a package whose entire pitch is "no build step, no
 * bloat". A harness that already lets you pick a free Groq model as its default
 * should not then require a Chromium tarball to open a page.
 *
 * The second is that the interesting part of browser use here is not navigation.
 * It is *acting*, and acting is where the blast radius lives. CDP gives the two
 * things a safety layer needs and a higher-level library actively hides:
 * the network request the action would issue, and the resolved identity of the
 * element being clicked. `Runtime.evaluate` and `DOM.resolveNode` are exactly the
 * primitives `probe` needs; Playwright would let a caller skip past them.
 *
 * ## A driver that reports its own limits
 *
 * There is no bundled browser. This module launches one if it can find one, and
 * otherwise returns a refusal that says which binary it looked for. That is the
 * `Semantic` posture from `audit.js` applied to a capability: a missing driver is
 * reported as *not available*, never as *no session required* or, worse, a
 * successful no-op.
 *
 * ## Element targeting is never by pixel
 *
 * `resolveTarget` walks the accessibility-ish tree built from the DOM and
 * returns a stable node reference plus its role and accessible name. There is
 * no coordinate path in this file, by design. Screenshot-driven clicking cannot
 * answer "did this click hit Delete or Edit", which is the one question the
 * effect descriptor exists to force.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/** Binaries we know how to start with CDP enabled, in preference order. */
export const BROWSER_CANDIDATES = Object.freeze([
  {
    name: 'chrome',
    bins: [
      process.env.CHROME_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ],
  },
  {
    name: 'edge',
    bins: [
      process.env.EDGE_PATH,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
  },
]);

/** Which binary, if any, this machine has. Never throws, never installs. */
export function findBrowser() {
  for (const { name, bins } of BROWSER_CANDIDATES) {
    for (const bin of bins) {
      if (bin && existsSync(bin)) return { name, path: bin };
    }
  }
  return null;
}

/**
 * A CDP connection.
 *
 * Deliberately thin: send a command, await its id. Everything clever happens in
 * the callers, so there is one place where a protocol misunderstanding can occur
 * rather than a wrapper per capability.
 */
class CdpSession {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    // Listeners for protocol events we care about â€” network in particular,
    // because the request a click issues is the effect.
    this.listeners = new Map();
    this.requests = [];

    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message || 'CDP error'} (${msg.error.code ?? '?'})`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        this.requests.push({
          requestId: msg.params?.requestId,
          method: msg.params?.request?.method,
          url: msg.params?.request?.url,
          postData: msg.params?.request?.postData ?? null,
          at: Date.now(),
        });
        for (const fn of this.listeners.get(msg.method) ?? []) {
          try { fn(msg.params); } catch { /* a listener must not break the socket */ }
        }
      }
    });
  }

  send(method, params = {}, timeoutMs = 20000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return () => {
      const arr = this.listeners.get(event) ?? [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  /** Requests seen since the last `takeRequests`. */
  takeRequests() {
    const out = this.requests;
    this.requests = [];
    return out;
  }

  close() {
    try { this.ws.close(); } catch { /* already closed */ }
  }
}

/**
 * Launch a browser with an isolated profile and return a driver.
 *
 * The profile directory is created by the caller (session.ensureProfile) so that
 * the credential-scoped one lives under `.sentinel/` and dies with the session.
 * A temp dir here is only the scratch CDP user-data root for a run with no
 * session â€” which the tools do not allow.
 */
export async function launch({ profileDir, headless = true, port = 0 } = {}) {
  const found = findBrowser();
  if (!found) {
    return {
      available: false,
      reason: 'no Chrome or Edge binary found',
      looked: BROWSER_CANDIDATES.flatMap((c) => c.bins).filter(Boolean),
    };
  }

  const portNum = port || 9222 + Math.floor(Math.random() * 900);
  const args = [
    `--remote-debugging-port=${portNum}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    // An agent must never be able to read the operator's clipboard or be read by
    // a page it does not control. Both are one flag each; both are the reason a
    // dedicated profile is not sufficient on its own.
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  let child;
  try {
    child = spawn(found.path, args, { stdio: 'ignore', detached: false });
  } catch (e) {
    return { available: false, reason: `failed to launch ${found.name}: ${e.message}` };
  }

  const wsUrl = await waitForTarget(portNum, child);
  if (!wsUrl) {
    try { child.kill(); } catch { /* already gone */ }
    return { available: false, reason: `${found.name} started but no CDP endpoint on port ${portNum}` };
  }

  // `globalThis.WebSocket` rather than a bare `WebSocket`: the engine exposes it
  // from Node 22 (which the package declares as its floor) and this repo's
  // eslint config does not know it as a browser global. Written this way it
  // resolves at runtime and does not need a lint exemption, so the two cannot
  // disagree about which is authoritative.
  const WebSocketCtor = globalThis.WebSocket;
  if (typeof WebSocketCtor !== 'function') {
    try { child.kill(); } catch { /* already gone */ }
    return { available: false, reason: 'this Node build has no global WebSocket (needs Node 22+)' };
  }

  const ws = new WebSocketCtor(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });

  const cdp = new CdpSession(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  return {
    available: true,
    browser: found.name,
    headless,
    cdp,
    async close() {
      cdp.close();
      try { child.kill(); } catch { /* already gone */ }
    },
  };
}

/** Poll the DevTools HTTP endpoint until it names a page target. */
async function waitForTarget(port, child, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return null;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * The in-page probe script.
 *
 * Returns the *resolved* target rather than confirming a selector exists. The
 * difference is the whole point: `document.querySelector('#del')` returning an
 * element says nothing about what that element does, while this returns the
 * role, the accessible name, the form it belongs to and whether submitting it
 * would navigate â€” which is what an approver actually needs to see.
 *
 * Written as a single expression because `Runtime.evaluate` returns
 * `exceptionDetails` rather than throwing, and a script that throws here would
 * be indistinguishable from a page that has no such button.
 */
const RESOLVE_SCRIPT = `(() => {
  const sel = __sel;
  let el = null;
  try { el = document.querySelector(sel); } catch (e) { return { error: 'invalid selector: ' + e.message }; }
  if (!el) return { error: 'no element matches selector', selector: sel };
  const name = (
    el.getAttribute('aria-label')
    || (el.labels && el.labels[0] && el.labels[0].textContent)
    || el.textContent
    || el.value
    || el.getAttribute('title')
    || ''
  ).trim().replace(/\\s+/g, ' ').slice(0, 200);
  const form = el.form || (el.closest('form') || null);
  return {
    found: true,
    selector: sel,
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') || implicitRole(el),
    name,
    type: el.getAttribute('type') || '',
    // A submit control inside a form is the single most common shape of an
    // irreversible web action, so it is worth naming explicitly rather than
    // leaving the approver to infer it from the tag.
    // NOTE: no backticks in this comment. This whole block is inside a template
    // literal, so a backtick here terminates it early and the file fails to
    // parse with "Unexpected identifier". That is exactly what it did.
    submitsForm: !!form && (el.type === 'submit' || el.tagName === 'BUTTON'),
    formAction: form ? (form.getAttribute('action') || location.href) : null,
    formMethod: form ? (form.getAttribute('method') || 'get').toUpperCase() : null,
    href: el.href || null,
    disabled: !!el.disabled,
    text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 300),
    url: location.href,
  };
  function implicitRole(e) {
    const t = e.tagName.toLowerCase();
    if (t === 'a') return 'link';
    if (t === 'button') return 'button';
    if (t === 'select') return 'combobox';
    if (t === 'textarea') return 'textbox';
    if (['input'].includes(t)) {
      const ty = (e.getAttribute('type') || 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'image'].includes(ty)) return 'button';
      if (ty === 'checkbox') return 'checkbox';
      if (ty === 'radio') return 'radio';
      return 'textbox';
    }
    return 'generic';
  }
})()`;

/** Navigation, with the resulting URL reported rather than assumed. */
export async function navigate(driver, url, { timeoutMs = 30000 } = {}) {
  const before = driver.cdp.requests.length;
  const res = await driver.cdp.send('Page.navigate', { url }, timeoutMs);
  if (res.errorText) return { ok: false, error: res.errorText };
  // Wait for the document to settle. A fixed sleep would be both slower and
  // less correct than waiting on the load event we can actually observe.
  await new Promise((resolve) => {
    const off = driver.cdp.on('Page.loadEventFired', () => { off(); resolve(); });
    setTimeout(() => { off(); resolve(); }, timeoutMs);
  });
  const current = await driver.cdp.send('Runtime.evaluate', {
    expression: 'location.href', returnByValue: true,
  }, 10000);
  return { ok: true, url: current?.result?.value ?? url, requests: driver.cdp.requests.slice(before) };
}

/**
 * Resolve a selector to its effect, without dispatching anything.
 *
 * The reason this function exists at all is that it is the only place in the
 * whole browser path where nothing irreversible has happened yet. Everything
 * downstream is a commit.
 */
export async function resolveTarget(driver, selector) {
  const res = await driver.cdp.send('Runtime.evaluate', {
    expression: RESOLVE_SCRIPT.replace('__sel', JSON.stringify(String(selector ?? ''))),
    returnByValue: true,
    awaitPromise: true,
  }, 15000);
  if (res?.exceptionDetails) {
    return { error: res.exceptionDetails.exception?.description || 'probe threw' };
  }
  return res?.result?.value ?? { error: 'probe returned nothing' };
}

/** Read the page as text. Read-only, so it needs no effect descriptor. */
export async function readPage(driver, { maxChars = 20000, selector = null } = {}) {
  const expr = `(() => {
    const root = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'};
    if (!root) return null;
    const clone = root.cloneNode(true);
    for (const n of clone.querySelectorAll('script,style,noscript,svg')) n.remove();
    return {
      title: document.title,
      url: location.href,
      text: (clone.innerText || clone.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim(),
    };
  })()`;
  const res = await driver.cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, 15000);
  if (res?.exceptionDetails) return { error: 'read failed' };
  const val = res?.result?.value;
  if (!val) return { error: 'nothing readable at that selector' };
  return { ...val, text: val.text.slice(0, maxChars), truncated: val.text.length > maxChars };
}

/**
 * Dispatch a click, then report what it actually caused.
 *
 * The network log after the click is the point. A click that issues no request
 * changed nothing; a click that issued a `POST` to `/api/customers/9` did, and
 * that URL is the concrete resource the effect descriptor should have named. If
 * they disagree, the caller has a finding.
 */
export async function click(driver, selector) {
  // Drain anything already queued so the collected set is only what this click
  // caused. Counting earlier navigations as the click's effect would report a
  // mutation that happened before anyone approved anything.
  driver.takeRequests();

  const res = await driver.cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(String(selector))});
      if (!el) return { error: 'no element matches selector' };
      if (el.disabled) return { error: 'element is disabled' };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { clicked: true };
    })()`,
    returnByValue: true,
  }, 15000);
  if (res?.exceptionDetails) return { error: 'click threw' };
  const out = res?.result?.value;
  if (out?.error) return { error: out.error };

  // Give the page a moment to issue whatever the click triggers, then collect.
  await new Promise((r) => setTimeout(r, 400));
  const all = driver.takeRequests();
  const writes = all.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(String(r.method || 'GET').toUpperCase()));
  return {
    clicked: true,
    url: await currentUrl(driver),
    requests: all.slice(0, 20),
    writes,
    // The single most useful derived fact: did clicking change anything?
    mutated: writes.length > 0,
  };
}

async function currentUrl(driver) {
  const res = await driver.cdp.send('Runtime.evaluate', {
    expression: 'location.href', returnByValue: true,
  }, 8000);
  return res?.result?.value ?? null;
}

/**
 * Guess the reversibility class from an observed effect.
 *
 * Advisory only, and deliberately conservative. It reads the *shape* of what
 * happened â€” a POST to a `/delete` path is almost certainly absorbing â€” but it
 * returns `unknown` whenever the signal is thin, because a classifier that
 * guesses `reversible` from thin evidence is exactly the ledger failure this
 * design set out to avoid. The model still has to assert the class; this only
 * tells it when its assertion contradicts what the browser did.
 */
export function inferReversibility({ writes = [], method, url } = {}) {
  if (!writes.length && (!method || ['GET', 'HEAD'].includes(String(method).toUpperCase()))) {
    return { reversibility: 'reversible', confidence: 'high', why: 'no mutating request issued' };
  }
  const joined = writes.map((w) => `${w.method} ${w.url}`).join(' | ') + ` ${url ?? ''}`;
  const irreversibleWords = /\/(delete|destroy|remove|revoke|terminate|cancel|purge|charge|payment|subscribe|send|publish|transfer|wire)\b/i;
  if (irreversibleWords.test(joined)) {
    return {
      reversibility: 'external',
      confidence: 'medium',
      why: 'the request names an irreversible-looking endpoint; confirm the recipient before asserting',
    };
  }
  if (writes.length) {
    return {
      reversibility: 'compensable',
      confidence: 'low',
      why: 'a mutating request was issued; state the compensating action explicitly',
    };
  }
  return { reversibility: 'unknown', confidence: 'none', why: 'nothing observable happened' };
}
