/**
 * Keybinds — an opencode-compatible keybind registry.
 *
 * Action IDs and default chords mirror opencode v2 (`cli.json` → `keybinds`).
 * Using opencode's own IDs means a muscle memory learned in one tool works in
 * the other: leader is `ctrl+x`, the palette is `ctrl+p`, Escape interrupts,
 * `<leader>m` lists models, and so on.
 *
 * Resolution rules follow the opencode spec:
 *   - a binding is a chord string ("ctrl+p", "shift+return"), or
 *     comma-separated alternatives ("ctrl+c,ctrl+d")
 *   - `<leader>x` expands to the configured leader chord plus `x`
 *   - "none" / false disables a binding
 *   - unknown action IDs are rejected rather than silently ignored
 */

export const LEADER_DEFAULT = 'ctrl+x';
export const LEADER_TIMEOUT_DEFAULT = 1500;

/**
 * Actions the owning component implements directly, because what the key means
 * depends on what is on screen (`return` selects an autocomplete item but
 * submits an empty prompt). They are listed here to document opencode parity
 * and are resolved in the component that owns the context, not here.
 */
export const CONTEXTUAL_ACTIONS = Object.freeze([
  'prompt.clear',
  'prompt.submit',
  'prompt.queue',
  'prompt.autocomplete.prev',
  'prompt.autocomplete.next',
  'prompt.autocomplete.hide',
  'prompt.autocomplete.select',
  'prompt.autocomplete.complete',
]);
const CONTEXTUAL_IDS = new Set(CONTEXTUAL_ACTIONS);

/**
 * Application-level defaults, copied from opencode's keybind reference.
 * `null` means "unbound by default", matching an opencode `none` default.
 * Only actions Sentinel can actually service are listed; anything it cannot
 * honour stays null rather than being bound to a no-op.
 */
export const DEFAULT_KEYBINDS = Object.freeze({
  // Application
  leader: LEADER_DEFAULT,
  'app.exit': 'ctrl+c,ctrl+d,<leader>q',
  'command.palette.show': 'ctrl+p',
  'help.show': 'ctrl+/',
  'theme.switch': null,
  'sentinel.mode.toggle': 'ctrl+m',
  // Sentinel extra. opencode's `app.clear` (ctrl+l) is mini-only, so the chord
  // is free in the full TUI; this keeps the session log viewer reachable.
  'sentinel.logs': 'ctrl+l',

  // Session
  'session.interrupt': 'escape',
  'session.new': '<leader>n',
  'session.list': '<leader>l',
  'session.sidebar.toggle': '<leader>b',
  'session.status': '<leader>s',
  'session.compact': '<leader>c',
  'session.undo': '<leader>u',
  'session.redo': '<leader>r',
  'session.export': '<leader>x',
  'session.background': 'ctrl+b',
  'session.rename': 'ctrl+r',
  'session.delete': 'ctrl+d',
  'session.toggle.thinking': '<leader>t',
  'session.toggle.details': '<leader>d',

  // Prompt
  'prompt.editor': '<leader>e,<leader>i',
  'prompt.clear': 'ctrl+c',
  'prompt.submit': null,
  'prompt.queue': '<leader>return',
  'prompt.history.previous': 'up',
  'prompt.history.next': 'down',
  'prompt.autocomplete.prev': 'up,ctrl+p',
  'prompt.autocomplete.next': 'down,ctrl+n',
  'prompt.autocomplete.hide': 'escape',
  'prompt.autocomplete.select': 'return',
  'prompt.autocomplete.complete': 'tab',

  // Input editing
  'input.submit': 'return',
  'input.newline': 'shift+return,ctrl+return,alt+return,ctrl+j',
  'input.move.left': 'left,ctrl+b',
  'input.move.right': 'right,ctrl+f',
  'input.line.home': 'ctrl+a',
  'input.line.end': 'ctrl+e',
  'input.delete.to.line.end': 'ctrl+k',
  'input.delete.to.line.start': 'ctrl+u',
  'input.delete.word.backward': 'ctrl+w,ctrl+backspace,alt+backspace',
  'input.backspace': 'backspace,shift+backspace',
  'input.delete': 'delete,shift+delete',

  // Models and agents
  'model.list': '<leader>m',
  'agent.list': '<leader>a',
  'agent.cycle': 'shift+tab',
  'variant.cycle': 'ctrl+t',
});

const ALL_ACTION_IDS = new Set(Object.keys(DEFAULT_KEYBINDS));

const MOD_ALIASES: Record<string, string> = {
  ctrl: 'ctrl', control: 'ctrl',
  cmd: 'meta', command: 'meta', super: 'meta', win: 'meta',
  alt: 'alt', option: 'alt', opt: 'alt',
  shift: 'shift',
};

/** Key-name aliases, matched on a whole token — never mid-word. */
const KEY_ALIASES: Record<string, string> = {
  enter: 'return',
  esc: 'escape',
  pgdn: 'pagedown',
  pgup: 'pageup',
};

const MOD_ORDER: Record<string, number> = { ctrl: 0, meta: 1, alt: 2, shift: 3 };

/**
 * Canonical form of a chord, so `Ctrl+P`, `ctrl-p` and `CTRL + P` all match.
 * Aliases are applied per token: a naive `esc` → `escape` substitution also
 * fires inside "escape" itself and turns it into "escapeape".
 */
export function normalizeChord(chord: string): string {
  const raw = String(chord).trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!raw) return '';
  const mods: string[] = [];
  const keys: string[] = [];
  for (const part of raw.split(/[-+]/)) {
    if (!part) continue;
    if (part in MOD_ALIASES) {
      const mod = MOD_ALIASES[part];
      if (!mods.includes(mod)) mods.push(mod);
    } else {
      keys.push(KEY_ALIASES[part] ?? part);
    }
  }
  mods.sort((a, b) => MOD_ORDER[a] - MOD_ORDER[b]);
  return [...mods, ...keys].join('+');
}

/** Split "ctrl+c,ctrl+d" into normalized alternatives. Disabled entries drop out. */
function parseChords(spec) {
  if (spec === null || spec === undefined || spec === false) return [];
  if (spec === true) return [];
  if (typeof spec === 'object' && spec !== null && typeof spec.key === 'string') {
    return parseChords(spec.key);
  }
  const raw = Array.isArray(spec) ? spec.join(',') : String(spec);
  if (raw === 'none' || raw === 'false') return [];
  return raw
    .split(',')
    .map(normalizeChord)
    .filter(Boolean);
}

/**
 * Build two lookup tables.
 *
 * opencode resolves a chord against whatever has focus, and that matters:
 * `return` submits in the prompt but selects an item in a dialog, and `escape`
 * interrupts a turn but closes an autocomplete. A single flat table cannot
 * express that — whichever action is compiled first silently wins — so bindings
 * are split by owner: the prompt's table and the app's table.
 */
export function compileKeybinds(overrides: Record<string, unknown> = {}) {
  const leader = normalizeChord(
    String(overrides.leader ?? DEFAULT_KEYBINDS.leader ?? LEADER_DEFAULT)
  );
  const app: Map<string, string> = new Map();
  const prompt: Map<string, string> = new Map();

  const ids = Object.keys({ ...DEFAULT_KEYBINDS, ...overrides });
  for (const id of ids) {
    if (id !== 'leader' && !ALL_ACTION_IDS.has(id)) {
      // opencode rejects unknown command IDs; so do we, loudly.
      throw new Error(`unknown keybind action "${id}"`);
    }
  }

  for (const id of Object.keys(DEFAULT_KEYBINDS)) {
    if (CONTEXTUAL_IDS.has(id)) continue; // resolved by the component that owns it
    const spec = id in overrides ? overrides[id] : DEFAULT_KEYBINDS[id];
    const target = isPromptAction(id) ? prompt : app;
    for (const chord of parseChords(spec)) {
      const resolved = chord.startsWith('<leader>')
        ? leader + chord.slice('<leader>'.length)
        : chord;
      if (resolved === leader) continue; // the leader key alone is not an action
      if (!target.has(resolved)) target.set(resolved, id);
    }
  }
  return { leader, app, prompt, table: app };
}

/** Build a chord with modifiers in canonical order. */
function withMods(key: string, mods: { ctrl?: boolean; shift?: boolean; meta?: boolean; alt?: boolean }): string {
  const out: string[] = [];
  if (mods.ctrl) out.push('ctrl');
  if (mods.meta) out.push('meta');
  if (mods.alt) out.push('alt');
  if (mods.shift) out.push('shift');
  out.push(key);
  return out.join('+');
}

/**
 * The normalized chord for one key event, or null if it is not a chord.
 *
 * Two encodings have to be accepted. Ink decodes ctrl+letter into the bare
 * letter with `key.ctrl` set, which is what actually arrives at runtime; other
 * sources hand over the raw control character instead. Getting this wrong left
 * every ctrl chord dead at runtime while unit tests — which built the event
 * object by hand — passed.
 *
 * Shift is tracked precisely because `shift+return` (insert newline) and
 * `return` (submit) must not collapse into the same chord.
 */
export function chordOf(input: unknown, key: Record<string, unknown> = {}): string | null {
  const mods = {
    ctrl: !!key.ctrl,
    shift: !!key.shift,
    meta: !!key.meta,
    alt: !!key.alt,
  };
  const text = typeof input === 'string' ? input : '';

  // Raw control character: ctrl is already encoded in the byte.
  const code = text.length === 1 ? text.charCodeAt(0) : 0;
  if (code >= 1 && code <= 26) return 'ctrl+' + String.fromCharCode(code + 96);

  if (key.upArrow) return withMods('up', mods);
  if (key.downArrow) return withMods('down', mods);
  if (key.leftArrow) return withMods('left', mods);
  if (key.rightArrow) return withMods('right', mods);
  if (key.pageDown) return withMods('pagedown', mods);
  if (key.pageUp) return withMods('pageup', mods);
  if (key.home) return withMods('home', mods);
  if (key.end) return withMods('end', mods);
  if (key.escape) return withMods('escape', mods);
  if (key.return) return withMods('return', mods);
  if (key.tab) return withMods('tab', mods);
  if (key.backspace) return withMods('backspace', mods);
  if (key.delete) return withMods('delete', mods);

  // Ink's ctrl+letter form.
  if (mods.ctrl && text.length === 1) return withMods(text.toLowerCase(), mods);
  // A bare printable character is a chord too: it is what a <leader>x binding
  // expands to. Returning null here made every leader chord silently dead.
  if (!mods.ctrl && !mods.meta && text.length === 1 && code >= 32) return text.toLowerCase();
  return null;
}

/** The action bound to a chord, or null. `input` is the literal typed chars. */
export function lookup(table: Map<string, string>, input: unknown, key: Record<string, unknown> = {}): string | null {
  const chord = chordOf(input, key);
  return chord ? table.get(chord) ?? null : null;
}

/** Is this an action the prompt owns (input editing) rather than the app? */
export function isInputAction(id: string | null | undefined): boolean {
  return !!id && isPromptAction(id);
}

/**
 * Which table an action belongs to. Prompt-owned ids are the text-editing and
 * history actions; everything else is the application's.
 */
function isPromptAction(id: string): boolean {
  return id.startsWith('input.') || id.startsWith('prompt.history.');
}

/** Read `keybinds` + `leader.timeout` from the Sentinel config, defensively. */
export async function loadKeybindOverrides() {
  try {
    const { configManager } = await import('../config/configManager.js');
    await configManager.load?.();
    const cli = configManager.get?.('cli') ?? {};
    return {
      keybinds: cli.keybinds && typeof cli.keybinds === 'object' ? cli.keybinds : {},
      leaderTimeout: Number(cli.leader?.timeout) || LEADER_TIMEOUT_DEFAULT,
    };
  } catch {
    return { keybinds: {}, leaderTimeout: LEADER_TIMEOUT_DEFAULT };
  }
}

let active = compileKeybinds();

/**
 * A one-line cheat sheet of what the leader chord can do next, derived from the
 * bindings actually in force. Shown when the leader is pressed, the way a
 * which-key does — a remembered chord is worthless if it silently does nothing.
 */
export function leaderHints(leader: string, app: Map<string, string>): string {
  const rows: string[] = [];
  for (const [chord, id] of app) {
    if (!chord.startsWith(leader)) continue;
    const suffix = chord.slice(leader.length);
    if (!suffix || suffix.includes('+')) continue;
    const label = id.replace(/^(session|sentinel|app|command)\./, '');
    rows.push(`${suffix} ${label}`);
  }
  return rows.join(' · ');
}

/** The bindings currently in force (defaults, plus any config overrides). */
export function keybinds() {
  return active;
}

/**
 * Apply config overrides. Called once the config is loaded; every keybinds-aware
 * component reads the same compiled table, so the prompt and the app can never
 * disagree about what a key means.
 */
export function setKeybindOverrides(overrides: Record<string, unknown> | undefined | null) {
  active = compileKeybinds(overrides ?? {});
  return active;
}