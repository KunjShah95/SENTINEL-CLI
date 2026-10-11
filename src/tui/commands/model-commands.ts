import type { CommandContext } from './types.js';

/** Rows of an unconnected provider shown in the transcript, before a "+N more". */
const OFFLINE_PREVIEW = 6;

/**
 * Report a model switch, naming the connect step when the provider behind the
 * new model has nothing behind it.
 *
 * Browsing the whole catalog means a pick can land on a provider with no
 * credential. That is allowed — the choice is recorded and starts working the
 * moment `auth login` runs — but saying so up front beats a 401 on the next
 * turn. A failed lookup falls through to the plain success toast: not knowing
 * the provider's status is no reason to deny that the switch happened.
 */
async function announceSwitch(modelId: string, toast: CommandContext['toast']) {
  try {
    const { inferProviderFromModelId, isProviderAvailable } = await import('../../shared/models/index.js');
    const provider = inferProviderFromModelId(modelId);
    if (provider && !isProviderAvailable(provider)) {
      toast.warning(`Switched to ${modelId} — connect it first: sentinel auth login ${provider}`);
      return;
    }
  } catch {
    // fall through to the success toast
  }
  toast.success(`Switched to ${modelId}`);
}

export async function handleModels(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { getBrowseModels, isOllamaCloudModel, isLocalProvider } = await import('../../shared/models/index.js');
    const { listConnectors } = await import('../../shared/connectors/registry.js');
    const { badgeFor } = await import('../../agent/bench-scores.js');

    const labels = new Map(listConnectors().map((c: { id: string; label: string }) => [c.id, c.label]));
    const providerName = (id: string) => labels.get(id) || id;

    const describe = (m: any): string => {
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
      return `  \`${m.id}\` — ${m.label}${flag}${tools}${price}${evidence}`;
    };

    // The browse view, not the runtime registry: the registry only holds
    // connected providers, so listing it showed nothing but the local daemon.
    const ranked = await getBrowseModels();
    const byProvider = new Map<string, { connected: boolean; rows: any[] }>();
    for (const m of ranked) {
      let group = byProvider.get(m.provider);
      if (!group) {
        group = { connected: !!m.connected, rows: [] };
        byProvider.set(m.provider, group);
      }
      group.rows.push(m);
    }

    const connected = [...byProvider.entries()].filter(([, g]) => g.connected);
    const offline = [...byProvider.entries()].filter(([, g]) => !g.connected);

    const lines: string[] = ['## Available Models', ''];

    if (connected.length === 0) {
      lines.push('No provider is connected, so nothing here can run yet.', '');
    } else {
      lines.push('**Connected — callable right now**', '');
    }

    for (const [provider, group] of connected) {
      lines.push(`### ${providerName(provider)} · ${group.rows.length}`);
      lines.push(...group.rows.map(describe));
      lines.push('');
    }

    // The catalog is ~860 models across the unconnected providers, 379 of them
    // from OpenRouter alone. Dumping all of those into the transcript buries the
    // connected list, so an unconnected provider shows its best few and the
    // picker (`/model`) carries the full set behind a search box.
    if (offline.length > 0) {
      const total = offline.reduce((n, [, g]) => n + g.rows.length, 0);
      lines.push(`**Not connected — ${total} models across ${offline.length} providers**`, '');
      for (const [provider, group] of offline) {
        const shown = group.rows.slice(0, OFFLINE_PREVIEW);
        lines.push(`### ${providerName(provider)} · ${group.rows.length} \x1b[2m· not connected\x1b[0m`);
        lines.push(...shown.map(describe));
        if (group.rows.length > shown.length) {
          lines.push(`  \x1b[2m… ${group.rows.length - shown.length} more\x1b[0m`);
        }
        lines.push(`  \x1b[2mConnect: \`sentinel auth login ${provider}\`\x1b[0m`);
        lines.push('');
      }
    }

    lines.push('> Switch: `/model <id>` in chat, or set `MODEL=<id>` env var.');
    lines.push('> Browse/search the full catalog: `/model` (or `sentinel models --all`).');
    lines.push('> Effort: `/model <id>#high` (or `off`/`fast`/`standard`/`max`), cycled with v in the picker.');
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
      // The picker owns Escape: the ctrl+a provider list steps back to the
      // model list on Esc before the dialog itself closes.
      closeOnEscape: false,
      children: React.createElement(ModelPickerDialog, {
        currentModel,
        onSelect: (modelId: string) => {
          setModel(modelId);
          announceSwitch(modelId, toast);
          dialog.close();
        },
      }),
    });
    return;
  }
  try {
    const { findSupportedChatModel, getBrowseModels } = await import('../../shared/models/index.js');
    // `model#high` is the inline form of choosing an effort level. It is parsed
    // before the lookup so the registry never has to know about suffixes, and
    // persisted so the next turn uses the same level without the user retyping it.
    const { parseVariant, loadVariant, saveVariant } = await import('../../shared/models/variants.js');
    const { modelId: bareId, variant: inlineVariant } = parseVariant(target);

    const commit = async (id: string, level?: string | null) => {
      const stored = level ?? await loadVariant(id);
      const resolved = await applyVariant(id, stored);
      setModel(resolved);
      await announceSwitch(resolved, toast);
    };

    const exact = findSupportedChatModel(bareId);
    if (exact) { await commit(exact.id, inlineVariant ?? await loadVariant(exact.id)); return; }

    // A name that is not in the runtime registry can still be a real model the
    // user is about to connect, so partial matching runs over the browse view.
    const ranked = await getBrowseModels();
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
