/**
 * Trigger-spec parsing, kept out of `watch.js` so the loop module stays
 * importable by the TUI without pulling in commander.
 *
 *   interval:300000   every 5 minutes
 *   command:npm test  when this exits non-zero
 *   command:git status --porcelain --when always   regardless of exit code
 *   file:src/api.js   when its mtime moves
 *   git               when HEAD moves
 *   once              immediately, then never again
 */
import { TRIGGER_TYPES } from './watch.js';

export function parseTrigger(spec) {
  const s = String(spec || '').trim();
  if (!s) throw new Error('empty trigger');
  const idx = s.indexOf(':');
  const type = (idx === -1 ? s : s.slice(0, idx)).trim();
  const rest = idx === -1 ? '' : s.slice(idx + 1).trim();

  if (!TRIGGER_TYPES.includes(type)) {
    throw new Error(`unknown trigger "${type}" (expected ${TRIGGER_TYPES.join(', ')})`);
  }

  switch (type) {
  case 'interval': {
    const ms = Number(rest);
    if (!Number.isFinite(ms) || ms < 1000) {
      throw new Error(`interval needs a duration in ms of at least 1000, got "${rest}"`);
    }
    return { type, everyMs: ms };
  }
  case 'command': {
    // A trigger command may itself contain colons (a URL, a Windows path),
    // so only a trailing ` --when ` clause is treated as an option.
    const m = /^(.*?)\s+--when\s+(always|fail)\s*$/i.exec(rest);
    const command = (m ? m[1] : rest).trim();
    if (!command) throw new Error('command trigger needs a command');
    return { type, command, when: (m?.[2] || 'fail').toLowerCase() };
  }
  case 'file': {
    if (!rest) throw new Error('file trigger needs a path');
    return { type, path: rest };
  }
  case 'git':
    return { type };
  case 'once':
    return { type };
  default:
    throw new Error(`unhandled trigger type ${type}`);
  }
}

export function parseTriggers(specs) {
  const list = Array.isArray(specs) ? specs : [specs];
  if (!list.length) throw new Error('at least one --trigger is required');
  return list.map(parseTrigger);
}
