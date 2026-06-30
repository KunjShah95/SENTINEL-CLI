import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigate } from 'react-router';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { InputBar } from '../components/input-bar.js';
import { getGitDiff, getChangedFiles, buildReviewPrompt } from '../lib/security-reviewer.js';

type FocusPanel = 'files' | 'cohorts' | 'review';

type CohortInfo = {
  name: string;
  description: string;
  files: string[];
  fileCount: number;
  insertions: number;
  deletions: number;
};

function FileEntry({ file, selected, colors }: { file: string; selected: boolean; colors: Record<string, string> }) {
  const ext = file.split('.').pop() || '';
  const extColor = ext === 'ts' || ext === 'tsx' ? colors.info
    : ext === 'js' || ext === 'jsx' ? colors.warning
    : ext === 'json' ? colors.success
    : colors.primary;

  const parts = file.split('/');
  const name = parts.pop() || file;
  const dir = parts.join('/');

  return (
    <Box flexDirection="row" paddingX={1}>
      <Text color={selected ? colors.primary : colors.dimSeparator}>{selected ? '▶ ' : '  '}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text bold={selected} color={selected ? extColor : colors.dimSeparator}>{name}</Text>
        {dir ? <Text dimColor>{dir}</Text> : null}
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
  const [cohorts, setCohorts] = useState<CohortInfo[]>([]);
  const [selectedCohortIdx, setSelectedCohortIdx] = useState(0);
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
    // Classify files into cohorts for navigation
    const cohortMap: Record<string, CohortInfo> = {
      'Foundation': { name: 'Foundation', description: 'Models, types, configs', files: [], fileCount: 0, insertions: 0, deletions: 0 },
      'API': { name: 'API', description: 'Routes, controllers', files: [], fileCount: 0, insertions: 0, deletions: 0 },
      'UI': { name: 'UI', description: 'Components, views', files: [], fileCount: 0, insertions: 0, deletions: 0 },
      'Tests': { name: 'Tests', description: 'Test files', files: [], fileCount: 0, insertions: 0, deletions: 0 },
      'Config': { name: 'Config', description: 'Config, CI/CD', files: [], fileCount: 0, insertions: 0, deletions: 0 },
      'Other': { name: 'Other', description: 'Other changes', files: [], fileCount: 0, insertions: 0, deletions: 0 },
    };
    for (const file of files) {
      const p = file.toLowerCase();
      if (/(test|spec|__tests__)/.test(p)) cohortMap['Tests'].files.push(file);
      else if (/(route|controller|api|handler|middleware)/.test(p)) cohortMap['API'].files.push(file);
      else if (/(component|view|page|screen|\.tsx|\.jsx|\.vue)/.test(p)) cohortMap['UI'].files.push(file);
      else if (/(config|\.env|\.yaml|\.yml|dockerfile|ci)/.test(p)) cohortMap['Config'].files.push(file);
      else if (/(model|schema|type|interface|entity|migration)/.test(p)) cohortMap['Foundation'].files.push(file);
      else cohortMap['Other'].files.push(file);
    }
    const activeCohorts = Object.values(cohortMap).filter(c => c.files.length > 0).map(c => ({ ...c, fileCount: c.files.length }));
    setCohorts(activeCohorts);
  }, []);

  useEffect(() => {
    if (reviewTriggeredRef.current) return;
    reviewTriggeredRef.current = true;
    const files = getChangedFiles();
    const diff = getGitDiff();
    if (!diff) { setReviewStarted(true); return; }
    setChangedFiles(files.length > 0 ? files : ['(no staged changes)']);
    const prompt = buildReviewPrompt(diff, { files, focus: 'all' });
    setReviewStarted(true);
    submitRef.current(prompt);
  }, []);

  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return;
    const textPart = lastAssistant.parts.find((p): p is { type: 'text'; text: string } => p.type === 'text');
    const text = textPart?.text || '';
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
    submitRef.current(buildReviewPrompt(diff, { files, focus: 'all' }));
  }, []);

  const runFileReview = useCallback((file: string) => {
    if (file === '(no changes detected)' || file === '(no staged changes)') return;
    const diff = getGitDiff({ file });
    if (!diff) return;
    submit(buildReviewPrompt(diff, { files: [file], focus: 'security' }));
  }, [submit]);

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl && !key.shift) { navigate('/'); return; }
    if (key.tab) { setFocusedPanel(p => p === 'files' ? 'cohorts' : p === 'cohorts' ? 'review' : 'files'); return; }
    if (key.ctrl && input === 'r') { runReview(); return; }
    if (focusedPanel === 'files') {
      if (key.upArrow) { setSelectedFileIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelectedFileIdx(i => Math.min(changedFiles.length - 1, i + 1)); return; }
      if (key.return) { const file = changedFiles[selectedFileIdx]; if (file) runFileReview(file); return; }
    }
    if (focusedPanel === 'cohorts') {
      if (key.upArrow) { setSelectedCohortIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSelectedCohortIdx(i => Math.min(cohorts.length - 1, i + 1)); return; }
      if (key.return) {
        const cohort = cohorts[selectedCohortIdx];
        if (cohort && cohort.files.length > 0) {
          setChangedFiles(cohort.files);
          setSelectedFileIdx(0);
          setFocusedPanel('files');
        }
        return;
      }
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      {/* Title bar */}
      <Box flexDirection="row" paddingX={2} gap={2} alignItems="center" borderStyle="single" borderColor={colors.dimSeparator}>
        <Text bold color={colors.critical}>{'SENTINEL'}</Text>
        <Text dimColor>{'|'}</Text>
        <Text color={colors.primary}>{'Security Code Review'}</Text>
        <Text dimColor>{'|'}</Text>
        <Text dimColor>{'q:back  Tab:panels  Ctrl+R:re-review  Ctrl+C:exit'}</Text>
      </Box>

      {/* Main content */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Cohorts panel */}
        {cohorts.length > 0 && (
          <Box
            flexDirection="column"
            width={24}
            borderStyle="single"
            borderColor={focusedPanel === 'cohorts' ? colors.primary : colors.dimSeparator}
            flexShrink={0}
          >
            <Box paddingX={1} borderStyle="single" borderColor={colors.dimSeparator}>
              <Text bold color={colors.primary}>{'Cohorts'}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1} paddingY={1}>
              {cohorts.map((cohort, idx) => (
                <Box key={cohort.name} flexDirection="row" paddingX={1}>
                  <Text color={idx === selectedCohortIdx && focusedPanel === 'cohorts' ? colors.primary : colors.dimSeparator}>
                    {idx === selectedCohortIdx && focusedPanel === 'cohorts' ? '▶ ' : '  '}
                  </Text>
                  <Text bold={idx === selectedCohortIdx && focusedPanel === 'cohorts'} color={colors.primary}>
                    {cohort.name}
                  </Text>
                  <Text dimColor>{` (${cohort.fileCount})`}</Text>
                </Box>
              ))}
            </Box>
            <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1}>
              <Text dimColor>{'↑↓ navigate  Enter select'}</Text>
            </Box>
          </Box>
        )}

        {/* Files panel */}
        <Box
          flexDirection="column"
          width={32}
          borderStyle="single"
          borderColor={focusedPanel === 'files' ? colors.primary : colors.dimSeparator}
          flexShrink={0}
        >
          <Box paddingX={1} borderStyle="single" borderColor={colors.dimSeparator}>
            <Text bold color={colors.primary}>{'Changed Files'}</Text>
          </Box>
          <Box flexDirection="column" flexGrow={1} paddingY={1}>
            {changedFiles.length === 0 ? (
              <Box paddingX={2}><Text dimColor>{'No changes'}</Text></Box>
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
          <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1}>
            <Text dimColor>{'↑↓ navigate  Enter review file'}</Text>
          </Box>
        </Box>

        {/* Review panel */}
        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor={focusedPanel === 'review' ? colors.primary : colors.dimSeparator}
        >
          {/* Review header */}
          <Box flexDirection="row" paddingX={2} gap={2} alignItems="center" borderStyle="single" borderColor={colors.dimSeparator}>
            <Text bold color={colors.primary}>{'Security Review'}</Text>
            {isLoading ? <Text dimColor>{'  analyzing...'}</Text> : null}
            <SeverityBadge label={'CRIT'} count={criticalCount} color={colors.critical} />
            <SeverityBadge label={'HIGH'} count={highCount} color={colors.error} />
            <SeverityBadge label={'MED'} count={mediumCount} color={colors.warning} />
            <SeverityBadge label={'LOW'} count={lowCount} color={colors.info} />
          </Box>

          {/* Messages */}
          <Box flexGrow={1} flexDirection="column" paddingX={1}>
            {!reviewStarted || messages.length === 0 ? (
              <Box padding={2} alignItems="center" justifyContent="center">
                <Text dimColor>{'Initializing security review...'}</Text>
              </Box>
            ) : null}
            {messages.map((msg: any) => {
              if (msg.role === 'error') {
                const text = msg.parts.find((p: any) => p.type === 'text')?.text || 'Unknown error';
                return <ErrorMessage key={msg.id} message={text} />;
              }
              if (msg.role === 'user') {
                const text = msg.parts.find((p: any) => p.type === 'text')?.text || '';
                if (text.startsWith('You are performing a CodeRabbit-style')) return null;
                return <UserMessage key={msg.id} message={text} mode={msg.mode || mode} />;
              }
              if (msg.role === 'assistant') {
                return <BotMessage key={msg.id} parts={msg.parts} model={msg.model || model} />;
              }
              return null;
            })}
          </Box>

          {/* Follow-up input */}
          <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} paddingTop={1}>
            <InputBar
              onSubmit={submit}
              placeholder={'Ask a follow-up security question...'}
              disabled={isLoading}
              mode={mode}
              onModeToggle={toggleMode}
            />
          </Box>
        </Box>
      </Box>

      <StatusBar mode={mode} />
    </Box>
  );
}
