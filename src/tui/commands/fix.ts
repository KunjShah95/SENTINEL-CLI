import type { CommandContext } from './types.js';

export async function handleFix(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const parts = raw.split(/\s+/).filter(Boolean);
  const write = parts.includes('--write');
  const noLlm = parts.includes('--no-llm');
  const failOnIdx = parts.indexOf('--fail-on');
  const failOn = failOnIdx >= 0 ? parts[failOnIdx + 1] : null;
  const maxIterIdx = parts.indexOf('--max-iter');
  const maxIter = maxIterIdx >= 0 ? (parseInt(parts[maxIterIdx + 1], 10) || 5) : 5;
  const flagValues = new Set<string>();
  if (failOn) flagValues.add(failOn);
  if (maxIterIdx >= 0 && parts[maxIterIdx + 1]) flagValues.add(parts[maxIterIdx + 1]);
  const targets = parts.filter(a => !a.startsWith('--') && !flagValues.has(a));
  if (targets.length === 0) {
    toast.error('Usage: /fix <file|glob...> [--write] [--fail-on <sev>] [--max-iter n] [--no-llm]');
    return;
  }
  try {
    const { glob } = await import('glob');
    const { runFixLoopOnPaths } = await import('../../agents/autonomousFixLoop.js');
    const files: string[] = [];
    for (const t of targets) {
      const matches = await glob(t, {
        cwd: process.cwd(),
        ignore: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
        nodir: true,
        windowsPathsNoEscape: true,
      });
      if (matches.length) files.push(...matches);
      else files.push(t);
    }
    if (files.length === 0) { toast.error('No matching files.'); return; }
    toast.info(`Autonomous fix on ${files.length} file(s)${write ? '' : ' (dry-run)'}...`);
    const { files: reports, totals } = await runFixLoopOnPaths(files, {
      maxIterations: maxIter, failOn: failOn || null, useLLM: !noLlm, writeBack: write,
    });
    const lines: string[] = [];
    for (const r of reports) {
      lines.push(`### \`${r.filename}\``);
      if (r.error) { lines.push(`- ✗ Error: ${r.error}`); continue; }
      for (const e of r.resolved || []) lines.push(`- ✓ ${e.type}${e.line != null ? `:${e.line}` : ''} — ${e.message}`);
      for (const e of r.remaining || []) lines.push(`- ✗ ${e.type}${e.line != null ? `:${e.line}` : ''} — ${e.message}`);
      for (const e of r.unfixableRemaining || []) lines.push(`- ⚠ needs human: ${e.severity} ${e.type}${e.line != null ? `:${e.line}` : ''} — ${e.message}`);
      lines.push(`- **PROVEN:** ${r.proven ? 'YES' : 'NO'} · **CLEAN:** ${r.clean ? 'YES' : 'NO'}${r.wroteFile ? ' · wrote fix to disk' : ''}`);
    }
    const summary = `**Totals:** targeted ${totals.targeted} · resolved ${totals.resolved} · remaining ${totals.remaining} · proven ${totals.proven}/${reports.length}`;
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## 🛠️ Autonomous Fix\n\n${lines.join('\n')}\n\n${summary}` }] });
    if (write) toast.success('Fix complete — proven fixes written.');
    else toast.info('Dry-run complete — re-run with --write to apply.');
  } catch (e) { toast.error('Fix failed: ' + String(e)); }
}

export async function handleTest(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model, submit } = ctx;
  const file = raw.trim();
  if (!file) { toast.error('Usage: /test <file-path>'); return; }
  try {
    appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `/test ${file}` }] });
    const fs = await import('fs');
    if (!fs.existsSync(file)) { toast.error(`File not found: ${file}`); return; }
    toast.info(`Generating tests for ${file}...`);
    const content = fs.readFileSync(file, 'utf-8');
    submit(`Generate a comprehensive unit test file for the following code. Use the project's existing test framework (Jest/Vitest). Output ONLY valid test code, no explanations. Include edge cases, error paths, and main success paths.\n\nFile: ${file}\n\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``);
  } catch (e) { toast.error('Test generation failed: ' + String(e)); }
}
