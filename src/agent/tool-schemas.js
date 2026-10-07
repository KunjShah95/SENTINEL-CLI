/**
 * Provider tool schemas — what the model is actually shown.
 *
 * ## Why this left loop.js
 *
 * It is 204 lines of pure data with no dependency on the turn, the stream, or
 * the provider client. It was the largest single block in a module that also
 * held the turn generator and the permission dispatch — three unrelated
 * responsibilities in one file. This is the one that could be lifted without
 * touching a control flow, so it went first.
 *
 * ## Why the shapes are hand-written JSON Schema
 *
 * `src/shared/tools/schemas.js` carries a second, parallel table of ~200 lines
 * of hand-rolled validators for the same inputs. It is never invoked:
 * `executeLocalTool` goes mode-check, permission-check, dispatch, with no
 * validation step, and `buildProviderTools` below reads only
 * `contract.description` plus these schemas.
 *
 * So one tool has three representations, adding a tool means editing all three,
 * and tool inputs are unvalidated at runtime despite 200 lines of validators
 * existing.
 *
 * Recorded here rather than fixed here: collapsing three representations into
 * one changes what the harness *accepts*, and doing that as a side effect of
 * moving a block would hide a behaviour change inside a refactor.
 */
import { getToolContracts } from '../shared/tools/index.js';

export const TOOL_PARAM_SCHEMAS = {
  readFile: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  listDirectory: { type: 'object', properties: { path: { type: 'string' } } },
  glob: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] },
  grep: {
    type: 'object',
    properties: { pattern: { type: 'string' }, path: { type: 'string' } },
    required: ['pattern'],
  },
  codeMap: {
    type: 'object',
    properties: { path: { type: 'string' } },
  },
  searchWeb: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query. Prefer natural-language questions over keyword soup.' },
      count: { type: 'integer', description: 'Results to return (1-20, default 5).' },
    },
    required: ['query'],
  },
  fetchUrl: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL to fetch.' },
      maxChars: { type: 'integer', description: 'Truncate the extracted text to this many characters (default 8000).' },
      prefer: {
        type: 'string',
        enum: ['auto', 'direct'],
        description: '"auto" (default) renders JavaScript via Context.dev when a key is configured. "direct" forces the free local fetch and spends no credits.',
      },
    },
    required: ['url'],
  },
  writeFile: {
    type: 'object',
    properties: { path: { type: 'string' }, content: { type: 'string' } },
    required: ['path', 'content'],
  },
  editFile: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      oldString: { type: 'string' },
      newString: { type: 'string' },
    },
    required: ['path', 'oldString', 'newString'],
  },
  batchEdit: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            oldString: { type: 'string' },
            newString: { type: 'string' },
          },
          required: ['filePath', 'oldString', 'newString'],
        },
      },
    },
    required: ['operations'],
  },
  bash: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'integer', description: 'Timeout in seconds (values ≥1000 are read as ms)' },
      description: { type: 'string' },
    },
    required: ['command'],
  },
  runTests: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'integer', description: 'Timeout in seconds (values ≥1000 are read as ms)' },
    },
    required: ['command'],
  },
  applyPatch: {
    type: 'object',
    properties: { patch: { type: 'string' } },
    required: ['patch'],
  },
  redoLastUndo: { type: 'object', properties: {} },
  todoWrite: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'string' },
          },
          required: ['id', 'title', 'status'],
        },
      },
    },
    required: ['todos'],
  },
  todoRead: { type: 'object', properties: {} },
  skill: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  spawnAgent: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      mode: { type: 'string' },
    },
    required: ['prompt'],
  },
  diffFile: {
    type: 'object',
    properties: { path: { type: 'string' }, newContent: { type: 'string' } },
    required: ['path', 'newContent'],
  },
  undoLastChange: { type: 'object', properties: {} },
  memoryWrite: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
      description: { type: 'string' },
      body: { type: 'string' },
    },
    required: ['name', 'type', 'description', 'body'],
  },
  memoryDelete: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  bgRun: {
    type: 'object',
    properties: { command: { type: 'string' }, timeout: { type: 'integer', description: 'Timeout in seconds' } },
    required: ['command'],
  },
  bgCheck: { type: 'object', properties: { id: { type: 'string' } } },

  /**
   * The unified task tool.
   *
   * `action` is required and enumerated because the whole point is that the
   * model does not have to guess between six names. The properties are a union
   * on purpose — JSON Schema `oneOf` is poorly supported across providers, and
   * an optional-everything schema is more robust than a strict one that gets
   * rejected. The handler validates per action and says what is missing.
   */
  task: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['spawn', 'spawn-async', 'run', 'status', 'check', 'merge', 'cancel', 'message'],
        description: 'What to do. "spawn" waits for the result; "spawn-async" reports back later.',
      },
      prompt: { type: 'string', description: 'Required for spawn and spawn-async.' },
      mode: { type: 'string', enum: ['BUILD', 'PLAN'], description: 'For spawn/spawn-async. Defaults to PLAN then BUILD.' },
      name: { type: 'string', description: 'Teammate name, for spawn-async and merge.' },
      isolation: { type: 'string', enum: ['none', 'worktree'], description: 'For spawn-async.' },
      command: { type: 'string', description: 'Required for run.' },
      timeout: { type: 'integer', description: 'Seconds, for run.' },
      id: { type: 'string', description: 'For check and cancel.' },
      to: { type: 'string', description: 'For message. Use "lead" to reach the lead.' },
      text: { type: 'string', description: 'For message.' },
      merge: { type: 'string', enum: ['diff', 'apply', 'discard'], description: 'For merge.' },
    },
    required: ['action'],
  },
  spawnTeammate: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      prompt: { type: 'string' },
      mode: { type: 'string', enum: ['BUILD', 'PLAN'] },
      isolation: { type: 'string', enum: ['none', 'worktree'] },
    },
    required: ['name', 'prompt'],
  },
  sendMessage: {
    type: 'object',
    properties: { to: { type: 'string' }, text: { type: 'string' } },
    required: ['to', 'text'],
  },
  teamStatus: { type: 'object', properties: {} },
  teamMerge: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      action: { type: 'string', enum: ['diff', 'apply', 'discard'] },
    },
    required: ['name'],
  },
};

/**
 * The legacy concurrency names. Their contracts and dispatch still exist so an
 * old trajectory keeps replaying, but the model is never offered them: showing
 * both `task` and its seven spellings leaves the model to choose between them,
 * which is the problem the unified tool was introduced to solve.
 */
export const LEGACY_TASK_TOOLS = Object.freeze([
  'spawnAgent', 'bgRun', 'bgCheck', 'spawnTeammate', 'sendMessage', 'teamStatus', 'teamMerge',
]);

/**
 * The tool list for one request.
 *
 * Pure over its inputs. Mode decides which contracts are in scope; the schemas
 * above supply the parameters.
 */
export function buildProviderTools(mode, externalTools = []) {
  const contracts = getToolContracts(mode);
  const local = Object.entries(contracts)
    .filter(([name]) => TOOL_PARAM_SCHEMAS[name])
    .filter(([name]) => !LEGACY_TASK_TOOLS.includes(name))
    .map(([name, contract]) => ({
      type: 'function',
      function: {
        name,
        description: contract.description,
        parameters: TOOL_PARAM_SCHEMAS[name],
      },
    }));
  // External MCP tools are appended after local ones so a third-party server
  // can never shadow a Sentinel builtin (its namespaced name can't collide,
  // but ordering also keeps the local block cache-stable).
  const external = (externalTools || []).map((t) => ({
    type: 'function',
    function: {
      name: t.namespacedName,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
  return [...local, ...external];
}
