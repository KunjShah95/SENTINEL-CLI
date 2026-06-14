import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';
import { useTheme } from '../../providers/theme/index.js';

type ToolCall = {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
};

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

type Props = {
  parts: MessagePart[];
  model?: string;
  duration?: number;
};

function PendingSpinner() {
  const { colors } = useTheme();
  return <Text color={colors.info}><InkSpinner type="dots" /></Text>;
}

function ReasoningBlock({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Box width="100%" flexDirection="column" paddingY={1}>
      <Box borderStyle="single" borderColor={colors.thinkingBorder} paddingX={2} paddingY={1} width="100%">
        <Text dimColor color={colors.thinking}>{text}</Text>
      </Box>
    </Box>
  );
}

function ToolCallBlock({ part }: { part: MessagePart }) {
  const { colors } = useTheme();

  if (part.toolCall) {
    return (
      <Box width="100%" paddingY={1}>
        <Box borderStyle="single" borderColor={colors.info} paddingX={2} paddingY={1} flexDirection="column" width="100%">
          <Text color={colors.info}>{`⚙ ${part.toolCall.name}`}</Text>
          {part.toolCall.args ? (
            <Text dimColor>{JSON.stringify(part.toolCall.args, null, 2)}</Text>
          ) : null}
          {part.toolCall.result ? (
            <Text dimColor color={colors.success}>{'✓ Done'}</Text>
          ) : null}
        </Box>
      </Box>
    );
  }

  const isPending = part.state === 'pending';
  const isDone = part.state === 'output-available';
  const isError = part.state === 'output-error';

  return (
    <Box width="100%" paddingY={1}>
      <Box
        borderStyle="single"
        borderColor={isError ? colors.error : colors.info}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        width="100%"
      >
        <Box flexDirection="row" gap={1}>
          {isPending ? <PendingSpinner /> : <Text color={colors.info}>{'⚙'}</Text>}
          <Text color={isError ? colors.error : colors.info}>{part.toolName || 'tool'}</Text>
        </Box>
        {part.input !== undefined ? (
          <Text dimColor>{JSON.stringify(part.input, null, 2)}</Text>
        ) : null}
        {isPending ? <Text dimColor>{'(running...)'}</Text> : null}
        {isDone && part.output !== undefined ? (
          <Text dimColor>{JSON.stringify(part.output).slice(0, 500)}</Text>
        ) : null}
        {isDone ? <Text dimColor color={colors.success}>{'Done'}</Text> : null}
        {isError && part.errorText ? (
          <Text dimColor color={colors.error}>{`Error: ${part.errorText}`}</Text>
        ) : null}
      </Box>
    </Box>
  );
}

export function BotMessage({ parts, model, duration }: Props) {
  const { colors } = useTheme();
  if (parts.length === 0) return null;

  const grouped = parts.reduce<MessagePart[][]>((acc, part) => {
    const last = acc[acc.length - 1];
    if (last && last[0].type === part.type) {
      last.push(part);
    } else {
      acc.push([part]);
    }
    return acc;
  }, []);

  return (
    <Box width="100%" flexDirection="column" paddingY={1}>
      {grouped.map((group, gi) => {
        const type = group[0].type;
        if (type === 'reasoning') {
          return <ReasoningBlock key={gi} text={group.map(p => p.text).join('')} />;
        }
        if (type === 'tool-call') {
          return (
            <Box key={gi} flexDirection="column">
              {group.map((p, pi) => <ToolCallBlock key={pi} part={p} />)}
            </Box>
          );
        }
        return (
          <Box key={gi} paddingX={1}>
            <Text>{group.map(p => p.text).join('')}</Text>
          </Box>
        );
      })}
      {(model || duration) ? (
        <Box flexDirection="row" gap={1} paddingX={1} paddingTop={1}>
          {model ? <Text dimColor color={colors.info}>{model}</Text> : null}
          {duration ? <Text dimColor color={colors.dimSeparator}>{`${duration}ms`}</Text> : null}
        </Box>
      ) : null}
    </Box>
  );
}
