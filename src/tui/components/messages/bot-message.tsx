import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../providers/theme/index.js';
import { modeColor } from '../../theme.js';
import { InlineTool, BlockTool, formatDuration, shortModelName, titlecase, type ToolState } from '../oc/primitives.js';
import { toolView } from '../oc/tool-display.js';
import { Markdown } from '../oc/markdown.js';

type MessagePart = {
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-result';
  text?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  state?: ToolState;
  output?: unknown;
  errorText?: string;
};

type Props = {
  parts: MessagePart[];
  model?: string;
  mode?: string;
  duration?: number;
  /** Turn finished: show the "▣ Build · model · 3.2s" footer. */
  done?: boolean;
  interrupted?: boolean;
  showThinking?: boolean;
  showDetails?: boolean;
};

function isDenied(err?: string) {
  return !!err && /denied permission|User denied|rejected/i.test(err);
}

function ToolPart({ part, showDetails }: { part: MessagePart; showDetails: boolean }) {
  const { colors } = useTheme();
  const view = toolView(part.toolName || 'tool', part.input, part.output);
  const failed = part.state === 'output-error';
  if (view.kind === 'block' && showDetails && part.state !== 'pending') {
    return (
      <BlockTool title={view.title} failed={failed}>
        {view.body.map((line, i) => (
          <Text key={i} color={i === 0 && line.startsWith('$ ') ? colors.text : colors.textMuted} wrap="truncate-end">{line}</Text>
        ))}
        {failed && part.errorText ? <Text color={colors.error} wrap="wrap">{part.errorText}</Text> : null}
      </BlockTool>
    );
  }
  return (
    <InlineTool
      icon={view.icon}
      state={part.state}
      pending={view.pending}
      error={part.errorText}
      denied={isDenied(part.errorText)}
    >
      {view.label}
    </InlineTool>
  );
}

/** opencode ReasoningPart in "hide" mode: one muted line, never shifts layout. */
function ReasoningPart({ text, expanded }: { text: string; expanded: boolean }) {
  const { colors } = useTheme();
  const clean = text.replace('[REDACTED]', '').trim();
  if (!clean) return null;
  // Harness notices (✉ / ⏳ / goal) arrive as reasoning parts too.
  const notice = /^(✉|⏳|⇄|⚖|✓ goal|✗ goal|… goal)/.test(clean);
  if (notice) {
    return (
      <Box paddingLeft={3} marginTop={1} flexDirection="column">
        {clean.split('\n').map((l, i) => <Text key={i} color={colors.accent}>{l}</Text>)}
      </Box>
    );
  }
  const firstLine = clean.split('\n').find((l) => l.trim()) || '';
  return (
    <Box paddingLeft={3} marginTop={1} flexDirection="column">
      <Text color={colors.textMuted} italic wrap="truncate-end">
        <Text color={colors.textMuted}>{'Thinking: '}</Text>
        {expanded ? '' : firstLine.slice(0, 120)}
      </Text>
      {expanded ? <Box paddingLeft={2}><Text color={colors.textMuted} wrap="wrap">{clean}</Text></Box> : null}
    </Box>
  );
}

/**
 * opencode AssistantMessage: parts in order — text (markdown, indented 3),
 * reasoning (one muted line), tools (inline rows or blocks) — then the
 * "▣ Mode · model · duration" footer once the turn completes.
 */
export function BotMessage({ parts, model, mode = 'BUILD', duration, done = true, interrupted, showThinking = true, showDetails = true }: Props) {
  const { colors } = useTheme();
  if (parts.length === 0) return null;
  const { name } = shortModelName(model);
  const visible = parts.filter((p) => showDetails || (p.type !== 'tool-call' && p.type !== 'tool-result'));

  // Merge consecutive text/reasoning parts (streaming emits many deltas).
  const merged: MessagePart[] = [];
  for (const p of visible) {
    const last = merged[merged.length - 1];
    if (last && (p.type === 'text' || p.type === 'reasoning') && last.type === p.type) {
      merged[merged.length - 1] = { ...last, text: (last.text ?? '') + (p.text ?? '') };
    } else merged.push(p);
  }

  let prevWasInline = false;
  return (
    <Box flexDirection="column">
      {merged.map((p, i) => {
        if (p.type === 'text') {
          prevWasInline = false;
          if (!p.text?.trim()) return null;
          return <Box key={i} paddingLeft={3} marginTop={1}><Markdown text={p.text} /></Box>;
        }
        if (p.type === 'reasoning') {
          prevWasInline = false;
          return <ReasoningPart key={i} text={p.text ?? ''} expanded={showThinking} />;
        }
        if (p.type === 'tool-call') {
          const view = toolView(p.toolName || 'tool', p.input, p.output);
          const block = view.kind === 'block' && showDetails && p.state !== 'pending';
          // opencode: consecutive one-line tools stack without gaps.
          const margin = block || !prevWasInline ? 1 : 0;
          prevWasInline = !block;
          return <Box key={i} marginTop={block ? 0 : margin}><ToolPart part={p} showDetails={showDetails} /></Box>;
        }
        return null;
      })}
      {done ? (
        <Box paddingLeft={3} marginTop={1}>
          <Text>
            <Text color={interrupted ? colors.textMuted : modeColor(colors, mode)}>{'▣ '}</Text>
            <Text color={colors.text}>{titlecase(mode)}</Text>
            {name ? <Text color={colors.textMuted}>{` · ${name}`}</Text> : null}
            {duration ? <Text color={colors.textMuted}>{` · ${formatDuration(duration)}`}</Text> : null}
            {interrupted ? <Text color={colors.textMuted}>{' · interrupted'}</Text> : null}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
