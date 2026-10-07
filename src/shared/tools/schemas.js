/**
 * Tool input schemas — mirror the Nightcode zod schemas so we can swap the
 * Vercel AI SDK in later if desired. These produce validator functions that
 * throw on invalid input and return the (possibly default-filled) value.
 */

import { isReadOnlyTool } from '../schemas/mode.js';

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

function str(field, opts = {}) {
  return validator(input => {
    const v = input[field];
    if (v === undefined) {
      if (opts.optional) return { ok: true, value: undefined };
      if ('default' in opts) return { ok: true, value: opts.default };
      return { ok: false, error: `${field} is required` };
    }
    if (typeof v !== 'string') {
      return { ok: false, error: `${field} must be a string` };
    }
    return { ok: true, value: v };
  });
}

export const toolInputSchemas = {
  readFile: str('path'),
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
    if (typeof input.name !== 'string' || input.name.length === 0) {
      return { ok: false, error: 'name is required' };
    }
    return { ok: true, value: { name: input.name } };
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

export const READ_ONLY_TOOL_NAMES = ['readFile', 'listDirectory', 'glob', 'grep', 'codeMap', 'searchWeb', 'fetchUrl', 'todoRead', 'skill', 'bgCheck', 'teamStatus'];
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
  'bgRun',
  'spawnTeammate',
  'sendMessage',
  'teamMerge',
];

export function isReadOnly(toolName) {
  return isReadOnlyTool(toolName);
}
