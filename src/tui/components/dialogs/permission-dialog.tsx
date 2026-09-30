import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { useDialog } from '../../providers/dialog/index.js';
import { toolView } from '../oc/tool-display.js';

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

const MAX_PREVIEW = 12;

/** Lines to preview under the headline: a mini diff for edits, content head for writes. */
export function permissionPreview(toolName: string, input: Record<string, unknown>): Array<{ sign: ' ' | '+' | '-'; text: string }> {
  const lines = (s: unknown) => String(s ?? '').replace(/\r/g, '').split('\n');
  const cap = <T,>(xs: T[], n: number) => (xs.length > n ? xs.slice(0, n) : xs);
  if (toolName === 'editFile') {
    return [
      ...cap(lines(input.oldString), MAX_PREVIEW / 2).map((text) => ({ sign: '-' as const, text })),
      ...cap(lines(input.newString), MAX_PREVIEW / 2).map((text) => ({ sign: '+' as const, text })),
    ];
  }
  if (toolName === 'batchEdit' && Array.isArray(input.operations)) {
    return (input.operations as Array<Record<string, unknown>>).slice(0, 3).flatMap((op) => [
      { sign: ' ' as const, text: `${op.filePath}` },
      ...cap(lines(op.oldString), 2).map((text) => ({ sign: '-' as const, text })),
      ...cap(lines(op.newString), 2).map((text) => ({ sign: '+' as const, text })),
    ]);
  }
  if (toolName === 'writeFile') {
    const all = lines(input.content);
    const shown: Array<{ sign: ' ' | '+' | '-'; text: string }> = cap(all, MAX_PREVIEW).map((text) => ({ sign: '+' as const, text }));
    if (all.length > MAX_PREVIEW) shown.push({ sign: ' ', text: `… ${all.length - MAX_PREVIEW} more line(s)` });
    return shown;
  }
  if (toolName === 'applyPatch') {
    return cap(lines(input.patch).filter((l) => /^[+-](?![+-]{2})/.test(l)), MAX_PREVIEW)
      .map((l) => ({ sign: l[0] as '+' | '-', text: l.slice(1) }));
  }
  return [];
}

/**
 * opencode-style permission prompt: "△ Permission required", the call as
 * its inline tool row, what it will change, and Allow once / Allow always /
 * Reject. Keys: ←/→ + enter, or y / a / n (esc = reject).
 */
export function PermissionDialog({ request, onResult }: PermissionDialogProps) {
  const { colors } = useTheme();
  const { close } = useDialog();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const options: Array<{ key: PermissionResult; label: string; hotkey: string }> = [
    { key: 'allow', label: 'Allow once', hotkey: 'y' },
    { key: 'allow-session', label: 'Allow always', hotkey: 'a' },
    { key: 'deny', label: 'Reject', hotkey: 'n' },
  ];
  const input = (request.input && typeof request.input === 'object' ? request.input : {}) as Record<string, unknown>;
  const risk = typeof input.__risk === 'string' ? input.__risk : '';
  const view = toolView(request.toolName, input);
  const preview = permissionPreview(request.toolName, input);
  const isShell = view.kind === 'block' && view.icon === '$';

  const handleResult = useCallback((result: PermissionResult) => {
    onResult(result);
    close();
  }, [onResult, close]);

  useInput((ch, key) => {
    if (key.leftArrow) setSelectedIdx((i) => Math.max(0, i - 1));
    else if (key.rightArrow || key.tab) setSelectedIdx((i) => Math.min(options.length - 1, i + 1));
    else if (key.return) handleResult(options[selectedIdx].key);
    else if (key.escape) handleResult('deny');
    else {
      const hit = options.find((o) => o.hotkey === ch?.toLowerCase());
      if (hit) handleResult(hit.key);
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <Text>
        <Text color={colors.warning}>{'△ '}</Text>
        <Text color={colors.text} bold>Permission required</Text>
      </Text>
      <Box marginTop={1} flexDirection="row">
        <Box width={2} flexShrink={0}><Text color={colors.warning}>{view.icon}</Text></Box>
        <Text color={colors.text} wrap="wrap">{isShell ? String(input.command ?? '') : view.label}</Text>
      </Box>
      {isShell && input.description ? (
        <Box paddingLeft={2}><Text color={colors.textMuted}>{String(input.description)}</Text></Box>
      ) : null}
      {preview.length ? (
        <Box flexDirection="column" marginTop={1} paddingLeft={2} backgroundColor={colors.backgroundPanel}>
          {preview.map((l, i) => (
            <Text
              key={i}
              color={l.sign === '+' ? colors.diffAdded : l.sign === '-' ? colors.diffRemoved : colors.textMuted}
              wrap="truncate-end"
            >
              {`${l.sign} ${l.text}`}
            </Text>
          ))}
        </Box>
      ) : null}
      {risk ? (
        <Box marginTop={1} paddingLeft={2}><Text color={colors.warning} wrap="wrap">{risk}</Text></Box>
      ) : null}
      <Box flexDirection="row" gap={1} marginTop={1}>
        {options.map((opt, i) => {
          const sel = i === selectedIdx;
          const tone = opt.key === 'deny' ? colors.error : opt.key === 'allow-session' ? colors.accent : colors.primary;
          return (
            <Text key={opt.key} backgroundColor={sel ? tone : colors.backgroundElement} color={sel ? colors.background : colors.text} bold={sel}>
              {` ${opt.label} `}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={colors.textMuted}>
          <Text color={colors.text}>←→</Text>{' select  '}
          <Text color={colors.text}>enter</Text>{' confirm  '}
          <Text color={colors.text}>y</Text>{'/'}<Text color={colors.text}>a</Text>{'/'}<Text color={colors.text}>n</Text>{' once/always/reject  '}
          <Text color={colors.text}>esc</Text>{' reject'}
        </Text>
      </Box>
    </Box>
  );
}

export function usePermission() {
  const dialog = useDialog();

  const requestPermission = useCallback(async (req: PermissionRequest): Promise<PermissionResult> => {
    return new Promise((resolve) => {
      dialog.open({
        title: 'Permission',
        closeOnEscape: false, // its own Esc handler resolves the promise as 'deny'
        width: 84,
        height: 24,
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
