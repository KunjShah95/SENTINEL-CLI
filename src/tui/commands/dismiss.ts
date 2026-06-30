import type { CommandContext } from './types.js';

export async function handleDismiss(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const args = raw.trim();
  if (!args) { toast.error('Usage: /dismiss <file:line:rule> [reason]'); return; }
  try {
    const { dismissIssue } = await import('../../utils/dismissedIssues.js');
    const parts = args.split(/\s+/);
    const key = parts[0];
    const reason = parts.slice(1).join(' ') || 'User dismissed';
    const keyParts = key.split(':');
    if (keyParts.length < 3) { toast.error('Key format: file:line:rule (e.g., src/app.ts:42:no-eval)'); return; }
    const [file, lineStr, ...ruleParts] = keyParts;
    const line = parseInt(lineStr, 10);
    const rule = ruleParts.join(':');
    dismissIssue(file, line, rule, reason, {});
    toast.success(`Dismissed ${key}`);
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Dismissed finding: ${key}\nReason: ${reason}\n\nThis finding will be skipped in future scans. Use /dismiss-list to show all dismissals, /dismiss-remove to undo.` }] });
  } catch (e) { toast.error('Dismiss failed: ' + String(e)); }
}

export async function handleDismissList(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { getDismissals } = await import('../../utils/dismissedIssues.js');
    const data = getDismissals();
    const keys = Object.keys(data.dismissals || {});
    if (keys.length === 0) { toast.info('No dismissed findings.'); return; }
    const lines = keys.map(k => `• ${k} — ${data.dismissals[k].reason || 'No reason'}`).join('\n');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## Dismissed Findings (${keys.length})\n\n${lines}` }] });
  } catch (e) { toast.error('Failed to list dismissals: ' + String(e)); }
}

export async function handleDismissRemove(ctx: CommandContext) {
  const { args: raw, toast } = ctx;
  const args = raw.trim();
  if (!args) { toast.error('Usage: /dismiss-remove <file:line:rule>'); return; }
  try {
    const { undismissIssue } = await import('../../utils/dismissedIssues.js');
    const keyParts = args.split(':');
    if (keyParts.length < 3) { toast.error('Key format: file:line:rule'); return; }
    const [file, lineStr, ...ruleParts] = keyParts;
    const line = parseInt(lineStr, 10);
    const rule = ruleParts.join(':');
    const ok = undismissIssue(file, line, rule);
    if (ok) { toast.success(`Removed dismissal for ${args}`); } else { toast.error('Dismissal not found'); }
  } catch (e) { toast.error('Failed to remove dismissal: ' + String(e)); }
}
