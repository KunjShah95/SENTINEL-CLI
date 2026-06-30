import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';

type ProviderDef = {
  id: string;
  name: string;
  envKey: string;
  keyUrl: string;
  keyPrefix: string;
  isLocal: boolean;
  isFree: boolean;
  defaultModel: string;
  docs: string;
};

const PROVIDERS: ProviderDef[] = [
  { id: 'groq', name: 'Groq (Free Tier)', envKey: 'GROQ_API_KEY', keyUrl: 'https://console.groq.com/keys', keyPrefix: 'gsk_', isLocal: false, isFree: true, defaultModel: 'llama-3.1-8b-instant', docs: 'Free Llama 3 / Gemma / Qwen models — default provider' },
  { id: 'openai', name: 'OpenAI / ChatGPT', envKey: 'OPENAI_API_KEY', keyUrl: 'https://platform.openai.com/api-keys', keyPrefix: 'sk-', isLocal: false, isFree: false, defaultModel: 'gpt-4o-mini', docs: 'ChatGPT Plus/Pro users get API credits included' },
  { id: 'anthropic', name: 'Anthropic / Claude', envKey: 'ANTHROPIC_API_KEY', keyUrl: 'https://console.anthropic.com/settings/keys', keyPrefix: 'sk-ant-', isLocal: false, isFree: false, defaultModel: 'claude-sonnet-4-6', docs: 'Claude Pro/Max/Team users get API credits included' },
  { id: 'gemini', name: 'Google Gemini', envKey: 'GEMINI_API_KEY', keyUrl: 'https://aistudio.google.com/apikey', keyPrefix: 'AIza', isLocal: false, isFree: true, defaultModel: 'gemini-2.0-flash', docs: 'Free tier available from Google AI Studio' },
  { id: 'github-copilot', name: 'GitHub Copilot', envKey: 'GITHUB_TOKEN', keyUrl: 'https://github.com/settings/tokens', keyPrefix: 'ghp_', isLocal: false, isFree: false, defaultModel: 'copilot/gpt-4o', docs: 'Uses your GitHub Copilot subscription' },
  { id: 'mistral', name: 'Mistral AI', envKey: 'MISTRAL_API_KEY', keyUrl: 'https://console.mistral.ai/api-keys', keyPrefix: '', isLocal: false, isFree: true, defaultModel: 'mistral-small-latest', docs: 'Free tier available (Mistral Small)' },
  { id: 'deepseek', name: 'DeepSeek', envKey: 'DEEPSEEK_API_KEY', keyUrl: 'https://platform.deepseek.com', keyPrefix: 'sk-', isLocal: false, isFree: true, defaultModel: 'deepseek-chat', docs: 'Very affordable, excellent reasoning models' },
  { id: 'xai', name: 'xAI / Grok', envKey: 'XAI_API_KEY', keyUrl: 'https://console.x.ai', keyPrefix: '', isLocal: false, isFree: false, defaultModel: 'grok-2', docs: 'Grok models via xAI API' },
  { id: 'together', name: 'Together AI', envKey: 'TOGETHER_API_KEY', keyUrl: 'https://api.together.ai/settings/api-keys', keyPrefix: 'tgp_', isLocal: false, isFree: true, defaultModel: 'mistralai/Mixtral-8x7B-Instruct-v0.1', docs: 'Open-source model hosting with free credits' },
  { id: 'fireworks', name: 'Fireworks AI', envKey: 'FIREWORKS_API_KEY', keyUrl: 'https://fireworks.ai/api-keys', keyPrefix: 'fw_', isLocal: false, isFree: true, defaultModel: 'accounts/fireworks/models/llama-v3p1-8b', docs: 'Fast inference on open-source models' },
  { id: 'perplexity', name: 'Perplexity', envKey: 'PERPLEXITY_API_KEY', keyUrl: 'https://perplexity.ai/settings/api', keyPrefix: 'pplx-', isLocal: false, isFree: false, defaultModel: 'sonar-pro', docs: 'Search-grounded models via Perplexity API' },
  { id: 'openrouter', name: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', keyUrl: 'https://openrouter.ai/keys', keyPrefix: 'sk-or-', isLocal: false, isFree: true, defaultModel: 'mistralai/mixtral-8x7b-instruct', docs: 'Router to 200+ models, free credits available' },
  { id: 'ollama', name: 'Ollama (Local)', envKey: 'OLLAMA_HOST', keyUrl: '', keyPrefix: '', isLocal: true, isFree: true, defaultModel: 'llama3.2', docs: 'Fully local — no key needed. Install Ollama and pull models' },
  { id: 'lm-studio', name: 'LM Studio (Local)', envKey: 'LMSTUDIO_HOST', keyUrl: '', keyPrefix: '', isLocal: true, isFree: true, defaultModel: 'local-model', docs: 'Local — no key needed. Runs OpenAI-compatible server' },
];

export const PROVIDER_ENV_KEYS = PROVIDERS.map(p => p.envKey);

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
      try {
        const { configManager } = await import('../../../config/configManager.js');
        await configManager.load();
        const map: Record<string, 'configured' | 'missing' | 'local' | 'error'> = {};
        for (const p of PROVIDERS) {
          if (p.isLocal) { map[p.id] = 'local'; continue; }
          const envValue = process.env[p.envKey];
          const cmKey = p.id === 'github-copilot' ? configManager.getApiKey('copilot') : configManager.getApiKey(p.id);
          map[p.id] = (envValue || cmKey) ? 'configured' : 'missing';
        }
        setStatusMap(map);
      } catch (e) {
        // configManager unavailable — show all as missing
      }
    })();
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
      const { configManager } = await import('../../../config/configManager.js');
      await configManager.load();
      const providerId = selected.id === 'github-copilot' ? 'copilot' : selected.id;
      await configManager.setApiKey(providerId, trimmed);
      configManager.injectEnvVars();
      process.env[selected.envKey] = trimmed;
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

  if (step === 'key' && selected) {
    return (
      <Box flexDirection="column" gap={1} width="100%">
        <Text bold>{selected.name}</Text>
        <Text dimColor>{selected.docs}</Text>
        {!selected.isFree && (
          <Text dimColor>Paid subscription — API key from your account</Text>
        )}
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
      <Text bold>AI Provider Setup</Text>
      <Text dimColor>
        {configuredCount > 0
          ? `${configuredCount} configured, ${missingCount} need keys`
          : 'No API keys set — select a provider to add one'}
      </Text>
      {keySaved && (
        <Text color={colors.success}>✓ {PROVIDERS.find(p => p.id === keySaved)?.name} configured</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {PROVIDERS.map((p, i) => {
          const status = statusMap[p.id];
          const isSelected = i === selectedIdx && step === 'list';
          const statusChar = status === 'configured' ? '✓' : status === 'local' ? '🔗' : ' ';
          const statusColor = status === 'configured' ? colors.success : status === 'local' ? colors.info : colors.dimSeparator;
          return (
            <Box key={p.id} flexDirection="row" gap={1} paddingX={1}>
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
                <Text dimColor>{p.docs}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Text dimColor>↑↓ navigate  Enter select  Esc close</Text>
      </Box>
    </Box>
  );
}
