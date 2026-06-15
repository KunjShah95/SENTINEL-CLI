import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentChat, type AgentMode } from './use-agent-chat.js';
import {
  runReviewLoop,
  startWatchLoop,
  runPipelineLoop,
  runCILoop,
  type LoopEvent,
  type LoopSummary,
  type LoopType,
  type SubmitAndWait,
} from '../lib/loop-engine.js';

export type { LoopEvent, LoopSummary, LoopType };

export type UseLoopEngineReturn = {
  // Loop state
  isRunning: boolean;
  loopType: LoopType | null;
  currentState: string;
  currentStage: string;
  events: LoopEvent[];
  summary: LoopSummary | null;
  iteration: number;
  // AI chat messages from loop actions (for display)
  messages: ReturnType<typeof useAgentChat>['messages'];
  model: string;
  // Loop controls
  startReviewLoop: (opts?: { maxIterations?: number; branch?: string }) => void;
  startWatchLoop: (opts?: { paths?: string[] }) => void;
  startPipelineLoop: (opts?: { target?: string }) => void;
  startCILoop: (opts?: { maxAttempts?: number; testCommand?: string }) => void;
  stop: () => void;
};

export function useLoopEngine(): UseLoopEngineReturn {
  const { messages, submit, setMode, model } = useAgentChat({ initialMode: 'REVIEW' });

  // Keep refs current for use inside async callbacks
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [isRunning, setIsRunning] = useState(false);
  const [loopType, setLoopType] = useState<LoopType | null>(null);
  const [currentState, setCurrentState] = useState('idle');
  const [currentStage, setCurrentStage] = useState('');
  const [events, setEvents] = useState<LoopEvent[]>([]);
  const [summary, setSummary] = useState<LoopSummary | null>(null);
  const [iteration, setIteration] = useState(0);

  const abortRef = useRef({ aborted: false });
  const stopWatchRef = useRef<(() => void) | null>(null);

  const addEvent = useCallback((event: LoopEvent) => {
    setEvents(prev => [...prev.slice(-149), event]);
    if (event.state) setCurrentState(event.state);
    if (event.stage) setCurrentStage(event.stage);
    if (event.iteration !== undefined) setIteration(event.iteration);
  }, []);

  // Wraps submit() into a promise that returns the full assistant response text.
  const submitAndWait: SubmitAndWait = useCallback(async (prompt, loopMode = 'REVIEW') => {
    const prevCount = messagesRef.current.length;
    if (loopMode === 'BUILD' || loopMode === 'PLAN' || loopMode === 'REVIEW') {
      setMode(loopMode as AgentMode);
    }
    await submit(prompt);
    // After submit resolves, find the last assistant message added after this call
    const after = messagesRef.current.slice(prevCount);
    const response = [...after].reverse().find(m => m.role === 'assistant');
    const textPart = response?.parts?.find((p): p is { type: 'text'; text: string } => p.type === 'text');
    return textPart?.text ?? '';
  }, [submit, setMode]);

  // ── 1. Review Loop ──────────────────────────────────────────────────────────
  const startReviewLoop = useCallback((opts: { maxIterations?: number; branch?: string } = {}) => {
    abortRef.current = { aborted: false };
    setIsRunning(true);
    setLoopType('review');
    setEvents([]);
    setSummary(null);
    setCurrentState('reviewing');
    setIteration(0);

    runReviewLoop({ ...opts, onEvent: addEvent, submitAndWait, abortSignal: abortRef.current })
      .then(s => { setSummary(s); setIsRunning(false); })
      .catch(() => { setCurrentState('error'); setIsRunning(false); });
  }, [addEvent, submitAndWait]);

  // ── 2. Watch Loop ───────────────────────────────────────────────────────────
  const startWatchLoop_ = useCallback((opts: { paths?: string[] } = {}) => {
    if (stopWatchRef.current) stopWatchRef.current();
    setIsRunning(true);
    setLoopType('watch');
    setEvents([]);
    setSummary(null);
    setCurrentState('watching');

    const stop = startWatchLoop({
      ...opts,
      onEvent: addEvent,
      onFilesChanged: async (files) => {
        addEvent({ type: 'state', state: 'reviewing', timestamp: Date.now(), files });
        try {
          const { getGitDiff, getChangedFiles, buildReviewPrompt, parseReviewResponse } = await import('../lib/security-reviewer.js');
          const diff = getGitDiff();
          if (!diff) {
            addEvent({ type: 'state', state: 'watching', timestamp: Date.now() });
            return;
          }
          const changedFiles = getChangedFiles();
          const text = await submitAndWait(buildReviewPrompt(diff, { files: changedFiles, focus: 'security' }), 'REVIEW');
          const parsed = parseReviewResponse(text, changedFiles);
          if (parsed.issues.length > 0) {
            addEvent({ type: 'issues', issues: parsed.issues, timestamp: Date.now() });
          } else {
            addEvent({ type: 'message', text: '✅ No issues in changed files.', timestamp: Date.now() });
          }
        } catch (e) {
          addEvent({ type: 'error', error: String(e), timestamp: Date.now() });
        }
        addEvent({ type: 'state', state: 'watching', timestamp: Date.now() });
      },
    });
    stopWatchRef.current = stop;
  }, [addEvent, submitAndWait]);

  // ── 3. Pipeline Loop ────────────────────────────────────────────────────────
  const startPipelineLoop = useCallback((opts: { target?: string } = {}) => {
    abortRef.current = { aborted: false };
    setIsRunning(true);
    setLoopType('pipeline');
    setEvents([]);
    setSummary(null);
    setCurrentStage('scanning');
    setCurrentState('running');
    setIteration(0);

    runPipelineLoop({ ...opts, onEvent: addEvent, submitAndWait, abortSignal: abortRef.current })
      .then(s => { setSummary(s); setIsRunning(false); })
      .catch(() => { setCurrentState('error'); setIsRunning(false); });
  }, [addEvent, submitAndWait]);

  // ── 4. CI Loop ──────────────────────────────────────────────────────────────
  const startCILoop = useCallback((opts: { maxAttempts?: number; testCommand?: string } = {}) => {
    abortRef.current = { aborted: false };
    setIsRunning(true);
    setLoopType('ci');
    setEvents([]);
    setSummary(null);
    setCurrentState('checking');
    setIteration(0);

    runCILoop({ ...opts, onEvent: addEvent, submitAndWait, abortSignal: abortRef.current })
      .then(s => { setSummary(s); setIsRunning(false); })
      .catch(() => { setCurrentState('error'); setIsRunning(false); });
  }, [addEvent, submitAndWait]);

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    abortRef.current.aborted = true;
    if (stopWatchRef.current) {
      stopWatchRef.current();
      stopWatchRef.current = null;
    }
    setIsRunning(false);
    setCurrentState('stopped');
  }, []);

  return {
    isRunning,
    loopType,
    currentState,
    currentStage,
    events,
    summary,
    iteration,
    messages,
    model,
    startReviewLoop,
    startWatchLoop: startWatchLoop_,
    startPipelineLoop,
    startCILoop,
    stop,
  };
}
