#!/usr/bin/env node
/**
 * sentinel — headless CLI surface.
 *
 *   sentinel                 TUI (interactive chat)
 *   sentinel ask "..."       one-shot question, streamed answer
 *   sentinel goal "<cond>"   work until an independent evaluator says <cond> holds
 *   sentinel mini "..."      bash-only mini-swe-agent style run (SWE-bench baseline)
 *   sentinel handoff [run]   turn a recorded run into a runbook the customer team can use
 *   sentinel budget           set/show the engagement budget, deadline, and spend
 *   sentinel watch "task"     keep working when something breaks, steerable
 *   sentinel steer "msg"      add an instruction for a running watcher
 *   sentinel risk "cmd"      grade a command against this repo's risk ledger
 *   sentinel tasks           list agent tasks: status, depth, permission, worktree
 *
 * The model has ONE tool for concurrent work — `task`, with an action — where it
 * used to have seven names (spawnAgent, spawnTeammate, bgRun, bgCheck,
 * teamStatus, teamMerge, sendMessage). Those seven are still dispatched exactly
 * as before, so a recorded trajectory replays; they are just no longer shown to
 * the model. `task(action="spawn")` waits for a subagent's summary, which is
 * what the old `spawnAgent` did.
 *   sentinel review [ref]    review a change; findings point at real diff lines
 *   sentinel doctor          pre-flight: runtime, data dir, provider keys, tool layer
 *
 * `sentinel review` is read-only by default and needs no network: it reads a
 * local git diff, or the worktree patch a finished task produced. It refuses a
 * diff over 800 changed lines before any model call, and exits 2 when it had to
 * drop a finding it could not place — a partial review is a warning, not a
 * clean pass.
 *   sentinel outcome "..."   turn a vague ask into a verifiable contract, then work to it
 *   sentinel onboard         survey this repo: entry points, CI, ownership, risk
 *   sentinel prompts         list prompt templates (/name args in ask/goal)
 *   sentinel --version       version
 *   sentinel help            this help
 *
 * That's the whole command surface. The TUI hosts everything else
 * (sessions, model picker, /commands) — see src/tui.
 */
import { Command } from 'commander';
import path from 'path';
import { join } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');

const CLI_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

/**
 * --yes permission callback for headless runs: approve everything except
 * commands bash-validation marks destructive (reset --hard, force push,
 * rm -rf on broad targets, ...). Those are denied, never asked.
 */
async function autoApprove() {
  const { classifyBashCommand } = await import('../agent/bash-validation.js');
  const { isShellTool } = await import('../shared/tool-taxonomy.js');
  return async (toolName, _id, input) => {
    if (isShellTool(toolName) && classifyBashCommand(input?.command).destructive) {
      process.stderr.write(`\x1b[31m✗ denied destructive command: ${input?.command}\x1b[0m\n`);
      return 'deny';
    }
    return 'allow';
  };
}

/** Print receipts / routing / notices to stderr. Returns true when handled. */
function printHarnessEvent(ev) {
  const dim = (s) => process.stderr.write(`\x1b[2m${s}\x1b[0m\n`);
  if (ev.event === 'receipts') {
    const mark = { supported: '\x1b[32m✓', stale: '\x1b[33m~', contradicted: '\x1b[31m✗', unsupported: '\x1b[33m?' };
    process.stderr.write(ev.data.blocking ? '\n\x1b[33mreceipt check: unbacked claims, asking the model to verify\x1b[0m\n' : '\n');
    for (const c of ev.data.claims) {
      const r = c.receipt ? ` · ${c.receipt.id} \`${c.receipt.command}\` exit ${c.receipt.exitCode} · sha ${c.receipt.sha}` : '';
      process.stderr.write(`${mark[c.status]} ${c.kind}: ${c.status}\x1b[0m\x1b[2m${r}\x1b[0m\n`);
    }
    return true;
  }
  if (ev.event === 'route') { dim(`⇄ ${ev.data.model} (${ev.data.reason})`); return true; }
  if (ev.event === 'waiting') { dim('⏳ waiting for background work / teammates…'); return true; }
  return false;
}

/**
 * A project-level engagement budget, when one has been set. Commands that run
 * agent turns opt in by passing `engagement: true`, so setting a budget once
 * with `sentinel budget --usd 25` gates every later run rather than being
 * advice the user has to remember.
 */
async function engagementEnabled() {
  const { readBudget } = await import('../agent/budget.js');
  const b = readBudget();
  return Boolean(b.budgetUsd > 0 || b.deadlineAt);
}

const program = new Command();

program
  .name('sentinel')
  .description('Sentinel — a minimalist AI coding assistant in your terminal')
  .version(CLI_VERSION, '-V, --version', 'output the version number');

// ── TUI ──────────────────────────────────────────────────────────────────────
program
  .command('tui', { isDefault: true, hidden: true })
  .action(async () => {
    const { launchTui } = await import(
      pathToFileURL(path.resolve(root, 'bin', 'sentinel.js')).href
    );
    await launchTui();
  });

// ── ask: one-shot agent turn with the local tool set ─────────────────────────
program
  .command('ask [question...]')
  .description('Ask the assistant a question and stream the answer (read-only by default)')
  .option('-m, --model <id>', 'Model id (defaults to the cheap default model)')
  .option('-b, --build', 'Allow file edits and shell commands (BUILD mode)')
  .option('-q, --quiet-cost', 'Do not print the token/cost summary')
  .option('-y, --yes', 'With --build: auto-approve tools incl. shell (destructive commands are still denied)')
  .option('--budget <usd>', 'Stop the turn once it has cost this many USD')
  .option('--route <model>', 'Cheap model for read-only exploration steps (main model plans and edits)')
  .action(async (questionParts, options) => {
    const raw = (questionParts || []).join(' ').trim();
    if (!raw) {
      console.error('Usage: sentinel ask "your question"');
      process.exit(1);
    }
    const { expandPromptTemplate } = await import('../agent/prompt-templates.js');
    const question = expandPromptTemplate(raw).text;
    const { runAgentTurn } = await import('../agent/loop.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const { formatUsd } = await import('../agent/cost.js');

    const mode = options.build ? 'BUILD' : 'PLAN';
    const model = options.model || DEFAULT_CHAT_MODEL_ID;

    let sawError = false;
    let wrote = false;

    try {
      for await (const ev of runAgentTurn({
        history: [
          {
            id: `ask_${Date.now()}`,
            role: 'user',
            parts: [{ type: 'text', text: question }],
          },
        ],
        mode,
        model,
        maxCostUsd: Number(options.budget) || undefined,
        engagement: await engagementEnabled(),
        routeModel: options.route,
        onPermissionRequest: options.yes ? await autoApprove() : undefined,
      })) {
        if (printHarnessEvent(ev)) continue;
        if (ev.event === 'text') {
          process.stdout.write(ev.data.delta);
          wrote = true;
        } else if (ev.event === 'reasoning' && process.env.SENTINEL_VERBOSE) {
          process.stderr.write(`\x1b[2m${ev.data.text}\x1b[0m`);
        } else if (ev.event === 'tool_call') {
          process.stderr.write(`\x1b[2m→ ${ev.data.toolName}\x1b[0m\n`);
        } else if (ev.event === 'finish') {
          if (wrote) process.stdout.write('\n'); // keep the answer and the cost line apart
          if (!options.quietCost && ev.data.usage) {
            const { inputTokens = 0, outputTokens = 0 } = ev.data.usage;
            process.stderr.write(
              `\x1b[2m${inputTokens} in / ${outputTokens} out · ${formatUsd(ev.data.costUsd || 0)} · ${model}\x1b[0m\n`
            );
          }
        } else if (ev.event === 'error') {
          sawError = true;
          process.stderr.write(`\n\x1b[31m${ev.data.message}\x1b[0m\n`);
        }
      }
    } catch (e) {
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }

    if (wrote) process.stdout.write('\n');
    process.exit(sawError && !wrote ? 1 : 0);
  });

// ── swe: SWE-bench style fix turn (reproduce → fix → verify) ──────────────
program
  .command('swe [task...]')
  .description('Fix a bug report with the SWE workflow (reproduce-first, test-verified)')
  .option('-m, --model <id>', 'Model id')
  .option('-q, --quiet-cost', 'Do not print the token/cost summary')
  .action(async (taskParts, options) => {
    const task = (taskParts || []).join(' ').trim();
    if (!task) {
      console.error('Usage: sentinel swe "bug report + FAIL_TO_PASS tests"');
      process.exit(1);
    }
    const { runAgentTurn } = await import('../agent/loop.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const { formatUsd } = await import('../agent/cost.js');
    const model = options.model || DEFAULT_CHAT_MODEL_ID;
    let sawError = false;
    let wrote = false;
    try {
      for await (const ev of runAgentTurn({
        history: [{ id: `swe_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: task }] }],
        mode: 'SWE',
        model,
      })) {
        if (ev.event === 'text') {
          process.stdout.write(ev.data.delta);
          wrote = true;
        } else if (ev.event === 'tool_call') {
          process.stderr.write(`\x1b[2m→ ${ev.data.toolName}\x1b[0m\n`);
        } else if (ev.event === 'finish') {
          if (!options.quietCost && ev.data.usage) {
            const { inputTokens = 0, outputTokens = 0 } = ev.data.usage;
            process.stderr.write(
              `\x1b[2m${inputTokens} in / ${outputTokens} out · ${formatUsd(ev.data.costUsd || 0)} · ${model} · SWE\x1b[0m\n`
            );
          }
        } else if (ev.event === 'error') {
          sawError = true;
          process.stderr.write(`\n\x1b[31m${ev.data.message}\x1b[0m\n`);
        }
      }
    } catch (e) {
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }
    if (wrote) process.stdout.write('\n');
    process.exit(sawError && !wrote ? 1 : 0);
  });

// ── goal: s17 goal loop — worker keeps going until the evaluator agrees ──
program
  .command('goal [condition...]')
  .description('Work (BUILD mode) until a completion condition is verified, e.g. "npm test exits 0"')
  .option('-m, --model <id>', 'Model id')
  .option('-t, --task <text>', 'Task to perform (defaults to the condition itself)')
  .option('-y, --yes', 'Auto-approve tools incl. shell (destructive commands are still denied)')
  .option('--budget <usd>', 'Stop the turn once it has cost this many USD')
  .option('--route <model>', 'Cheap model for read-only exploration steps (main model plans and edits)')
  .action(async (condParts, options) => {
    const { expandPromptTemplate } = await import('../agent/prompt-templates.js');
    const condition = expandPromptTemplate((condParts || []).join(' ').trim()).text;
    if (!condition) {
      console.error('Usage: sentinel goal "pytest tests/auth exits 0" [--task "fix the auth bug"]');
      process.exit(1);
    }
    const { runAgentTurn } = await import('../agent/loop.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const model = options.model || DEFAULT_CHAT_MODEL_ID;
    const task = options.task ? `${options.task}\n\nDone when: ${condition}` : `Make this true: ${condition}`;
    let met = false;
    let sawError = false;
    for await (const ev of runAgentTurn({
      history: [{ id: `goal_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: task }] }],
      mode: 'BUILD',
      model,
      goal: condition,
      maxCostUsd: Number(options.budget) || undefined,
      routeModel: options.route,
      onPermissionRequest: options.yes ? await autoApprove() : undefined,
    })) {
      if (printHarnessEvent(ev)) continue;
      if (ev.event === 'text') process.stdout.write(ev.data.delta);
      else if (ev.event === 'tool_call') process.stderr.write(`\x1b[2m→ ${ev.data.toolName}\x1b[0m\n`);
      else if (ev.event === 'notification') process.stderr.write(`\x1b[2m✉ ${ev.data.count} notification(s)\x1b[0m\n`);
      else if (ev.event === 'goal') {
        met = ev.data.ok;
        const tag = ev.data.ok ? '\x1b[32mgoal met' : ev.data.impossible ? '\x1b[31mgoal impossible' : '\x1b[33mgoal not met';
        process.stderr.write(`\n${tag} (check ${ev.data.check})\x1b[0m ${ev.data.reason}\n`);
      } else if (ev.event === 'error') {
        sawError = true;
        process.stderr.write(`\n\x1b[31m${ev.data.message}\x1b[0m\n`);
      }
    }
    process.stdout.write('\n');
    process.exit(met && !sawError ? 0 : 1);
  });

// ── replay: past sessions as a regression suite ────────────────────────────
program
  .command('replay [runIds...]')
  .description('Re-run recorded turns (.sentinel/trajectories) with the current harness/model and diff behavior')
  .option('-m, --model <id>', 'Model to replay with (default: the recorded model)')
  .option('-l, --list', 'List replayable trajectories')
  .option('-n, --last <count>', 'Replay the N most recent trajectories')
  .option('--allow-bash', 'Let replays run non-destructive shell commands (inside a throwaway worktree)')
  .action(async (runIds, options) => {
    const { listTrajectories, replayTrajectory } = await import('../agent/replay.js');
    const { formatUsd } = await import('../agent/cost.js');
    if (options.list) {
      const list = listTrajectories();
      if (!list.length) console.log('No replayable trajectories yet (run sentinel ask/goal/swe first).');
      for (const t of list) {
        const s = t.summary;
        console.log(`${t.runId}  ${(s.mode || '?').padEnd(5)} ${String(s.tools.length).padStart(3)} tools  ${s.finished ? '✓' : '✗'}  ${s.prompt.replace(/\s+/g, ' ').slice(0, 60)}`);
      }
      process.exit(0);
    }
    let ids = runIds || [];
    if (!ids.length && options.last) ids = listTrajectories(process.cwd(), Number(options.last) || 1).map((t) => t.runId);
    if (!ids.length) {
      console.error('Usage: sentinel replay <runId...> | --last 5 | --list');
      process.exit(1);
    }
    let regressions = 0;
    for (const id of ids) {
      try {
        const r = await replayTrajectory(id, { model: options.model, allowBash: !!options.allowBash });
        const d = r.diff;
        if (d.regressed) regressions++;
        console.log(`\n${d.regressed ? '\x1b[31m✗ REGRESSED' : '\x1b[32m✓ ok'}\x1b[0m  ${r.runId}  ${r.prompt.replace(/\s+/g, ' ').slice(0, 60)}`);
        for (const reg of d.regressions) console.log(`   - ${reg}`);
        console.log(`   tools ${d.toolsBefore}→${d.toolsAfter} (similarity ${d.toolSimilarity}) · files ${d.filesSame ? 'same' : `${d.filesBefore.join(',') || '∅'} → ${d.filesAfter.join(',') || '∅'}`} · cost ${formatUsd(d.costBefore)}→${formatUsd(d.costAfter)}`);
      } catch (e) {
        regressions++;
        console.log(`\n\x1b[31m✗ ${id}\x1b[0m  ${e.message}`);
      }
    }
    console.log(`\n${ids.length - regressions}/${ids.length} replays without regressions`);
    process.exit(regressions ? 1 : 0);
  });

// ── race: best-of-N in isolated worktrees, scored by your test command ─────
program
  .command('race [task...]')
  .description('Best-of-N: N agents solve the task in parallel git worktrees; your --check command picks the winner')
  .requiredOption('-c, --check <cmd>', 'Command that must exit 0 for a candidate to win (e.g. "npm test")')
  .option('-n, --n <count>', 'Number of candidates (max 6)', '3')
  .option('-m, --models <ids>', 'Comma-separated model ids, assigned round-robin (a model tournament)')
  .option('--allow-bash', 'Let candidates run non-destructive shell commands in their worktree')
  .option('--no-apply', 'Do not apply the winner; print its patch instead')
  .option('--critique', 'Peer review: each passing diff is reviewed by another candidate\'s model; severity breaks ties')
  .action(async (taskParts, options) => {
    const task = (taskParts || []).join(' ').trim();
    if (!task) {
      console.error('Usage: sentinel race "fix the failing date parser" --check "npm test" [-n 3] [-m a,b] [--critique]');
      process.exit(1);
    }
    const { runRace } = await import('../agent/race.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const { formatUsd } = await import('../agent/cost.js');
    const models = (options.models || DEFAULT_CHAT_MODEL_ID).split(',').map((s) => s.trim()).filter(Boolean);
    let res;
    try {
      res = await runRace({
        task,
        check: options.check,
        n: Number(options.n) || 3,
        models,
        apply: options.apply !== false,
        allowBash: !!options.allowBash,
        critique: !!options.critique,
        onEvent: (e) => {
          if (e.type === 'critique') {
            const color = e.severity >= 2 ? '\x1b[31m' : e.severity === 1 ? '\x1b[33m' : '\x1b[32m';
            process.stderr.write(`${color}⚖ ${e.candidate} reviewed by ${e.reviewer}: severity ${e.severity}\x1b[0m${e.issues.length ? `\x1b[2m — ${e.issues.join('; ')}\x1b[0m` : ''}\n`);
            return;
          }
          if (e.type === 'start') process.stderr.write(`\x1b[2m▶ ${e.candidate} (${e.model})\x1b[0m\n`);
          else if (e.type === 'tool') process.stderr.write(`\x1b[2m  ${e.candidate} → ${e.tool}\x1b[0m\n`);
          else if (e.type === 'scored') {
            process.stderr.write(e.disqualified
              ? `\x1b[33m◼ ${e.candidate}: ${e.disqualified}\x1b[0m\n`
              : `${e.exitCode === 0 ? '\x1b[32m✓' : '\x1b[31m✗'} ${e.candidate}: exit ${e.exitCode}, ${e.passed} passed / ${e.failed} failed, +${e.added}/-${e.removed}\x1b[0m\n`);
          }
        },
      });
    } catch (e) {
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }
    console.log('\nRanking:');
    res.ranking.forEach((c, i) => {
      const review = c.critique ? ` · review ${c.critique.severity}/3` : '';
      console.log(`${i + 1}. ${c.name} [${c.model}] ${c.disqualified ? `disqualified: ${c.disqualified}` : `exit ${c.exitCode}`}${review} · +${c.added}/-${c.removed} · ${formatUsd(c.costUsd)} · hint: ${c.hint}`);
      // Why a candidate produced nothing is the first question anyone asks.
      if (c.error) console.log(`   \x1b[31merror: ${c.error}\x1b[0m`);
      else if (c.disqualified && c.summary) console.log(`   \x1b[2mlast words: ${c.summary.replace(/\s+/g, ' ').slice(0, 200)}\x1b[0m`);
    });
    if (!res.winner) {
      console.log('\nNo candidate passed the check. Nothing applied.');
      process.exit(1);
    }
    if (res.merged) console.log(`\nWinner ${res.winner} applied to the working tree (undo with /undo or undoLastChange).`);
    else if (res.patch) process.stdout.write(`\nWinner ${res.winner} patch:\n${res.patch}`);
    else console.log(`\nWinner ${res.winner} could not be applied: ${res.mergeError}`);
    process.exit(0);
  });

// ── mini: bash-only agent (mini-swe-agent port) ────────────────────────────
program
  .command('mini [task...]')
  .description('Bash-only agent: one tool, fresh subshell per command, submit sentinel to finish')
  .option('-m, --model <id>', 'Model id')
  .option('-o, --output <file>', 'Write the trajectory (mini-swe-agent-1.1 format)')
  .option('--step-limit <n>', 'Max model calls (0 = unlimited)', '0')
  .option('--cost-limit <usd>', 'Stop after this cost in USD (0 = unlimited)', '3')
  .option('--timeout <ms>', 'Per-command timeout in ms', '60000')
  .action(async (taskParts, options) => {
    const task = (taskParts || []).join(' ').trim();
    if (!task) {
      console.error('Usage: sentinel mini "issue text" [-o traj.json]');
      process.exit(1);
    }
    const { runMini } = await import('../agent/mini.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const { formatUsd } = await import('../agent/cost.js');
    const res = await runMini({
      task,
      model: options.model || DEFAULT_CHAT_MODEL_ID,
      stepLimit: Number(options.stepLimit) || 0,
      costLimit: Number(options.costLimit) || 0,
      commandTimeoutMs: Number(options.timeout) || 60000,
      output: options.output ? path.resolve(options.output) : undefined,
      onEvent: (e) => {
        if (e.type === 'step') {
          if (e.text) process.stdout.write(`${e.text}\n`);
          for (const c of e.commands) process.stderr.write(`\x1b[2m$ ${c}\x1b[0m\n`);
        } else if (e.type === 'observation') {
          process.stderr.write(`\x1b[2m  → exit ${e.exitCode}\x1b[0m\n`);
        }
      },
    });
    process.stderr.write(`\x1b[2m${res.exitStatus} · ${res.apiCalls} calls · ${formatUsd(res.cost)}\x1b[0m\n`);
    if (res.submission) process.stdout.write(`${res.submission}\n`);
    process.exit(res.exitStatus === 'Submitted' ? 0 : 1);
  });

// ── watch: the standing FDE ────────────────────────────────────────────────
program
  .command('watch [task...]')
  .description('Keep working on a task when something breaks: failing tests, a changed file, a new commit — steerable from another terminal')
  .requiredOption('-t, --trigger <spec>', 'Repeatable. interval:<ms> | command:<cmd> | file:<path> | git | once')
  .option('-m, --model <id>', 'Model id')
  .option('-g, --goal <cond>', 'Stop when this condition is verified')
  .option('--max-ticks <n>', 'Stop after this many ticks (0 = unlimited)', '0')
  .option('--max-unproductive <n>', 'Give up after this many ticks with no progress', '5')
  .option('--interval <ms>', 'Base wait between ticks, doubled on each unproductive tick', '60000')
  .option('-y, --yes', 'Auto-approve tools incl. shell (destructive commands are still denied)')
  .action(async (taskParts, options) => {
    const { expandPromptTemplate } = await import('../agent/prompt-templates.js');
    const task = expandPromptTemplate((taskParts || []).join(' ').trim()).text;
    if (!task) {
      console.error('Usage: sentinel watch "fix whatever breaks" -t "command:npm test" -t git');
      process.exit(1);
    }
    const { parseTriggers } = await import('../agent/watch-cli.js');
    let triggers;
    try {
      triggers = parseTriggers(options.trigger);
    } catch (e) {
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }

    const { runWatcher } = await import('../agent/watch.js');
    const { runAgentTurn } = await import('../agent/loop.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const { formatUsd } = await import('../agent/cost.js');

    const controller = new AbortController();
    const onSig = () => {
      process.stderr.write('\n\x1b[2mstopping after the current step…\x1b[0m\n');
      controller.abort();
    };
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);

    console.error(`\x1b[2mwatching: ${triggers.map((t) => t.type).join(', ')}\x1b[0m`);
    console.error('\x1b[2msteer it from another terminal: sentinel steer "also check the retries"\x1b[0m\n');

    const permissions = options.yes ? await autoApprove() : undefined;
    let res;
    try {
      res = await runWatcher({
        task,
        triggers,
        goal: options.goal || null,
        cwd: process.cwd(),
        runTurn: (opts) => runAgentTurn({
          ...opts,
          model: options.model || DEFAULT_CHAT_MODEL_ID,
          onPermissionRequest: permissions,
        }),
        onPermissionRequest: permissions,
        maxTicks: Number(options.maxTicks) || 0,
        maxUnproductive: Number(options.maxUnproductive) || 5,
        baseDelayMs: Number(options.interval) || 60_000,
        signal: controller.signal,
      });
    } catch (e) {
      process.off('SIGINT', onSig);
      process.off('SIGTERM', onSig);
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);

    const spent = res.ticks.reduce((n, t) => n + (t.costUsd || 0), 0);
    console.error(`\n${res.ticks.length} tick(s), ${formatUsd(spent)}, stopped: ${res.reason}`);
    process.exit(0);
  });

// ── steer: interrupt a running watch from anywhere ─────────────────────────
program
  .command('steer [message...]')
  .description('Add an instruction for a running `sentinel watch` to pick up on its next tick')
  .option('-d, --dir <path>', 'Project the watcher is running in (default: cwd)')
  .option('--pending', 'Show queued instructions without clearing them')
  .action(async (msgParts, options) => {
    const { steer, pendingSteering, drainSteering, STEER_PATH } = await import('../agent/watch.js');
    const cwd = path.resolve(options.dir || process.cwd());
    if (options.pending) {
      const n = pendingSteering(cwd);
      console.log(n ? `${n} instruction(s) queued in ${STEER_PATH}` : 'nothing queued');
      process.exit(0);
    }
    const text = (msgParts || []).join(' ').trim();
    if (!text) {
      const queued = drainSteering(cwd);
      for (const q of queued) console.log(`${q.ts}  ${q.text}`);
      console.log(queued.length ? `\nCleared ${queued.length} instruction(s).` : 'nothing queued');
      process.exit(0);
    }
    steer(text, cwd);
    console.log(`Queued: ${text}`);
    console.log('\x1b[2mThe next watcher tick will pick this up as a priority instruction.\x1b[0m');
    process.exit(0);
  });

// ── budget: an engagement ceiling that outlives the turn ──────────────────
program
  .command('budget')
  .description('Set, show, or clear the engagement budget, deadline, and stop condition')
  .option('-d, --dir <path>', 'Project to inspect (default: cwd)')
  .option('--usd <amount>', 'Engagement budget in USD (e.g. --usd 25)')
  .option('--deadline <when>', 'Deadline: ISO date or relative (45m, 2h, 3d)')
  .option('--condition <text>', 'Stop condition recorded alongside the budget')
  .option('--clear', 'Remove the engagement budget')
  .option('--history', 'List recent turns and their spend')
  .option('--json', 'Print as JSON')
  .action(async (options) => {
    const {
      readBudget, writeBudget, clearBudget, budgetStatus, formatStatus, burnBar,
      readSpend, parseDeadline, BUDGET_PATH, SPEND_PATH, formatDuration,
    } = await import('../agent/budget.js');
    const cwd = path.resolve(options.dir || process.cwd());

    if (options.clear) {
      clearBudget(cwd);
      console.log(`Cleared ${BUDGET_PATH}. Spend history in ${SPEND_PATH} is kept.`);
      process.exit(0);
    }

    if (options.usd != null || options.deadline != null || options.condition != null) {
      const prev = readBudget(cwd);
      const budgetUsd = options.usd != null ? Number(options.usd) : prev.budgetUsd;
      if (!Number.isFinite(budgetUsd) || budgetUsd < 0) {
        console.error(`\x1b[31m--usd must be a positive number (got "${options.usd}")\x1b[0m`);
        process.exit(1);
      }
      let deadlineAt = prev.deadlineAt;
      if (options.deadline != null) {
        deadlineAt = parseDeadline(options.deadline);
        if (!deadlineAt) {
          console.error(`\x1b[31mcould not parse deadline "${options.deadline}" (try 45m, 2h, 3d, or 2026-01-31)\x1b[0m`);
          process.exit(1);
        }
      }
      const saved = writeBudget({
        budgetUsd,
        deadlineAt,
        stopCondition: options.condition ?? prev.stopCondition,
        startedAt: prev.startedAt || new Date().toISOString(),
      }, cwd);
      console.log(`Engagement budget set in ${BUDGET_PATH}:`);
      console.log(`  budget     $${saved.budgetUsd.toFixed(2)}`);
      console.log(`  deadline   ${saved.deadlineAt || 'none'} (${saved.deadlineAt ? formatDuration(new Date(saved.deadlineAt) - Date.now()) + ' left' : '—'})`);
      console.log(`  condition  ${saved.stopCondition || 'none'}`);
      console.log(`  since      ${saved.startedAt}`);
      process.exit(0);
    }

    const status = budgetStatus(cwd);

    if (options.history) {
      const rows = readSpend(cwd).slice(-25).reverse();
      if (options.json) {
        process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
        process.exit(0);
      }
      if (!rows.length) {
        console.log(`No recorded spend yet (${SPEND_PATH}). Runs with a budget set are logged here.`);
        process.exit(0);
      }
      console.log(`Recent spend (${rows.length} of ${readSpend(cwd).length} turn(s)):`);
      for (const r of rows) {
        const when = String(r.ts).slice(0, 16).replace('T', ' ');
        console.log(`  ${when}  $${(r.usd || 0).toFixed(4)}  ${String(r.model || '?').padEnd(28)} ${String(r.prompt || '').slice(0, 50)}`);
      }
      process.exit(0);
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(status, null, 2) + '\n');
      process.exit(0);
    }

    const color = status.status === 'active' ? 32 : status.status === 'unbounded' ? 36 : 31;
    console.log(`\x1b[${color}m${status.status}\x1b[0m  ${burnBar(status)}  ${formatStatus(status)}`);
    console.log(`  budget     ${status.budget.budgetUsd ? `$${status.budget.budgetUsd.toFixed(2)}` : 'not set'}`);
    console.log(`  remaining  ${Number.isFinite(status.remainingUsd) ? `$${status.remainingUsd.toFixed(2)}` : 'unbounded'}`);
    console.log(`  spent      $${status.spend.usd.toFixed(4)} over ${status.spend.turns} turn(s) this engagement`);
    console.log(`  lifetime   $${status.lifetime.usd.toFixed(4)} over ${status.lifetime.turns} turn(s) (${SPEND_PATH})`);
    if (status.budget.stopCondition) console.log(`  condition  ${status.budget.stopCondition}`);
    if (status.budget.corrupt) console.log('\x1b[33m  note: budget file was unreadable and is being treated as no budget\x1b[0m');
    if (status.status === 'unbounded') {
      console.log('\nNo engagement budget set. Every run is unbudgeted.');
      console.log('  sentinel budget --usd 25 --deadline 2h --condition "npm test exits 0"');
    }
    process.exit(0);
  });

// ── handoff: turn a recorded run into a runbook the customer team can use ──
program
  .command('handoff [runId...]')
  .description('Generate a handoff runbook from recorded runs: what changed, what was verified, what was tried and rejected')
  .option('-d, --dir <path>', 'Repository to inspect (default: cwd)')
  .option('--list', 'List runs that can be handed off')
  .option('-o, --out <file>', 'Write the runbook here (default: .sentinel/HANDOFF.md)')
  .option('--stdout', 'Print instead of writing a file')
  .option('--json', 'Print the structured handoff as JSON')
  .action(async (runIds, options) => {
    const { buildHandoff, renderRunbook, listHandoffs, handoffFile } = await import('../agent/handoff.js');
    const cwd = path.resolve(options.dir || process.cwd());

    if (options.list || !runIds?.length) {
      const runs = listHandoffs(cwd);
      if (options.json) {
        process.stdout.write(JSON.stringify(runs, null, 2) + '\n');
        process.exit(0);
      }
      if (!runs.length) {
        console.log('No replayable runs recorded yet. Run a turn first, then `sentinel handoff`.');
        process.exit(1);
      }
      console.log(`${runs.length} run(s) recorded:`);
      for (const r of runs) {
        const prompt = String(r.prompt).replace(/\s+/g, ' ').slice(0, 70);
        console.log(`  ${r.runId}  ${r.finished ? 'finished' : 'incomplete'}  ${String(r.files).padStart(3)} file(s)  ${prompt}`);
      }
      console.log('\nGenerate one: sentinel handoff <runId>');
      process.exit(0);
    }

    let handoffs;
    try {
      handoffs = runIds.map((id) => buildHandoff(id, { cwd }));
    } catch (e) {
      console.error(`\x1b[31m${e.message}\x1b[0m`);
      process.exit(1);
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(handoffs, null, 2) + '\n');
      process.exit(0);
    }

    const md = handoffs.map(renderRunbook).join('\n\n---\n\n');
    if (options.stdout) {
      process.stdout.write(md);
    } else {
      const { writeFileSync, mkdirSync } = await import('fs');
      const out = path.resolve(options.out || handoffFile(cwd));
      mkdirSync(join(out, '..'), { recursive: true });
      writeFileSync(out, md, 'utf-8');
      console.log(`Handoff written to ${out}`);
      const fragile = handoffs.reduce((n, h) => n + h.fragile.length, 0);
      if (fragile) console.log(`\x1b[33m${fragile} thing(s) flagged as still fragile — the runbook says so explicitly.\x1b[0m`);
    }
    process.exit(0);
  });

// ── risk: inspect the per-repo command risk ledger ──────────────────────────
program
  .command('risk [command...]')
  .description('Show how a command grades against this repo, or list/forget what the ledger has learned')
  .option('-d, --dir <path>', 'Repository to inspect (default: cwd)')
  .option('--list', 'List approved command shapes')
  .option('--forget <command>', 'Stop tracking a command shape')
  .option('--json', 'Print as JSON')
  .action(async (cmdParts, options) => {
    const { riskLevel, explainRisk, readLedger, forgetShape, commandShape, LEDGER_PATH } =
      await import('../agent/risk-ledger.js');
    const cwd = path.resolve(options.dir || process.cwd());

    if (options.forget) {
      const ledger = forgetShape(options.forget, cwd);
      console.log(`Forgot ${commandShape(options.forget)} (${Object.keys(ledger.shapes).length} shape(s) still tracked).`);
      process.exit(0);
    }

    if (options.list || !cmdParts.length) {
      const ledger = readLedger(cwd);
      const shapes = Object.entries(ledger.shapes).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
      if (options.json) {
        process.stdout.write(JSON.stringify(ledger, null, 2) + '\n');
        process.exit(0);
      }
      if (!shapes.length) {
        console.log(`No approved command shapes yet (${LEDGER_PATH}).`);
        console.log('Approving a new non-destructive command in a session records its shape there.');
        process.exit(0);
      }
      console.log(`${shapes.length} approved command shape(s) in ${LEDGER_PATH}:`);
      for (const [shape, meta] of shapes) {
        const when = meta?.at ? new Date(meta.at).toISOString().slice(0, 16).replace('T', ' ') : 'unknown';
        console.log(`  ${shape}   ×${meta?.count || 1}  ${when}`);
      }
      process.exit(0);
    }

    const command = cmdParts.join(' ');
    const risk = riskLevel(command, cwd);
    if (options.json) {
      process.stdout.write(JSON.stringify(risk, null, 2) + '\n');
    } else {
      const color = risk.level === 'green' ? 32 : risk.level === 'red' ? 31 : 33;
      console.log(`\x1b[${color}m${risk.level}\x1b[0m  ${command}`);
      const text = explainRisk(risk);
      if (text) console.log(text);
    }
    process.exit(0);
  });

// ── review: a turn whose findings must point at real lines ────────────────
program
  .command('audit [runId...]')
  .description('Replay recorded approvals and report bound-gaps (the action that ran vs the action that was approved)')
  .option('-d, --dir <path>', 'Project to audit (default: cwd)')
  .option('--last <n>', 'Audit the N most recent runs', (v) => Number(v))
  .option('--list', 'List runs with an audit trail and exit')
  .option('--json', 'Print as JSON')
  .action(async (runIds, options) => {
    const { auditRun, auditRuns, listAuditRuns, renderAudit, summarizeAudits } =
      await import('../agent/audit.js');

    const cwd = path.resolve(options.dir || process.cwd());

    if (options.list) {
      const ids = listAuditRuns(cwd);
      if (options.json) {
        process.stdout.write(JSON.stringify(ids, null, 2) + '\n');
      } else if (!ids.length) {
        console.error('No recorded runs. A run has an audit trail once a tool call has been approved.');
      } else {
        for (const id of ids) console.log(id);
      }
      process.exit(0);
    }

    // With no argument, audit the most recent run: "audit this" is the question
    // someone asks after something looked wrong, and making them find the id
    // first would be making the tool do less work than the person using it.
    const ids = (runIds || []).length ? runIds : null;
    const reports = ids
      ? ids.map((id) => auditRun(id, { cwd }))
      : auditRuns(Number(options.last) > 0 ? Number(options.last) : 1, { cwd });

    if (!reports.length) {
      console.error('No recorded runs. A run has an audit trail once a tool call has been approved.');
      process.exit(1);
    }

    const missing = reports.filter((r) => !r.grants && !r.dispatches);
    if (missing.length === reports.length) {
      console.error(`No audit trail for: ${reports.map((r) => r.runId).join(', ')}`);
      process.exit(1);
    }

    if (options.json) {
      const payload = reports.length === 1 ? reports[0] : { summary: summarizeAudits(reports), runs: reports };
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      process.exit(reports.some((r) => r.gaps.length) ? 2 : 0);
    }

    for (const report of reports) process.stdout.write(renderAudit(report));
    // Non-zero when a gap was found: a bound-gap is the finding, so a clean
    // exit has to mean "audited, nothing found" and not merely "audited".
    process.exit(reports.some((r) => r.gaps.length) ? 2 : 0);
  });

// ── review: a turn whose findings must point at real lines ────────────────
program
  .command('review [ref...]')
  .description('Review a change and report defects that point at real diff lines')
  .option('-d, --dir <path>', 'Repository to review (default: cwd)')
  .option('-b, --base <ref>', 'Diff this branch against a base ref (e.g. main)')
  .option('--staged', 'Review only what is staged')
  .option('--task <id>', 'Review the worktree patch produced by a finished task')
  .option('-m, --model <id>', 'Model id')
  .option('--max-lines <n>', 'Refuse a diff larger than this many changed lines', (v) => Number(v))
  .option('--json', 'Print as JSON')
  .option('--no-read-only', 'Allow the reviewer write access (it has no reason to need it)')
  .action(async (refParts, options) => {
    const { repoState, collectReviewableDiff, reviewTargetWorktree, decideReviewable } =
      await import('../agent/review-refs.js');
    const { runReview, buildBrief, renderReview } = await import('../agent/review.js');
    const { getTask, listTasks, describePermission } = await import('../agent/task.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');

    const cwd = path.resolve(options.dir || process.cwd());
    const state = await repoState(cwd);
    if (!state.isRepo) {
      console.error('Not a git repository, so there is no diff to review.');
      process.exit(1);
    }

    // An explicit positional ref is a shorthand for --base.
    const positional = (refParts || []).join(' ').trim();
    const base = options.base || positional || null;

    let diff;
    if (options.task) {
      // Review what a teammate actually produced. Reading the task's workdir
      // rather than the main tree is the whole point: the patch is not merged.
      const task = getTask(options.task) || listTasks().find((t) => t.id === options.task);
      if (!task) {
        console.error(`No task with id ${options.task}. Try: sentinel tasks --all`);
        process.exit(1);
      }
      if (!task.workdir || !task.baseSha) {
        console.error(
          `Task ${task.id} has no worktree patch to review (isolation: ${task.isolation}). ` +
          'Only a task with a worktree produced a diff.',
        );
        process.exit(1);
      }
      diff = reviewTargetWorktree({ dir: task.workdir, baseSha: task.baseSha });
    } else {
      diff = await collectReviewableDiff({ cwd, base, staged: Boolean(options.staged) });
    }

    const verdict = decideReviewable({
      stats: diff.stats,
      maxLines: Number(options.maxLines) > 0 ? Number(options.maxLines) : undefined,
    });
    if (!verdict.review) {
      // A refusal says why, because "decided not to look" and "broken" look
      // identical from the outside.
      if (options.json) {
        process.stdout.write(JSON.stringify({ skipped: true, reason: verdict.reason }, null, 2) + '\n');
      } else {
        console.error(`Nothing reviewed: ${verdict.reason}.`);
      }
      process.exit(0);
    }

    if (!options.json) {
      const rung = options.readOnly === false ? 'teammate' : 'readonly';
      console.error(
        `\x1b[2m${diff.stats.files} file(s) +${diff.stats.additions} -${diff.stats.deletions} · ${diff.ref} · ${describePermission(rung)}\x1b[0m`,
      );
    }

    const brief = buildBrief({
      ref: diff.ref,
      stats: diff.stats,
      readOnly: options.readOnly !== false,
    });

    const controller = new AbortController();
    const onSig = () => controller.abort();
    process.on('SIGINT', onSig);
    process.on('SIGTERM', onSig);

    try {
      const out = await runReview({
        brief,
        cwd,
        model: options.model || DEFAULT_CHAT_MODEL_ID,
        readOnly: options.readOnly !== false,
        name: 'review',
        files: diff.files,
        signal: controller.signal,
      });

      if (options.json) {
        process.stdout.write(JSON.stringify({ ref: diff.ref, ...out }, null, 2) + '\n');
        // Non-zero only when something was dropped: a partially-delivered
        // review is a warning, not a clean pass.
        process.exit(out.dropped.length ? 2 : 0);
      }

      process.stdout.write(renderReview({ ...out, ref: diff.ref }));
      process.exit(out.dropped.length ? 2 : 0);
    } catch (e) {
      console.error(`\x1b[31mreview failed: ${e.message}\x1b[0m`);
      process.exit(1);
    } finally {
      process.off('SIGINT', onSig);
      process.off('SIGTERM', onSig);
    }
  });

// ── outcome: turn a vague ask into a contract a machine can judge ─────────
program
  .command('outcome [ask...]')
  .description('Turn a vague request into a verifiable outcome contract, then work until the contract holds')
  .option('-m, --model <id>', 'Model id')
  .option('-y, --yes', 'Auto-approve tools incl. shell (destructive commands are still denied)')
  .option('--budget <usd>', 'Stop the turn once it has cost this many USD')
  .option('--plan', 'Only write the contract; do not start the work')
  .option('--no-save', 'Do not persist the contract to .sentinel/outcome.json')
  .action(async (askParts, options) => {
    const { expandPromptTemplate } = await import('../agent/prompt-templates.js');
    const ask = expandPromptTemplate((askParts || []).join(' ').trim()).text;
    if (!ask) {
      console.error('Usage: sentinel outcome "the sync is flaky" [--plan]');
      process.exit(1);
    }
    const { draftOutcome, renderContract, writeContract, workerBrief, contractGaps } = await import('../agent/outcome.js');
    const { runAgentTurn } = await import('../agent/loop.js');
    const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
    const model = options.model || DEFAULT_CHAT_MODEL_ID;

    const draft = await draftOutcome({ ask, modelId: model });
    if (!draft) {
      console.error('\x1b[31mCould not draft an outcome contract from that request.\x1b[0m');
      process.exit(1);
    }

    const contract = draft.contract;
    if (!options.noSave) {
      try {
        writeContract(contract);
      } catch (e) {
        console.error(`\x1b[33mcontract not saved: ${e.message}\x1b[0m`);
      }
    }

    process.stdout.write(renderContract(contract) + '\n\n');
    const gaps = contractGaps(contract);
    if (gaps.length) {
      console.log(
        `\x1b[33m${gaps.length} field(s) still unknown: ${gaps.join(', ')}\x1b[0m\n` +
        'The contract is weaker than it looks. Work toward TARGET and report the evidence.',
      );
    }
    if (options.plan) {
      process.stdout.write('\nRe-run without --plan to work toward the contract.\n');
      process.exit(0);
    }

    const condition = `The outcome contract holds: VERIFICATION has been run and its result satisfies TARGET.\n\n${workerBrief(contract)}`;
    let met = false;
    let sawError = false;
    for await (const ev of runAgentTurn({
      history: [{ id: `outcome_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: condition }] }],
      mode: 'BUILD',
      model,
      goal: `VERIFICATION passes and TARGET is met: ${contract.target}`,
      outcome: contract,
      maxCostUsd: Number(options.budget) || undefined,
      engagement: await engagementEnabled(),
      onPermissionRequest: options.yes ? await autoApprove() : undefined,
    })) {
      if (ev.event === 'text') process.stdout.write(ev.data.delta);
      else if (ev.event === 'tool_call') process.stderr.write(`\x1b[2m→ ${ev.data.toolName}\x1b[0m\n`);
      else if (ev.event === 'goal') {
        met = ev.data.ok;
        const tag = ev.data.ok ? '\x1b[32mcontract met'
          : ev.data.impossible ? '\x1b[31mcontract impossible'
            : ev.data.unknown ? '\x1b[33mcontract unverifiable'
              : '\x1b[33mcontract not met';
        process.stderr.write(`\n${tag} (check ${ev.data.check})\x1b[0m ${ev.data.reason}\n`);
      } else if (ev.event === 'error') {
        sawError = true;
        process.stderr.write(`\n\x1b[31m${ev.data.message}\x1b[0m\n`);
      }
    }
    process.stdout.write('\n');
    process.exit(met && !sawError ? 0 : 1);
  });

// ── tasks: inspect the concurrent work the primitive owns ──────────────────
program
  .command('tasks')
  .description('List agent tasks and background commands: status, depth, permission, worktree')
  .option('--json', 'Print as JSON')
  .option('--all', 'Include finished tasks (default: running only)')
  .action(async (options) => {
    const { listTasks, renderTasks, describePermission } = await import('../agent/task.js');
    const all = listTasks();
    const list = options.all ? all : all.filter((t) => t.status === 'running' || t.status === 'pending');

    if (options.json) {
      process.stdout.write(
        JSON.stringify(
          list.map((t) => ({
            id: t.id,
            kind: t.kind,
            name: t.name,
            parent: t.parent,
            status: t.status,
            depth: t.depth,
            permission: t.permission,
            permissionDetail: describePermission(t.permission),
            isolation: t.isolation,
            branch: t.branch,
            error: t.error,
            summary: t.result?.summary || null,
          })),
          null,
          2,
        ) + '\n',
      );
      process.exit(0);
    }

    console.log(renderTasks(list));
    if (!options.all && all.length > list.length) {
      console.log(`\x1b[2m${all.length - list.length} finished task(s) hidden; --all to show them\x1b[0m`);
    }
    process.exit(0);
  });

// ── doctor: pre-flight checks before the first turn ─────────────────────────
program
  .command('doctor')
  .description('Check the runtime, data directory, provider keys and tool layer before starting a turn')
  .option('-d, --dir <path>', 'Project to check (default: cwd)')
  .option('--network', 'Also probe local model servers over HTTP (Ollama, LM Studio)')
  .option('--json', 'Print the report as JSON')
  .action(async (options) => {
    const { runDoctor, renderDoctor } = await import('../agent/doctor.js');
    const cwd = path.resolve(options.dir || process.cwd());

    let report;
    try {
      report = await runDoctor({ cwd, probeNetwork: !!options.network });
    } catch (e) {
      console.error(`\x1b[31mdoctor failed: ${e?.message || e}\x1b[0m`);
      process.exit(1);
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      console.log(renderDoctor(report));
    }
    process.exit(report.ok ? 0 : 1);
  });

// ── connect: wire SENTINEL into installed coding assistants ─────────────────
program
  .command('connect')
  .description('Detect installed coding assistants and register the SENTINEL MCP server with them')
  .option('-t, --target <id>', 'Assistant id to target (default: all detected)')
  .option('-s, --scope <scope>', 'Config scope: user | project (default: user)')
  .option('--list', 'List detected assistants and exit')
  .option('--skills', 'Show skill directories SENTINEL can read')
  .option('--remove', 'Remove the SENTINEL entry instead of adding it')
  .option('--dry-run', 'Show what would change without writing')
  .option('--json', 'Print the result as JSON')
  .action(async (options) => {
    const { detectTargets, registerWithAssistant, unregisterFromAssistant, skillDiscovery, ASSISTANT_TARGETS } =
      await import('./connect.js');

    const cwd = path.resolve(options.dir || process.cwd());
    const scope = options.scope === 'project' ? 'project' : 'user';

    if (options.skills) {
      const dirs = skillDiscovery(cwd);
      if (options.json) {
        process.stdout.write(JSON.stringify({ skills: dirs }, null, 2) + '\n');
      } else if (dirs.length === 0) {
        console.log('No skill directories found. Install one with: npx skills add <owner/repo>');
      } else {
        console.log('Skill directories SENTINEL reads (no copy needed):');
        for (const d of dirs) {
          console.log(`  ${d.count ? '✓' : '·'} ${d.path}  [${d.owner}, ${d.scope}]`);
        }
        console.log('\nInstall more: npx skills add <owner/repo>');
      }
      return;
    }

    const detected = detectTargets({ cwd });
    if (options.list) {
      if (options.json) {
        process.stdout.write(JSON.stringify({ detected, known: ASSISTANT_TARGETS.map((t) => ({ id: t.id, label: t.label })) }, null, 2) + '\n');
        return;
      }
      if (detected.length === 0) {
        console.log('No coding assistants detected. Target one explicitly with --target <id>.');
        console.log(`Known ids: ${ASSISTANT_TARGETS.map((t) => t.id).join(', ')}`);
        return;
      }
      console.log('Detected assistants:');
      for (const t of detected) {
        console.log(`  ${t.id.padEnd(18)} ${t.label}  (${t.evidence.length} marker${t.evidence.length === 1 ? '' : 's'})`);
      }
      console.log(`\nKnown ids: ${ASSISTANT_TARGETS.map((t) => t.id).join(', ')}`);
      return;
    }

    const targets = options.target
      ? [{ id: options.target, label: options.target }]
      : detected;
    if (targets.length === 0) {
      console.log('\x1b[33mNo coding assistants detected — nothing to configure.\x1b[0m');
      console.log('Use --target <id> to configure one anyway.');
      return;
    }

    const results = targets.map((t) =>
      options.remove
        ? unregisterFromAssistant({ targetId: t.id, scope, cwd, dryRun: options.dryRun })
        : registerWithAssistant({ targetId: t.id, scope, cwd, dryRun: options.dryRun }),
    );

    if (options.json) {
      process.stdout.write(JSON.stringify({ results }, null, 2) + '\n');
    } else {
      for (const r of results) {
        const mark = r.ok ? (r.action === 'unchanged' ? '·' : '✓') : '✗';
        const color = r.ok ? (r.action === 'unchanged' ? '90' : '32') : '31';
        console.log(`\x1b[${color}m${mark}\x1b[0m ${r.message}`);
        if (options.dryRun && r.preview) console.log(r.preview);
      }
      if (!options.remove && !options.dryRun) {
        console.log('\nRestart the affected assistant(s) to pick up the MCP server.');
      }
    }
    process.exit(results.some((r) => !r.ok) ? 1 : 0);
  });

// ── mcp-status: what external MCP servers are reachable ─────────────────────
program
  .command('mcp-status')
  .description('Connect to configured external MCP servers and list the tools they expose')
  .option('-d, --dir <path>', 'Project directory (default: cwd)')
  .option('--json', 'Print the result as JSON')
  .option('--refresh', 'Reconnect instead of using the cached registry')
  .action(async (options) => {
    const { configManager } = await import('../config/configManager.js');
    await configManager.load();
    const mcpServers = configManager.get('mcpServers', {}) || {};
    const { buildToolRegistry, closeAll } = await import('../agent/mcp-client.js');

    if (!Object.keys(mcpServers).length) {
      const payload = { configured: 0, servers: [], tools: [], errors: [] };
      if (options.json) {
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      } else {
        console.log('No external MCP servers configured.');
        console.log('Add them under `mcpServers:` in ~/.sentinel.yaml, e.g.');
        console.log('  mcpServers:');
        console.log('    github:');
        console.log('      command: npx');
        console.log('      args: ["-y", "@modelcontextprotocol/server-github"]');
        console.log('    filesystem:');
        console.log('      url: https://example.com/mcp');
      }
      return;
    }

    const registry = await buildToolRegistry(mcpServers, { refresh: options.refresh });
    if (options.json) {
      process.stdout.write(JSON.stringify(registry, null, 2) + '\n');
    } else {
      console.log(`Configured servers: ${Object.keys(mcpServers).length}`);
      for (const s of registry.servers) {
        console.log(`  ✓ ${s.name} [${s.kind}] — ${s.toolCount} tool${s.toolCount === 1 ? '' : 's'}`);
      }
      for (const e of registry.errors) {
        console.log(`  ✗ ${e.server} — ${e.error}`);
      }
      if (registry.tools.length) {
        console.log(`\nTools (${registry.tools.length}):`);
        for (const t of registry.tools) console.log(`  ${t.namespacedName}`);
      }
    }
    await closeAll();
    process.exit(registry.errors.length && !registry.servers.length ? 1 : 0);
  });

// ── skills: install from skills.sh via the official CLI ─────────────────────
program
  .command('skills')
  .description('Install or list skills via the skills.sh CLI (npx skills)')
  .argument('[action]', 'install | list | find', 'list')
  .argument('[pkg]', 'Skill package, e.g. mattpocock/skills')
  .option('-s, --skill <name>', 'Specific skill name (default: all in the package)')
  .option('-a, --agent <agent>', 'Target agent for the install (default: auto-detect)')
  .option('-g, --global', 'Install globally instead of project-level')
  .option('--json', 'Print skill directories as JSON')
  .action(async (action, pkg, options) => {
    const { skillDiscovery } = await import('./connect.js');
    const cwd = path.resolve(options.dir || process.cwd());

    if (action === 'list' || !pkg) {
      const dirs = skillDiscovery(cwd);
      if (options.json) {
        process.stdout.write(JSON.stringify({ skills: dirs }, null, 2) + '\n');
      } else if (!dirs.length) {
        console.log('No skills installed. Try: sentinel skills install mattpocock/skills');
      } else {
        for (const d of dirs) console.log(`${d.count ? '✓' : '·'} ${d.path} [${d.owner}, ${d.scope}]`);
      }
      return;
    }

    // Delegating to the official CLI rather than reimplementing the install is
    // deliberate: it owns agent detection, symlink layout, and its own lockfile.
    // SENTINEL reads the resulting directories via skills.js.
    const args = ['--yes', 'skills', action === 'install' ? 'add' : action];
    if (pkg) args.push(pkg);
    if (options.skill) args.push('--skill', options.skill);
    if (options.agent) args.push('--agent', options.agent);
    if (options.global) args.push('--global');

    console.log(`Running: npx ${args.join(' ')}`);
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('npx', args, { stdio: 'inherit', cwd, shell: process.platform === 'win32' });
    process.exit(r.status === 0 ? 0 : 1);
  });

// ── onboard: the forward-deployed engineer's week one ──────────────────────
program
  .command('onboard')
  .description('Survey this repository the way a new engineer would: entry points, what gates the merge, churn, ownership, risk areas')
  .option('-d, --dir <path>', 'Repository to survey (default: cwd)')
  .option('-o, --out <file>', 'Write the survey here (default: stdout)')
  .option('--json', 'Print the raw survey as JSON')
  .option('--remember', 'Also store a project memory record under .sentinel/memory/')
  .option('--todos', 'Also seed .sentinel/todos.json with the gaps found')
  .action(async (options) => {
    const { analyzeRepo, renderOnboarding, memoryBody, suggestTodos } = await import('../agent/onboard.js');
    const cwd = path.resolve(options.dir || process.cwd());
    const report = analyzeRepo(cwd);

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      const md = renderOnboarding(report);
      if (options.out) {
        const { writeFileSync } = await import('fs');
        writeFileSync(path.resolve(options.out), md, 'utf-8');
        console.log(`Survey written to ${path.resolve(options.out)}`);
      } else {
        process.stdout.write(md);
      }
    }

    if (options.remember) {
      const { writeMemory } = await import('../agent/memory.js');
      const name = `${report.meta.name}-onboarding`;
      try {
        writeMemory({
          name,
          type: 'project',
          description: `Repository survey: entry points, CI, ownership, risk areas (${report.generatedAt.slice(0, 10)})`,
          body: memoryBody(report),
        }, cwd);
        console.log(`Memory record written: .sentinel/memory/${name}.md`);
      } catch (e) {
        console.error(`\x1b[31mcould not write memory: ${e.message}\x1b[0m`);
      }
    }

    if (options.todos) {
      const { writeTodos, readTodos } = await import('../agent/tasks.js');
      const fresh = suggestTodos(report);
      const existing = readTodos(cwd).filter((t) => !t.id.startsWith('onboard-'));
      try {
        writeTodos([...existing, ...fresh].slice(0, 50), cwd);
        console.log(`${fresh.length} onboarding task(s) added to .sentinel/todos.json`);
      } catch (e) {
        console.error(`\x1b[31mcould not write todos: ${e.message}\x1b[0m`);
      }
    }

    process.exit(report.summary.warnings.length ? 1 : 0);
  });

// ── prompts: list prompt templates ─────────────────────────────────────────
program
  .command('prompts')
  .description('List prompt templates from .sentinel/prompts and ~/.sentinel/prompts')
  .action(async () => {
    const { listPromptTemplates } = await import('../agent/prompt-templates.js');
    const list = listPromptTemplates();
    if (!list.length) console.log('No prompt templates. Add .sentinel/prompts/<name>.md and run: sentinel ask /<name> args');
    for (const t of list) console.log(`/${t.name.padEnd(20)} ${t.description}`);
  });

// ── bench: offline SWE-mini capability harness (no API key needed) ─────────
program
  .command('bench')
  .description('Run the offline SWE-mini capability harness (no API key needed)')
  .action(async () => {
    const { runMiniBench } = await import('../../scripts/bench-swe-mini.js');
    const { passed, total } = await runMiniBench({ verbose: true });
    process.exit(passed === total ? 0 : 1);
  });

// ── bench:security: offline security gates (no API key needed) ─────────
program
  .command('bench:security')
  .description('Run the offline security capability harness (no API key needed)')
  .action(async () => {
    const { runSecurityBench } = await import('../../scripts/bench-security-mini.js');
    const { passed, total } = await runSecurityBench({ verbose: true });
    process.exit(passed === total ? 0 : 1);
  });

// ── deepsec-scan: fast regex scan (no API key, no network) ─────────
program
  .command('deepsec-scan')
  .description('Fast DeepSec-style pattern scan (free, no AI)')
  .option('--dir <path>', 'Directory to scan (default: cwd)')
  .option('--sarif-out <file>', 'Write SARIF report')
  .action(async (options) => {
    const { scanDir, summarize, toSarif } = await import('../../evals/security/deepsec.mjs');
    const path = await import('path');
    const dir = path.resolve(options.dir || process.cwd());
    const hits = scanDir(dir);
    const s = summarize(hits);
    console.log(`deepsec-scan: ${hits.length} candidate(s) under ${dir}`);
    console.log(`bySeverity: ${JSON.stringify(s.bySeverity)}`);
    for (const h of hits.slice(0, 50)) console.log(`  ${h.severity} ${h.matcherId} ${h.file}:${h.line}`);
    if (options.sarifOut) {
      const { writeFileSync } = await import('fs');
      writeFileSync(path.resolve(options.sarifOut), JSON.stringify(toSarif(hits), null, 2));
      console.log(`SARIF: ${options.sarifOut}`);
    }
    process.exit(0);
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
