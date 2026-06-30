import React, { useCallback, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';

type LogEntry = {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
};

let _logBuffer: LogEntry[] = [];
const MAX_BUFFER = 500;

export function appendLog(level: LogEntry['level'], message: string) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString().slice(11, 23),
    level,
    message,
  };
  _logBuffer.push(entry);
  if (_logBuffer.length > MAX_BUFFER) _logBuffer.splice(0, _logBuffer.length - MAX_BUFFER);
}

export function getLogs(level?: LogEntry['level']): LogEntry[] {
  if (!level) return [..._logBuffer];
  return _logBuffer.filter(l => l.level === level);
}

export function clearLogs() {
  _logBuffer = [];
}

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info: 'info',
  warn: 'warning',
  error: 'error',
  debug: 'dimSeparator',
};

const LEVEL_BADGE: Record<LogEntry['level'], string> = {
  info: 'ℹ',
  warn: '⚠',
  error: '✗',
  debug: '·',
};

export function LogViewer() {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');
  const [scroll, setScroll] = useState(0);

  const logs = filter === 'all' ? _logBuffer : _logBuffer.filter(l => l.level === filter);
  const visible = logs.slice(-30 - scroll);

  useInput((input, key) => {
    if (key.escape) { close(); return; }
    if (key.upArrow) { setScroll(s => Math.min(s + 1, Math.max(0, logs.length - 30))); return; }
    if (key.downArrow) { setScroll(s => Math.max(0, s - 1)); return; }
    if (key.return) { setFilter(f => f === 'all' ? 'error' : f === 'error' ? 'warn' : f === 'warn' ? 'info' : f === 'info' ? 'debug' : 'all'); return; }
    if (input === 'c') { clearLogs(); return; }
  });

  const errorCount = _logBuffer.filter(l => l.level === 'error').length;
  const warnCount = _logBuffer.filter(l => l.level === 'warn').length;

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Box flexDirection="row" gap={2}>
        <Text bold>Session Logs</Text>
        <Text dimColor>|</Text>
        <Text color={colors.info}>{`${_logBuffer.length} entries`}</Text>
        {errorCount > 0 && <Text color={colors.error}>{`${errorCount} errors`}</Text>}
        {warnCount > 0 && <Text color={colors.warning}>{`${warnCount} warnings`}</Text>}
        <Text dimColor>|</Text>
        <Text color={colors.primary}>Filter: {filter}</Text>
        <Text dimColor>|</Text>
        <Text dimColor>Enter cycle filter | C clear | Esc close</Text>
      </Box>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={colors.dimSeparator}
        paddingX={1}
        maxHeight={25}
      >
        {visible.length === 0 ? (
          <Text dimColor>No log entries yet.</Text>
        ) : visible.map((entry, i) => (
          <Box key={`${entry.timestamp}-${i}`} flexDirection="row" gap={1}>
            <Text dimColor>{entry.timestamp}</Text>
            <Text color={(colors as any)[LEVEL_COLORS[entry.level]]}>
              {LEVEL_BADGE[entry.level]}
            </Text>
            <Text>{entry.message}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
