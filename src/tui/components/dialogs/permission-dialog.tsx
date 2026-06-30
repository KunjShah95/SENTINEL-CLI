import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';

export type PermissionRequest = {
  toolName: string;
  toolCallId: string;
  input: unknown;
};

export type PermissionResult = 'allow' | 'deny' | 'allow-session';

type PermissionDialogProps = {
  request: PermissionRequest;
  onResult: (result: PermissionResult) => void;
};

const DANGEROUS_TOOLS = new Set(['bash', 'writeFile', 'editFile', 'batchEdit']);

export function PermissionDialog({ request, onResult }: PermissionDialogProps) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const options: Array<{ key: PermissionResult; label: string; color: string }> = [
    { key: 'allow', label: 'Allow', color: colors.success },
    { key: 'deny', label: 'Deny', color: colors.error },
    { key: 'allow-session', label: 'Allow for session', color: colors.info },
  ];
  const isDangerous = DANGEROUS_TOOLS.has(request.toolName);

  const handleResult = useCallback((result: PermissionResult) => {
    onResult(result);
    close();
  }, [onResult, close]);

  useInput((_input, key) => {
    if (key.leftArrow) setSelectedIdx(i => Math.max(0, i - 1));
    if (key.rightArrow) setSelectedIdx(i => Math.min(options.length - 1, i + 1));
    if (key.return) handleResult(options[selectedIdx].key);
    if (key.escape) handleResult('deny');
  });

  const inputStr = typeof request.input === 'object' ? JSON.stringify(request.input, null, 2).slice(0, 2000) : String(request.input).slice(0, 2000);

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text bold>
        <Text color={isDangerous ? colors.error : colors.warning}>
          {isDangerous ? '⚠ ' : '🔧 '}
        </Text>
        Tool Permission Request
      </Text>
      <Box flexDirection="column" gap={0}>
        <Text dimColor>Tool:</Text>
        <Text color={isDangerous ? colors.error : colors.primary} bold>{request.toolName}</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text dimColor>Input:</Text>
        <Box
          borderStyle="single"
          borderColor={colors.dimSeparator}
          paddingX={1}
        >
          <Text>{inputStr}</Text>
        </Box>
      </Box>
      {isDangerous && (
        <Text color={colors.error}>This tool can modify files or execute commands — review carefully.</Text>
      )}
      <Box flexDirection="row" gap={2} justifyContent="center">
        {options.map((opt, i) => (
          <Box
            key={opt.key}
            borderStyle={i === selectedIdx ? 'bold' : 'single'}
            borderColor={i === selectedIdx ? opt.color : colors.dimSeparator}
            paddingX={1}
          >
            <Text color={i === selectedIdx ? opt.color : colors.dimSeparator} bold={i === selectedIdx}>
              {i === selectedIdx ? '>' : ' '} {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>← → navigate  Enter confirm  Esc deny</Text>
    </Box>
  );
}

export function usePermission() {
  const dialog = useDialog();

  const requestPermission = useCallback(async (req: PermissionRequest): Promise<PermissionResult> => {
    return new Promise((resolve) => {
      dialog.open({
        title: 'Permission Required',
        width: 80,
        height: 20,
        children: (
          <PermissionDialog
            request={req}
            onResult={(result) => resolve(result)}
          />
        ),
      });
    });
  }, [dialog]);

  return { requestPermission };
}
