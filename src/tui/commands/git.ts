import type { CommandContext } from './types.js';

export async function handleCommit(ctx: CommandContext) {
  const { toast, appendMessage, mode, model, setMode, submit } = ctx;
  try {
    const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
    const diff = getGitDiff({ staged: true }) || getGitDiff();
    if (!diff) { toast.error('No changes to commit.'); return; }
    const files = getChangedFiles({ staged: true });
    const prompt = `Generate a concise git commit message for these changes. Output ONLY the commit message (subject line + optional body). No preamble.\n\nChanged files: ${files.join(', ')}\n\n\`\`\`diff\n${diff.slice(0, 6000)}\n\`\`\``;
    const prevMode = mode;
    setMode('PLAN' as any);
    await submit(prompt);
    setMode(prevMode as any);
  } catch (e) { toast.error('Commit generation failed: ' + String(e)); }
}

export async function handleDiff(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const arg = raw.trim();
  try {
    const { getGitDiff } = await import('../lib/security-reviewer.js');
    const isStaged = arg === '--staged';
    const branch = !isStaged && arg ? arg : undefined;
    const file = !isStaged && !branch && arg ? arg : undefined;
    const diff = isStaged ? getGitDiff({ staged: true })
      : branch ? getGitDiff({ branch })
      : file ? getGitDiff({ file })
      : getGitDiff();
    if (!diff) { toast.info('No changes detected.'); return; }

    const fileSections: Array<{ path: string; added: number; deleted: number; hunks: string[] }> = [];
    let currentFile: { path: string; added: number; deleted: number; hunks: string[] } | null = null;

    for (const line of diff.split('\n')) {
      if (line.startsWith('diff --git ')) {
        const m = line.match(/diff --git a\/(.+) b\/(.+)/);
        const path = m ? m[2] : 'unknown';
        if (currentFile) fileSections.push(currentFile);
        currentFile = { path, added: 0, deleted: 0, hunks: [] };
      }
      if (currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) currentFile.added++;
        else if (line.startsWith('-') && !line.startsWith('---')) currentFile.deleted++;
        currentFile.hunks.push(line);
      }
    }
    if (currentFile) fileSections.push(currentFile);

    const totalAdded = fileSections.reduce((s, f) => s + f.added, 0);
    const totalDeleted = fileSections.reduce((s, f) => s + f.deleted, 0);
    const lines: string[] = [];
    lines.push('## Git Diff Preview'); lines.push('');
    if (branch) lines.push(`**Branch:** \`${branch}\``);
    if (isStaged) lines.push('**Scope:** Staged changes');
    if (file) lines.push(`**File:** \`${file}\``);
    lines.push(`**Files changed:** ${fileSections.length}  **+${totalAdded}**  **-${totalDeleted}**`);
    lines.push(''); lines.push('```diff');

    for (const section of fileSections) {
      lines.push(`--- a/${section.path}`);
      lines.push(`+++ b/${section.path}`);
      lines.push(`# change: -${section.deleted} +${section.added} lines`);
      const maxLines = 50;
      const hunkLines = section.hunks.filter(l => {
        if (l.startsWith('@@')) return true;
        if (l.startsWith('+') || l.startsWith('-') || l.startsWith(' ')) return !l.startsWith('+++') && !l.startsWith('---') && !l.startsWith('diff --git');
        return false;
      });
      if (hunkLines.length > maxLines) {
        lines.push(...hunkLines.slice(0, 20));
        lines.push(`  ... ${hunkLines.length - 40} lines truncated ...`);
        lines.push(...hunkLines.slice(hunkLines.length - 20));
      } else {
        lines.push(...hunkLines);
      }
      lines.push('');
    }
    lines.push('```'); lines.push('');

    lines.push('### Summary'); lines.push('');
    for (const section of fileSections) {
      const icon = section.deleted > section.added ? '🔴' : section.added > 0 ? '🟢' : '⚪';
      lines.push(`- ${icon} \`${section.path}\` — **+${section.added}** **-${section.deleted}**`);
    }
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
  } catch (e) { toast.error('Diff failed: ' + String(e)); }
}
