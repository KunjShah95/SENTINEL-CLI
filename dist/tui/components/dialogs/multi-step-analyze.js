import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useState } from 'react';
import { TextAttributes } from '@opentui/core';
import { useTheme } from '../../providers/theme';
import { DialogSearchList } from '../dialog-search-list';
import { useDialog } from '../../providers/dialog';
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
    const [customPath, setCustomPath] = useState('');
    const handleTargetSelect = useCallback((item) => {
        setTarget(item.id);
        setStep('input');
    }, []);
    const handleAnalyzersSubmit = useCallback((value) => {
        const raw = String(value || analyzersInput);
        const selected = raw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        if (selected.length > 0) {
            setAnalyzersInput(raw);
            setStep('confirm');
        }
    }, [analyzersInput]);
    const handleConfirm = useCallback(() => {
        const selected = analyzersInput
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        onRun(customPath || target, selected.length > 0 ? selected : ['security', 'quality', 'bugs']);
        close();
    }, [target, analyzersInput, customPath, onRun, close]);
    if (step === 'target') {
        return (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, children: "Step 1: Select Target" }), _jsx("text", { attributes: TextAttributes.DIM, children: "What files do you want to analyze?" }), _jsx(DialogSearchList, { items: TARGETS, onSelect: handleTargetSelect, filterFn: (item, q) => item.label.toLowerCase().includes(q.toLowerCase()), renderItem: (item, isSelected) => (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: isSelected ? colors.selection : undefined, attributes: isSelected ? 1 : 0, children: item.label }), _jsx("text", { attributes: 2, children: item.description })] })), getKey: item => item.id, placeholder: "Search targets...", emptyText: "No matching targets" }), _jsx("box", { flexDirection: "row", gap: 1, paddingTop: 1, children: _jsx("text", { attributes: TextAttributes.DIM, children: "Press Enter to select, Esc to cancel" }) })] }));
    }
    if (step === 'input') {
        return (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, children: "Step 2: Select Analyzers" }), _jsx("text", { attributes: TextAttributes.DIM, children: "Enter comma-separated analyzer names (or press Enter for defaults):" }), _jsx("box", { flexDirection: "column", gap: 0.5, paddingY: 1, children: ANALYZERS.map(a => (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: colors.primary, children: '\u25CF' }), _jsx("text", { attributes: 1, children: a.label }), _jsx("text", { attributes: TextAttributes.DIM, children: a.description })] }, a.id))) }), _jsx("input", { placeholder: "security, quality, bugs", focused: true, onInput: v => setAnalyzersInput(String(v)), onSubmit: handleAnalyzersSubmit }), _jsx("text", { attributes: TextAttributes.DIM, children: "Default: security, quality, bugs" })] }));
    }
    return (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, children: "Step 3: Confirm & Run" }), _jsxs("box", { flexDirection: "column", gap: 0.5, paddingY: 1, children: [_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { attributes: 1, children: "Target:" }), _jsx("text", { children: customPath || target })] }), _jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { attributes: 1, children: "Analyzers:" }), _jsx("text", { children: analyzersInput })] })] }), _jsx("input", { placeholder: "Press Enter to run, Esc to cancel", focused: true, onSubmit: handleConfirm })] }));
}
