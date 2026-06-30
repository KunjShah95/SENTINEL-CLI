import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigate } from 'react-router';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { InputBar } from '../components/input-bar.js';
import { getGitDiff, getChangedFiles, buildReviewPrompt } from '../lib/security-reviewer.js';
function FileEntry({ file, selected, colors }) {
  const ext = file.split('.').pop() || '';
  const extColor = ext === 'ts' || ext === 'tsx' ? colors.info
    : ext === 'js' || ext === 'jsx' ? colors.warning
      : ext === 'json' ? colors.success
        : colors.primary;
  const parts = file.split('/');
  const name = parts.pop() || file;
  const dir = parts.join('/');
  return (_jsxs(Box, { flexDirection: 'row', paddingX: 1, children: [_jsx(Text, { color: selected ? colors.primary : colors.dimSeparator, children: selected ? '▶ ' : '  ' }), _jsxs(Box, { flexDirection: 'column', flexGrow: 1, children: [_jsx(Text, { bold: selected, color: selected ? extColor : colors.dimSeparator, children: name }), dir ? _jsx(Text, { dimColor: true, children: dir }) : null] })] }));
}
function SeverityBadge({ label, count, color }) {
  if (count === 0)
    return null;
  return (_jsxs(Box, { flexDirection: 'row', gap: 1, paddingX: 1, children: [_jsx(Text, { bold: true, color: color, children: label }), _jsx(Text, { color: color, children: String(count) })] }));
}
export function Review() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const [focusedPanel, setFocusedPanel] = useState('review');
  const [changedFiles, setChangedFiles] = useState([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [criticalCount, setCriticalCount] = useState(0);
  const [highCount, setHighCount] = useState(0);
  const [mediumCount, setMediumCount] = useState(0);
  const [lowCount, setLowCount] = useState(0);
  const reviewTriggeredRef = useRef(false);
  const { messages, loading, mode, toggleMode, submit, status, model } = useAgentChat({ initialMode: 'REVIEW' });
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const isLoading = loading || status === 'streaming';
  useEffect(() => {
    const files = getChangedFiles();
    setChangedFiles(files.length > 0 ? files : ['(no changes detected)']);
  }, []);
  useEffect(() => {
    if (reviewTriggeredRef.current)
      return;
    reviewTriggeredRef.current = true;
    const files = getChangedFiles();
    const diff = getGitDiff();
    if (!diff) {
      setReviewStarted(true);
      return;
    }
    setChangedFiles(files.length > 0 ? files : ['(no staged changes)']);
    const prompt = buildReviewPrompt(diff, { files, focus: 'all' });
    setReviewStarted(true);
    submitRef.current(prompt);
  }, []);
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant)
      return;
    const textPart = lastAssistant.parts.find((p) => p.type === 'text');
    const text = textPart?.text || '';
    const critMatch = text.match(/🔴[^\n]*\((\d+)\)|critical[^\n]*:\s*(\d+)/i);
    const highMatch = text.match(/🟠[^\n]*\((\d+)\)|high[^\n]*:\s*(\d+)/i);
    const medMatch = text.match(/🟡[^\n]*\((\d+)\)|medium[^\n]*:\s*(\d+)/i);
    const lowMatch = text.match(/🟢[^\n]*\((\d+)\)|low[^\n]*:\s*(\d+)/i);
    if (critMatch)
      setCriticalCount(parseInt(critMatch[1] || critMatch[2] || '0'));
    if (highMatch)
      setHighCount(parseInt(highMatch[1] || highMatch[2] || '0'));
    if (medMatch)
      setMediumCount(parseInt(medMatch[1] || medMatch[2] || '0'));
    if (lowMatch)
      setLowCount(parseInt(lowMatch[1] || lowMatch[2] || '0'));
  }, [messages]);
  const runReview = useCallback(() => {
    const files = getChangedFiles();
    const diff = getGitDiff();
    if (!diff)
      return;
    setChangedFiles(files.length > 0 ? files : ['(no staged changes)']);
    submitRef.current(buildReviewPrompt(diff, { files, focus: 'all' }));
  }, []);
  const runFileReview = useCallback((file) => {
    if (file === '(no changes detected)' || file === '(no staged changes)')
      return;
    const diff = getGitDiff({ file });
    if (!diff)
      return;
    submit(buildReviewPrompt(diff, { files: [file], focus: 'security' }));
  }, [submit]);
  useInput((input, key) => {
    if (input === 'q' && !key.ctrl && !key.shift) {
      navigate('/');
      return;
    }
    if (key.tab) {
      setFocusedPanel(p => p === 'files' ? 'review' : 'files');
      return;
    }
    if (key.ctrl && input === 'r') {
      runReview();
      return;
    }
    if (focusedPanel === 'files') {
      if (key.upArrow) {
        setSelectedFileIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedFileIdx(i => Math.min(changedFiles.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const file = changedFiles[selectedFileIdx];
        if (file)
          runFileReview(file);
        return;
      }
    }
  });
  return (_jsxs(Box, { flexDirection: 'column', width: '100%', children: [_jsxs(Box, { flexDirection: 'row', paddingX: 2, gap: 2, alignItems: 'center', borderStyle: 'single', borderColor: colors.dimSeparator, children: [_jsx(Text, { bold: true, color: colors.critical, children: 'SENTINEL' }), _jsx(Text, { dimColor: true, children: '|' }), _jsx(Text, { color: colors.primary, children: 'Security Code Review' }), _jsx(Text, { dimColor: true, children: '|' }), _jsx(Text, { dimColor: true, children: 'q:back  Tab:panels  Ctrl+R:re-review  Ctrl+C:exit' })] }), _jsxs(Box, { flexDirection: 'row', flexGrow: 1, children: [_jsxs(Box, { flexDirection: 'column', width: 32, borderStyle: 'single', borderColor: focusedPanel === 'files' ? colors.primary : colors.dimSeparator, flexShrink: 0, children: [_jsx(Box, { paddingX: 1, borderStyle: 'single', borderColor: colors.dimSeparator, children: _jsx(Text, { bold: true, color: colors.primary, children: 'Changed Files' }) }), _jsx(Box, { flexDirection: 'column', flexGrow: 1, paddingY: 1, children: changedFiles.length === 0 ? (_jsx(Box, { paddingX: 2, children: _jsx(Text, { dimColor: true, children: 'No changes' }) })) : (changedFiles.map((file, idx) => (_jsx(FileEntry, { file: file, selected: idx === selectedFileIdx && focusedPanel === 'files', colors: colors }, file + idx)))) }), _jsx(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, children: _jsx(Text, { dimColor: true, children: '↑↓ navigate  Enter review file' }) })] }), _jsxs(Box, { flexDirection: 'column', flexGrow: 1, borderStyle: 'single', borderColor: focusedPanel === 'review' ? colors.primary : colors.dimSeparator, children: [_jsxs(Box, { flexDirection: 'row', paddingX: 2, gap: 2, alignItems: 'center', borderStyle: 'single', borderColor: colors.dimSeparator, children: [_jsx(Text, { bold: true, color: colors.primary, children: 'Security Review' }), isLoading ? _jsx(Text, { dimColor: true, children: '  analyzing...' }) : null, _jsx(SeverityBadge, { label: 'CRIT', count: criticalCount, color: colors.critical }), _jsx(SeverityBadge, { label: 'HIGH', count: highCount, color: colors.error }), _jsx(SeverityBadge, { label: 'MED', count: mediumCount, color: colors.warning }), _jsx(SeverityBadge, { label: 'LOW', count: lowCount, color: colors.info })] }), _jsxs(Box, { flexGrow: 1, flexDirection: 'column', paddingX: 1, children: [!reviewStarted || messages.length === 0 ? (_jsx(Box, { padding: 2, alignItems: 'center', justifyContent: 'center', children: _jsx(Text, { dimColor: true, children: 'Initializing security review...' }) })) : null, messages.map((msg) => {
    if (msg.role === 'error') {
      const text = msg.parts.find((p) => p.type === 'text')?.text || 'Unknown error';
      return _jsx(ErrorMessage, { message: text }, msg.id);
    }
    if (msg.role === 'user') {
      const text = msg.parts.find((p) => p.type === 'text')?.text || '';
      if (text.startsWith('You are performing a CodeRabbit-style'))
        return null;
      return _jsx(UserMessage, { message: text, mode: msg.mode || mode }, msg.id);
    }
    if (msg.role === 'assistant') {
      return _jsx(BotMessage, { parts: msg.parts, model: msg.model || model }, msg.id);
    }
    return null;
  })] }), _jsx(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, paddingTop: 1, children: _jsx(InputBar, { onSubmit: submit, placeholder: 'Ask a follow-up security question...', disabled: isLoading, mode: mode, onModeToggle: toggleMode }) })] })] }), _jsx(StatusBar, { mode: mode })] }));
}
