import { useCallback, useEffect, useRef, useState } from 'react';
import { TextAttributes } from '@opentui/core';
import { useNavigate } from 'react-router';
import { useKeyboard } from '@opentui/react';
import { useTheme } from '../providers/theme';
import { SentinelBorderChars } from '../components/border';
import { StatusBar } from '../components/status-bar';
import { useAgentChat } from '../hooks/use-agent-chat';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages';
import { InputBar } from '../components/input-bar';
import { getGitDiff, getChangedFiles, buildReviewPrompt } from '../lib/security-reviewer';

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
    <box flexDirection="row" paddingX={1} paddingY={0}>
      <text fg={selected ? colors.primary : colors.dimSeparator}>{selected ? '▶ ' : '  '}</text>
      <box flexDirection="column" flexGrow={1}>
        <text fg={selected ? extColor : colors.dimSeparator} attributes={selected ? TextAttributes.BOLD : TextAttributes.DIM}>
          {name}
        </text>
        {dir ? (
          <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
            {dir}
          </text>
        ) : null}
      </box>
    </box>
  );
}

function SeverityBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <box flexDirection="row" gap={1} paddingX={1}>
      <text fg={color} attributes={TextAttributes.BOLD}>
        {label}
      </text>
      <text fg={color}>{String(count)}</text>
    </box>
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

  useKeyboard((key) => {
    // q to go back
    if (key.name === 'q' && !key.ctrl && !key.shift) {
      navigate('/');
      return;
    }

    // Tab to switch panels
    if (key.name === 'tab') {
      setFocusedPanel(p => (p === 'files' ? 'review' : 'files'));
      return;
    }

    // Ctrl+R to re-run review
    if (key.name === 'r' && key.ctrl) {
      runReview();
      return;
    }

    // Arrow navigation in files panel
    if (focusedPanel === 'files') {
      if (key.name === 'up') {
        setSelectedFileIdx(i => Math.max(0, i - 1));
        return;
      }
      if (key.name === 'down') {
        setSelectedFileIdx(i => Math.min(changedFiles.length - 1, i + 1));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        const file = changedFiles[selectedFileIdx];
        if (file) runFileReview(file);
        return;
      }
    }
  });

  const filesPanel = (
    <box
      flexDirection="column"
      width={32}
      height="100%"
      border={SentinelBorderChars as any}
      borderColor={focusedPanel === 'files' ? colors.primary : colors.dimSeparator}
      flexShrink={0}
    >
      <box paddingX={1} paddingY={0} border={['top']} borderColor={colors.dimSeparator}>
        <text fg={colors.primary} attributes={TextAttributes.BOLD}>
          {'Changed Files'}
        </text>
      </box>
      <box flexDirection="column" flexGrow={1} paddingY={1}>
        {changedFiles.length === 0 ? (
          <box paddingX={2}>
            <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
              {'No changes'}
            </text>
          </box>
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
      </box>
      <box border={['top']} borderColor={colors.dimSeparator} paddingX={1}>
        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          {'↑↓ navigate  Enter review file'}
        </text>
      </box>
    </box>
  );

  const reviewPanel = (
    <box
      flexDirection="column"
      flexGrow={1}
      height="100%"
      border={SentinelBorderChars as any}
      borderColor={focusedPanel === 'review' ? colors.primary : colors.dimSeparator}
    >
      {/* Header */}
      <box
        flexDirection="row"
        paddingX={2}
        paddingY={0}
        border={['top']}
        borderColor={colors.dimSeparator}
        gap={2}
        alignItems="center"
      >
        <text fg={colors.primary} attributes={TextAttributes.BOLD}>
          {'Security Review'}
        </text>
        {isLoading ? (
          <text fg={colors.warning} attributes={TextAttributes.DIM}>
            {'  analyzing...'}
          </text>
        ) : null}
        <SeverityBadge label={'CRIT'} count={criticalCount} color={colors.critical} />
        <SeverityBadge label={'HIGH'} count={highCount} color={colors.error} />
        <SeverityBadge label={'MED'} count={mediumCount} color={colors.warning} />
        <SeverityBadge label={'LOW'} count={lowCount} color={colors.info} />
      </box>

      {/* Messages area */}
      <box flexGrow={1} flexDirection="column" paddingX={1}>
        {!reviewStarted || messages.length === 0 ? (
          <box padding={2} alignItems="center" justifyContent="center">
            <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
              {'Initializing security review...'}
            </text>
          </box>
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
      </box>

      {/* Input for follow-up questions */}
      <box border={['top']} borderColor={colors.dimSeparator} paddingX={1} paddingTop={1}>
        <InputBar
          onSubmit={handleSubmit}
          placeholder={'Ask a follow-up security question...'}
          disabled={isLoading}
          mode={mode}
          onModeToggle={toggleMode}
        />
      </box>
    </box>
  );

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Title bar */}
      <box
        flexDirection="row"
        paddingX={2}
        paddingY={0}
        border={['top']}
        borderColor={colors.dimSeparator}
        gap={2}
        alignItems="center"
      >
        <text fg={colors.critical} attributes={TextAttributes.BOLD}>
          {'SENTINEL'}
        </text>
        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          {'|'}
        </text>
        <text fg={colors.primary}>{'Security Code Review'}</text>
        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          {'|'}
        </text>
        <text fg={colors.dimSeparator} attributes={TextAttributes.DIM}>
          {'q:back  Tab:panels  Ctrl+R:re-review  Ctrl+C:exit'}
        </text>
      </box>

      {/* Main content */}
      <box flexDirection="row" flexGrow={1} gap={0}>
        {filesPanel}
        {reviewPanel}
      </box>

      {/* Status bar */}
      <StatusBar mode={mode} />
    </box>
  );
}
