import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'react/jsx-runtime';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
import { useTheme } from '../../providers/theme/index.js';
function ToolRow({ part }) {
  const { colors } = useTheme();
  if (part.toolCall) {
    const done = !!part.toolCall.result;
    return (_jsxs(Box, { flexDirection: 'column', paddingLeft: 6, marginY: 0, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: colors.dimSeparator, children: '↳' }), _jsx(Text, { color: colors.info, children: part.toolCall.name }), part.toolCall.args
      ? _jsx(Text, { dimColor: true, children: Object.values(part.toolCall.args).slice(0, 2).map(String).join('  ') })
      : null, done
      ? _jsx(Text, { color: colors.success, children: '✓' })
      : _jsx(Text, { color: colors.info, children: _jsx(InkSpinner, { type: 'dots' }) })] }), done && part.toolCall.result
      ? _jsx(Box, { paddingLeft: 3, children: _jsx(Text, { dimColor: true, children: String(part.toolCall.result).slice(0, 200) }) })
      : null] }));
  }
  const isPending = part.state === 'pending';
  const isDone = part.state === 'output-available';
  const isError = part.state === 'output-error';
  const name = part.toolName || 'tool';
  const inputStr = part.input
    ? (typeof part.input === 'string' ? part.input : JSON.stringify(part.input)).slice(0, 120)
    : '';
  const outputStr = isDone && part.output !== undefined
    ? (typeof part.output === 'string' ? part.output : JSON.stringify(part.output)).slice(0, 300)
    : '';
  return (_jsxs(Box, { flexDirection: 'column', paddingLeft: 6, marginY: 0, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, alignItems: 'center', children: [_jsx(Text, { color: colors.dimSeparator, children: '↳' }), _jsx(Text, { color: colors.info, children: name }), inputStr ? _jsx(Text, { dimColor: true, children: inputStr }) : null, isPending ? _jsx(Text, { color: colors.info, children: _jsx(InkSpinner, { type: 'dots' }) }) : null, isDone ? _jsx(Text, { color: colors.success, children: '✓' }) : null, isError ? _jsx(Text, { color: colors.error, children: '✗' }) : null] }), outputStr ? _jsx(Box, { paddingLeft: 3, children: _jsx(Text, { dimColor: true, children: outputStr }) }) : null, isError && part.errorText
    ? _jsx(Box, { paddingLeft: 3, children: _jsx(Text, { color: colors.error, children: part.errorText }) })
    : null] }));
}
function ReasoningRow({ text }) {
  const { colors } = useTheme();
  return (_jsx(Box, { paddingLeft: 6, marginY: 0, children: _jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: colors.dimSeparator, children: '⊹' }), _jsx(Text, { dimColor: true, color: colors.thinking, children: text.trim() })] }) }));
}
function renderLine(line, colors, key) {
  if (!line.trim())
    return _jsx(Text, { children: '' }, key);
  if (line.startsWith('```'))
    return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { dimColor: true, children: line }) }, key);
  const headingM = line.match(/^(#{1,3})\s+(.+)/);
  if (headingM)
    return _jsx(Box, { marginTop: 1, paddingLeft: 4, children: _jsx(Text, { bold: true, color: colors.primary, children: headingM[2] }) }, key);
  const bulletM = line.match(/^(\s*[-*•])\s+(.+)/);
  if (bulletM)
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, paddingLeft: 6, children: [_jsx(Text, { color: colors.dimSeparator, children: '•' }), _jsx(Text, { children: bulletM[2] })] }, key));
  if (/^🔴/.test(line))
    return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { bold: true, color: colors.critical, children: line }) }, key);
  if (/^🟠/.test(line))
    return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { bold: true, color: colors.error, children: line }) }, key);
  if (/^🟡/.test(line))
    return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { bold: true, color: colors.warning, children: line }) }, key);
  if (/^🟢/.test(line))
    return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { bold: true, color: colors.success, children: line }) }, key);
  if (/^(Score|Grade|Security Score):/i.test(line))
    return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { bold: true, color: colors.info, children: line }) }, key);
  return _jsx(Box, { paddingLeft: 4, children: _jsx(Text, { children: line }) }, key);
}
export function BotMessage({ parts, model, duration }) {
  const { colors } = useTheme();
  if (parts.length === 0)
    return null;
  const groups = parts.reduce((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last[0].type === p.type) {
      last.push(p);
    }
    else {
      acc.push([p]);
    }
    return acc;
  }, []);
  const shortModel = model
    ? model.replace('claude-', '').replace('gpt-4', 'gpt4').replace('-latest', '')
    : null;
  return (_jsxs(Box, { flexDirection: 'column', marginY: 1, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, paddingLeft: 2, marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.primary, children: '◆' }), _jsx(Text, { bold: true, color: colors.primary, children: 'Sentinel' }), shortModel ? _jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: '·' }), _jsx(Text, { dimColor: true, children: shortModel })] }) : null, duration ? _jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: '·' }), _jsx(Text, { dimColor: true, children: `${(duration / 1000).toFixed(1)}s` })] }) : null] }), groups.map((group, gi) => {
    const type = group[0].type;
    if (type === 'reasoning') {
      const text = group.map(p => p.text ?? '').join('');
      return _jsx(ReasoningRow, { text: text }, gi);
    }
    if (type === 'tool-call') {
      return (_jsx(Box, { flexDirection: 'column', children: group.map((p, pi) => _jsx(ToolRow, { part: p }, pi)) }, gi));
    }
    const text = group.map(p => p.text ?? '').join('');
    if (!text.trim())
      return null;
    const lines = text.split('\n');
    return (_jsx(Box, { flexDirection: 'column', children: lines.map((line, li) => renderLine(line, colors, li)) }, gi));
  })] }));
}
