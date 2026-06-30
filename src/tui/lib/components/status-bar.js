import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';
const MODE_SYMBOL = {
  BUILD: '⬡ BUILD', PLAN: '◎ PLAN', REVIEW: '⊕ REVIEW', SCAN: '◈ SCAN', FIX: '⚙ FIX',
};
function useGitBranch() {
  const [branch, setBranch] = useState('');
  useEffect(() => {
    import('child_process').then(({ execSync }) => {
      try {
        setBranch(execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { encoding: 'utf-8' }).trim());
      }
      catch { }
    });
  }, []);
  return branch;
}
function Pipe({ colors }) {
  return _jsx(Text, { color: colors.dimSeparator, children: ' │ ' });
}
export function StatusBar({ mode = 'BUILD', model, statusText, sessionId, tokenUsage, compacting, serverStatus, costUsd }) {
  const { colors } = useTheme();
  const branch = useGitBranch();
  const modeColor = mode === 'BUILD' ? colors.success :
    mode === 'PLAN' ? colors.planMode :
      mode === 'REVIEW' ? colors.critical :
        mode === 'SCAN' ? colors.warning : colors.error;
  const shortModel = model
    ? model.replace('claude-', '').replace('-latest', '').replace('gpt-4', 'gpt4')
    : null;
  return (_jsxs(Box, { flexDirection: 'row', borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, width: '100%', alignItems: 'center', children: [_jsx(Text, { bold: true, color: modeColor, children: MODE_SYMBOL[mode] }), shortModel && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { dimColor: true, children: shortModel })] })), branch && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { color: colors.info, children: '⎇ ' }), _jsx(Text, { dimColor: true, children: branch })] })), sessionId && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsxs(Text, { dimColor: true, children: ['#', sessionId.slice(0, 8)] })] })), statusText && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { dimColor: true, children: statusText })] })), compacting && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { color: colors.warning, children: '⟳ compacting…' })] })), tokenUsage && tokenUsage.estimated > 0 && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { color: tokenUsage.percentage >= 80 ? colors.error :
    tokenUsage.percentage >= 60 ? colors.warning : colors.dimSeparator, children: `~${(tokenUsage.estimated / 1000).toFixed(1)}k/${(tokenUsage.limit / 1000).toFixed(0)}k tok` })] })), costUsd !== undefined && costUsd > 0 && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { dimColor: true, children: `~$${costUsd.toFixed(3)}` })] })), serverStatus && (_jsxs(_Fragment, { children: [_jsx(Pipe, { colors: colors }), _jsx(Text, { color: serverStatus === 'connected' ? colors.success : colors.warning, children: serverStatus === 'connected' ? '⬤ server' : '◌ local' })] })), _jsx(Box, { flexGrow: 1 }), _jsx(Text, { dimColor: true, children: 'Ctrl+P commands · Tab mode' })] }));
}
