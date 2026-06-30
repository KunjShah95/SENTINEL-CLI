import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../providers/theme/index.js';
import { DialogSearchList } from '../dialog-search-list.js';
import { useDialog } from '../../providers/dialog/index.js';
const TARGETS = [
  { id: '.', label: 'Current directory', description: 'Scan entire project' },
  { id: 'src', label: 'Source code', description: 'Scan src/ directory' },
  { id: 'diff', label: 'Staged changes', description: 'Scan git diff only' },
];
const ANALYZERS = [
  { id: 'security', label: 'Security Audit', description: 'Vulnerabilities, injections, crypto' },
  { id: 'secrets', label: 'Secret Scanning', description: 'API keys, tokens, credentials' },
  { id: 'quality', label: 'Code Quality', description: 'Complexity, maintainability, style' },
  { id: 'bugs', label: 'Bug Detection', description: 'Null pointers, race conditions, errors' },
  { id: 'performance', label: 'Performance', description: 'Memory, N+1 queries, perf issues' },
  { id: 'dependency', label: 'Dependencies', description: 'Outdated/vulnerable packages' },
];
export function MultiStepAnalyzeDialog({ onRun }) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [step, setStep] = useState('target');
  const [target, setTarget] = useState('.');
  const [analyzersInput, setAnalyzersInput] = useState('security, quality, bugs');
  const handleTargetSelect = useCallback((item) => {
    setTarget(item.id);
    setStep('input');
  }, []);
  const handleAnalyzersSubmit = useCallback((value) => {
    const selected = value.split(',').map(s => s.trim()).filter(Boolean);
    if (selected.length > 0) {
      setAnalyzersInput(value);
      setStep('confirm');
    }
  }, []);
  const handleConfirm = useCallback((value) => {
    const selected = analyzersInput.split(',').map(s => s.trim()).filter(Boolean);
    onRun(target, selected.length > 0 ? selected : ['security', 'quality', 'bugs']);
    close();
  }, [target, analyzersInput, onRun, close]);
  if (step === 'target') {
    return (_jsxs(Box, { flexDirection: 'column', gap: 1, children: [_jsx(Text, { bold: true, children: 'Step 1: Select Target' }), _jsx(Text, { dimColor: true, children: 'What files do you want to analyze?' }), _jsx(DialogSearchList, { items: TARGETS, onSelect: handleTargetSelect, filterFn: (item, q) => item.label.toLowerCase().includes(q.toLowerCase()), renderItem: (item, isSelected) => (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { bold: isSelected, color: isSelected ? colors.selection : undefined, children: item.label }), _jsx(Text, { dimColor: true, children: item.description })] })), getKey: item => item.id, placeholder: 'Search targets...', emptyText: 'No matching targets' }), _jsx(Text, { dimColor: true, children: 'Press Enter to select, Esc to cancel' })] }));
  }
  if (step === 'input') {
    return (_jsxs(Box, { flexDirection: 'column', gap: 1, children: [_jsx(Text, { bold: true, children: 'Step 2: Select Analyzers' }), _jsx(Text, { dimColor: true, children: 'Enter comma-separated analyzer names:' }), _jsx(Box, { flexDirection: 'column', gap: 0, children: ANALYZERS.map(a => (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: colors.primary, children: '●' }), _jsx(Text, { bold: true, children: a.label }), _jsx(Text, { dimColor: true, children: a.description })] }, a.id))) }), _jsx(Box, { borderStyle: 'single', borderColor: colors.primary, paddingX: 1, children: _jsx(TextInput, { value: analyzersInput, onChange: setAnalyzersInput, onSubmit: handleAnalyzersSubmit, placeholder: 'security, quality, bugs', focus: true }) }), _jsx(Text, { dimColor: true, children: 'Default: security, quality, bugs' })] }));
  }
  return (_jsxs(Box, { flexDirection: 'column', gap: 1, children: [_jsx(Text, { bold: true, children: 'Step 3: Confirm & Run' }), _jsxs(Box, { flexDirection: 'column', gap: 0, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { bold: true, children: 'Target:' }), _jsx(Text, { children: target })] }), _jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { bold: true, children: 'Analyzers:' }), _jsx(Text, { children: analyzersInput })] })] }), _jsx(Box, { borderStyle: 'single', borderColor: colors.success, paddingX: 1, children: _jsx(TextInput, { value: '', onChange: () => { }, onSubmit: handleConfirm, placeholder: 'Press Enter to run, Esc to cancel', focus: true }) })] }));
}
