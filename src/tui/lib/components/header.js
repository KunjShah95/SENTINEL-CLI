import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';
export function Header() {
  const { colors } = useTheme();
  return (_jsx(Box, { justifyContent: 'center', alignItems: 'center', paddingY: 1, children: _jsxs(Box, { flexDirection: 'column', alignItems: 'center', children: [_jsx(Text, { bold: true, color: colors.primary, children: 'SENTINEL' }), _jsx(Text, { dimColor: true, children: 'AI-Powered Code Guardian' })] }) }));
}
