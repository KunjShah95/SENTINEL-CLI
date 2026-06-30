import type { CommandContext } from './types.js';

export async function handleReview(ctx: CommandContext) {
  const { args: raw, toast, navigate, setMode, appendMessage, submit, mode, model } = ctx;
  const arg = raw.trim();
  if (!arg) { navigate('/review'); return; }
  const prevMode = mode;
  setMode('REVIEW' as any);
  try {
    const { getGitDiff, buildReviewPrompt } = await import('../lib/security-reviewer.js');
    const { injectContextIntoPrompt } = await import('../lib/context-file.js');
    const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
    const diff = getGitDiff({ file: arg });
    if (!diff) { toast.info(`No changes detected for ${arg}.`); setMode(prevMode as any); return; }
    const [sast] = await Promise.all([runSast()]);
    const sastSummary = sast.findings.length > 0 ? formatSastForPrompt(sast) : undefined;
    const basePrompt = buildReviewPrompt(diff, { files: [arg], focus: 'security', sastSummary });
    submit(injectContextIntoPrompt(basePrompt));
  } catch (e) { toast.error('Review failed: ' + String(e)); setMode(prevMode as any); }
}

export async function handleReviewBranch(ctx: CommandContext) {
  const { args: raw, toast, setMode, appendMessage, submit, mode, model } = ctx;
  const branch = raw.trim();
  if (!branch) { toast.error('Usage: /review-branch <branch-name>'); return; }
  const prevMode = mode;
  setMode('REVIEW' as any);
  try {
    const { getGitDiff, getChangedFiles, buildReviewPrompt } = await import('../lib/security-reviewer.js');
    const { injectContextIntoPrompt } = await import('../lib/context-file.js');
    const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
    const diff = getGitDiff({ branch });
    if (!diff) { toast.info(`No changes detected vs ${branch}.`); setMode(prevMode as any); return; }
    const files = getChangedFiles({ branch });
    const sast = await runSast();
    const sastSummary = sast.findings.length > 0 ? formatSastForPrompt(sast) : undefined;
    const basePrompt = buildReviewPrompt(diff, { files, focus: 'all', sastSummary });
    submit(injectContextIntoPrompt(basePrompt));
  } catch (e) { toast.error('Review failed: ' + String(e)); setMode(prevMode as any); }
}

export async function handleReviewFile(ctx: CommandContext) {
  const { args: raw, toast, navigate } = ctx;
  const file = raw.trim();
  if (!file) { toast.error('Usage: /review-file <path>'); return; }
  navigate('/review');
}

export async function handleScan(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const target = raw.trim() || '.';
  try {
    const { TOOLS } = await import('../lib/tools.js');
    const result = await TOOLS.securityAudit.execute({ files: target });
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: result.output || result.error || 'Scan complete.' }] });
  } catch (e) { toast.error('Scan failed: ' + String(e)); }
}

export async function handleSast(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const target = raw.trim() || '.';
  try {
    appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `/sast ${target}` }] });
    const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
    toast.info('Running SAST analysis…');
    const result = await runSast({ target });
    const formatted = formatSastForPrompt(result);
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: formatted }] });
    if (result.errors.length > 0) {
      const timeoutErrors = result.errors.filter(e => e.includes('TIMEOUT'));
      const otherErrors = result.errors.filter(e => !e.includes('TIMEOUT'));
      if (timeoutErrors.length > 0) toast.warning(`SAST tool timed out: ${timeoutErrors.join('; ')} — results may be partial.`);
      if (otherErrors.length > 0) toast.error(`SAST warnings: ${otherErrors.slice(0, 2).join('; ')}`);
    }
  } catch (e) { toast.error('SAST failed: ' + String(e)); }
}

export async function handleParallel(ctx: CommandContext) {
  const { toast, appendMessage, mode, model, setMode, submit } = ctx;
  try {
    const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
    const diff = getGitDiff();
    if (!diff) { toast.error('No git diff found for parallel scan.'); return; }
    const files = getChangedFiles();
    toast.info('Launching 4 specialist agents in parallel…');
    const { runParallelAgents } = await import('../lib/parallel-agents.js');
    const result = await runParallelAgents(diff, files, async (prompt, m) => {
      const prevMode = mode;
      setMode((m || 'REVIEW') as any);
      await submit(prompt);
      setMode(prevMode as any);
      return '';
    }, {
      onProgress: (agent, done) => { if (done) toast.info(`Agent done: ${agent}`); },
    });
    const summary = `## Parallel Scan Complete\n\n**${result.mergedIssues.length} unique issues** across ${result.agentResults.length} agents\n\n${result.agentResults.map(a => `- **${a.agent}**: ${a.issues.length} issues (${Math.round(a.durationMs / 1000)}s)`).join('\n')}`;
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: summary }] });
  } catch (e) { toast.error('Parallel scan failed: ' + String(e)); }
}

export async function handleSarif(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const target = raw.trim() || 'sentinel-results.sarif';
  try {
    const { SarifGenerator } = await import('../../output/sarifGenerator.js');
    const { runSast } = await import('../lib/sast-runner.js');
    toast.info('Running SAST scan for SARIF export...');
    const sast = await runSast();
    const generator = new SarifGenerator();
    const sarifPath = await generator.saveToFile(sast.findings, target);
    toast.success(`SARIF report saved to ${sarifPath}`);
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ SARIF report exported to \`${sarifPath}\`\n\n**Findings:** ${sast.findings.length} issues\n**Tools run:** ${sast.toolsRun.join(', ')}` }] });
  } catch (e) { toast.error('SARIF export failed: ' + String(e)); }
}
