import { jsx as _jsx } from 'react/jsx-runtime';
import { Box } from 'ink';
import { useTheme } from '../providers/theme/index.js';
export function ThemedRoot({ children }) {
  const { colors } = useTheme();
  return (_jsx(Box, { width: '100%', flexGrow: 1, flexDirection: 'column', children: children }));
}
