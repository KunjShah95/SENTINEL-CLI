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
  let git = 'not a git repo';
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, timeout: 3000 })
      .toString()
      .trim();
    git = `git repo (branch: ${branch})`;
  } catch {
    // Not a repo or git missing — the sentence above already says so.
  }
  return `Environment: working directory ${dir}, OS ${process.platform}, ${git}.`;
}

export function buildProjectContextSection(dir = process.cwd()) {
  return buildContextInjection(loadContextFiles(dir));
}

export function buildSkillListingSection(dir = process.cwd()) {
  return formatSkillListing(dir);
}

function buildModeSection(mode) {
  if (mode === Mode.PLAN) {
    return {
      modeLine:
        'You are in PLAN mode (read-only). Analyse the request, gather context, ' +
        'and respond with a clear plan. Do NOT modify anything.',
      toolsLine: 'Available tools: readFile, listDirectory, glob, grep, codeMap, searchWeb, todoRead, skill.',
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
      toolsLine: 'Available tools: readFile, listDirectory, glob, grep, searchWeb, todoRead, skill.',
      rules: [],
    };
  }
  return {
    modeLine:
      'You are in BUILD mode with full read/write access to the project. ' +
      'Make changes decisively.',
    toolsLine:
      'Available tools: readFile, listDirectory, glob, grep, codeMap, writeFile, editFile, ' +
      'batchEdit, bash, runTests, applyPatch, searchWeb, diffFile, undoLastChange, redoLastUndo, ' +
      'todoWrite, todoRead, skill, spawnAgent, memoryWrite, memoryDelete, bgRun, bgCheck, ' +
      'spawnTeammate, sendMessage, teamStatus, teamMerge.',
    rules: [
      'If a bash command fails due to a missing package, install it and retry.',
      'For multi-step work, track progress with todoWrite (send the FULL list every call).',
      'Delegate bounded research subtasks with spawnAgent; it returns a summary, not a transcript.',
      'Run long commands (full test suites, builds, servers) with bgRun and keep working; results arrive as <notifications>.',
      'For large parallelizable work, propose a small team and wait for the user to confirm before spawnTeammate; use isolation="worktree" when teammates edit overlapping areas, then review with teamMerge action="diff" and apply or discard.',
      'Save only durable, non-obvious facts with memoryWrite (user preferences, feedback, project constraints).',
    ],
  };
}

export function buildSystemPrompt({ mode = Mode.BUILD, dir = process.cwd() } = {}) {
  if (mode === Mode.SWE || mode === 'SWE') return buildSweSystemPrompt();
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
  const skills = buildSkillListingSection(dir);
  if (skills) sections.push(skills);
  const memory = buildMemorySection(dir);
  if (memory) sections.push(memory);
  return sections.join('\n\n');
}
