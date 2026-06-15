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
  undoLastChange: validator(_input => {
    return { ok: true, value: {} };
  }),
};

export const READ_ONLY_TOOL_NAMES = ['readFile', 'listDirectory', 'glob', 'grep', 'searchWeb'];
export const BUILD_TOOL_NAMES = [
  ...READ_ONLY_TOOL_NAMES,
  'writeFile',
  'editFile',
  'bash',
  'batchEdit',
  'diffFile',
  'undoLastChange',
];

export function isReadOnly(toolName) {
  return isReadOnlyTool(toolName);
}
