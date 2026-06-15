import fs from 'fs';

const filePath = 'src/dist/cli.js';
let content = fs.readFileSync(filePath, 'utf8');

const marker = `// NEW: Workspace/Monorepo Analysis Command`;

const checkRunCmd = `
// NEW: GitHub Check Run Command — creates a check run with annotations on any PR
program
  .command('check-run <pr-url>')
  .description('Run analysis and create a GitHub Check Run with annotations on a PR')
  .option('--target <path>', 'Target directory to scan')
  .option('--dry-run', 'Analyze but do not create the check run')
  .option('--verbose', 'Show detailed output')
  .addHelpText(
    'after',
    \`
Examples:
  sentinel check-run https://github.com/owner/repo/pull/123
  sentinel check-run https://github.com/owner/repo/pull/123 --target src/
  sentinel check-run https://github.com/owner/repo/pull/123 --dry-run

This command will:
  1. Run analysis and detect issues
  2. Parse the PR URL to get owner, repo, and PR number
  3. Fetch PR details to obtain the head commit SHA
  4. Create a GitHub Check Run with inline annotations
  5. Display the check run URL

Requires GITHUB_TOKEN environment variable.
\`
  )
  .action(async (prUrl, options) => {
    try {
      const { GitHubIntegration } = await import('../integrations/github.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      console.log(chalk.cyan('🔍 Running analysis for check run...'));

      const result = await bot.runAnalysis({
        format: 'json',
        silent: true,
        files: options.target ? [options.target] : undefined,
      });

      const issues = (result.issues || []).map(i => ({
        file: i.file || 'unknown',
        line: i.line || 1,
        severity: i.severity,
        message: i.message || i.title || '',
        title: i.title || 'Sentinel finding',
      }));

      if (options.verbose || options.dryRun) {
        console.log(chalk.yellow(\`\\nFindings: \${issues.length} issue\${issues.length !== 1 ? 's' : ''}\`));
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const i of issues) if (counts[i.severity] !== undefined) counts[i.severity]++;
        if (counts.critical) console.log(chalk.red(\`  🛑 Critical: \${counts.critical}\`));
        if (counts.high) console.log(chalk.yellow(\`  🔶 High: \${counts.high}\`));
        if (counts.medium) console.log(chalk.blue(\`  🔷 Medium: \${counts.medium}\`));
        if (counts.low) console.log(chalk.green(\`  🟢 Low: \${counts.low}\`));
        if (counts.info) console.log(chalk.gray(\`  ℹ️ Info: \${counts.info}\`));
      }

      if (options.dryRun) {
        console.log(chalk.green('\\n✓ Dry run complete — no check run was created.'));
        console.log(chalk.gray('  Remove --dry-run to create the check run.'));
        return;
      }

      console.log(chalk.cyan('\\n📡 Fetching PR details and creating check run...'));

      const github = new GitHubIntegration();
      const { owner, repo, prNumber } = github.parsePrUrl(prUrl);
      const prDetails = await github.getPrDetails(owner, repo, prNumber);
      const commitSha = prDetails.head.sha;

      await github.createCheckRun(owner, repo, commitSha, { issues });

      const checkRunUrl = \`https://github.com/\${owner}/\${repo}/pull/\${prNumber}/checks\`;
      console.log(chalk.green(\`\\n✅ Check run created!\`));
      console.log(chalk.cyan(\`📋 PR: \${prUrl}\`));
      console.log(chalk.cyan(\`🔍 Check: \${checkRunUrl}\`));
      console.log(chalk.gray(\`   Commit: \${commitSha.slice(0, 7)}\`));
      console.log(chalk.gray(\`   Findings: \${issues.length} issue\${issues.length !== 1 ? 's' : ''}\`));
    } catch (error) {
      console.error(chalk.red('Check run failed:'), error.message);
      process.exit(1);
    }
  });

`;

const idx = content.indexOf(marker);
if (idx === -1) {
  console.error('ERROR: Could not find insertion marker in src/dist/cli.js');
  process.exit(1);
}

content = content.slice(0, idx) + checkRunCmd + content.slice(idx);
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ check-run command inserted successfully');
