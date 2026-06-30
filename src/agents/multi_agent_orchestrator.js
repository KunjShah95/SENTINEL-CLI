// Orchestrator for Scanner -> Fixer -> Validator agent pipeline
// Usage: node multi_agent_orchestrator.js <path-to-js-file-or-code-string>
// If the argument is a path to a file, it will read the file contents as code; otherwise it will treat the argument as the code string.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');

async function readCodeFromInput(input) {
  if (!input) return '';
  // If input points to an existing file, read file contents
  try {
    const stat = fs.statSync(input);
    if (stat.isFile()) {
      return fs.readFileSync(input, 'utf8');
    }
  } catch {
    // Not a file, treat input as code string
  }
  return input;
}

async function main() {
  const scannerModule = await import('./scanner_agent.js');
  const fixerModule = await import('./fixer_agent.js');
  const validatorModule = await import('./validator_agent.js');

  // Basic CLI parsing: first non-flag argument is code or path, rest are options
  const argv = process.argv.slice(2);
  let codeArg = null;
  const options = { format: 'text', sarif: false, failOn: null, loop: false, write: false, maxIter: 5 };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format' && argv[i + 1]) {
      options.format = argv[i + 1];
      i++;
      continue;
    }
    if (a === '--sarif') {
      options.sarif = true;
      continue;
    }
    if (a === '--fail-on' && argv[i + 1]) {
      options.failOn = argv[i + 1];
      i++;
      continue;
    }
    if (a === '--loop') {
      options.loop = true;
      continue;
    }
    if (a === '--write') {
      options.write = true;
      continue;
    }
    if (a === '--max-iter' && argv[i + 1]) {
      options.maxIter = parseInt(argv[i + 1], 10) || 5;
      i++;
      continue;
    }
    // first non-flag is code/path
    if (!codeArg) codeArg = a;
  }

  const code = await readCodeFromInput(codeArg);
  if (typeof code !== 'string' || code.length === 0) {
    console.log('No input code provided. Pass a code string or a path to a code file as the first argument.');
    return;
  }

  let isFile = false;
  try { isFile = fs.statSync(codeArg).isFile(); } catch { /* code string */ }

  // Autonomous loop mode: scan -> fix -> validate -> re-scan proof -> iterate.
  if (options.loop) {
    const { runFixLoop } = await import('./autonomousFixLoop.js');
    const report = await runFixLoop(code, {
      filename: isFile ? codeArg : 'code.js',
      maxIterations: options.maxIter,
      failOn: options.failOn,
      writeBack: options.write && isFile
    });

    console.log('# Autonomous Fix Loop');
    console.log(`\nAuto-fixable targets: ${report.targetedCount} | Iterations: ${report.iterations}`);
    console.log(`Resolved (proven gone): ${report.resolved.length}`);
    report.resolved.forEach(e => console.log(`  ✓ ${e.type}: ${e.message}${e.line ? ` (line ${e.line})` : ''}`));
    console.log(`Remaining (auto-fixable): ${report.remaining.length}`);
    report.remaining.forEach(e => console.log(`  ✗ ${e.type}: ${e.message}${e.line ? ` (line ${e.line})` : ''}`));
    if (report.regressionsIntroduced.length > 0) {
      console.log(`Regressions blocked: ${report.regressionsIntroduced.length} (fix rolled back)`);
    }
    const unfixable = report.unfixableRemaining || [];
    if (unfixable.length > 0) {
      console.log(`\nNeeds human (not auto-fixable): ${unfixable.length}`);
      unfixable.forEach(e => console.log(`  ⚠ ${e.severity} ${e.type}: ${e.message}${e.line ? ` (line ${e.line})` : ''}`));
    }
    console.log(`\nSyntax valid: ${report.syntaxValid ? 'YES' : 'NO'}`);
    console.log(`PROVEN FIXED: ${report.proven ? 'YES' : 'NO'}`);
    console.log(`CLEAN (nothing left at threshold): ${report.clean ? 'YES' : 'NO'}`);
    if (report.wroteFile) console.log(`Wrote proven fix to ${report.filename}`);

    // CI gate: fail if anything remains at the threshold — including findings a
    // human must fix — not just auto-fixable ones.
    if (options.failOn && !report.clean) process.exit(1);
    return;
  }

  // Step 1: Scan for errors
  const errors = await scannerModule.scanCode(code);

  // Step 2: Propose fixes
  const fixRes = await fixerModule.proposeFixes(code, errors);

  // Step 3: Validate fixes
  const validation = validatorModule.validateFix(code, fixRes.fixedCode, errors);

  // Determine exit-on severity if requested
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  if (options.failOn) {
    const threshold = severityOrder[options.failOn] || 0;
    const found = errors.some(e => severityOrder[(e.severity || 'info')] >= threshold);
    if (found) {
      // Print a brief summary then exit non-zero
      console.error('Fail-on threshold met; exiting with non-zero code');
      process.exit(1);
    }
  }

  // Output formatting
  if (options.sarif) {
    const sarif = {
      version: '2.1.0',
      $schema: 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
      runs: [
        {
          tool: { driver: { name: 'Sentinel CLI', informationUri: 'https://example.com' } },
          results: errors.map((e) => ({
            ruleId: e.type,
            message: { text: e.message },
            level: (e.severity === 'critical' || e.severity === 'high') ? 'error' : 'warning'
          }))
        }
      ]
    };
    console.log(JSON.stringify(sarif, null, 2));
    return;
  }

  if (options.format === 'markdown') {
    console.log('# Automated Review');
    console.log('\n## Errors');
    if (errors.length === 0) {
      console.log('- No errors detected');
    } else {
      errors.forEach((e) => {
        console.log(`- **${e.type}**: ${e.message}` + (e.line ? ` (line ${e.line})` : ''));
      });
    }

    console.log('\n## Proposed Fixes');
    if (fixRes.proposals && fixRes.proposals.length > 0) {
      fixRes.proposals.forEach((p) => {
        console.log(`- ${p.description}`);
        console.log(`  \n  Preview: \n\n  ${p.patchPreview}\n`);
      });
    } else {
      console.log('- No fixes proposed');
    }

    console.log('\n## Validator Feedback');
    console.log(`- Overall passes: ${validation.passes ? 'YES' : 'NO'}`);
    validation.details.forEach((d) => {
      console.log(`- ${d.check}: ${d.status}${d.note ? ' — ' + d.note : ''}`);
    });

    return;
  }

  // Default text output (fallback)
  console.log('Error list');
  if (errors.length === 0) {
    console.log('- No errors detected');
  } else {
    errors.forEach((e, idx) => {
      console.log(`${idx + 1}. ${e.type}: ${e.message}` + (e.line ? ` (line ${e.line})` : ''));
    });
  }

  console.log('\nProposed fix');
  if (fixRes.proposals && fixRes.proposals.length > 0) {
    fixRes.proposals.forEach((p) => {
      console.log(`- ${p.description}`);
      console.log(`  Preview: ${p.patchPreview}`);
    });
  } else {
    console.log('- No fixes proposed');
  }

  console.log('\nValidator feedback');
  console.log(`Overall passes: ${validation.passes ? 'YES' : 'NO'}`);
  validation.details.forEach((d) => {
    console.log(`- ${d.check}: ${d.status}${d.note ? ' - ' + d.note : ''}`);
  });
}

main();
