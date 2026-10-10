import type { CommandContext } from './types.js';

export async function handleModels(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { getRankedModels, isOllamaCloudModel, isLocalProvider } = await import('../../shared/models/index.js');
    const { badgeFor } = await import('../../agent/bench-scores.js');
    const ranked = getRankedModels();
    const byProvider: Record<string, string[]> = {};
    for (const m of ranked) {
      if (!byProvider[m.provider]) byProvider[m.provider] = [];
      const price = m.inputUsdPerMillionTokens > 0
        ? ` (\$${m.inputUsdPerMillionTokens}/\$${m.outputUsdPerMillionTokens} per M)`
        : isOllamaCloudModel(m) ? ' (cloud, metered by ollama.com)'
          : isLocalProvider(m.provider) ? ' (free, local)' : ' (free tier)';
      const flag = m.thinking ? ' 🧠' : '';
      const tools = m.toolCall ? ' 🔧' : '';
      // Measured scores only where a bench has run for that model. Absence is
      // not evidence of a bad model, so an unbenchmarked model says nothing.
      const badge = badgeFor(m.id);
      const evidence = badge ? ` — \x1b[2m${badge}\x1b[0m` : '';
      byProvider[m.provider].push(`  \`${m.id}\` — ${m.label}${flag}${tools}${price}${evidence}`);
    }
    const lines = ['## Available Models', '', 'Free models listed first, then by capability:', ''];
    for (const [provider, models] of Object.entries(byProvider)) {
      const capName = provider.charAt(0).toUpperCase() + provider.slice(1);
      lines.push(`### ${capName}`);
      lines.push(...models);
      lines.push('');
    }
    lines.push('> Switch: `/model <id>` in chat, or set `MODEL=<id>` env var.');
    lines.push('> Effort: `/model <id>#high` (or `off`/`fast`/`standard`/`max`), cycled with `v` in the picker.');
    lines.push('> Connect a provider: `sentinel auth login <id>` · probe one: `sentinel health`.');
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
    // `model#high` is the inline form of choosing an effort level. It is parsed
    // before the lookup so the registry never has to know about suffixes, and
    // persisted so the next turn uses the same level without the user retyping it.
    const { parseVariant, loadVariant, saveVariant } = await import('../../shared/models/variants.js');
    const { modelId: bareId, variant: inlineVariant } = parseVariant(target);

    const commit = async (id: string, level?: string | null) => {
      const stored = level ?? await loadVariant(id);
      const resolved = await applyVariant(id, stored);
      setModel(resolved);
      toast.success(`Switched to ${resolved}`);
    };

    const exact = findSupportedChatModel(bareId);
    if (exact) { await commit(exact.id, inlineVariant ?? await loadVariant(exact.id)); return; }

    const ranked = getRankedModels();
    const matches = ranked.filter(m =>
      m.id.toLowerCase().includes(bareId.toLowerCase()) ||
      m.label.toLowerCase().includes(bareId.toLowerCase())
    );
    if (matches.length === 0) {
      toast.error(`No model matches "${target}". Use /models to list available.`);
      return;
    }
    if (matches.length === 1) { await commit(matches[0].id, inlineVariant ?? await loadVariant(matches[0].id)); return; }
    const suggestions = matches.slice(0, 8).map(m => `\`${m.id}\` — ${m.label}`).join('\n');
    appendMessage({ role: 'assistant', mode, model: currentModel, parts: [{ type: 'text', text: `Models matching "${target}":\n${suggestions}\n\nUse \`/model <exact-id>\` to switch.` }] });
  } catch (e) { toast.error('Failed to switch model: ' + String(e)); }
}

/** Persist the chosen effort level and return the id that carries it. */
async function applyVariant(modelId: string, level: string | null) {
  const { variantLabel, saveVariant, supportsThinking } = await import('../../shared/models/variants.js');
  if (!level || !supportsThinking(modelId)) return modelId;
  await saveVariant(modelId, level);
  return variantLabel(modelId, level);
}
