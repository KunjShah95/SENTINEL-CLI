import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';

type ModelEntry = {
  id: string;
  provider: string;
  label: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  thinking?: boolean;
};

type ModelPickerDialogProps = {
  currentModel: string;
  onSelect: (modelId: string) => void;
};

export function ModelPickerDialog({ currentModel, onSelect }: ModelPickerDialogProps) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [filtered, setFiltered] = useState<ModelEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [query, setQuery] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const { getRankedModels } = await import('../../../shared/models/index.js');
        const all = getRankedModels();
        setModels(all);
        setFiltered(all);
        const currentIdx = all.findIndex(m => m.id === currentModel);
        if (currentIdx >= 0) setSelectedIdx(currentIdx);
      } catch (e) {
        // models not available — dialog shows empty
      }
    })();
  }, [currentModel]);

  useEffect(() => {
    if (!query.trim()) {
      setFiltered(models);
      return;
    }
    const q = query.toLowerCase();
    setFiltered(models.filter(m =>
      m.id.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    ));
    setSelectedIdx(0);
  }, [query, models]);

  const handleSelect = useCallback((m: ModelEntry) => {
    onSelect(m.id);
    close();
  }, [onSelect, close]);

  const visible = filtered.slice(0, 18);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIdx(i => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx(i => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.leftArrow) {
      if (!query.trim()) {
        const currentProvider = filtered[selectedIdx]?.provider;
        if (currentProvider) {
          const providers = [...new Set(models.map(m => m.provider))];
          const idx = providers.indexOf(currentProvider);
          const prevProvider = idx > 0 ? providers[idx - 1] : providers[providers.length - 1];
          const firstOfProvider = models.findIndex(m => m.provider === prevProvider);
          if (firstOfProvider >= 0) setSelectedIdx(firstOfProvider);
        }
      }
      return;
    }
    if (key.rightArrow) {
      if (!query.trim()) {
        const currentProvider = filtered[selectedIdx]?.provider;
        if (currentProvider) {
          const providers = [...new Set(models.map(m => m.provider))];
          const idx = providers.indexOf(currentProvider);
          const nextProvider = idx < providers.length - 1 ? providers[idx + 1] : providers[0];
          const firstOfProvider = models.findIndex(m => m.provider === nextProvider);
          if (firstOfProvider >= 0) setSelectedIdx(firstOfProvider);
        }
      }
      return;
    }
    if (key.return && filtered[selectedIdx]) {
      handleSelect(filtered[selectedIdx]);
    }
  });

  const getProviderColor = (p: string) => {
    const map: Record<string, string> = {
      groq: '#00D4AA', openai: '#00A67E', anthropic: '#7C3AED',
      google: '#4285F4', mistral: '#FF6F00', deepseek: '#6C5CE7',
      xai: '#000000', together: '#FF6B6B', fireworks: '#E91E63',
      perplexity: '#1A1A2E', openrouter: '#FF8C00',
      'github-copilot': '#6CC644', ollama: '#00BCD4', lmstudio: '#607D8B',
    };
    return map[p] || colors.info;
  };

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text bold>Select Model</Text>
      <Text dimColor>
        Current: {currentModel}
      </Text>
      <Box borderStyle="single" borderColor={colors.primary} paddingX={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search models (name, provider)..."
          focus
        />
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>No models match your search</Text>
      ) : (
        <Box flexDirection="column">
          {visible.map((m, i) => {
            const isSelected = i === selectedIdx;
            const isCurrent = m.id === currentModel;
            const isFree = m.inputUsdPerMillionTokens === 0 && m.outputUsdPerMillionTokens === 0;
            const priceStr = isFree ? '' : ` \$${m.inputUsdPerMillionTokens}/\$${m.outputUsdPerMillionTokens}`;
            return (
              <Box key={m.id} flexDirection="row" gap={1}>
                <Text color={isSelected ? colors.selection : colors.dimSeparator}>
                  {isSelected ? '▶' : isCurrent ? '●' : ' '}
                </Text>
                <Text color={getProviderColor(m.provider)} bold={isSelected}>
                  {m.provider}/
                </Text>
                <Text bold={isSelected} color={isSelected ? colors.selection : undefined}>
                  {m.id}
                </Text>
                <Text dimColor>
                  {m.thinking ? '🧠' : ''}{priceStr}
                </Text>
              </Box>
            );
          })}
          {filtered.length > visible.length && (
            <Text dimColor>{`...${filtered.length - visible.length} more`}</Text>
          )}
        </Box>
      )}
      <Box flexDirection="row" gap={2}>
        <Text dimColor>↑↓ navigate  ←→ provider  Enter select  Esc close  Type to filter</Text>
      </Box>
    </Box>
  );
}
