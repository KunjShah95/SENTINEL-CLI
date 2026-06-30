import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
const MODE_COLOR_KEY = {
  BUILD: 'success', PLAN: 'planMode', REVIEW: 'critical', SCAN: 'warning', FIX: 'error',
};
export function UserMessage({ message, mode = 'BUILD' }) {
  const { colors } = useTheme();
  const modeColor = colors[MODE_COLOR_KEY[mode]] ?? colors.primary;
  return (_jsxs(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.primary, children: '▶' }), _jsx(Text, { bold: true, color: colors.primary, children: 'You' }), _jsx(Text, { dimColor: true, children: '·' }), _jsx(Text, { bold: true, color: modeColor, children: mode })] }), _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { children: message }) })] }));
}
