#!/usr/bin/env node

/**
 * Unified review command — integrates SmartBundler, PositioningModule,
 * ReflectionModule, PreviewMode, BackgroundContext, and Audience Mode.
 *
 * Features inspired by open-code-review:
 *   --preview       Show which files would be reviewed (no LLM calls)
 *   --background    Business context for targeted review
 *   --concurrency   Max concurrent file reviews
 *   --from / --to   Branch compare
 *   --commit        Single commit review
 *   --format        text | json | sarif
 *   --audience      human | agent (different output formats)
 *   --rule          Custom rule file path
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createReviewPipeline } from '../agents/review-pipeline.js';
import { SecurityAnalyzer } from '../analyzers/securityAnalyzer.js';
import { QualityAnalyzer } from '../analyzers/qualityAnalyzer.js';
import { BugAnalyzer } from '../analyzers/bugAnalyzer.js';
import { PerformanceAnalyzer } from '../analyzers/performanceAnalyzer.js';
import { DependencyAnalyzer } from '../analyzers/dependencyAnalyzer.js';
import Config from '../config/config.js';
import { SmartBundler } from '../review/smartBundler.js';
import { ReflectionModule } from '../review/reflectionModule.js';
import { PreviewMode } from '../review/previewMode.js';
import { BackgroundContext } from '../review/backgroundContext.js';
import { RulesCommand } from './rulesCommand.js';
import { recordSession } from '../server/viewer.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function hasFlag(args, ...flags) {
  return flags.some(f => args.includes(f));
}

function getChangedFiles(fromRef, toRef) {
  try {
    const result = execSync(`git diff ${fromRef}..${toRef} --name-only`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function getWorkspaceFiles() {
  try {
    const result = execSync('git status --porcelain', {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.trim().split('\n')
      .filter(Boolean)
      .map(line => line.slice(3).trim())
      .filter(f => f);
  } catch {
    return [];
  }
}

function getCommitFiles(sha) {
  try {
    const result = execSync(`git diff-tree --no-commit-id --name-only -r ${sha}`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (hasFlag(args, '--help', '-h')) {
    showHelp();
    process.exit(0);
  }

  const fromRef = parseArg(args, '--from');
  const toRef = parseArg(args, '--to');
  const commitSha = parseArg(args, '--commit');
  const format = parseArg(args, '--format') || 'text';
  const concurrency = parseInt(parseArg(args, '--concurrency') || '4', 10);
  const backgroundCtx = parseArg(args, '--background');
  const audience = parseArg(args, '--audience') || 'human';
  const rulePath = parseArg(args, '--rule');
  const isPreview = hasFlag(args, '--preview', '-p');
  // Instantiate all modules
  const bundler = new SmartBundler({ concurrency });
  const reflection = new ReflectionModule();
  const preview = new PreviewMode({ bundler });
  const background = new BackgroundContext();
  const rulesCmd = new RulesCommand();

  // Load config
  const config = new Config();
  await config.load();

  // Resolve background context
  const bgResult = background.resolve(backgroundCtx, { commit: commitSha });
  if (bgResult.hasContext) {
    console.error(background.summarize(bgResult));
    console.error('');
  }

  // Determine which files to review
  let files = [];
  if (commitSha) {
    console.error(`Reviewing commit ${commitSha}...`);
    files = getCommitFiles(commitSha);
  } else if (fromRef && toRef) {
    console.error(`Reviewing ${fromRef}..${toRef}...`);
    files = getChangedFiles(fromRef, toRef);
  } else {
    console.error('Reviewing workspace changes...');
    files = getWorkspaceFiles();
  }

  // Smart bundle the files
  const bundleResult = bundler.bundle(files, { concurrency });
  if (bundleResult.bundles.length > 0) {
    console.error(bundler.summarize(bundleResult));
    console.error('');
  }

  // PREVIEW mode — show what would be reviewed without running LLM
  if (isPreview) {
    const previewResult = preview.preview(files, {
      from: fromRef,
      to: toRef,
      commit: commitSha,
      concurrency,
    });
    console.log(preview.format(previewResult));
    process.exit(0);
  }

  // RULES CHECK — if user passes --rule, show rules and exit
  if (rulePath) {
    if (!existsSync(resolve(rulePath))) {
      console.error(`Rule file not found: ${rulePath}`);
      process.exit(1);
    }
    for (const file of files.slice(0, 5)) {
      const result = await rulesCmd.check(file, { rule: rulePath });
      if (format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(rulesCmd.format(result));
      }
    }
    process.exit(0);
  }

  // Run the review pipeline
  const analyzers = [
    new SecurityAnalyzer(config),
    new QualityAnalyzer(config),
    new BugAnalyzer(config),
    new PerformanceAnalyzer(config),
    new DependencyAnalyzer(config),
  ];

  const pipeline = await createReviewPipeline({
    analyzers,
    concurrency,
    background: bgResult.hasContext ? background.buildPrompt(bgResult) : undefined,
  });

  let pipelineResult;
  if (commitSha) {
    pipelineResult = await pipeline.reviewCommit(commitSha);
  } else if (fromRef && toRef) {
    pipelineResult = await pipeline.reviewRange(fromRef, toRef);
  } else {
    pipelineResult = await pipeline.reviewWorkspace();
  }

  // Position and reflect on all comments
  const allComments = pipelineResult.comments || [];
  const positionedIssues = allComments.map(c => ({
    file: c.path || c.file || '',
    line: c.line || 1,
    severity: c.severity || 'medium',
    title: c.title || 'Issue',
    message: c.message || '',
    snippet: c.snippet || '',
    suggestion: c.suggestion || '',
  }));

  const reflected = reflection.reflect(positionedIssues, {
    minConfidence: 0.4,
    maxIssues: 50,
  });

  // Classify by priority for agent audience
  const classified = reflection.classifyByPriority(reflected.comments);

  // Record session for viewer
  const sessionId = recordSession(null, {
    mode: 'review',
    timestamp: new Date().toISOString(),
    files,
    totalIssues: reflected.stats.accepted,
    discarded: reflected.stats.discarded,
    comments: reflected.comments.slice(0, 20),
    bundles: bundleResult.bundles,
    background: bgResult,
  });

  // OUTPUT
  if (format === 'json') {
    const output = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      pipeline: 'sentinel-review',
      summary: {
        files: files.length,
        issues: reflected.stats.accepted,
        discarded: reflected.stats.discarded,
        avgConfidence: reflected.stats.avgConfidence,
        bundles: bundleResult.bundles.length,
        audience,
      },
      ...(audience === 'agent' ? {
        high: classified.high,
        medium: classified.medium,
        low: classified.low,
      } : {
        comments: reflected.comments,
      }),
      stats: reflected.stats,
      session: sessionId,
    };
    console.log(JSON.stringify(output, null, 2));

  } else if (format === 'sarif') {
    const sarif = {
      version: '2.1.0',
      runs: [{
        tool: { driver: { name: 'Sentinel Review', version: '2.0.2' } },
        results: reflected.comments.map(c => ({
          ruleId: c.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'review',
          level: c.severity === 'critical' || c.severity === 'high' ? 'error'
            : c.severity === 'medium' ? 'warning' : 'note',
          message: { text: `${c.title}: ${c.message}` },
          locations: c.file ? [{
            physicalLocation: {
              artifactLocation: { uri: c.file },
              region: { startLine: c.line || 1 },
            },
          }] : undefined,
        })),
      }],
    };
    console.log(JSON.stringify(sarif, null, 2));

  } else {
    // TEXT output
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const sorted = [...reflected.comments].sort((a, b) => {
      const sa = sevOrder[a.severity] ?? 99;
      const sb = sevOrder[b.severity] ?? 99;
      return sa - sb || (a.file || '').localeCompare(b.file || '');
    });

    const critical = reflected.comments.filter(c => c.severity === 'critical').length;
    const high = reflected.comments.filter(c => c.severity === 'high').length;
    const medium = reflected.comments.filter(c => c.severity === 'medium').length;
    const low = reflected.comments.filter(c => c.severity === 'low').length;
    const discarded = reflected.stats.discarded;

    console.log('');
    console.log('  ─────────────────────────────────────────────────────');
    console.log('  🛡️  Sentinel Review');
    if (bgResult.hasContext) {
      console.log(`     Context: ${bgResult.text.slice(0, 60)}${bgResult.text.length > 60 ? '...' : ''}`);
    }
    console.log('  ─────────────────────────────────────────────────────');
    console.log('');
    console.log(`  Files:           ${files.length}  (${bundleResult.bundles.length} bundles, ${bundleResult.singletons.length} singletons)`);
    console.log(`  Issues:          ${reflected.stats.accepted}`);
    if (discarded > 0) console.log(`  Discarded:       ${discarded} (low confidence / meaningless)`);
    console.log(`  Confidence:      ${(reflected.stats.avgConfidence * 100).toFixed(0)}%`);
    console.log('');
    if (critical > 0) console.log(`  🔴 Critical: ${critical}`);
    if (high > 0) console.log(`  🟠 High:     ${high}`);
    if (medium > 0) console.log(`  🟡 Medium:   ${medium}`);
    if (low > 0) console.log(`  🟢 Low:      ${low}`);

    console.log('');
    for (const c of sorted) {
      const sevTag = {
        critical: '🔴 [CRIT]',
        high:     '🟠 [HIGH]',
        medium:   '🟡 [MED] ',
        low:      '🟢 [LOW] ',
        info:     'ℹ️ [INFO]',
      }[c.severity] || '[?]    ';
      const loc = c.file ? `${c.file}${c.line ? `:${c.line}` : ''}` : '?';
      const conf = c._reflection?.confidence ? ` (${(c._reflection.confidence * 100).toFixed(0)}%)` : '';
      console.log(`  ${sevTag} ${loc}${conf}`);
      console.log(`         ${c.title}: ${c.message}`);
      if (c.suggestion) console.log(`         💡 ${c.suggestion}`);
      console.log('');
    }

    console.log(`  Summary: ${reflected.stats.accepted} issue(s) across ${files.length} file(s)`);
    if (sessionId) console.log(`  Session: ${sessionId} (view with: sentinel viewer)`);
    console.log('');
  }
}

function showHelp() {
  console.log([
    '  🛡️  Sentinel Review — Unified code review with AI enhancements',
    '',
    '  Usage:',
    '    sentinel review [options]',
    '',
    '  Mode options:',
    '    --workspace              Review working tree changes (default)',
    '    --from <ref>             Source branch/ref (e.g., main)',
    '    --to <ref>               Target branch/ref (e.g., feature-branch)',
    '    --commit <sha>           Single commit SHA',
    '',
    '  Review options:',
    '    --preview, -p            Preview files without running LLM',
    '    --background <text>      Business context for targeted review',
    '    --format <fmt>           Output: text (default), json, sarif',
    '    --audience <type>        human (default) or agent (classified output)',
    '    --concurrency <n>        Max concurrent file reviews (default: 4)',
    '    --rule <path>            Custom review rules JSON file',
    '',
    '  Utility:',
    '    --help, -h               Show this help',
    '',
    '  Examples:',
    '    sentinel review',
    '    sentinel review --preview',
    '    sentinel review --from main --to feature-x --format json',
    '    sentinel review --commit abc123 --background "Add rate limiting"',
    '    sentinel review --preview --audience agent --format json',
    '',
  ].join('\n'));
}

main().catch(err => {
  console.error('  ❌ Review failed:', err.message);
  process.exit(1);
});
