import React, { useCallback, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigate } from 'react-router';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { Spinner } from '../components/spinner.js';
import { BotMessage } from '../components/messages/index.js';
import { useLoopEngine, type LoopEvent, type LoopType } from '../hooks/use-loop-engine.js';

// ─── Loop type definitions ────────────────────────────────────────────────────

type LoopConfig = {
  type: LoopType;
  label: string;
  shortcut: string;
  description: string;
  details: string;
  color: string;
};

const LOOP_CONFIGS: LoopConfig[] = [
  {
    type: 'review',
    label: 'Review Loop',
    shortcut: '1',
    description: 'Auto-review → fix → re-review until clean',
    details: 'Runs CodeRabbit-style security review, auto-fixes critical/high issues, then re-reviews. Repeats up to 3 iterations.',
    color: '#DC2626',
  },
  {
    type: 'watch',
    label: 'Watch Loop',
    shortcut: '2',
    description: 'Watch files, auto-review on every save',
    details: 'Monitors the working directory for changes. Triggers an incremental security review whenever files are saved.',
    color: '#3B82F6',
  },
  {
    type: 'pipeline',
    label: 'Pipeline Loop',
    shortcut: '3',
    description: 'Scan → Plan → Fix → Verify in sequence',
    details: 'Multi-agent pipeline: scanner finds issues, planner creates fix strategy, fixer applies changes, verifier confirms resolution.',
    color: '#7C3AED',
  },
  {
    type: 'ci',
    label: 'CI Loop',
    shortcut: '4',
    description: 'Run tests → fix failures → repeat until green',
    details: 'Runs your test suite, reads failure output, asks AI to fix the code (not the tests), and repeats until all tests pass.',
    color: '#F59E0B',
  },
];

// ─── Event log ────────────────────────────────────────────────────────────────

function EventLog({ events, colors }: { events: LoopEvent[]; colors: Record<string, string> }) {
  if (events.length === 0) return null;
  const EVENT_WINDOW = 50;
  const visible = events.slice(-EVENT_WINDOW);

  return (
    <Box flexDirection="column">
      {visible.map((ev, i) => {
        const time = new Date(ev.timestamp).toLocaleTimeString('en-US', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        });

        if (ev.type === 'issues' && ev.issues && ev.issues.length > 0) {
          return (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row" gap={1}>
                <Text dimColor>{time}</Text>
                <Text color={colors.warning} bold>{`⚑  ${ev.issues.length} issue(s) found${ev.iteration ? ` (iter ${ev.iteration})` : ''}:`}</Text>
              </Box>
              {ev.issues.slice(0, 6).map((iss, j) => {
                const sev = iss.severity?.toLowerCase() || 'info';
                const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : sev === 'medium' ? '🟡' : '🟢';
                const color = sev === 'critical' ? colors.critical : sev === 'high' ? colors.error : sev === 'medium' ? colors.warning : colors.info;
                return (
                  <Box key={j} paddingLeft={8}>
                    <Text color={color}>{`${icon} ${iss.title}${iss.file ? ` (${iss.file})` : ''}`}</Text>
                  </Box>
                );
              })}
              {ev.issues.length > 6 && (
                <Box paddingLeft={8}><Text dimColor>{`...and ${ev.issues.length - 6} more`}</Text></Box>
              )}
            </Box>
          );
        }

        if (ev.type === 'file-change' && ev.files) {
          return (
            <Box key={i} flexDirection="row" gap={1}>
              <Text dimColor>{time}</Text>
              <Text color={colors.info}>{'◌'}</Text>
              <Text>{`${ev.files.length} file(s) changed:`}</Text>
              <Text dimColor>{ev.files.slice(0, 3).map(f => f.split('/').pop()).join(', ')}{ev.files.length > 3 ? '...' : ''}</Text>
            </Box>
          );
        }

        const icon = ev.type === 'error' ? '✗'
          : ev.type === 'fix' ? '✔'
          : ev.type === 'done' ? '★'
          : ev.type === 'stage' ? '▸'
          : ev.type === 'state' ? '→'
          : '·';
        const color = ev.type === 'error' ? colors.error
          : ev.type === 'fix' ? colors.success
          : ev.type === 'done' ? colors.primary
          : ev.type === 'stage' ? colors.info
          : colors.dimSeparator;

        const text = ev.text || (ev.stage ? `[${ev.stage}]` : ev.state ? `state: ${ev.state}` : '');
        if (!text) return null;

        return (
          <Box key={i} flexDirection="row" gap={1}>
            <Text dimColor>{time}</Text>
            <Text color={color}>{icon}</Text>
            <Text color={ev.type === 'error' ? colors.error : ev.type === 'done' ? colors.success : undefined}>
              {text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StateBadge({ state, stage, colors }: { state: string; stage: string; colors: Record<string, string> }) {
  const isGood = state === 'done' || state === 'green';
  const isBad = state === 'error' || state === 'timeout';
  const isWarn = state === 'max-iterations' || state === 'partial' || state === 'stopped';
  const color = isGood ? colors.success : isBad ? colors.error : isWarn ? colors.warning : colors.primary;
  const label = stage ? `${state} / ${stage}` : state;
  return <Text bold color={color}>{label.toUpperCase()}</Text>;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function Loop() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const startingRef = useRef(false);

  const {
    isRunning, loopType, currentState, currentStage, events, summary, iteration,
    messages, model,
    startReviewLoop, startWatchLoop, startPipelineLoop, startCILoop, stop,
  } = useLoopEngine();

  const handleStart = useCallback(() => {
    if (isRunning || startingRef.current) return;
    startingRef.current = true;
    setTimeout(() => { startingRef.current = false; }, 500);
    switch (LOOP_CONFIGS[selectedIdx].type) {
      case 'review': startReviewLoop(); break;
      case 'watch': startWatchLoop(); break;
      case 'pipeline': startPipelineLoop(); break;
      case 'ci': startCILoop(); break;
    }
  }, [isRunning, selectedIdx, startReviewLoop, startWatchLoop, startPipelineLoop, startCILoop]);

  useInput((input, key) => {
    if (key.escape || input === 'q') { stop(); navigate('/'); return; }
    if (isRunning) {
      if (input === 's') { stop(); return; }
      return;
    }
    if (key.upArrow) { setSelectedIdx(p => Math.max(0, p - 1)); return; }
    if (key.downArrow) { setSelectedIdx(p => Math.min(LOOP_CONFIGS.length - 1, p + 1)); return; }
    if (key.return) { handleStart(); return; }
    const byShortcut = LOOP_CONFIGS.findIndex(c => c.shortcut === input);
    if (byShortcut >= 0) { setSelectedIdx(byShortcut); return; }
  });

  const activeConfig = LOOP_CONFIGS.find(c => c.type === loopType);
  const selectedConfig = LOOP_CONFIGS[selectedIdx];

  // Latest AI messages for the live output panel
  const MESSAGE_WINDOW = 5;
  const latestMessages = messages.slice(-MESSAGE_WINDOW);
  const totalMessages = messages.length;

  return (
    <Box flexDirection="column" width="100%" padding={1}>
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="row" gap={2} alignItems="center">
          <Text bold color={colors.primary}>{'⟳ LOOP ENGINE'}</Text>
          {activeConfig && isRunning && (
            <>
              <Text dimColor>{'|'}</Text>
              <Text bold color={activeConfig.color}>{activeConfig.label}</Text>
              <Spinner mode="BUILD" />
            </>
          )}
        </Box>
        <Text dimColor>{'↑↓/1-4 select  Enter start  s stop  q back'}</Text>
      </Box>

      <Box flexDirection="row" gap={1} flexGrow={1}>
        {/* Left panel: type selector + status */}
        <Box flexDirection="column" width={34} flexShrink={0}>
          {/* Loop type cards */}
          <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} paddingY={0} flexDirection="column" marginBottom={1}>
            <Text bold color={colors.primary}>{'Loop Types'}</Text>
            {LOOP_CONFIGS.map((cfg, i) => {
              const isSelected = i === selectedIdx;
              const isActive = cfg.type === loopType && isRunning;
              return (
                <Box key={cfg.type} flexDirection="column" marginTop={1}>
                  <Box flexDirection="row" gap={1} alignItems="center">
                    <Text color={isActive ? cfg.color : isSelected ? colors.primary : colors.dimSeparator}>
                      {isActive ? '▶' : isSelected ? '●' : `${cfg.shortcut}`}
                    </Text>
                    <Text bold={isSelected || isActive} color={isActive ? cfg.color : isSelected ? colors.primary : undefined}>
                      {cfg.label}
                    </Text>
                  </Box>
                  <Box paddingLeft={2}>
                    <Text dimColor>{cfg.description}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Status / summary */}
          {(isRunning || summary || currentState !== 'idle') && (
            <Box
              borderStyle="single"
              borderColor={currentState === 'done' || currentState === 'green' ? colors.success : currentState === 'error' ? colors.error : colors.primary}
              paddingX={1} paddingY={0}
              flexDirection="column"
            >
              <Text bold color={colors.primary}>{'Status'}</Text>
              <Box flexDirection="row" gap={1} alignItems="center">
                {isRunning && <Spinner />}
                <StateBadge state={currentState} stage={currentStage} colors={colors} />
              </Box>
              {iteration > 0 && <Text dimColor>{`Iteration: ${iteration}`}</Text>}
              {summary && (
                <Box flexDirection="column" marginTop={1}>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text dimColor>{'Issues found:'}</Text>
                    <Text color={summary.issuesFound > 0 ? colors.warning : colors.success}>{String(summary.issuesFound)}</Text>
                  </Box>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text dimColor>{'Issues fixed:'}</Text>
                    <Text color={colors.success}>{String(summary.issuesFixed)}</Text>
                  </Box>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text dimColor>{'Duration:'}</Text>
                    <Text>{`${(summary.durationMs / 1000).toFixed(1)}s`}</Text>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* Selected loop details (when idle) */}
          {!isRunning && !summary && (
            <Box borderStyle="single" borderColor={selectedConfig.color} paddingX={1} paddingY={0} flexDirection="column" marginTop={1}>
              <Text bold color={selectedConfig.color}>{selectedConfig.label}</Text>
              <Text dimColor>{selectedConfig.details}</Text>
              <Box marginTop={1}>
                <Text color={colors.success}>{'↵ Press Enter to start'}</Text>
              </Box>
            </Box>
          )}
        </Box>

        {/* Right panel: event log + live AI output */}
        <Box flexDirection="column" flexGrow={1}>
          {/* Event log */}
          <Box
            borderStyle="single"
            borderColor={colors.dimSeparator}
            paddingX={1}
            paddingY={0}
            flexDirection="column"
            flexGrow={1}
            marginBottom={1}
          >
            <Text bold color={colors.primary}>{'Event Log'}</Text>
            {events.length === 0 ? (
              <Box paddingTop={1}>
                <Text dimColor>
                  {isRunning ? 'Starting...' : 'No events yet. Select a loop type and press Enter.'}
                </Text>
              </Box>
            ) : (
              <Box marginTop={1}>
                <EventLog events={events} colors={colors} />
              </Box>
            )}
          </Box>

          {/* Live AI output */}
          {latestMessages.length > 0 && (
            <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1} paddingY={0} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold color={colors.primary}>{'AI Output'}</Text>
                <Text dimColor>{totalMessages > MESSAGE_WINDOW ? `showing last ${MESSAGE_WINDOW} / ${totalMessages} messages` : `${totalMessages} messages`}</Text>
              </Box>
              <Box flexDirection="column" marginTop={1}>
                {latestMessages.map((msg: any) => (
                  msg.role === 'assistant'
                    ? <BotMessage key={msg.id} parts={msg.parts} model={model} />
                    : null
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <StatusBar
          mode={isRunning ? 'SCAN' : 'BUILD'}
          statusText={`Loop Engine${isRunning && activeConfig ? ` — ${activeConfig.label.toUpperCase()} RUNNING` : ''}`}
        />
      </Box>
    </Box>
  );
}
