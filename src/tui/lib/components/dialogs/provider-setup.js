import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
const PROVIDERS = [
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
export function ProviderSetupDialog({ onComplete }) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [step, setStep] = useState('list');
  const [selected, setSelected] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [saving, setSaving] = useState(false);
  const [keySaved, setKeySaved] = useState('');
  const [statusMap, setStatusMap] = useState({});
  const statusesLoaded = useRef(false);
  useEffect(() => {
    if (statusesLoaded.current)
      return;
    statusesLoaded.current = true;
    (async () => {
      const { configManager } = await import('../../config/configManager.js');
      await configManager.load();
      const map = {};
      for (const p of PROVIDERS) {
        if (p.isLocal) {
          map[p.id] = 'local';
          continue;
        }
        const envValue = process.env[p.envKey];
        const cmKey = p.id === 'github-copilot' ? configManager.getApiKey('copilot') : configManager.getApiKey(p.id);
        map[p.id] = (envValue || cmKey) ? 'configured' : 'missing';
      }
      setStatusMap(map);
    })();
  }, []);
  useInput((input, key) => {
    if (step !== 'list')
      return;
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
      if (p.isLocal)
        return;
      setSelected(p);
      setKeyInput('');
      setKeyError('');
      setKeySaved('');
      setStep('key');
    }
  });
  const handleKeySubmit = useCallback(async (value) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setStep('list');
      return;
    }
    if (!selected)
      return;
    setSaving(true);
    setKeyError('');
    try {
      const { configManager } = await import('../../config/configManager.js');
      await configManager.load();
      const providerId = selected.id === 'github-copilot' ? 'copilot' : selected.id;
      await configManager.setApiKey(providerId, trimmed);
      configManager.injectEnvVars();
      process.env[selected.envKey] = trimmed;
      setStatusMap(prev => ({ ...prev, [selected.id]: 'configured' }));
      setKeySaved(selected.id);
      setStep('list');
    }
    catch (e) {
      setKeyError('Failed to save key: ' + String(e));
    }
    setSaving(false);
  }, [selected]);
  const configuredCount = Object.values(statusMap).filter(s => s === 'configured').length;
  const missingCount = Object.values(statusMap).filter(s => s === 'missing').length;
  if (step === 'key' && selected) {
    return (_jsxs(Box, { flexDirection: 'column', gap: 1, width: '100%', children: [_jsx(Text, { bold: true, children: selected.name }), _jsx(Text, { dimColor: true, children: selected.docs }), !selected.isFree && (_jsx(Text, { dimColor: true, children: 'Paid subscription \u2014 API key from your account' })), _jsxs(Box, { flexDirection: 'column', gap: 0, marginTop: 1, children: [_jsxs(Text, { children: ['Enter your ', selected.envKey, ':'] }), selected.keyUrl && (_jsxs(Text, { dimColor: true, children: ['Get one at: ', selected.keyUrl] }))] }), _jsx(Box, { borderStyle: 'single', borderColor: colors.primary, paddingX: 1, children: _jsx(TextInput, { value: keyInput, onChange: setKeyInput, onSubmit: handleKeySubmit, placeholder: selected.keyPrefix ? `Paste ${selected.keyPrefix}... key` : 'Paste your API key or press Enter to skip', focus: true }) }), saving && _jsx(Text, { dimColor: true, children: 'Saving...' }), keyError && _jsx(Text, { color: colors.error, children: keyError }), _jsxs(Box, { flexDirection: 'row', gap: 2, children: [_jsx(Text, { dimColor: true, children: 'Enter to save' }), _jsx(Text, { dimColor: true, children: 'Empty Enter to skip' })] })] }));
  }
  return (_jsxs(Box, { flexDirection: 'column', gap: 1, width: '100%', children: [_jsx(Text, { bold: true, children: 'AI Provider Setup' }), _jsx(Text, { dimColor: true, children: configuredCount > 0
    ? `${configuredCount} configured, ${missingCount} need keys`
    : 'No API keys set — select a provider to add one' }), keySaved && (_jsxs(Text, { color: colors.success, children: ['\u2713 ', PROVIDERS.find(p => p.id === keySaved)?.name, ' configured'] })), _jsx(Box, { flexDirection: 'column', marginTop: 1, children: PROVIDERS.map((p, i) => {
    const status = statusMap[p.id];
    const isSelected = i === selectedIdx && step === 'list';
    const statusChar = status === 'configured' ? '✓' : status === 'local' ? '🔗' : ' ';
    const statusColor = status === 'configured' ? colors.success : status === 'local' ? colors.info : colors.dimSeparator;
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, paddingX: 1, children: [_jsx(Text, { color: isSelected ? colors.selection : statusColor, children: isSelected ? '▶' : ' ' }), _jsx(Text, { color: isSelected ? colors.selection : statusColor, children: statusChar }), _jsxs(Box, { flexDirection: 'column', children: [_jsx(Text, { bold: isSelected, color: isSelected ? colors.selection : undefined, children: p.name }), _jsx(Text, { dimColor: true, children: p.docs })] })] }, p.id));
  }) }), _jsx(Box, { flexDirection: 'row', gap: 2, marginTop: 1, children: _jsx(Text, { dimColor: true, children: '\u2191\u2193 navigate  Enter select  Esc close' }) })] }));
}
