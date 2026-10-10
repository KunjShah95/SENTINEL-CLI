/**
 * Tool input schemas — mirror the Nightcode zod schemas so we can swap the
 * Vercel AI SDK in later if desired. These produce validator functions that
 * throw on invalid input and return the (possibly default-filled) value.
 */

import { isReadOnlyTool } from '../schemas/mode.js';
import { normalizeSkillArgs } from '../../agent/skills.js';

function validator(check) {
  const v = (input = {}) => {
    if (typeof input !== 'object' || input === null) {
      throw new Error('Tool input must be an object');
    }
    const result = check(input);
    if (!result.ok) throw new Error(result.error);
    return result.value;
  };
  v._isValidator = true;
  v.parse = v;
  return v;
}

/**
 * One required (or optional, or defaulted) string field.
 *
 * The projected value is `{ [field]: value }`, not the bare string. It has to
 * be: every validator in this file returns the shape the *implementation*
 * expects, and an implementation expects `{ path }`, not `'src/x.js'`. Getting
 * this wrong was invisible while these validators were never invoked — with the
 * validator live, `readFile` would have received the bare string and every read
 * would fail on `input?.path`.
 */
function str(field, opts = {}) {
  return validator(input => {
    const v = input[field];
    if (v === undefined) {
      if (opts.optional) return { ok: true, value: {} };
      if ('default' in opts) return { ok: true, value: { [field]: opts.default } };
      return { ok: false, error: `${field} is required` };
    }
    if (typeof v !== 'string') {
      return { ok: false, error: `${field} must be a string` };
    }
    return { ok: true, value: { [field]: v } };
  });
}

/**
 * `readFile`'s validator, spelled out rather than using `str()` because it also
 * carries the windowing parameters. `offset`/`limit` are optional and must be
 * non-negative integers when present — a negative offset silently reading from
 * the end of a file is a worse failure than a rejected call.
 */
export const toolInputSchemas = {
  readFile: validator(input => {
    // Missing and wrong-typed are distinguished deliberately. A model that sent
    // `{path: 42}` did send a path, and "path is required" sends it looking for
    // an empty value instead of fixing the type — the message is what it acts on.
    if (input.path === undefined || input.path === null) {
      return { ok: false, error: 'path is required' };
    }
    if (typeof input.path !== 'string') {
      return { ok: false, error: 'path must be a string' };
    }
    if (input.path.length === 0) {
      return { ok: false, error: 'path is required' };
    }
    const value = { path: input.path };
    for (const f of ['offset', 'limit']) {
      if (input[f] === undefined) continue;
      if (!Number.isInteger(input[f]) || input[f] < 0) {
        return { ok: false, error: `${f} must be a non-negative integer` };
      }
      value[f] = input[f];
    }
    return { ok: true, value };
  }),
  listDirectory: validator(input => {
    if (input.path === undefined) return { ok: true, value: { path: '.' } };
    if (typeof input.path !== 'string') return { ok: false, error: 'path must be a string' };
    return { ok: true, value: { path: input.path } };
  }),
  glob: validator(input => {
    if (typeof input.pattern !== 'string' || input.pattern.length === 0) {
      return { ok: false, error: 'pattern is required' };
    }
    return {
      ok: true,
      value: { pattern: input.pattern, path: input.path ?? '.' },
    };
  }),
  grep: validator(input => {
    if (typeof input.pattern !== 'string' || input.pattern.length === 0) {
      return { ok: false, error: 'pattern is required' };
    }
    return {
      ok: true,
      value: {
        pattern: input.pattern,
        path: input.path ?? '.',
        include: input.include,
      },
    };
  }),
  codeMap: validator(input => {
    if (input.path !== undefined && typeof input.path !== 'string') {
      return { ok: false, error: 'path must be a string' };
    }
    return { ok: true, value: { path: input.path ?? '.' } };
  }),
  writeFile: validator(input => {
    if (typeof input.path !== 'string') return { ok: false, error: 'path is required' };
    if (typeof input.content !== 'string') return { ok: false, error: 'content is required' };
    return { ok: true, value: { path: input.path, content: input.content } };
  }),
  editFile: validator(input => {
    if (typeof input.path !== 'string') return { ok: false, error: 'path is required' };
    if (typeof input.oldString !== 'string') return { ok: false, error: 'oldString is required' };
    if (typeof input.newString !== 'string') return { ok: false, error: 'newString is required' };
    return {
      ok: true,
      value: { path: input.path, oldString: input.oldString, newString: input.newString },
    };
  }),
  bash: validator(input => {
    if (typeof input.command !== 'string' || input.command.length === 0) {
      return { ok: false, error: 'command is required' };
    }
    return {
      ok: true,
      value: {
        command: input.command,
        description: input.description,
        timeout: typeof input.timeout === 'number' ? input.timeout : undefined,
      },
    };
  }),
  searchWeb: validator(input => {
    if (typeof input.query !== 'string' || input.query.length === 0) {
      return { ok: false, error: 'query is required' };
    }
    return {
      ok: true,
      value: {
        query: input.query,
        count:
          typeof input.count === 'number' && input.count >= 1 && input.count <= 20
            ? input.count
            : 5,
      },
    };
  }),
  fetchUrl: validator(input => {
    if (typeof input.url !== 'string' || input.url.length === 0) {
      return { ok: false, error: 'url is required' };
    }
    return {
      ok: true,
      value: {
        url: input.url,
        maxChars:
          typeof input.maxChars === 'number' && input.maxChars >= 500 && input.maxChars <= 40000
            ? input.maxChars
            : undefined,
        // 'direct' forces the free local fetch and spends no Context.dev
        // credits. Useful when fetchUrl is called in a loop.
        prefer: input.prefer === 'direct' ? 'direct' : undefined,
      },
    };
  }),
  // ── Browser tools ──
  //
  // `webAct` does NOT validate the effect descriptor here. That is deliberate:
  // a schema that accepts a missing descriptor and defaults it would make the
  // gate in `web-tools.js` unreachable, and the whole design rests on the
  // descriptor being mandatory. The tool returns a refusal the model can read
  // and correct, which is the same treatment `normalizeTaskCall` gives an
  // unknown action.
  webSession: validator(input => ({
    ok: true,
    value: {
      action: input.action ?? 'open',
      sessionId: input.sessionId,
      label: input.label,
      origins: Array.isArray(input.origins) ? input.origins : undefined,
      leaseMs: typeof input.leaseMs === 'number' ? input.leaseMs : undefined,
      irreversibleCeiling:
        typeof input.irreversibleCeiling === 'number' ? input.irreversibleCeiling : undefined,
    },
  })),
  webRead: validator(input => ({
    ok: true,
    value: {
      sessionId: input.sessionId,
      url: input.url,
      selector: input.selector,
      maxChars: typeof input.maxChars === 'number' ? input.maxChars : undefined,
    },
  })),
  webProbe: validator(input => ({
    ok: true,
    value: { sessionId: input.sessionId, selector: input.selector },
  })),
  webAct: validator(input => ({
    ok: true,
    value: {
      sessionId: input.sessionId,
      selector: input.selector,
      kind: input.kind === 'type' ? 'type' : 'click',
      effect: input.effect,
    },
  })),
  memoryRecall: validator(input => {
    if (typeof input.query !== 'string' || input.query.length === 0) {
      return { ok: false, error: 'query is required' };
    }
    return {
      ok: true,
      value: {
        query: input.query,
        limit:
          typeof input.limit === 'number' && input.limit >= 1 && input.limit <= 25 ? input.limit : 5,
        project: typeof input.project === 'string' ? input.project : undefined,
      },
    };
  }),
  memoryRemember: validator(input => {
    if (typeof input.content !== 'string' || input.content.trim().length === 0) {
      return { ok: false, error: 'content is required' };
    }
    const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 10) : undefined);
    return {
      ok: true,
      value: {
        content: input.content,
        concepts: strings(input.concepts),
        files: strings(input.files),
        project: typeof input.project === 'string' ? input.project : undefined,
        agentId: typeof input.agentId === 'string' ? input.agentId : undefined,
      },
    };
  }),
  batchEdit: validator(input => {
    const operations = input.operations;
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 10) {
      return { ok: false, error: 'operations must be an array of 1-10 edit operations' };
    }
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (typeof op.filePath !== 'string')
        return { ok: false, error: `operations[${i}].filePath is required` };
      if (typeof op.oldString !== 'string')
        return { ok: false, error: `operations[${i}].oldString is required` };
      if (typeof op.newString !== 'string')
        return { ok: false, error: `operations[${i}].newString is required` };
    }
    return {
      ok: true,
      value: {
        operations,
        fallback: typeof input.fallback === 'boolean' ? input.fallback : false,
      },
    };
  }),
  diffFile: validator(input => {
    if (typeof input.path !== 'string') return { ok: false, error: 'path is required' };
    if (typeof input.newContent !== 'string') return { ok: false, error: 'newContent is required' };
    return { ok: true, value: { path: input.path, newContent: input.newContent } };
  }),
  todoWrite: validator(input => {
    if (!Array.isArray(input.todos) || input.todos.length === 0) {
      return { ok: false, error: 'todos must be a non-empty array' };
    }
    return { ok: true, value: { todos: input.todos } };
  }),
  todoRead: validator(_input => {
    return { ok: true, value: {} };
  }),
  skill: validator(input => {
    // `name` is one skill; `names` is several. Either satisfies the requirement —
    // refusing `names` on the grounds that `name` is missing would be an
    // argument about naming, not about whether the call is well-formed.
    const hasName = typeof input.name === 'string' && input.name.length > 0;
    const hasNames = Array.isArray(input.names) && input.names.length > 0;
    if (!hasName && !hasNames) {
      return { ok: false, error: 'name is required (or `names`, to stack several)' };
    }
    // Only the key that was supplied appears in the projected value. Adding
    // `names: undefined` would change the shape every other validator here
    // returns, and a caller comparing shapes would see a difference.
    return {
      ok: true,
      value: {
        ...(hasName ? { name: input.name } : {}),
        ...(hasNames ? { names: input.names } : {}),
        // Accepted as an array or a bare string. See `normalizeSkillArgs` —
        // rejecting the string form fails a correct intent over punctuation.
        args: normalizeSkillArgs(input.args),
      },
    };
  }),
  runSkillScript: validator(input => {
    if (typeof input.name !== 'string' || input.name.length === 0) {
      return { ok: false, error: 'name is required' };
    }
    if (typeof input.script !== 'string' || input.script.trim().length === 0) {
      return { ok: false, error: 'script is required (a path relative to the skill directory)' };
    }
    return {
      ok: true,
      value: {
        name: input.name,
        script: input.script,
        args: normalizeSkillArgs(input.args),
        timeout: typeof input.timeout === 'number' ? input.timeout : undefined,
      },
    };
  }),
  spawnAgent: validator(input => {
    if (typeof input.prompt !== 'string' || input.prompt.length === 0) {
      return { ok: false, error: 'prompt is required' };
    }
    return {
      ok: true,
      value: {
        prompt: input.prompt,
        mode: input.mode === 'BUILD' ? 'BUILD' : 'PLAN',
        // A workflow to load into the subagent's context. The subagent follows
        // it instead of improvising; the prompt stays the task.
        skills: input.skills ?? input.skill,
      },
    };
  }),
  undoLastChange: validator(_input => {
    return { ok: true, value: {} };
  }),
  redoLastUndo: validator(_input => {
    return { ok: true, value: {} };
  }),
  runTests: validator(input => {
    if (typeof input.command !== 'string' || input.command.length === 0) {
      return { ok: false, error: 'command is required' };
    }
    return {
      ok: true,
      value: {
        command: input.command,
        timeout: typeof input.timeout === 'number' ? input.timeout : 120000,
      },
    };
  }),
  applyPatch: validator(input => {
    if (typeof input.patch !== 'string' || input.patch.length === 0) {
      return { ok: false, error: 'patch is required' };
    }
    return { ok: true, value: { patch: input.patch } };
  }),
  memoryWrite: validator(input => {
    for (const f of ['name', 'type', 'description', 'body']) {
      if (typeof input[f] !== 'string' || input[f].length === 0) {
        return { ok: false, error: `${f} is required` };
      }
    }
    return { ok: true, value: { name: input.name, type: input.type, description: input.description, body: input.body } };
  }),
  memoryDelete: str('name'),
  bgRun: validator(input => {
    if (typeof input.command !== 'string' || input.command.length === 0) {
      return { ok: false, error: 'command is required' };
    }
    return { ok: true, value: { command: input.command, timeout: typeof input.timeout === 'number' ? input.timeout : undefined } };
  }),
  bgCheck: validator(input => ({ ok: true, value: { id: typeof input.id === 'string' ? input.id : undefined } })),
  spawnTeammate: validator(input => {
    if (typeof input.name !== 'string' || typeof input.prompt !== 'string' || !input.prompt) {
      return { ok: false, error: 'name and prompt are required' };
    }
    return {
      ok: true,
      value: {
        name: input.name,
        prompt: input.prompt,
        mode: input.mode === 'PLAN' ? 'PLAN' : 'BUILD',
        isolation: input.isolation === 'worktree' ? 'worktree' : 'none',
        // Same `skills` field the waited subagent takes, and the same builder
        // renders it — see skill-delegation.js.
        skills: input.skills ?? input.skill,
      },
    };
  }),
  sendMessage: validator(input => {
    if (typeof input.to !== 'string' || typeof input.text !== 'string' || !input.text) {
      return { ok: false, error: 'to and text are required' };
    }
    return { ok: true, value: { to: input.to, text: input.text } };
  }),
  teamStatus: validator(_input => ({ ok: true, value: {} })),
  teamMerge: validator(input => {
    if (typeof input.name !== 'string' || !input.name) return { ok: false, error: 'name is required' };
    const action = ['diff', 'apply', 'discard'].includes(input.action) ? input.action : 'apply';
    return { ok: true, value: { name: input.name, action } };
  }),
};

// `skill` is read-only: it returns a prompt as a tool result and runs nothing.
// `runSkillScript` is deliberately absent — it executes a file, so it belongs to
// the shell category and is gated like `bash`. Keeping the two apart is what
// stops a PLAN-mode turn from acquiring execution by way of a skills folder.
export const READ_ONLY_TOOL_NAMES = ['readFile', 'listDirectory', 'glob', 'grep', 'codeMap', 'searchWeb', 'fetchUrl', 'memoryRecall', 'todoRead', 'skill', 'bgCheck', 'teamStatus', 'webRead'];
export const BUILD_TOOL_NAMES = [
  ...READ_ONLY_TOOL_NAMES,
  'writeFile',
  'editFile',
  'bash',
  'runTests',
  'applyPatch',
  'batchEdit',
  'diffFile',
  'undoLastChange',
  'redoLastUndo',
  'todoWrite',
  'spawnAgent',
  'memoryWrite',
  'memoryDelete',
  'memoryRemember',
  'bgRun',
  'spawnTeammate',
  'sendMessage',
  'teamMerge',
  'runSkillScript',
];

export function isReadOnly(toolName) {
  return isReadOnlyTool(toolName);
}
