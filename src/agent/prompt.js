/**
 * System prompts — composable sections, Claude Code style.
 *
 * Every token here is sent on every turn, so sections stay small and
 * computed: header, environment (cwd/os/git), project context files,
 * skill listing (names only — bodies load on demand), mode guidance,
 * and working rules. Previously one flat string; now each section has
 * its own builder so tests can assert on sections independently.
 */
import { execSync } from 'node:child_process';
import process from 'node:process';
import { Mode } from '../shared/schemas/mode.js';
import { buildSweSystemPrompt } from './swe.js';
import { loadContextFiles, buildContextInjection } from './context-files.js';
import { formatSkillListing } from './skills.js';
import { buildMemorySection } from './memory.js';

export function buildEnvironmentSection(dir = process.cwd()) {
  const branch = currentGitBranch(dir);
  const git = branch ? `git repo (branch: ${branch})` : 'not a git repo';
  return `Environment: working directory ${dir}, OS ${process.platform}, ${git}.`;
}

/**
 * Branch name for `dir`, cached.
 *
 * `git rev-parse` is a process spawn — measured at ~52ms on this machine. It
 * used to run on every `buildEnvironmentSection` call, which is once per turn
 * AND once per subagent turn, so a team of five agents paid 250ms of pure
 * subprocess latency before the first token. The branch does not change while
 * a turn runs, and `flushPromptCache()` exists for the case where it does
 * (a `/theme`-style command, or a teammate that switches branches).
 */
let branchCache = null; // { dir, branch } | null

/** Forget the cached git branch. Call after anything that can change it. */
export function flushPromptCache() {
  branchCache = null;
  systemPromptCache.clear();
}

export function currentGitBranch(dir = process.cwd()) {
  if (branchCache && branchCache.dir === dir) return branchCache.branch;
  let branch = null;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, timeout: 3000 })
      .toString()
      .trim() || null;
  } catch {
    branch = null;
  }
  branchCache = { dir, branch };
  return branch;
}

export function buildProjectContextSection(dir = process.cwd()) {
  return buildContextInjection(loadContextFiles(dir));
}

export function buildSkillListingSection(dir = process.cwd(), options = {}) {
  return formatSkillListing(dir, options);
}

function buildModeSection(mode) {
  if (mode === Mode.PLAN) {
    return {
      modeLine:
        'You are in PLAN mode (read-only). Analyse the request, gather context, ' +
        'and respond with a clear plan. Do NOT modify anything.',
      toolsLine: 'Available tools: readFile, listDirectory, glob, grep, codeMap, searchWeb, fetchUrl, todoRead, skill.',
      rules: ['If you would need writeFile, editFile or bash, say so and stop.'],
    };
  }
  if (mode === Mode.REVIEW) {
    return {
      modeLine: [
        'You are in REVIEW mode — a code reviewer. Review the diff you are given and ' +
          'ALWAYS format your response as:',
        '',
        '## Summary',
        '[1-2 sentences: what changed + overall risk]',
        '## Walkthrough',
        '[what the diff does and why it matters]',
        '## Issues Found',
        '### 🔴 Critical (must fix before merge)',
        '- **[file:line]** Issue title — description 💡 Fix: suggestion',
        '### 🟠 High / 🟡 Medium / 🟢 Low — same format',
        '## Security Checklist',
        '- [x/✗] SQL injection, XSS, hardcoded secrets, command injection, path traversal, authn/authz, input validation, insecure deps',
        '## Score: [A/B/C/D/F]',
        'Omit empty sections. Be specific with file:line references.',
      ].join('\n'),
      toolsLine: 'Available tools: readFile, listDirectory, glob, grep, searchWeb, fetchUrl, todoRead, skill.',
      rules: [],
    };
  }
  return {
    modeLine:
      'You are in BUILD mode with full read/write access to the project. ' +
      'Make changes decisively.',
    toolsLine:
      'Available tools: readFile, listDirectory, glob, grep, codeMap, writeFile, editFile, ' +
      'batchEdit, bash, runTests, applyPatch, searchWeb, fetchUrl, diffFile, undoLastChange, ' +
      'redoLastUndo, todoWrite, todoRead, skill, task, memoryWrite, memoryDelete.',
    rules: [
      'If a bash command fails due to a missing package, install it and retry.',
      'For multi-step work, track progress with todoWrite (send the FULL list every call).',
      'Use the single `task` tool for ALL concurrent work, with an action: ' +
      'action="spawn" delegates a bounded research subtask and returns its summary; ' +
      'action="run" starts a long command (test suite, build, server) and its result arrives as a notification; ' +
      'action="status" lists what is running; ' +
      'action="merge" with merge="diff"|"apply"|"discard" brings a worktree teammate\'s work home. ' +
      'Never start a task you do not intend to wait for: use "spawn" when you need the answer now and ' +
      '"spawn-async"/"run" when you can keep working. ' +
      'For large parallelizable work, propose a small team and wait for the user to confirm before ' +
      'action="spawn-async"; use isolation="worktree" when teammates edit overlapping areas.',
      'Save only durable, non-obvious facts with memoryWrite (user preferences, feedback, project constraints).',
    ],
  };
}

/**
 * Memo for the assembled prompt.
 *
 * Assembling it reads the skill library (up to 10 directories on disk) and the
 * memory index, and it was rebuilt for every turn and every subagent turn,
 * producing a byte-identical result each time. Keyed on everything that can
 * change the output — mode, dir, and request — so a changed request is a cache
 * miss rather than a stale prompt.
 */
const systemPromptCache = new Map();
const SYSTEM_PROMPT_CACHE_CAP = 32;

/**
 * The system prompt for one turn.
 *
 * @param {string} [request] The user's actual ask. Used to rank the skill
 *   listing so the prompt budget goes to relevant skills first; it does not
 *   change the listing's LENGTH, so an empty or absent request is safe and
 *   yields the same prompt as before, minus the budget cap.
 */
export function buildSystemPrompt({ mode = Mode.BUILD, dir = process.cwd(), request = '', crossAgentMemory = '' } = {}) {
  if (mode === 'SWE' || mode === 'SWE') return buildSweSystemPrompt();
  // crossAgentMemory is keyed too: it changes as agentmemory is queried, and a
  // stale cache hit would leak one request's memories into another's prompt.
  const key = JSON.stringify([mode, dir, request, crossAgentMemory]);
  const hit = systemPromptCache.get(key);
  if (hit !== undefined) return hit;
  const built = assembleSystemPrompt({ mode, dir, request, crossAgentMemory });
  if (systemPromptCache.size >= SYSTEM_PROMPT_CACHE_CAP) {
    // Cheap eviction: this cache is small and the oldest key is a fine victim.
    const oldest = systemPromptCache.keys().next().value;
    if (oldest !== undefined) systemPromptCache.delete(oldest);
  }
  systemPromptCache.set(key, built);
  return built;
}

function assembleSystemPrompt({ mode, dir, request, crossAgentMemory }) {
  const header =
    'You are a coding assistant running inside a terminal. ' +
    'You work directly in the user\'s project directory with file and shell tools.';
  const { modeLine, toolsLine, rules } = buildModeSection(mode);
  const baseRules = [
    'Be decisive — pick an approach and execute it.',
    'Never re-read a file you already read in this conversation.',
    'Batch independent tool calls into a single message.',
    'Prefer editFile for small changes; writeFile only for new files or full rewrites.',
    ...rules,
  ];
  const sections = [
    header,
    buildEnvironmentSection(dir),
    modeLine,
    toolsLine,
    baseRules.join('\n'),
  ];
  const context = buildProjectContextSection(dir);
  if (context) sections.splice(2, 0, context);
  const skills = buildSkillListingSection(dir, { request });
  if (skills) sections.push(skills);
  const memory = buildMemorySection(dir);
  if (memory) sections.push(memory);
  // Cross-agent memories go last: they are the least authoritative (another
  // agent's notes, possibly stale) and must not outrank the local record.
  if (crossAgentMemory) sections.push(crossAgentMemory);
  return sections.join('\n\n');
}
