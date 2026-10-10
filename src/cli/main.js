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
    const { expandSlashCommand } = await import('../agent/slash-commands.js');
    const question = expandSlashCommand(raw).text;
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
    const { expandSlashCommand } = await import('../agent/slash-commands.js');
    const condition = expandSlashCommand((condParts || []).join(' ').trim()).text;
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
    const { expandSlashCommand } = await import('../agent/slash-commands.js');
    const task = expandSlashCommand((taskParts || []).join(' ').trim()).text;
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

// ── webeffect: would this browser action be allowed, and can it be undone? ──
program
  .command('webeffect [effect...]')
  .description('Grade a proposed browser action: what it would touch, how reversible it is, and whether a session would permit it')
  .option('-d, --dir <path>', 'Project (default: cwd)')
  .option('--origin <url>', 'Origin the action targets')
  .option('--resource <id>', 'Resource the action names (e.g. /api/customers/4127)')
  .option('--account <ref>', 'Account the action is declared under')
  .option('--session <id>', 'Check against a real session\'s lease and allowlist')
  .option('--json', 'Print as JSON')
  .option('-f, --file <path>', 'Read the descriptor as JSON from a file, or "-" for stdin')
  .action(async (effectParts, options) => {
    const { describeEffect, classifyEffect, severity, explainEffect, REVERSIBILITY } =
      await import('../agent/web/effect.js');
    const { checkAct, getSession } = await import('../agent/web/session.js');
    const cwd = path.resolve(options.dir || process.cwd());

    // The descriptor can arrive as free text (`sentinel webeffect "delete customer"`)
    // or as JSON. JSON is read from a file or stdin rather than from an argv
    // blob: a shell strips the double quotes out of an inline JSON argument
    // before the program ever sees them, so the form most people would reach for
    // is the one that fails. A file and a pipe both survive every shell.
    let raw = {};
    let parseFailed = false;
    if (options.file) {
      let text;
      try {
        text = options.file === '-'
          ? readFileSync(0, 'utf-8')
          : readFileSync(path.resolve(options.file), 'utf-8');
      } catch (e) {
        console.error(`Could not read descriptor: ${e.message}`);
        process.exit(1);
      }
      try {
        raw = JSON.parse(text);
      } catch {
        parseFailed = true;
      }
    } else if (effectParts.length === 1 && effectParts[0].trim().startsWith('{')) {
      // Only reachable from a shell that preserves quotes (bash, zsh, fish).
      try {
        raw = JSON.parse(effectParts[0]);
      } catch {
        console.error('That looked like JSON but did not parse.');
        console.error('Windows shells strip quotes from inline JSON — use --file - and pipe it instead.');
        process.exit(1);
      }
    } else if (effectParts.length) {
      raw.action = effectParts.join(' ');
    }
    if (parseFailed) {
      console.error('The descriptor file did not parse as JSON.');
      process.exit(1);
    }
    if (options.origin) raw.origin = options.origin;
    if (options.resource) raw.resourceId = options.resource;
    if (options.account) raw.accountRef = options.account;

    const described = describeEffect(raw);
    if (!described.ok) {
      const payload = { ok: false, error: described.error, missing: described.missing ?? [] };
      if (options.json) {
        process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      } else {
        console.log('\x1b[31mnot gradable\x1b[0m');
        console.log(payload.error);
        console.log('\nA browser action is gradable only when the target can be named.');
        console.log('This is the whole difference from a shell command: `git status` and');
        console.log('`npm publish` share no danger, but every click shares the verb `click`.');
      }
      process.exit(1);
    }

    const effect = described.effect;
    const cls = classifyEffect(effect);
    let gate = null;
    if (options.session) {
      const s = getSession(options.session, cwd);
      gate = s
        ? checkAct(s, effect)
        : { ok: false, reason: `no session ${options.session}` };
    }

    const report = {
      ok: true,
      effect,
      reversibility: cls,
      severity: severity(effect),
      rollback: explainEffect(effect),
      gate,
    };

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exit(gate && gate.ok === false ? 1 : 0);
    }

    const color = cls === REVERSIBILITY.EXTERNAL || cls === REVERSIBILITY.ABSORBING
      ? 31 : cls === REVERSIBILITY.COMPENSABLE ? 33 : 32;
    console.log(`\x1b[${color}m${cls}\x1b[0m  ${effect.action}`);
    console.log(report.rollback);
    if (gate) {
      console.log(gate.ok
        ? `\x1b[32msession ${options.session} permits this\x1b[0m`
        : `\x1b[31msession ${options.session} refuses: ${gate.reason}\x1b[0m${gate.hint ? `\n  ${gate.hint}` : ''}`);
    }
    process.exit(gate && gate.ok === false ? 1 : 0);
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
    const { expandSlashCommand } = await import('../agent/slash-commands.js');
    const ask = expandSlashCommand((askParts || []).join(' ').trim()).text;
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

// ── health: are my connectors actually answering? ─────────────────────────────
program
  .command('health')
  .description('Probe every configured connector and report latency, quota and reachability')
  .option('-c, --connector <id>', 'Probe only one connector (repeatable)')
  .option('--json', 'Print as JSON')
  .action(async (options) => {
    const { probeConnectors, HEALTH } = await import('../shared/connectors/health.js');
    const only = options.connector
      ? (Array.isArray(options.connector) ? options.connector : [options.connector])
      : undefined;
    const rows = await probeConnectors({ only });

    if (options.json) {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
      process.exit(rows.some((r) => r.state !== HEALTH.OK && r.state !== HEALTH.DEGRADED) ? 1 : 0);
    }

    if (rows.length === 0) {
      console.log('\nNo connector has a credential, so there is nothing to probe.');
      console.log('  \x1b[2mAdd one:  sentinel auth login <id>\x1b[0m');
      console.log('  \x1b[2mOr free:   run Ollama, then `sentinel models`\x1b[0m\n');
      process.exit(0);
    }

    const MARK = {
      [HEALTH.OK]: ['\x1b[32m●\x1b[0m', 'ok'],
      [HEALTH.DEGRADED]: ['\x1b[33m●\x1b[0m', 'slow'],
      [HEALTH.QUOTA]: ['\x1b[33m●\x1b[0m', 'no quota'],
      [HEALTH.UNAUTHORIZED]: ['\x1b[31m●\x1b[0m', 'bad key'],
      [HEALTH.UNSUPPORTED]: ['\x1b[31m●\x1b[0m', 'no endpoint'],
      [HEALTH.ERROR]: ['\x1b[31m●\x1b[0m', 'server error'],
      [HEALTH.UNREACHABLE]: ['\x1b[31m●\x1b[0m', 'unreachable'],
    };

    console.log('');
    for (const r of rows) {
      const [mark, label] = MARK[r.state] || ['\x1b[2m○\x1b[0m', r.state];
      const latency = r.latencyMs != null ? `${String(r.latencyMs).padStart(5)}ms` : '      ';
      const models = r.models ? `${r.models} models` : '';
      console.log(`  ${mark} ${r.label.padEnd(24)} ${latency}  \x1b[2m${label.padEnd(13)} ${models}\x1b[0m`);
      if (r.advice && r.state !== HEALTH.OK) {
        console.log(`    \x1b[2m${r.advice}\x1b[0m`);
      }
    }
    console.log('');
    process.exit(rows.some((r) => r.state !== HEALTH.OK && r.state !== HEALTH.DEGRADED) ? 1 : 0);
  });

// ── auth: manage LLM connector credentials ────────────────────────────────────
//
// The command name is not new. `providers.js` has been telling users to run
// `sentinel auth login <provider>` in its no-credential error for a long time,
// and no such command existed — so the error dead-ended. This is that command.
//
// `connect` is already taken by the MCP assistant registrar, which is a
// different concept entirely (wiring SENTINEL's MCP server into Claude Code /
// Cursor / Zed) and must not be overloaded.
program
  .command('auth')
  .description('Manage LLM connector credentials stored in ~/.sentinel/auth.json')
  .option('--json', 'Print status as JSON')
  .action(async (options) => {
    const { connectionStatus } = await import('../shared/connectors/credentials.js');
    const { listConnectors } = await import('../shared/connectors/registry.js');
    const rows = await connectionStatus();
    if (options.json) {
      process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
      process.exit(0);
    }
    console.log('\n\x1b[1mConnectors\x1b[0m\n');
    const byState = { connected: [], available: [] };
    for (const row of rows) {
      (row.connected ? byState.connected : byState.available).push(row);
    }
    for (const row of byState.connected) {
      const how = row.local ? 'local daemon'
        : row.source === 'store' ? 'saved key'
          : row.source === 'env' ? row.envName : '';
      console.log(`  \x1b[32m●\x1b[0m ${row.label.padEnd(24)} \x1b[2m${how}\x1b[0m`);
    }
    if (byState.connected.length) console.log('');
    console.log('  \x1b[2mNot connected\x1b[0m');
    for (const row of byState.available) {
      console.log(`  \x1b[2m○\x1b[0m ${row.label.padEnd(24)}`);
    }
    console.log(`\n  \x1b[2m${listConnectors().length} connectors known. Add one: \x1b[0msentinel auth login <id>\x1b[0m`);
    console.log('  \x1b[2mKeys are stored at ~/.sentinel/auth.json (mode 0600) and never printed.\x1b[0m\n');
    process.exit(0);
  });

program
  .command('auth login <connector>')
  .description('Store a credential for a connector, or run its OAuth flow')
  .option('--key <key>', 'Pass the key inline instead of prompting')
  .action(async (connectorId, options) => {
    const { getConnector } = await import('../shared/connectors/registry.js');
    const { setCredential, credentialHint, redact } = await import('../shared/connectors/credentials.js');
    const conn = getConnector(connectorId);
    if (!conn) {
      const { listConnectors } = await import('../shared/connectors/registry.js');
      console.error(`\x1b[31mUnknown connector "${connectorId}".\x1b[0m Known: ${listConnectors().map((c) => c.id).join(', ')}`);
      process.exit(1);
    }
    if (conn.local) {
      console.log(`${conn.label} runs on your machine and needs no key.`);
      console.log(`  ${credentialHint(connectorId)}`);
      process.exit(0);
    }
    let key = options.key;
    if (!key) {
      console.log(`\n\x1b[1m${conn.label}\x1b[0m`);
      console.log(`  \x1b[2mGet a key: ${conn.docs}\x1b[0m`);
      if (conn.auth.includes('oauth-device')) {
        console.log(`  \x1b[2mOAuth device flow available — run \`sentinel auth login ${conn.id} --oauth\`.\x1b[0m`);
      }
      process.stdout.write('\n  API key: ');
      key = (await readLine()).trim();
    }
    if (!key) {
      console.error('\n\x1b[31mNo key entered. Nothing saved.\x1b[0m');
      process.exit(1);
    }
    try {
      await setCredential(conn.id, { key });
      console.log(`\n\x1b[32mSaved\x1b[0m ${redact(key)} for ${conn.label}.`);
      console.log(`  \x1b[2mRun \`sentinel models --connector ${conn.id}\` to see what it serves.\x1b[0m\n`);
      process.exit(0);
    } catch (e) {
      console.error(`\n\x1b[31m${e?.message || e}\x1b[0m`);
      process.exit(1);
    }
  });

program
  .command('auth logout <connector>')
  .description('Remove a stored credential for a connector')
  .action(async (connectorId) => {
    const { getConnector } = await import('../shared/connectors/registry.js');
    const { clearCredential } = await import('../shared/connectors/credentials.js');
    const conn = getConnector(connectorId);
    if (!conn) {
      console.error(`\x1b[31mUnknown connector "${connectorId}".\x1b[0m`);
      process.exit(1);
    }
    const { removed } = await clearCredential(conn.id);
    console.log(removed
      ? `Removed the stored key for ${conn.label}.`
      : `No stored key for ${conn.label} — nothing to remove.`);
    process.exit(0);
  });

/** Read one line from stdin. Kept local so `login` does not pull in readline. */
function readLine() {
  return new Promise((resolveLine) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (chunk) => resolveLine(String(chunk)));
    process.stdin.once('end', () => resolveLine(''));
    process.stdin.resume();
  });
}

// ── models: what can I actually call right now ────────────────────────────────
program
  .command('models')
  .description('List models from connected connectors, grouped by connector')
  .option('-c, --connector <id>', 'Only show one connector')
  .option('-s, --search <text>', 'Filter by id or label substring')
  .option('--all', 'Include connectors with no credential')
  .option('--offline', 'Skip network calls; use the cached catalog')
  .option('--json', 'Print as JSON')
  .action(async (options) => {
    const { refreshModels, getRankedModels, getModelTier, isLocalProvider } =
      await import('../shared/models/index.js');
    const { listConnectors } = await import('../shared/connectors/registry.js');

    if (!options.offline) await refreshModels({ includeUnconnected: !!options.all });
    let models = getRankedModels();

    if (options.connector) {
      const { getConnector } = await import('../shared/connectors/registry.js');
      if (!getConnector(options.connector)) {
        console.error(`\x1b[31mUnknown connector "${options.connector}".\x1b[0m Known: ${listConnectors().map((c) => c.id).join(', ')}`);
        process.exit(1);
      }
      models = models.filter((m) => m.provider === options.connector);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      models = models.filter((m) =>
        m.id.toLowerCase().includes(q) || String(m.label).toLowerCase().includes(q));
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(models, null, 2) + '\n');
      process.exit(0);
    }

    if (models.length === 0) {
      // With nothing connected the filtered answer is legitimately empty, but an
      // empty list is a bad first run. Show the pinned fallback — the models
      // SENTINEL will use once a key exists — so the user sees something real
      // and knows what to do next.
      if (!options.connector && !options.search && !options.all) {
        const { getFallbackModels } = await import('../shared/models/discovery.js');
        const fallbacks = getFallbackModels();
        console.log('\n\x1b[1mNo connector is connected yet.\x1b[0m');
        console.log('  \x1b[2mThese are what SENTINEL falls back to. Connect a provider to use them:\x1b[0m\n');
        for (const m of fallbacks) {
          console.log(`  \x1b[2m${m.id.padEnd(28)} ${String(m.label)}\x1b[0m`);
        }
        console.log('\n  \x1b[2mConnect one:  \x1b[0msentinel auth login <id>   \x1b[2mor run Ollama/LM Studio for a free local model.\x1b[0m');
        console.log('  \x1b[2mSee the list: \x1b[0msentinel auth\n');
        process.exit(0);
      }
      console.log('\nNo models matched.');
      console.log('  \x1b[2mConnect a provider: sentinel auth login <id>\x1b[0m');
      console.log('  \x1b[2mOr widen the search: sentinel models --all\x1b[0m\n');
      process.exit(0);
    }

    const { isOllamaCloudModel } = await import('../shared/models/index.js');
    const byConnector = new Map();
    for (const m of models) {
      if (!byConnector.has(m.provider)) byConnector.set(m.provider, []);
      byConnector.get(m.provider).push(m);
    }

    console.log('');
    for (const [connectorId, rows] of byConnector) {
      const { label } = listConnectors().find((c) => c.id === connectorId) || { label: connectorId };
      console.log(`\x1b[1m${label}\x1b[0m \x1b[2m(${rows.length})\x1b[0m`);
      for (const m of rows) {
        const price = (m.inputUsdPerMillionTokens || 0) + (m.outputUsdPerMillionTokens || 0) === 0
          ? (isOllamaCloudModel(m) ? 'cloud, metered' : isLocalProvider(m.provider) ? 'local' : 'free tier')
          : `$${m.inputUsdPerMillionTokens}/$${m.outputUsdPerMillionTokens} per M`;
        const flags = [
          m.thinking ? '\x1b[35mthinking\x1b[0m' : null,
          m.toolCall ? 'tools' : null,
          getModelTier(m),
        ].filter(Boolean).join(', ');
        console.log(`  ${m.id.padEnd(44)} \x1b[2m${price.padEnd(22)} ${flags}\x1b[0m`);
      }
      console.log('');
    }
    console.log('  \x1b[2mSwitch with -m <id> on any command, or /model <id> in the TUI.\x1b[0m\n');
    process.exit(0);
  });

// ── connect: wire SENTINEL (and third-party MCP servers) into assistants ──────
program
  .command('connect')
  .description('Detect installed coding assistants and register the SENTINEL MCP server with them')
  .option('-t, --target <id>', 'Assistant id to target (default: all detected)')
  .option('-s, --scope <scope>', 'Config scope: user | project (default: user)')
  .option('--mcp <provider>', 'Register a third-party MCP server instead: context (Context.dev)')
  .option('--providers', 'List available third-party MCP providers and exit')
  .option('--logout', 'Forget stored credentials for --mcp <provider>')
  .option('--list', 'List detected assistants and exit')
  .option('--skills', 'Show skill directories SENTINEL can read (with --list: the skills themselves)')
  .option('--remove', 'Remove the SENTINEL entry instead of adding it')
  .option('--dry-run', 'Show what would change without writing')
  .option('--json', 'Print the result as JSON')
  .action(async (options) => {
    const { detectTargets, registerWithAssistant, unregisterFromAssistant, skillDiscovery, ASSISTANT_TARGETS, MCP_PROVIDERS } =
      await import('./connect.js');

    const cwd = path.resolve(options.dir || process.cwd());
    const scope = options.scope === 'project' ? 'project' : 'user';
    const providerId = options.mcp || null;

    if (options.providers) {
      const list = Object.values(MCP_PROVIDERS).map((p) => ({
        id: p.id, label: p.label, url: p.url, docs: p.docs,
      }));
      if (options.json) {
        process.stdout.write(JSON.stringify({ providers: list }, null, 2) + '\n');
        return;
      }
      console.log('Third-party MCP servers this command can register:');
      for (const p of list) {
        console.log(`  ${p.id.padEnd(10)} ${p.label.padEnd(14)} ${p.url}`);
        console.log(`  ${' '.repeat(10)} ${p.docs}`);
      }
      console.log('\nUsage: sentinel connect --mcp context [--target <id>] [--scope user|project]');
      return;
    }

    if (options.logout) {
      if (!providerId) {
        console.error('Specify which provider to forget: --mcp context --logout');
        process.exit(1);
      }
      const { clearStoredAuth } = await import('../agent/mcp-oauth.js');
      const provider = MCP_PROVIDERS[providerId];
      const ok = clearStoredAuth(provider?.serverKey || providerId);
      console.log(ok
        ? `Forgot stored credentials for ${provider?.label || providerId}.`
        : `Nothing stored for ${provider?.label || providerId}.`);
      process.exit(0);
    }

    if (providerId && !MCP_PROVIDERS[providerId]) {
      console.error(`\x1b[31mUnknown MCP provider "${providerId}".\x1b[0m Known: ${Object.keys(MCP_PROVIDERS).join(', ')}`);
      console.error('Run `sentinel connect --providers` for details.');
      process.exit(1);
    }

    if (options.skills) {
      // `--skills` alone answers "where does Sentinel look". Adding `--list`
      // answers the question that actually follows it — "what is in there" —
      // which the directory view cannot answer, because it never opens a
      // SKILL.md.
      if (options.list) {
        const { listSkills, resolveSkill, listSkillScripts } = await import('../agent/skills.js');
        // Every skill, including the ones withheld from the model. This view is
        // for a human deciding what to type as `/name`, and a skill marked
        // `disable-model-invocation` is exactly the one they most need to see.
        const skills = listSkills(cwd);
        if (options.json) {
          process.stdout.write(
            JSON.stringify(
              {
                count: skills.length,
                skills: skills.map((s) => ({
                  name: s.name,
                  description: s.description,
                  // Reachable as `/name`, but not advertised to the model.
                  explicitOnly: Boolean(s.disableModelInvocation),
                  argumentHint: s.argumentHint || undefined,
                  scripts: listSkillScripts(resolveSkill(s.name, cwd)),
                })),
              },
              null,
              2,
            ) + '\n',
          );
          return;
        }
        if (skills.length === 0) {
          console.log('No skills found. Install one with: npx skills add <owner/repo>');
          return;
        }
        console.log(`Skills (${skills.length}) — invoke one with /<name>:`);
        for (const s of skills) {
          const scripts = listSkillScripts(resolveSkill(s.name, cwd));
          const hint = s.argumentHint ? ` ${s.argumentHint}` : '';
          const explicit = s.disableModelInvocation ? '  [explicit only — the model will not pick this]' : '';
          console.log(`  ${s.name}${hint}: ${s.description}${explicit}`);
          if (scripts.length) console.log(`      scripts: ${scripts.join(', ')}`);
        }
        return;
      }
      const dirs = await skillDiscovery(cwd);
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
        ? unregisterFromAssistant({ targetId: t.id, scope, cwd, dryRun: options.dryRun, mcpProvider: providerId })
        : registerWithAssistant({ targetId: t.id, scope, cwd, dryRun: options.dryRun, mcpProvider: providerId }),
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

// ── contextdev: inspect and verify the Context.dev integration ──────────────
program
  .command('contextdev')
  .description('Check the Context.dev web-context integration: key, providers, MCP auth, and a live probe')
  .option('--json', 'Print the report as JSON')
  .option('--check', 'Make one live API call to verify the key (costs ~1 credit)')
  .option('--url <url>', 'Scrape one URL through Context.dev (costs ~1 credit)')
  .option('--register', 'Register the hosted Context.dev MCP server with detected assistants')
  .option('-t, --target <id>', 'With --register, only this assistant id')
  .option('--dry-run', 'With --register, show what would change without writing')
  .action(async (options) => {
    const { hasContextDevKey, contextDevKey, contextDevMissingReason, scrape, CONTEXT_DEV_MCP_URL } =
      await import('../shared/context-dev.js');
    const { providerOrder, availableProviders } = await import('../shared/web-search.js');
    const { hasStoredAuth, authSummary } = await import('../agent/mcp-oauth.js');

    const report = {
      key: {
        // Presence and length only. The value never reaches stdout, a log, or
        // a status report that might get pasted into an issue.
        configured: hasContextDevKey(),
        length: contextDevKey()?.length ?? 0,
        problem: contextDevMissingReason(),
      },
      search: {
        order: providerOrder(),
        available: availableProviders(),
      },
      mcp: {
        url: CONTEXT_DEV_MCP_URL,
        authenticated: hasStoredAuth('context'),
        state: authSummary('context'),
      },
      live: null,
    };

    if (options.register) {
      const { detectTargets, registerWithAssistant } = await import('./connect.js');
      const detected = detectTargets({ cwd: process.cwd() });
      const targets = options.target ? detected.filter((t) => t.id === options.target) : detected;
      report.registered = targets.map((t) =>
        registerWithAssistant({ targetId: t.id, scope: 'user', cwd: process.cwd(), dryRun: !!options.dryRun, mcpProvider: 'context' }));
      if (!targets.length) {
        report.registerNote = 'No assistants detected. Use sentinel connect --target <id> --mcp context.';
      }
    }

    if (options.url) {
      try {
        report.live = { ok: true, scrape: await scrape(options.url, { maxChars: 2000 }) };
      } catch (e) {
        report.live = { ok: false, error: e?.message || String(e) };
      }
    } else if (options.check) {
      try {
        // The cheapest live call that still proves the key works end to end.
        report.live = { ok: true, search: await (await import('../shared/context-dev.js')).search('sentinel cli', 1) };
      } catch (e) {
        report.live = { ok: false, error: e?.message || String(e) };
      }
    }

    if (options.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      process.exit(report.live && report.live.ok === false ? 1 : 0);
    }

    const yn = (b) => (b ? '\x1b[32m✓\x1b[0m' : '\x1b[33m·\x1b[0m');
    console.log('Context.dev integration\n');
    console.log(`  API key       ${yn(report.key.configured)} ${report.key.configured ? `set (${report.key.length} chars)` : 'not set — optional'}`);
    if (report.key.problem) console.log(`                 \x1b[2m${report.key.problem}\x1b[0m`);
    console.log(`  searchWeb     ${report.search.available.join(', ') || 'none'}`);
    console.log(`                 chain: ${report.search.order.join(' → ')}`);
    console.log(`  MCP server    ${yn(report.mcp.authenticated)} ${report.mcp.url}`);
    console.log(`                 ${report.mcp.authenticated ? 'signed in' : 'not signed in yet — OAuth happens in the assistant, or use CONTEXT_DEV_API_KEY'}`);

    if (report.live) {
      console.log('');
      if (report.live.ok) {
        const credits = report.live.scrape?.creditsUsed ?? report.live.search?.[0]?.creditsUsed;
        console.log(`  \x1b[32m✓\x1b[0m live call succeeded${Number.isFinite(credits) ? ` (${credits} credit(s) used)` : ''}`);
        if (report.live.scrape) {
          console.log(`                 ${report.live.scrape.title || report.live.scrape.url}`);
          console.log(`                 ${report.live.scrape.text.slice(0, 160).replace(/\s+/g, ' ')}…`);
        } else {
          console.log(`                 ${report.live.search.length} result(s)`);
        }
      } else {
        console.log(`  \x1b[31m✗\x1b[0m live call failed: ${report.live.error}`);
      }
    }

    if (report.registered) {
      console.log('');
      for (const r of report.registered) {
        const mark = r.ok ? (r.action === 'unchanged' ? '·' : '✓') : '✗';
        console.log(`  ${mark} ${r.message}`);
      }
    }

    console.log('\n  Next:');
    if (!report.key.configured) {
      console.log('    • Set CONTEXT_DEV_API_KEY for searchWeb/fetchUrl, or');
    }
    console.log('    • sentinel connect --mcp context   → OAuth server for your other assistants');
    console.log('    • sentinel contextdev --check      → verify with one live call (~1 credit)');
    process.exit(report.live && report.live.ok === false ? 1 : 0);
  });

// ── heal: detect and repair drift ───────────────────────────────────────────
program
  .command('heal')
  .description('Detect drift in assistant integrations and .sentinel state, then repair it')
  .option('-d, --dir <path>', 'Project directory (default: cwd)')
  .option('--fix', 'Apply repairs (default: report only)')
  .option('--dry-run', 'With --fix, show what would change without writing')
  .option('--json', 'Print the report as JSON')
  .action(async (options) => {
    const { fullHealthCheck, renderHealth, repairState, repairAssistantDrift, checkAssistantDrift, checkStateHealth } =
      await import('../agent/self-heal.js');
    const cwd = path.resolve(options.dir || process.cwd());

    if (!options.fix) {
      const report = await fullHealthCheck({ cwd });
      if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else console.log(renderHealth(report));
      // Drift or rot is a warning, not a failure: this is a diagnostic command.
      process.exit(0);
    }

    const drift = checkAssistantDrift(cwd);
    const state = checkStateHealth(cwd);
    const driftResults = repairAssistantDrift(drift, { cwd, dryRun: options.dryRun });
    const stateResults = repairState(state, { cwd, dryRun: options.dryRun });

    if (options.json) {
      process.stdout.write(JSON.stringify({ drift, driftResults, state, stateResults }, null, 2) + '\n');
      process.exit(0);
    }

    if (drift.length === 0 && state.length === 0) {
      console.log('Nothing to repair.');
      return;
    }
    if (driftResults.length) {
      console.log('Assistant integration:');
      for (const r of driftResults) {
        const mark = r.ok ? (r.action === 'unchanged' ? '·' : '✓') : '✗';
        console.log(`  ${mark} ${r.message}`);
      }
    }
    if (stateResults.length) {
      console.log('State:');
      for (const r of stateResults) {
        const mark = r.applied ? '✓' : '·';
        console.log(`  ${mark} ${r.file}: ${r.note}`);
      }
    }
    if (options.dryRun) console.log('\nDry run — nothing was written.');
  });

// ── update: check for and apply available updates ───────────────────────────
program
  .command('update')
  .description('Check for a newer SENTINEL, assistant config drift, and integration health')
  .option('-d, --dir <path>', 'Project directory (default: cwd)')
  .option('--yes', 'Actually install updates (default: report only)')
  .option('--skills', 'Update installed skills via the skills.sh CLI instead')
  .option('--json', 'Print the report as JSON')
  .action(async (options) => {
    const { fullUpdateReport, renderUpdateReport, checkSelfUpdate, applySelfUpdate, updateSkills } =
      await import('../agent/self-update.js');
    const cwd = path.resolve(options.dir || process.cwd());

    if (options.skills) {
      const out = updateSkills({ cwd, yes: options.yes });
      if (options.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      else console.log(out.applied ? `Skills updated.\n${out.output || ''}` : `Not updated: ${out.reason}`);
      process.exit(out.applied ? 0 : 1);
    }

    if (options.yes) {
      const self = await checkSelfUpdate();
      if (self.updateAvailable) {
        const result = applySelfUpdate({ yes: true });
        if (!options.json) {
          console.log(result.applied
            ? `Updated SENTINEL ${self.current} → ${self.latest}.`
            : `Update failed: ${result.reason}`);
        } else {
          process.stdout.write(JSON.stringify({ self: result }, null, 2) + '\n');
        }
        // A package swap means the running process is stale; re-run to verify.
        process.exit(result.applied ? 0 : 1);
      }
      const report = await fullUpdateReport({ cwd });
      if (!options.json) console.log(`SENTINEL ${report.self.current} is already the latest published version.`);
      else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      return;
    }

    const report = await fullUpdateReport({ cwd });
    if (options.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else console.log(renderUpdateReport(report));
  });

// ── memory: cross-agent memory (agentmemory) ────────────────────────────────
program
  .command('memory')
  .description('Query the cross-agent memory store shared by all assistants (agentmemory)')
  .argument('[query]', 'Search query. Omit to check status.')
  .option('-n, --limit <n>', 'Maximum results (default 5)', parseInt)
  .option('--remember <text>', 'Store a durable insight instead of searching')
  .option('--concepts <list>', 'Comma-separated concepts (with --remember)')
  .option('--project <name>', 'Scope to a project')
  .option('--refresh', 'Re-probe server health instead of using the cache')
  .option('--json', 'Print the result as JSON')
  .action(async (query, options) => {
    const bridge = await import('../agent/memory-bridge.js');
    if (options.refresh) bridge.resetHealthCache();

    if (options.remember) {
      const out = await bridge.remember({
        content: options.remember,
        concepts: options.concepts ? options.concepts.split(',').map((c) => c.trim()).filter(Boolean) : [],
        project: options.project,
        agentId: 'sentinel',
      });
      if (options.json) {
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      } else if (out.stored) {
        console.log(out.similarTo ? `Already known (similar to ${out.similarTo}).` : 'Stored.');
      } else {
        console.log(`Not stored: agentmemory ${out.skipped}${out.detail ? ` (${out.detail})` : ''}`);
      }
      process.exit(out.stored ? 0 : 1);
    }

    if (!query) {
      const s = await bridge.status();
      if (options.json) {
        process.stdout.write(JSON.stringify(s, null, 2) + '\n');
      } else if (s.reachable) {
        console.log(`agentmemory online at ${s.url}${s.sessions ? ` — ${s.sessions} sessions` : ''}`);
      } else {
        console.log(`agentmemory offline (${s.state}).`);
        console.log(s.hint || 'Start it with: npx -y @agentmemory/agentmemory@latest');
      }
      process.exit(s.reachable ? 0 : 1);
    }

    const result = await bridge.recall({ query, limit: options.limit || 5, project: options.project });
    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      process.exit(result.ok ? 0 : 1);
    }
    if (!result.ok) {
      console.log(`agentmemory unavailable (${result.skipped}).`);
      process.exit(1);
    }
    if (!result.results.length) {
      console.log('No matches.');
      return;
    }
    result.results.forEach((r, i) => {
      const content = String(r.content || r.text || r.summary || '').replace(/\s+/g, ' ').trim();
      console.log(`${i + 1}. ${content.slice(0, 300)}`);
      if (r.concepts?.length) console.log(`   concepts: ${r.concepts.join(', ')}`);
    });
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
  .argument('[action]', 'install | list | find | run', 'list')
  .argument('[pkg]', 'Skill package, e.g. mattpocock/skills')
  .option('-s, --skill <name>', 'Specific skill name (default: all in the package)')
  .option('-a, --agent <agent>', 'Target agent for the install (default: auto-detect)')
  .option('-g, --global', 'Install globally instead of project-level')
  .option('--json', 'Print skill directories as JSON')
  .option('--print', 'With `run`: print the expanded skill and exit instead of running a turn')
  .option('-b, --build', 'With `run`: allow edits (default: PLAN, read-only)')
  .option('-m, --model <id>', 'With `run`: model to use')
  .option('--budget <usd>', 'With `run`: stop the turn once it has cost this many USD')
  .action(async (action, pkg, options) => {
    const { skillDiscovery } = await import('./connect.js');
    const cwd = path.resolve(options.dir || process.cwd());

    // `run` starts a turn with a skill already loaded, rather than waiting for
    // the model to decide it wants one. `sentinel skills run review auth.js` is
    // `/review auth.js` for a shell, a script, or a CI step — none of which have
    // a composer to type into.
    if (action === 'run') {
      const { expandSlashCommand } = await import('../agent/slash-commands.js');
      // `pkg` is the skill name and everything after it is its arguments, which
      // is why this branch runs before the `!pkg` check below.
      const raw = `/${pkg || ''}`.trim();
      if (!pkg) {
        console.error('Usage: sentinel skills run <name> [args...] [--build] [--model id]');
        process.exit(1);
      }
      const expanded = expandSlashCommand(raw, cwd);
      if (!expanded.skill) {
        console.error(`Unknown skill: ${pkg}`);
        console.error('List what is available with: sentinel connect --skills --list');
        process.exit(1);
      }
      if (options.print) {
        process.stdout.write(expanded.text + '\n');
        return;
      }
      const { runAgentTurn } = await import('../agent/loop.js');
      const { DEFAULT_CHAT_MODEL_ID } = await import('../shared/models/index.js');
      const { formatUsd } = await import('../agent/cost.js');
      const mode = options.build ? 'BUILD' : 'PLAN';
      const model = options.model || DEFAULT_CHAT_MODEL_ID;
      let sawError = false;
      try {
        for await (const ev of runAgentTurn({
          history: [{ id: `skill_${Date.now()}`, role: 'user', parts: [{ type: 'text', text: expanded.text }] }],
          mode,
          model,
          budgetUsd: options.budget ? Number(options.budget) : undefined,
        })) {
          if (ev.event === 'text') process.stdout.write(ev.data.delta);
          else if (ev.event === 'tool_result') {
            process.stderr.write(`\x1b[2m  ${ev.data.tool || ev.data.toolCallId || 'tool'}\x1b[0m\n`);
          } else if (ev.event === 'error') {
            sawError = true;
            process.stderr.write(`\x1b[31m${ev.data.message}\x1b[0m\n`);
          } else if (ev.event === 'finish') {
            const inputTokens = ev.data.usage?.inputTokens ?? '?';
            const outputTokens = ev.data.usage?.outputTokens ?? '?';
            process.stderr.write(
              `\n\x1b[2m${inputTokens} in / ${outputTokens} out · ${formatUsd(ev.data.costUsd || 0)} · ${model}\x1b[0m\n`,
            );
          }
        }
      } catch (err) {
        console.error(`\x1b[31m${err.message}\x1b[0m`);
        process.exit(1);
      }
      process.exit(sawError ? 1 : 0);
    }

    if (action === 'list' || !pkg) {
      const dirs = await skillDiscovery(cwd);
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
