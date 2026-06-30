import type { CommandContext } from './types.js';

export async function handleModels(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { getRankedModels } = await import('../../shared/models/index.js');
    const ranked = getRankedModels();
    const byProvider: Record<string, string[]> = {};
    for (const m of ranked) {
      if (!byProvider[m.provider]) byProvider[m.provider] = [];
      const price = m.inputUsdPerMillionTokens > 0
        ? ` (\$${m.inputUsdPerMillionTokens}/\$${m.outputUsdPerMillionTokens} per M)`
        : ' (free/local)';
      const flag = m.thinking ? ' 🧠' : '';
      byProvider[m.provider].push(`  \`${m.id}\` — ${m.label}${flag}${price}`);
    }
    const lines = ['## Available Models', '', 'Free models listed first, then by capability:', ''];
    for (const [provider, models] of Object.entries(byProvider)) {
      const capName = provider.charAt(0).toUpperCase() + provider.slice(1);
      lines.push(`### ${capName}`);
      lines.push(...models);
      lines.push('');
    }
    lines.push('> Switch: `/model <id>` in chat, or set `MODEL=<id>` env var.');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
  } catch (e) { toast.error('Failed to list models: ' + String(e)); }
}

export async function handleModel(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model: currentModel, setModel, dialog } = ctx;
  const target = raw.trim();
  if (!target) {
    const { ModelPickerDialog } = await import('../components/dialogs/model-picker.js');
    const React = await import('react');
    dialog.open({
      title: 'Select Model',
      width: 72,
      height: 35,
      children: React.createElement(ModelPickerDialog, {
        currentModel,
        onSelect: (modelId: string) => { setModel(modelId); toast.success(`Switched to ${modelId}`); dialog.close(); },
      }),
    });
    return;
  }
  try {
    const { findSupportedChatModel, getRankedModels } = await import('../../shared/models/index.js');
    const exact = findSupportedChatModel(target);
    if (exact) { setModel(exact.id); toast.success(`Switched to ${exact.label}`); return; }
    const ranked = getRankedModels();
    const matches = ranked.filter(m =>
      m.id.toLowerCase().includes(target.toLowerCase()) ||
      m.label.toLowerCase().includes(target.toLowerCase())
    );
    if (matches.length === 0) { toast.error(`No model matches "${target}". Use /models to list available.`); return; }
    if (matches.length === 1) { setModel(matches[0].id); toast.success(`Switched to ${matches[0].label}`); return; }
    const suggestions = matches.slice(0, 8).map(m => `\`${m.id}\` — ${m.label}`).join('\n');
    appendMessage({ role: 'assistant', mode, model: currentModel, parts: [{ type: 'text', text: `Models matching "${target}":\n${suggestions}\n\nUse \`/model <exact-id>\` to switch.` }] });
  } catch (e) { toast.error('Failed to switch model: ' + String(e)); }
}
