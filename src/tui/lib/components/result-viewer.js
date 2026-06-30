import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';
const SEVERITY_COLORS = {
  critical: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#60A5FA',
  info: '#88C0D0',
};
const SEVERITY_ICONS = {
  critical: '☢',
  high: '⚠',
  medium: '●',
  low: '↓',
  info: 'ℹ',
};
function IssueCard({ issue, icon, color }) {
  const { colors } = useTheme();
  return (_jsxs(Box, { flexDirection: 'column', paddingY: 0, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: color, children: icon }), _jsx(Text, { bold: true, color: color, children: issue.title || 'Issue' }), issue.line ? _jsx(Text, { dimColor: true, color: colors.dimSeparator, children: `:${issue.line}` }) : null, issue.confidence ? (_jsx(Text, { dimColor: true, color: colors.dimSeparator, children: `${Math.round(issue.confidence * 100)}%` })) : null] }), _jsx(Box, { paddingLeft: 2, children: _jsx(Text, { dimColor: true, children: issue.message || '' }) }), issue.file ? (_jsx(Box, { paddingLeft: 2, children: _jsx(Text, { dimColor: true, color: colors.info, children: `→ ${issue.file}` }) })) : null, issue.suggestion ? (_jsx(Box, { paddingLeft: 2, children: _jsx(Text, { dimColor: true, color: colors.success, children: `✓ ${issue.suggestion}` }) })) : null, issue.tags && issue.tags.length > 0 ? (_jsx(Box, { paddingLeft: 2, flexDirection: 'row', gap: 1, children: issue.tags.slice(0, 4).map(t => (_jsx(Text, { dimColor: true, color: colors.dimSeparator, children: `#${t}` }, t))) })) : null] }));
}
export function ResultViewer({ issues, title }) {
  const { colors } = useTheme();
  if (!issues || issues.length === 0) {
    return (_jsx(Box, { padding: 2, children: _jsx(Text, { color: colors.success, children: '✓ No issues found.' }) }));
  }
  const grouped = {};
  for (const issue of issues) {
    const sev = issue.severity || 'info';
    if (!grouped[sev])
      grouped[sev] = [];
    grouped[sev].push(issue);
  }
  const sevOrder = ['critical', 'high', 'medium', 'low', 'info'];
  const sorted = sevOrder.filter(s => grouped[s]);
  return (_jsxs(Box, { flexDirection: 'column', width: '100%', paddingY: 1, gap: 1, children: [title ? _jsx(Text, { bold: true, color: colors.primary, children: title }) : null, _jsx(Text, { dimColor: true, children: `${issues.length} issue${issues.length !== 1 ? 's' : ''} found` }), sorted.map(sev => {
    const items = grouped[sev];
    const color = SEVERITY_COLORS[sev] || colors.info;
    const icon = SEVERITY_ICONS[sev] || '●';
    return (_jsxs(Box, { flexDirection: 'column', width: '100%', children: [_jsxs(Box, { paddingY: 0, flexDirection: 'row', gap: 1, children: [_jsx(Text, { bold: true, color: color, children: `${icon} ${sev.toUpperCase()}` }), _jsx(Text, { dimColor: true, children: String(items.length) })] }), items.map((issue, i) => (_jsx(IssueCard, { issue: issue, icon: icon, color: color }, i)))] }, sev));
  })] }));
}
