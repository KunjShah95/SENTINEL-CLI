import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'react/jsx-runtime';
import { useCallback, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigate } from 'react-router';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { Spinner } from '../components/spinner.js';
import { BotMessage } from '../components/messages/index.js';
import { useLoopEngine } from '../hooks/use-loop-engine.js';
const LOOP_CONFIGS = [
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
function EventLog({ events, colors }) {
  if (events.length === 0)
    return null;
  const EVENT_WINDOW = 50;
  const visible = events.slice(-EVENT_WINDOW);
  return (_jsx(Box, { flexDirection: 'column', children: visible.map((ev, i) => {
    const time = new Date(ev.timestamp).toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    if (ev.type === 'issues' && ev.issues && ev.issues.length > 0) {
      return (_jsxs(Box, { flexDirection: 'column', marginBottom: 1, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { dimColor: true, children: time }), _jsx(Text, { color: colors.warning, bold: true, children: `⚑  ${ev.issues.length} issue(s) found${ev.iteration ? ` (iter ${ev.iteration})` : ''}:` })] }), ev.issues.slice(0, 6).map((iss, j) => {
        const sev = iss.severity?.toLowerCase() || 'info';
        const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : sev === 'medium' ? '🟡' : '🟢';
        const color = sev === 'critical' ? colors.critical : sev === 'high' ? colors.error : sev === 'medium' ? colors.warning : colors.info;
        return (_jsx(Box, { paddingLeft: 8, children: _jsx(Text, { color: color, children: `${icon} ${iss.title}${iss.file ? ` (${iss.file})` : ''}` }) }, j));
      }), ev.issues.length > 6 && (_jsx(Box, { paddingLeft: 8, children: _jsx(Text, { dimColor: true, children: `...and ${ev.issues.length - 6} more` }) }))] }, i));
    }
    if (ev.type === 'file-change' && ev.files) {
      return (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { dimColor: true, children: time }), _jsx(Text, { color: colors.info, children: '◌' }), _jsx(Text, { children: `${ev.files.length} file(s) changed:` }), _jsxs(Text, { dimColor: true, children: [ev.files.slice(0, 3).map(f => f.split('/').pop()).join(', '), ev.files.length > 3 ? '...' : ''] })] }, i));
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
    if (!text)
      return null;
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { dimColor: true, children: time }), _jsx(Text, { color: color, children: icon }), _jsx(Text, { color: ev.type === 'error' ? colors.error : ev.type === 'done' ? colors.success : undefined, children: text })] }, i));
  }) }));
}
// ─── Status badge ─────────────────────────────────────────────────────────────
function StateBadge({ state, stage, colors }) {
  const isGood = state === 'done' || state === 'green';
  const isBad = state === 'error' || state === 'timeout';
  const isWarn = state === 'max-iterations' || state === 'partial' || state === 'stopped';
  const color = isGood ? colors.success : isBad ? colors.error : isWarn ? colors.warning : colors.primary;
  const label = stage ? `${state} / ${stage}` : state;
  return _jsx(Text, { bold: true, color: color, children: label.toUpperCase() });
}
// ─── Main screen ──────────────────────────────────────────────────────────────
export function Loop() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const startingRef = useRef(false);
  const { isRunning, loopType, currentState, currentStage, events, summary, iteration, messages, model, startReviewLoop, startWatchLoop, startPipelineLoop, startCILoop, stop } = useLoopEngine();
  const handleStart = useCallback(() => {
    if (isRunning || startingRef.current)
      return;
    startingRef.current = true;
    setTimeout(() => { startingRef.current = false; }, 500);
    switch (LOOP_CONFIGS[selectedIdx].type) {
    case 'review':
      startReviewLoop();
      break;
    case 'watch':
      startWatchLoop();
      break;
    case 'pipeline':
      startPipelineLoop();
      break;
    case 'ci':
      startCILoop();
      break;
    }
  }, [isRunning, selectedIdx, startReviewLoop, startWatchLoop, startPipelineLoop, startCILoop]);
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      stop();
      navigate('/');
      return;
    }
    if (isRunning) {
      if (input === 's') {
        stop();
        return;
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIdx(p => Math.max(0, p - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIdx(p => Math.min(LOOP_CONFIGS.length - 1, p + 1));
      return;
    }
    if (key.return) {
      handleStart();
      return;
    }
    const byShortcut = LOOP_CONFIGS.findIndex(c => c.shortcut === input);
    if (byShortcut >= 0) {
      setSelectedIdx(byShortcut);
      return;
    }
  });
  const activeConfig = LOOP_CONFIGS.find(c => c.type === loopType);
  const selectedConfig = LOOP_CONFIGS[selectedIdx];
  // Latest AI messages for the live output panel
  const MESSAGE_WINDOW = 5;
  const latestMessages = messages.slice(-MESSAGE_WINDOW);
  const totalMessages = messages.length;
  return (_jsxs(Box, { flexDirection: 'column', width: '100%', padding: 1, children: [_jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1, children: [_jsxs(Box, { flexDirection: 'row', gap: 2, alignItems: 'center', children: [_jsx(Text, { bold: true, color: colors.primary, children: '⟳ LOOP ENGINE' }), activeConfig && isRunning && (_jsxs(_Fragment, { children: [_jsx(Text, { dimColor: true, children: '|' }), _jsx(Text, { bold: true, color: activeConfig.color, children: activeConfig.label }), _jsx(Spinner, { mode: 'BUILD' })] }))] }), _jsx(Text, { dimColor: true, children: '↑↓/1-4 select  Enter start  s stop  q back' })] }), _jsxs(Box, { flexDirection: 'row', gap: 1, flexGrow: 1, children: [_jsxs(Box, { flexDirection: 'column', width: 34, flexShrink: 0, children: [_jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, paddingY: 0, flexDirection: 'column', marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.primary, children: 'Loop Types' }), LOOP_CONFIGS.map((cfg, i) => {
    const isSelected = i === selectedIdx;
    const isActive = cfg.type === loopType && isRunning;
    return (_jsxs(Box, { flexDirection: 'column', marginTop: 1, children: [_jsxs(Box, { flexDirection: 'row', gap: 1, alignItems: 'center', children: [_jsx(Text, { color: isActive ? cfg.color : isSelected ? colors.primary : colors.dimSeparator, children: isActive ? '▶' : isSelected ? '●' : `${cfg.shortcut}` }), _jsx(Text, { bold: isSelected || isActive, color: isActive ? cfg.color : isSelected ? colors.primary : undefined, children: cfg.label })] }), _jsx(Box, { paddingLeft: 2, children: _jsx(Text, { dimColor: true, children: cfg.description }) })] }, cfg.type));
  })] }), (isRunning || summary || currentState !== 'idle') && (_jsxs(Box, { borderStyle: 'single', borderColor: currentState === 'done' || currentState === 'green' ? colors.success : currentState === 'error' ? colors.error : colors.primary, paddingX: 1, paddingY: 0, flexDirection: 'column', children: [_jsx(Text, { bold: true, color: colors.primary, children: 'Status' }), _jsxs(Box, { flexDirection: 'row', gap: 1, alignItems: 'center', children: [isRunning && _jsx(Spinner, {}), _jsx(StateBadge, { state: currentState, stage: currentStage, colors: colors })] }), iteration > 0 && _jsx(Text, { dimColor: true, children: `Iteration: ${iteration}` }), summary && (_jsxs(Box, { flexDirection: 'column', marginTop: 1, children: [_jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Issues found:' }), _jsx(Text, { color: summary.issuesFound > 0 ? colors.warning : colors.success, children: String(summary.issuesFound) })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Issues fixed:' }), _jsx(Text, { color: colors.success, children: String(summary.issuesFixed) })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Duration:' }), _jsx(Text, { children: `${(summary.durationMs / 1000).toFixed(1)}s` })] })] }))] })), !isRunning && !summary && (_jsxs(Box, { borderStyle: 'single', borderColor: selectedConfig.color, paddingX: 1, paddingY: 0, flexDirection: 'column', marginTop: 1, children: [_jsx(Text, { bold: true, color: selectedConfig.color, children: selectedConfig.label }), _jsx(Text, { dimColor: true, children: selectedConfig.details }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: colors.success, children: '↵ Press Enter to start' }) })] }))] }), _jsxs(Box, { flexDirection: 'column', flexGrow: 1, children: [_jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, paddingY: 0, flexDirection: 'column', flexGrow: 1, marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.primary, children: 'Event Log' }), events.length === 0 ? (_jsx(Box, { paddingTop: 1, children: _jsx(Text, { dimColor: true, children: isRunning ? 'Starting...' : 'No events yet. Select a loop type and press Enter.' }) })) : (_jsx(Box, { marginTop: 1, children: _jsx(EventLog, { events: events, colors: colors }) }))] }), latestMessages.length > 0 && (_jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, paddingX: 1, paddingY: 0, flexDirection: 'column', children: [_jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { bold: true, color: colors.primary, children: 'AI Output' }), _jsx(Text, { dimColor: true, children: totalMessages > MESSAGE_WINDOW ? `showing last ${MESSAGE_WINDOW} / ${totalMessages} messages` : `${totalMessages} messages` })] }), _jsx(Box, { flexDirection: 'column', marginTop: 1, children: latestMessages.map((msg) => (msg.role === 'assistant'
    ? _jsx(BotMessage, { parts: msg.parts, model: model }, msg.id)
    : null)) })] }))] })] }), _jsx(Box, { marginTop: 1, children: _jsx(StatusBar, { mode: isRunning ? 'SCAN' : 'BUILD', statusText: `Loop Engine${isRunning && activeConfig ? ` — ${activeConfig.label.toUpperCase()} RUNNING` : ''}` }) })] }));
}
