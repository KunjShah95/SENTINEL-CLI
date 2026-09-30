import path from 'node:path';
import type { CommandContext } from './types.js';

/** `.sentinel/exports/session-<id8>-<kind>-<ts>.md`, with native separators. */
function exportFilePath(kind: 'export' | 'share', sessionId?: string | null) {
  const dir = path.join(process.cwd(), '.sentinel', 'exports');
  const id = sessionId ? `-${String(sessionId).slice(0, 8)}` : '';
  return { dir, file: path.join(dir, `session${id}-${kind}-${Date.now()}.md`) };
}

export async function handleUndo(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { executeLocalTool } = await import('../../shared/tools/index.js');
    const result = await executeLocalTool('undoLastChange', {}, 'BUILD');
    if (result?.success) {
      toast.success(result.message || 'Changes undone.');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Undo complete: ${result.message}` }] });
    } else { toast.error('No checkpoints available.'); }
  } catch (e) { toast.error('Undo failed: ' + String(e)); }
}

export async function handleRedo(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { executeLocalTool } = await import('../../shared/tools/index.js');
    const result = await executeLocalTool('redoLastUndo', {}, 'BUILD');
    if (result?.success) {
      toast.success(result.message || 'Changes redone.');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Redo complete: ${result.message}` }] });
    } else { toast.error('Nothing to redo.'); }
  } catch (e) { toast.error('Redo failed: ' + String(e)); }
}

export async function handleExport(ctx: CommandContext) {
  const { toast, appendMessage, mode, model, messages, sessionId } = ctx;
  try {
    toast.info('Exporting session...');
    const lines: string[] = ['# Sentinel Session Export', '', `**Date:** ${new Date().toISOString()}`, `**Mode:** ${mode}`, `**Model:** ${model}`, `**Messages:** ${messages.length}`, ''];
    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      const text = msg.parts.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
      if (text) { lines.push(`### ${role}`); lines.push(''); lines.push(text); lines.push(''); }
      const toolCalls = msg.parts.filter(p => p.type === 'tool-call');
      for (const tc of toolCalls) { lines.push(`> _Tool: ${(tc as any).toolName}_`); }
    }
    const { dir: exportDir, file: exportPath } = exportFilePath('export', sessionId);
    const fs = await import('fs');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');
    toast.success(`Session exported to ${exportPath}`);
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Session exported to \`${exportPath}\`` }] });
  } catch (e) { toast.error('Export failed: ' + String(e)); }
}

export async function handleShare(ctx: CommandContext) {
  const { toast, appendMessage, mode, model, sessionId, messages } = ctx;
  try {
    const sid = sessionId || null;
    const lines: string[] = ['# Sentinel Session Export', ''];
    for (const msg of messages || []) {
      const role = (msg.role || 'user').toUpperCase();
      const text = (msg.parts || [])
        .filter((p: any) => p.type === 'text' && (p as any).text)
        .map((p: any) => (p as any).text)
        .join('\n');
      if (text) {
        lines.push(`### ${role}`, '', text, '');
      }
    }
    const { dir: exportDir, file: exportPath } = exportFilePath('share', sid);
    const fs = await import('fs');
    fs.mkdirSync(exportDir, { recursive: true });
    fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');
    toast.success(`Session exported to ${exportPath}`);
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `📋 Session exported to \`${exportPath}\`` }] });
  } catch (e) { toast.error('Share failed: ' + String(e)); }
}

export async function handleSession(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model, handleSelectSession } = ctx;
  const sub = raw.trim();
  try {
    const { Sessions } = await import('../lib/api-client.js');
    if (!sub || sub === 'list') {
      const list = await Sessions.list();
      if (!list || list.length === 0) { appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: 'No sessions found.' }] }); return; }
      const lines = list.map((s: any, i: number) => `${i + 1}. \`${s.id.slice(0, 8)}\` — ${s.title || 'untitled'} (${s.mode || '?'}, ${new Date(s.createdAt).toLocaleDateString()})`);
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `**Sessions:**\n${lines.join('\n')}\n\nUse \`/session switch <id>\` to load a session.` }] });
    } else if (sub.startsWith('switch ') || sub.startsWith('load ')) {
      const id = sub.replace(/^(switch|load)\s+/i, '');
      await handleSelectSession(id);
    } else if (sub.startsWith('delete ') || sub.startsWith('rm ')) {
      const id = sub.replace(/^(delete|rm)\s+/i, '');
      const ok = await Sessions.delete(id);
      toast.success(ok ? 'Session deleted' : 'Failed to delete session');
    } else { toast.error('Usage: /session [list|switch <id>|delete <id>]'); }
  } catch (e) { toast.error('Session command failed: ' + String(e)); }
}
