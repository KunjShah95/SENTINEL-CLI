import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigate } from 'react-router';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { InputBar } from '../components/input-bar.js';
import { getGitDiff, getChangedFiles, buildReviewPrompt } from '../lib/security-reviewer.js';

type FocusPanel = 'files' | 'review';

function FileEntry({
  file,
  selected,
  colors,
}: {
  file: string;
  selected: boolean;
  colors: Record<string, string>;
}) {
  const ext = file.split('.').pop() || '';
  const extColor =
    ext === 'ts' || ext === 'tsx'
      ? colors.info
      : ext === 'js' || ext === 'jsx'
        ? colors.warning
        : ext === 'json'
          ? colors.success
          : colors.primary;

  const parts = file.split('/');
  const name = parts.pop() || file;
  const dir = parts.join('/');

  return (
    <Box flexDirection="row" paddingX={1}>
      <Text color={selected ? colors.primary : colors.dimSeparator}>{selected ? '▶ ' : '  '}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text color={selected ? extColor : colors.dimSeparator} bold={selected} dimColor={!selected}>
          {name}
        </Text>
        {dir ? (
          <Text dimColor color={colors.dimSeparator}>{dir}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

function SeverityBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text bold color={color}>{label}</Text>
      <Text color={color}>{String(count)}</Text>
    </Box>
  );
}

export function Review() {
  const navigate = useNavigate();
  const { colors } = useTheme();

  const [focusedPanel, setFocusedPanel] = useState<FocusPanel>('review');
  const [changedFiles, setChangedFiles] = useState<string[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [criticalCount, setCriticalCount] = useState(0);
  const [highCount, setHighCount] = useState(0);
  const [mediumCount, setMediumCount] = useState(0);
  const [lowCount, setLowCount] = useState(0);
  const reviewTriggeredRef = useRef(false);

  const {
    messages,
    loading,
    mode,
    toggleMode,
    submit,
    status,
    model,
  } = useAgentChat({ initialMode: 'REVIEW' });

  const isLoading = loading || status === 'streaming';

  // Load changed files on mount
  useEffect(() => {
    const files = getChangedFiles();
    setChangedFiles(files.length > 0 ? files : ['(no changes detected)']);
  }, []);

  // Trigger initial review automatically
  useEffect(() => {
    if (reviewTriggeredRef.current) return;
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
    submit(prompt);
  }, [submit]);

  // Parse severity counts from latest assistant message
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    const text = lastAssistant.parts.find(p => p.type === 'text')?.text || '';
    const critMatch = text.match(/🔴[^\n]*\((\d+)\)|critical[^\n]*:\s*(\d+)/i);
    const highMatch = text.match(/🟠[^\n]*\((\d+)\)|high[^\n]*:\s*(\d+)/i);
    const medMatch = text.match(/🟡[^\n]*\((\d+)\)|medium[^\n]*:\s*(\d+)/i);
    const lowMatch = text.match(/🟢[^\n]*\((\d+)\)|low[^\n]*:\s*(\d+)/i);
    if (critMatch) setCriticalCount(parseInt(critMatch[1] || critMatch[2] || '0'));
    if (highMatch) setHighCount(parseInt(highMatch[1] || highMatch[2] || '0'));
    if (medMatch) setMediumCount(parseInt(medMatch[1] || medMatch[2] || '0'));
    if (lowMatch) setLowCount(parseInt(lowMatch[1] || lowMatch[2] || '0'));
  }, [messages]);

  const runReview = useCallback(() => {
    const files = getChangedFiles();
    const diff = getGitDiff();
    if (!diff) return;
    setChangedFiles(files.length > 0 ? files : ['(no staged changes)']);
    const prompt = buildReviewPrompt(diff, { files, focus: 'all' });
    submit(prompt);
  }, [submit]);

  const runFileReview = useCallback(
    (file: string) => {
      if (file === '(no changes detected)' || file === '(no staged changes)') return;
      const diff = getGitDiff({ file });
      if (!diff) return;
      const prompt = buildReviewPrompt(diff, { files: [file], focus: 'security' });
      submit(prompt);
    },
    [submit]
  );

  const handleSubmit = useCallback(
    (value: string) => {
      submit(value);
    },
    [submit]
  );

  useInput((input, key) => {
    // q to go back
    if (input === 'q' && !key.ctrl && !key.shift) {
      navigate('/');
      return;
    }

    // Tab to switch panels
    if (key.tab) {
      setFocusedPanel(p => (p === 'files' ? 'review' : 'files'));
      return;
    }

    // Ctrl+R to re-run review
    if (key.ctrl && input === 'r') {
      runReview();
      return;
    }

    // Arrow navigation in files panel
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
        if (file) runFileReview(file);
        return;
      }
    }
  });

  const filesPanel = (
    <Box
      flexDirection="column"
      width={32}
      borderStyle="single"
      borderColor={focusedPanel === 'files' ? colors.primary : colors.dimSeparator}
      flexShrink={0}
    >
      <Box paddingX={1} paddingY={0}>
        <Text bold color={colors.primary}>{'Changed Files'}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingY={1}>
        {changedFiles.length === 0 ? (
          <Box paddingX={2}>
            <Text dimColor color={colors.dimSeparator}>{'No changes'}</Text>
          </Box>
        ) : (
          changedFiles.map((file, idx) => (
            <FileEntry
              key={file + idx}
              file={file}
              selected={idx === selectedFileIdx && focusedPanel === 'files'}
              colors={colors}
            />
          ))
        )}
      </Box>
      <Box paddingX={1}>
        <Text dimColor color={colors.dimSeparator}>{'↑↓ navigate  Enter review file'}</Text>
      </Box>
    </Box>
  );

  const reviewPanel = (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={focusedPanel === 'review' ? colors.primary : colors.dimSeparator}
    >
      <Box
        flexDirection="row"
        paddingX={2}
        paddingY={0}
        gap={2}
        alignItems="center"
      >
        <Text bold color={colors.primary}>{'Security Review'}</Text>
        {isLoading ? (
          <Text dimColor color={colors.warning}>{'  analyzing...'}</Text>
        ) : null}
        <SeverityBadge label={'CRIT'} count={criticalCount} color={colors.critical} />
        <SeverityBadge label={'HIGH'} count={highCount} color={colors.error} />
        <SeverityBadge label={'MED'} count={mediumCount} color={colors.warning} />
        <SeverityBadge label={'LOW'} count={lowCount} color={colors.info} />
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {!reviewStarted || messages.length === 0 ? (
          <Box padding={2} alignItems="center" justifyContent="center">
            <Text dimColor color={colors.dimSeparator}>{'Initializing security review...'}</Text>
          </Box>
        ) : null}
        {messages.map(msg => {
          if (msg.role === 'error') {
            const text = msg.parts.find(p => p.type === 'text')?.text || 'Unknown error';
            return <ErrorMessage key={msg.id} message={text} />;
          }
          if (msg.role === 'user') {
            const text = msg.parts.find(p => p.type === 'text')?.text || '';
            // Only show follow-up user messages (not the initial review prompt)
            if (text.startsWith('You are performing a CodeRabbit-style')) return null;
            return <UserMessage key={msg.id} message={text} mode={msg.mode || mode} />;
          }
          if (msg.role === 'assistant') {
            return <BotMessage key={msg.id} parts={msg.parts} model={msg.model || model} />;
          }
          return null;
        })}
      </Box>

      <Box paddingX={1} paddingTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          placeholder={'Ask a follow-up security question...'}
          disabled={isLoading}
          mode={mode}
          onModeToggle={toggleMode}
        />
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column" width="100%">
      <Box
        flexDirection="row"
        paddingX={2}
        paddingY={0}
        gap={2}
        alignItems="center"
      >
        <Text bold color={colors.critical}>{'SENTINEL'}</Text>
        <Text dimColor color={colors.dimSeparator}>{'|'}</Text>
        <Text color={colors.primary}>{'Security Code Review'}</Text>
        <Text dimColor color={colors.dimSeparator}>{'|'}</Text>
        <Text dimColor color={colors.dimSeparator}>{'q:back  Tab:panels  Ctrl+R:re-review  Ctrl+C:exit'}</Text>
      </Box>

      <Box flexDirection="row" flexGrow={1} gap={0}>
        {filesPanel}
        {reviewPanel}
      </Box>

      <StatusBar mode={mode} />
    </Box>
  );
}
