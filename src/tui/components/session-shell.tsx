import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, useInput } from 'ink';
import { InputBar } from './input-bar.js';
import { TranscriptViewport } from './transcript-viewport.js';
import { ActivityLine, Footer, TodoPanel, useTodos, type ActivityPhase } from './oc/chrome.js';

type Mode = 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
type Props = {
  children: ReactNode;
  onSubmit: (value: string) => void;
  onShellCommand?: (command: string) => void;
  inputDisabled?: boolean;
  loading?: boolean;
  mode?: Mode;
  model?: string;
  statusText?: string;
  sessionId?: string;
  tokenUsage?: { estimated: number; limit: number; percentage: number };
  compacting?: boolean;
  serverStatus?: 'connected' | 'local';
  costUsd?: number;
  microcompactSaved?: number;
  showThinking?: boolean;
  showDetails?: boolean;
  onStop?: () => void;
  /** Characters streamed this turn (drives the tok/s estimate). */
  streamedChars?: number;
  /** Loop is blocked on background work / teammates. */
  waiting?: boolean;
  /** A dialog or the command palette is open: Esc belongs to the modal. */
  modalOpen?: boolean;
  /** Lines the transcript is scrolled up from the live edge. 0 = following. */
  scrollFromBottom?: number;
  onMaxScroll?: (max: number) => void;
  onViewportRows?: (rows: number) => void;
  /** Called when the user sends a message, to return to the live edge. */
  onSubmitScrollReset?: () => void;
};

/** Poll team + background counts from the in-process harness while busy. */
function useHarnessCounts(active: boolean) {
  const [counts, setCounts] = useState({ teammates: 0, background: 0 });
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [{ listTeam }, { listBackground }] = await Promise.all([
          import('../../agent/team.js'),
          import('../../agent/background.js'),
        ]);
        const teammates = listTeam().filter((m: { status: string }) => m.status === 'running').length;
        const background = listBackground().filter((t: { status: string }) => t.status === 'running').length;
        // Keep the previous object when nothing moved: this polls forever, and a
        // fresh object every tick re-rendered the whole session (and therefore
        // repainted the screen) on a timer, even with an idle prompt.
        if (!cancelled) {
          setCounts((prev) =>
            prev.teammates === teammates && prev.background === background
              ? prev
              : { teammates, background }
          );
        }
      } catch { /* harness modules unavailable */ }
    };
    load();
    const t = setInterval(load, active ? 1000 : 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [active]);
  return counts;
}

/**
 * Session layout, opencode-style: transcript, (todo panel), activity line,
 * prompt box, footer. No header row — the prompt carries mode + model and
 * the footer carries directory, context meter and cost.
 */
export function SessionShell({
  children,
  onSubmit,
  onShellCommand,
  inputDisabled = false,
  loading = false,
  mode = 'BUILD',
  model,
  tokenUsage,
  microcompactSaved,
  compacting,
  costUsd,
  onStop,
  streamedChars = 0,
  waiting = false,
  modalOpen = false,
  scrollFromBottom = 0,
  onMaxScroll,
  onViewportRows,
  onSubmitScrollReset,
}: Props) {
  useInput((_input, key) => {
    if (key.escape && loading && onStop) onStop();
  }, { isActive: !modalOpen });

  const submitAndReset = useCallback((value: string) => {
    onSubmitScrollReset?.();
    onSubmit(value);
  }, [onSubmit, onSubmitScrollReset]);

  const startedAt = useRef<number | undefined>(undefined);
  if (loading && startedAt.current === undefined) startedAt.current = Date.now();
  if (!loading) startedAt.current = undefined;

  const todos = useTodos(loading);
  const { teammates, background } = useHarnessCounts(loading);
  const phase: ActivityPhase = compacting ? 'compacting' : waiting ? 'waiting' : loading ? 'running' : 'idle';
  const ratio = tokenUsage && tokenUsage.limit > 0 ? tokenUsage.estimated / tokenUsage.limit : undefined;

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Box flexDirection="column" flexGrow={1} paddingX={1} width="100%">
        <TranscriptViewport
          scrollFromBottom={scrollFromBottom}
          onMaxOffset={onMaxScroll}
          onRows={onViewportRows}
        >
          {children}
        </TranscriptViewport>
      </Box>

      {loading ? <TodoPanel todos={todos} /> : null}

      <Box flexShrink={0} marginTop={1} width="100%">
        <ActivityLine phase={phase} startedAt={startedAt.current} outputChars={streamedChars} />
      </Box>

      <Box flexShrink={0} paddingX={1}>
        <InputBar
          model={model}
          busy={loading}
          onSubmit={submitAndReset}
          onShellCommand={onShellCommand}
          disabled={inputDisabled}
          mode={mode}
        />
      </Box>

      <Box flexShrink={0} marginTop={1} width="100%">
        <Footer
          contextRatio={ratio}
          costUsd={costUsd}
          teammates={teammates}
          background={background}
          microSaved={microcompactSaved}
          scroll={scrollFromBottom}
          model={model}
        />
      </Box>
    </Box>
  );
}
