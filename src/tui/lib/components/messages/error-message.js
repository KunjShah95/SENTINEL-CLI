import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
export function ErrorMessage({ message }) {
  const { colors } = useTheme();
  return (_jsxs(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.error, children: '✗' }), _jsx(Text, { bold: true, color: colors.error, children: 'Error' })] }), _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { color: colors.error, children: message }) })] }));
}
