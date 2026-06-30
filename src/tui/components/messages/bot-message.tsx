import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
import { useTheme } from '../../providers/theme/index.js';

type ToolCall = { name: string; args?: Record<string, unknown>; result?: string };
type MessagePart = {
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-result';
  text?: string;
  toolCall?: ToolCall;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  state?: 'pending' | 'output-available' | 'output-error';
  output?: unknown;
  errorText?: string;
};
type Props = { parts: MessagePart[]; model?: string; duration?: number; showThinking?: boolean; showDetails?: boolean };

function ToolRow({ part }: { part: MessagePart }) {
  const { colors } = useTheme();

  if (part.toolCall) {
    const done = !!part.toolCall.result;
    return (
      <Box flexDirection="column" paddingLeft={4} marginY={0}>
        <Box flexDirection="row" gap={1}>
          <Text color={colors.dimSeparator}>{'↳'}</Text>
          <Text color={colors.info}>{part.toolCall.name}</Text>
          {part.toolCall.args
            ? <Text dimColor>{Object.values(part.toolCall.args).slice(0, 2).map(String).join(' ')}</Text>
            : null}
          {done
            ? <Text color={colors.success}>{'✓'}</Text>
            : <Text color={colors.info}><InkSpinner type="dots" /></Text>}
        </Box>
        {done && part.toolCall.result
          ? <Box paddingLeft={3}><Text dimColor>{String(part.toolCall.result).slice(0, 200)}</Text></Box>
          : null}
      </Box>
    );
  }

  const isPending = part.state === 'pending';
  const isDone    = part.state === 'output-available';
  const isError   = part.state === 'output-error';
  const name      = part.toolName || 'tool';
  const inputStr  = part.input
    ? (typeof part.input === 'string' ? part.input : JSON.stringify(part.input)).slice(0, 120)
    : '';
  const outputStr = isDone && part.output !== undefined
    ? (typeof part.output === 'string' ? part.output : JSON.stringify(part.output)).slice(0, 300)
    : '';

  return (
    <Box flexDirection="column" paddingLeft={4} marginY={0}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color={colors.dimSeparator}>{'↳'}</Text>
        <Text color={colors.info}>{name}</Text>
        {inputStr ? <Text dimColor>{inputStr}</Text> : null}
        {isPending ? <Text color={colors.info}><InkSpinner type="dots" /></Text> : null}
        {isDone    ? <Text color={colors.success}>{'✓'}</Text> : null}
        {isError   ? <Text color={colors.error}>{'✗'}</Text>  : null}
      </Box>
      {outputStr ? <Box paddingLeft={3}><Text dimColor>{outputStr}</Text></Box> : null}
      {isError && part.errorText
        ? <Box paddingLeft={3}><Text color={colors.error}>{part.errorText}</Text></Box>
        : null}
    </Box>
  );
}

function ReasoningRow({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Box paddingLeft={4} marginY={0}>
      <Box flexDirection="row" gap={1}>
        <Text color={colors.dimSeparator}>{'⊹'}</Text>
        <Text dimColor color={colors.thinking}>{text.trim()}</Text>
      </Box>
    </Box>
  );
}

function renderLine(line: string, colors: Record<string, string>, key: number) {
  if (!line.trim()) return <Text key={key}>{''}</Text>;

  if (line.startsWith('```'))
    return <Box key={key} paddingLeft={3}><Text dimColor>{line}</Text></Box>;

  const headingM = line.match(/^(#{1,3})\s+(.+)/);
  if (headingM)
    return <Box key={key} marginTop={1} paddingLeft={2}><Text bold color={colors.primary}>{headingM[2]}</Text></Box>;

  const bulletM = line.match(/^(\s*[-*•])\s+(.+)/);
  if (bulletM)
    return (
      <Box key={key} flexDirection="row" gap={1} paddingLeft={4}>
        <Text color={colors.dimSeparator}>{'•'}</Text>
        <Text>{bulletM[2]}</Text>
      </Box>
    );

  if (/^🔴/.test(line)) return <Box key={key} paddingLeft={2}><Text bold color={colors.critical}>{line}</Text></Box>;
  if (/^🟠/.test(line)) return <Box key={key} paddingLeft={2}><Text bold color={colors.error}>{line}</Text></Box>;
  if (/^🟡/.test(line)) return <Box key={key} paddingLeft={2}><Text bold color={colors.warning}>{line}</Text></Box>;
  if (/^🟢/.test(line)) return <Box key={key} paddingLeft={2}><Text bold color={colors.success}>{line}</Text></Box>;
  if (/^(Score|Grade|Security Score):/i.test(line))
    return <Box key={key} paddingLeft={2}><Text bold color={colors.info}>{line}</Text></Box>;

  return <Box key={key} paddingLeft={2}><Text>{line}</Text></Box>;
}

export function BotMessage({ parts, model, duration, showThinking = true, showDetails = true }: Props) {
  const { colors } = useTheme();
  if (parts.length === 0) return null;

  const filtered = parts.filter(p => {
    if (!showThinking && p.type === 'reasoning') return false;
    if (!showDetails && (p.type === 'tool-call' || p.type === 'tool-result')) return false;
    return true;
  });

  const shortModel = model
    ? model.replace('claude-', '').replace('gpt-4', 'gpt4').replace('-latest', '')
    : null;

  if (filtered.length === 0) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box paddingLeft={2}><Text bold color={colors.primary}>{'Sentinel'}</Text></Box>
        <Box paddingLeft={2}><Text dimColor>{'[content filtered — use /thinking or /details to toggle]'}</Text></Box>
      </Box>
    );
  }

  const groups = filtered.reduce<MessagePart[][]>((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last[0].type === p.type) { last.push(p); } else { acc.push([p]); }
    return acc;
  }, []);

  return (
    <Box flexDirection="column" marginY={1}>
      <Box flexDirection="row" gap={1} paddingLeft={2} marginBottom={1}>
        <Text bold color={colors.primary}>{'Sentinel'}</Text>
        {shortModel ? <Text dimColor>{shortModel}</Text> : null}
        {duration ? <Text dimColor>{`${(duration / 1000).toFixed(1)}s`}</Text> : null}
      </Box>

      {groups.map((group, gi) => {
        const type = group[0].type;

        if (type === 'reasoning') {
          const text = group.map(p => p.text ?? '').join('');
          return <ReasoningRow key={gi} text={text} />;
        }

        if (type === 'tool-call') {
          return (
            <Box key={gi} flexDirection="column">
              {group.map((p, pi) => <ToolRow key={pi} part={p} />)}
            </Box>
          );
        }

        const text = group.map(p => p.text ?? '').join('');
        if (!text.trim()) return null;
        const lines = text.split('\n');
        return (
          <Box key={gi} flexDirection="column">
            {lines.map((line, li) => renderLine(line, colors as any, li))}
          </Box>
        );
      })}
    </Box>
  );
}
