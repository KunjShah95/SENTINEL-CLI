import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import { InputBar } from './input-bar.js';
import { Spinner } from './spinner.js';
import { StatusBar } from './status-bar.js';
import { useTheme } from '../providers/theme/index.js';
export function SessionShell({ children, onSubmit, onCommand, onSlashCommand, inputDisabled = false, loading = false, mode = 'BUILD', onModeToggle, onCommandPalette, model, statusText, sessionId, tokenUsage, compacting, serverStatus, costUsd }) {
  const { colors } = useTheme();
  return (_jsxs(Box, { flexDirection: 'column', flexGrow: 1, width: '100%', children: [_jsxs(Box, { flexDirection: 'row', paddingX: 2, borderStyle: 'single', borderColor: colors.dimSeparator, gap: 2, children: [_jsx(Text, { bold: true, color: colors.primary, children: '◆ SENTINEL' }), _jsx(Text, { color: colors.dimSeparator, children: '│' }), model ? _jsx(Text, { dimColor: true, children: model.replace('claude-', '').replace('-latest', '') }) : null, _jsx(Text, { color: colors.dimSeparator, children: '│' }), _jsx(Text, { bold: true, color: mode === 'REVIEW' ? colors.critical :
    mode === 'PLAN' ? colors.planMode :
      mode === 'SCAN' ? colors.warning :
        mode === 'FIX' ? colors.error : colors.success, children: mode }), statusText && (_jsxs(_Fragment, { children: [_jsx(Text, { color: colors.dimSeparator, children: '│' }), _jsx(Text, { dimColor: true, children: statusText })] }))] }), _jsx(Box, { flexDirection: 'column', flexGrow: 1, paddingX: 1, children: children }), loading ? (_jsx(Box, { flexShrink: 0, children: _jsx(Spinner, { mode: mode }) })) : null, _jsx(Box, { flexShrink: 0, paddingX: 1, children: _jsx(InputBar, { onSubmit: onSubmit, onCommand: onCommand, onSlashCommand: onSlashCommand, disabled: inputDisabled, mode: mode, onModeToggle: onModeToggle, onCommandPalette: onCommandPalette }) }), _jsx(Box, { flexShrink: 0, children: _jsx(StatusBar, { mode: mode, model: model, statusText: statusText, sessionId: sessionId, tokenUsage: tokenUsage, compacting: compacting, serverStatus: serverStatus, costUsd: costUsd }) })] }));
}
