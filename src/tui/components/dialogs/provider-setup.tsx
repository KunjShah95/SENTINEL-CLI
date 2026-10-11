import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
import { useViewport, windowRange } from '../oc/overlay.js';
import { listConnectors } from '../../../shared/connectors/registry.js';

type ProviderDef = {
  id: string;
  name: string;
  envKey: string;
  keyUrl: string;
  keyPrefix: string;
  isLocal: boolean;
  authMethods: string[];
  docs: string;
};

/**
 * API-key prefix hints, for the "Paste gsk_… key" placeholder.
 *
 * Display-only, and deliberately not read from the registry: a connector's
 * `keyPrefix` there namespaces *model ids* (`ollama/`, `openrouter/`), which has
 * nothing to do with the shape of its credential. A missing hint only makes the
 * placeholder less specific — it never blocks a key.
 */
const KEY_PREFIX_HINTS: Record<string, string> = {
  groq: 'gsk_',
  openai: 'sk-',
  anthropic: 'sk-ant-',
  google: 'AIza',
  'github-copilot': 'ghp_',
  together: 'tgp_',
  fireworks: 'fw_',
  perplexity: 'pplx-',
  openrouter: 'sk-or-',
  cerebras: 'csk-',
  nvidia: 'nvapi-',
  deepinfra: 'sk-',
  nebius: 'eyJ',
  moonshot: 'sk-',
  'vercel-ai-gateway': 'vck_',
  huggingface: 'hf_',
  zai: '',
};

/**
 * The provider list, derived from the connector registry.
 *
 * This was a hand-written array, and it had drifted in every way a parallel
 * list can: nine of the twenty-two connectors were missing (Cerebras, NVIDIA,
 * DeepInfra, Nebius, Moonshot, Vercel AI Gateway, HuggingFace, Z.AI, and
 * LM Studio under the id `lm-studio`, which no connector has), while the
 * ids it did carry had to be reconciled by hand elsewhere — `gemini` versus
 * `google`, `copilot` versus `github-copilot`.
 *
 * One list, owned by the registry, means a connector added there appears here
 * with its real id and its real env var, and there is nothing to forget.
 */
const PROVIDERS: ProviderDef[] = listConnectors().map((c) => ({
  id: c.id,
  name: c.label,
  envKey: c.env?.[0] || '',
  keyUrl: c.docs || '',
  keyPrefix: KEY_PREFIX_HINTS[c.id] ?? '',
  isLocal: c.local === true,
  authMethods: c.auth || [],
  docs: c.docs || '',
}));

/**
 * Every connector's env var, from the registry.
 *
 * Session start uses this to decide whether anything is configured at all. It
 * was derived from the same hand-written array, so it inherited the same gaps.
 */
export const PROVIDER_ENV_KEYS: string[] = PROVIDERS.map((p) => p.envKey).filter(Boolean);

/** How the registry names each way of supplying a credential. */
const AUTH_LABEL: Record<string, string> = {
  key: 'API key',
  'oauth-device': 'device-code login',
  'oauth-browser': 'browser login',
  'cli-session': 'reuse your CLI login',
  none: 'nothing to supply',
};

type ProviderSetupDialogProps = {
  onComplete?: () => void;
};

function MaskedInput({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (input.length === 1 && input >= ' ') {
      onChange(value + input);
    }
  });

  const masked = value ? '•'.repeat(value.length) : '';

  return (
    <Box>
      {masked ? (
        <Text>{masked}</Text>
      ) : (
        <Text dimColor>{placeholder || ''}</Text>
      )}
      <Text dimColor>▌</Text>
    </Box>
  );
}

export function ProviderSetupDialog({ onComplete }: ProviderSetupDialogProps) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [step, setStep] = useState<'list' | 'key'>('list');
  const [selected, setSelected] = useState<ProviderDef | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [keySaved, setKeySaved] = useState('');
  const [statusMap, setStatusMap] = useState<Record<string, 'configured' | 'missing' | 'local' | 'error'>>({});
  const statusesLoaded = useRef(false);

  useEffect(() => {
    if (statusesLoaded.current) return;
    statusesLoaded.current = true;
    (async () => {
      // Status comes from the credential store, which is what the runtime
      // actually reads — store first, then environment. Asking configManager
      // instead reported "missing" for a provider connected by
      // `sentinel auth login`, because that writes the store and not the config
      // file. One source, so the check cannot disagree with the answer.
      const { isConnected } = await import('../../../shared/connectors/credentials.js');
      const map: Record<string, 'configured' | 'missing' | 'local' | 'error'> = {};
      for (const p of PROVIDERS) {
        if (p.isLocal) { map[p.id] = 'local'; continue; }
        map[p.id] = (await isConnected(p.id)) ? 'configured' : 'missing';
      }
      setStatusMap(map);
    })().catch(() => {
      // Credential store unavailable — show all as missing rather than crash.
    });
  }, []);

  useInput((input, key) => {
    if (step !== 'list') return;
    if (key.upArrow || input === 'k') {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx(i => Math.min(PROVIDERS.length - 1, i + 1));
      return;
    }
    if (key.return) {
      const p = PROVIDERS[selectedIdx];
      // A local daemon needs no credential — its availability is proven by the
      // daemon answering, which discovery already checks.
      if (p.isLocal) return;
      setSelected(p);
      setKeyInput('');
      setKeyError('');
      setKeySaved('');
      setStep('key');
    }
  });

  const handleKeySubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) { setStep('list'); return; }
    if (!selected) return;
    setSaving(true);
    setKeyError('');
    try {
      // The credential store is the destination, keyed by connector id. This is
      // the same write `sentinel auth login` performs, so a key added in /setup
      // and a key added from the shell are the same key to every reader.
      //
      // It used to be written to configManager only, and the store only ever
      // saw it for the rest of that session via process.env — so a Mistral or
      // xAI key vanished on the next start.
      const { setCredential } = await import('../../../shared/connectors/credentials.js');
      await setCredential(selected.id, { key: trimmed });
      // Publish for this process too, so the change is live without a restart.
      if (selected.envKey) process.env[selected.envKey] = trimmed;
      setStatusMap(prev => ({ ...prev, [selected.id]: 'configured' }));
      setKeySaved(selected.id);
      setStep('list');
    } catch (e) {
      setKeyError('Failed to save key: ' + String(e));
    }
    setSaving(false);
  }, [selected]);

  const configuredCount = Object.values(statusMap).filter(s => s === 'configured').length;
  const missingCount = Object.values(statusMap).filter(s => s === 'missing').length;

  // The provider list is two lines per entry. Without a window the panel is
  // taller than the terminal, so the extra lines were clipped and the names
  // squeezed out of view — a first-run user could not see what they were
  // picking. Window the list to what actually fits.
  const { rows } = useViewport();
  const ROWS_PER_PROVIDER = 2;
  const maxVisible = Math.max(3, Math.floor((rows - 12) / ROWS_PER_PROVIDER));
  const { start: windowStart, count } = windowRange(PROVIDERS.length, selectedIdx, maxVisible);
  const visible = PROVIDERS.slice(windowStart, windowStart + count);

  if (step === 'key' && selected) {
    return (
      <Box flexDirection="column" gap={1} width="100%">
        <Text bold>{selected.name}</Text>
        <Text dimColor>
          {selected.authMethods.map((m) => AUTH_LABEL[m] || m).join(' or ') || 'API key'}
        </Text>
        <Box flexDirection="column" gap={0} marginTop={1}>
          <Text>Enter your {selected.envKey}:</Text>
          {selected.keyUrl && (
            <Text dimColor>Get one at: {selected.keyUrl}</Text>
          )}
        </Box>
        <Box borderStyle="single" borderColor={colors.primary} paddingX={1}>
          <MaskedInput
            value={keyInput}
            onChange={setKeyInput}
            onSubmit={handleKeySubmit}
            placeholder={selected.keyPrefix ? `Paste ${selected.keyPrefix}... key` : 'Paste your API key or press Enter to skip'}
          />
        </Box>
        {saving && <Text dimColor>Saving...</Text>}
        {keyError && <Text color={colors.error}>{keyError}</Text>}
        <Box flexDirection="row" gap={2}>
          <Text dimColor>Enter to save</Text>
          <Text dimColor>Empty Enter to skip</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text dimColor>
        {configuredCount > 0
          ? `${configuredCount} configured, ${missingCount} need keys`
          : 'No API keys set — select a provider to add one'}
      </Text>
      {keySaved && (
        <Text color={colors.success}>✓ {PROVIDERS.find(p => p.id === keySaved)?.name} configured</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {visible.map((p) => {
          const i = PROVIDERS.indexOf(p);
          const status = statusMap[p.id];
          const isSelected = i === selectedIdx && step === 'list';
          const statusChar = status === 'configured' ? '✓' : status === 'local' ? '🔗' : ' ';
          const statusColor = status === 'configured' ? colors.success : status === 'local' ? colors.info : colors.dimSeparator;
          return (
            <Box key={p.id} flexDirection="row" gap={1} paddingX={1} flexShrink={0}>
              <Text color={isSelected ? colors.selection : statusColor}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Text color={isSelected ? colors.selection : statusColor}>
                {statusChar}
              </Text>
              <Box flexDirection="column">
                <Text bold={isSelected} color={isSelected ? colors.selection : undefined}>
                  {p.name}
                </Text>
                <Text dimColor>
                  {p.isLocal ? 'Local — no key needed, runs on your machine' : p.docs}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Text dimColor>↑↓ navigate  Enter select  Esc close</Text>
        <Text dimColor>{`${selectedIdx + 1}/${PROVIDERS.length}`}</Text>
      </Box>
    </Box>
  );
}