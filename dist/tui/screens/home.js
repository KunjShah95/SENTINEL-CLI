import { jsxs as _jsxs, jsx as _jsx } from "@opentui/react/jsx-runtime";
import { useCallback, useState } from 'react';
import { TextAttributes } from '@opentui/core';
import { Header } from '../components/header';
import { InputBar } from '../components/input-bar';
import { StatusBar } from '../components/status-bar';
import { useTheme } from '../providers/theme';
import { useNavigate } from 'react-router';
function QuickAction({ cmdKey, label, description, color, }) {
    return (_jsxs("box", { flexDirection: "row", gap: 1, paddingY: 0.5, children: [_jsxs("text", { fg: color, width: 20, children: ["/ ", cmdKey] }), _jsx("text", { attributes: TextAttributes.DIM, children: description })] }));
}
const QUICK_ACTIONS = [
    { cmdKey: 'analyze', label: 'analyze', description: 'Analyze code for issues', color: '#60A5FA' },
    {
        cmdKey: 'full-scan',
        label: 'full-scan',
        description: 'Run all available analyzers',
        color: '#F59E0B',
    },
    {
        cmdKey: 'security',
        label: 'security',
        description: 'Comprehensive security audit',
        color: '#EF4444',
    },
    { cmdKey: 'diff', label: 'diff', description: 'Review staged changes', color: '#34D399' },
    { cmdKey: 'agents', label: 'agents', description: 'Run multi-agent pipeline', color: '#7C3AED' },
    { cmdKey: 'fix', label: 'fix', description: 'Auto-fix detected issues', color: '#10B981' },
    { cmdKey: 'status', label: 'status', description: 'Show system status', color: '#88C0D0' },
    { cmdKey: 'help', label: 'help', description: 'Show available commands', color: '#81A1C1' },
];
export function Home() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('BUILD');
    const { colors } = useTheme();
    const handleSubmit = useCallback((value) => {
        navigate('/session', { state: { message: value, mode } });
    }, [navigate, mode]);
    const handleCommand = useCallback((command) => {
        navigate('/session', { state: { message: command, mode } });
    }, [navigate, mode]);
    const toggleMode = useCallback(() => {
        setMode(prev => {
            const modes = ['BUILD', 'PLAN', 'SCAN', 'FIX'];
            const idx = modes.indexOf(prev);
            return modes[(idx + 1) % modes.length];
        });
    }, []);
    return (_jsxs("box", { flexDirection: "column", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", paddingX: 4, children: [_jsx(Header, {}), _jsx("box", { paddingY: 2, paddingX: 4, width: "100%", maxWidth: 80, children: _jsx("box", { flexDirection: "column", gap: 0, children: QUICK_ACTIONS.map(action => (_jsx(QuickAction, { ...action }, action.cmdKey))) }) }), _jsx("box", { flexDirection: "column", width: "100%", maxWidth: 80, paddingX: 4, children: _jsx("box", { border: ['top'], borderColor: colors.dimSeparator, paddingTop: 1, width: "100%", children: _jsx("text", { attributes: TextAttributes.DIM, children: "Type a message or /command to start. Tab to toggle modes. Ctrl+P for command palette." }) }) }), _jsx("box", { width: "100%", maxWidth: 80, paddingX: 4, paddingTop: 1, children: _jsx(InputBar, { onSubmit: handleSubmit, onCommand: handleCommand, mode: mode, onModeToggle: toggleMode }) }), _jsx("box", { width: "100%", maxWidth: 80, paddingX: 4, paddingTop: 1, children: _jsx(StatusBar, { mode: mode }) })] }));
}
