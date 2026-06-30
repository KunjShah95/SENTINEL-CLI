import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
const MODE_COLOR = {
  BUILD: '#00D4AA', PLAN: '#7C3AED', REVIEW: '#DC2626', SCAN: '#F59E0B', FIX: '#EF4444',
};
const MODE_LABEL = {
  BUILD: 'Thinking', PLAN: 'Planning', REVIEW: 'Analyzing', SCAN: 'Scanning', FIX: 'Fixing',
};
export function Spinner({ mode = 'BUILD', label }) {
  const color = MODE_COLOR[mode];
  const text = label ?? `${MODE_LABEL[mode]}...`;
  return (_jsxs(Box, { flexDirection: 'row', gap: 1, paddingLeft: 4, children: [_jsx(Text, { color: color, children: _jsx(InkSpinner, { type: 'dots' }) }), _jsx(Text, { dimColor: true, children: text })] }));
}
