import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Sessions } from '../lib/api-client.js';
import { useTheme } from '../providers/theme/index.js';

type SessionPanelProps = {
  currentSessionId?: string;
  onSelect: (sessionId: string) => void;
  onFork: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onClose: () => void;
};

type SessionItem = {
  id: string;
  title: string;
  createdAt: string;
  mode: string;
  model: string;
};

function relativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'yesterday';
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

function getModeColor(mode: string, colors: Record<string, string>): string {
  switch (mode) {
    case 'BUILD': return colors.success;
    case 'PLAN': return colors.planMode;
    case 'SCAN': return colors.info;
    case 'FIX': return colors.error;
    case 'REVIEW': return colors.critical;
    default: return colors.dimSeparator;
  }
}

export function SessionPanel({ currentSessionId, onSelect, onFork, onDelete, onClose }: SessionPanelProps) {
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await Sessions.list();
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(list);
      setSelectedIndex(prev => Math.min(prev, Math.max(0, list.length - 1)));
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await Sessions.delete(id);
      onDelete(id);
      await loadSessions();
    } catch {}
  }, [loadSessions, onDelete]);

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) { setSelectedIndex(prev => Math.max(0, prev - 1)); return; }
    if (key.downArrow) { setSelectedIndex(prev => Math.min(sessions.length - 1, prev + 1)); return; }
    if (key.return) {
      const session = sessions[selectedIndex];
      if (session) onSelect(session.id);
      return;
    }
    if (input === 'd') {
      const session = sessions[selectedIndex];
      if (session) handleDelete(session.id);
      return;
    }
    if (input === 'f') {
      const session = sessions[selectedIndex];
      if (session) onFork(session.id);
      return;
    }
    if (input === 'n') { onClose(); return; }
  });

  return (
    <Box flexDirection="column" width={28} borderStyle="single" borderColor={colors.dimSeparator}>
      <Box paddingX={1} paddingY={0}>
        <Text bold color={colors.primary}>{'Sessions'}</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {loading ? (
          <Box paddingX={1}><Text dimColor>{'Loading...'}</Text></Box>
        ) : sessions.length === 0 ? (
          <Box paddingX={1}><Text dimColor>{'No sessions yet'}</Text></Box>
        ) : (
          sessions.map((session, i) => {
            const isSelected = i === selectedIndex;
            const isActive = session.id === currentSessionId;
            return (
              <Box key={session.id} flexDirection="column" paddingX={1}>
                <Text
                  bold={isActive || isSelected}
                  color={isActive ? colors.primary : isSelected ? colors.selection : undefined}
                >
                  {`${isSelected ? '> ' : '  '}${truncate(session.title, 22)}`}
                </Text>
                <Box flexDirection="row" gap={1} paddingLeft={2}>
                  <Text dimColor color={getModeColor(session.mode, colors)}>{session.mode}</Text>
                  <Text dimColor color={colors.dimSeparator}>{relativeDate(session.createdAt)}</Text>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      <Box paddingX={1}>
        <Text color={colors.primary}>{'+ New Session'}</Text>
      </Box>
      <Box paddingX={1} paddingBottom={0}>
        <Text dimColor color={colors.dimSeparator}>{'↑↓ nav  Enter sel  f fork  d del  Esc close'}</Text>
      </Box>
    </Box>
  );
}
