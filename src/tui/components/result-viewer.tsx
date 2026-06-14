import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';

type Issue = {
  file?: string;
  line?: number | null;
  severity?: string;
  type?: string;
  title?: string;
  message?: string;
  suggestion?: string;
  confidence?: number;
  tags?: string[];
};

type Props = {
  issues: Issue[];
  title?: string;
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#60A5FA',
  info: '#88C0D0',
};

const SEVERITY_ICONS: Record<string, string> = {
  critical: '☢',
  high: '⚠',
  medium: '●',
  low: '↓',
  info: 'ℹ',
};

function IssueCard({ issue, icon, color }: { issue: Issue; icon: string; color: string }) {
  const { colors } = useTheme();
  return (
    <Box flexDirection="column" paddingY={0}>
      <Box flexDirection="row" gap={1}>
        <Text color={color}>{icon}</Text>
        <Text bold color={color}>{issue.title || 'Issue'}</Text>
        {issue.line ? <Text dimColor color={colors.dimSeparator}>{`:${issue.line}`}</Text> : null}
        {issue.confidence ? (
          <Text dimColor color={colors.dimSeparator}>{`${Math.round(issue.confidence * 100)}%`}</Text>
        ) : null}
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>{issue.message || ''}</Text>
      </Box>
      {issue.file ? (
        <Box paddingLeft={2}>
          <Text dimColor color={colors.info}>{`→ ${issue.file}`}</Text>
        </Box>
      ) : null}
      {issue.suggestion ? (
        <Box paddingLeft={2}>
          <Text dimColor color={colors.success}>{`✓ ${issue.suggestion}`}</Text>
        </Box>
      ) : null}
      {issue.tags && issue.tags.length > 0 ? (
        <Box paddingLeft={2} flexDirection="row" gap={1}>
          {issue.tags.slice(0, 4).map(t => (
            <Text key={t} dimColor color={colors.dimSeparator}>{`#${t}`}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

export function ResultViewer({ issues, title }: Props) {
  const { colors } = useTheme();
  if (!issues || issues.length === 0) {
    return (
      <Box padding={2}>
        <Text color={colors.success}>{'✓ No issues found.'}</Text>
      </Box>
    );
  }

  const grouped: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const sev = issue.severity || 'info';
    if (!grouped[sev]) grouped[sev] = [];
    grouped[sev].push(issue);
  }

  const sevOrder = ['critical', 'high', 'medium', 'low', 'info'];
  const sorted = sevOrder.filter(s => grouped[s]);

  return (
    <Box flexDirection="column" width="100%" paddingY={1} gap={1}>
      {title ? <Text bold color={colors.primary}>{title}</Text> : null}
      <Text dimColor>{`${issues.length} issue${issues.length !== 1 ? 's' : ''} found`}</Text>
      {sorted.map(sev => {
        const items = grouped[sev];
        const color = SEVERITY_COLORS[sev] || colors.info;
        const icon = SEVERITY_ICONS[sev] || '●';
        return (
          <Box key={sev} flexDirection="column" width="100%">
            <Box paddingY={0} flexDirection="row" gap={1}>
              <Text bold color={color}>{`${icon} ${sev.toUpperCase()}`}</Text>
              <Text dimColor>{String(items.length)}</Text>
            </Box>
            {items.map((issue, i) => (
              <IssueCard key={i} issue={issue} icon={icon} color={color} />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
