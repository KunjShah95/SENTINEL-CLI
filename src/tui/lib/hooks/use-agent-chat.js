/**
 * useAgentChat — streaming AI coding agent chat hook.
 *
 * Talks to the Sentinel Hono server (`/chat`) over SSE. Handles:
 *   - text deltas streamed back from the LLM
 *   - tool calls emitted by the model (executed locally in the CLI process)
 *   - reasoning deltas
 *   - session persistence
 *   - mode/model metadata on every message
 *
 * Mirrors packages/cli/src/hooks/use-chat.ts from Nightcode but adapted
 * to talk to the Hono server instead of using the AI SDK transport
 * directly. The server is the source of truth for sessions and credit
 * metering; the CLI is the source of truth for file system access.
 *
 * When the Hono server is not running, the hook falls back to a local
 * LLM orchestrator (see src/llm/llmOrchestrator.js) and generates local
 * UUIDs for sessions. No persistence across restarts in local mode.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'node:crypto';
import { streamChat, Sessions } from '../lib/api-client.js';
import { runLocalTool, Mode, isReadOnlyTool } from '../lib/local-tools.js';
import { shouldCompact, compactMessages, estimateTokens } from '../lib/context-compactor.js';
import { DEFAULT_CHAT_MODEL_ID } from '../../shared/models/index.js';
let idCounter = 0;
function nextId(prefix = 'msg') {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}
function buildLocalSystemPrompt(mode) {
  if (mode === 'PLAN') {
    return 'You are a senior software engineer. Your task is to explore the codebase and propose a plan. You have access to read-only tools: readFile, listDirectory, glob, grep, searchWeb. Do NOT write any code or make changes. Be thorough in your analysis.';
  }
  return 'You are a senior software engineer working in a terminal. You have access to tools: readFile, listDirectory, glob, grep, searchWeb, writeFile, editFile, batchEdit, bash. You can read, write, and execute commands. Be thorough and precise.';
}
export function useAgentChat(options = {}) {
  const [sessionId, setSessionId] = useState(options.initialSessionId);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(options.initialMode || 'BUILD');
  const [model, setModel] = useState(options.initialModel || DEFAULT_CHAT_MODEL_ID);
  const [streamedText, setStreamedText] = useState('');
  const [compacting, setCompacting] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({
    estimated: 0,
    limit: 40_000,
    percentage: 0,
  });
  const sessionIdRef = useRef(sessionId);
  const modeRef = useRef(mode);
  const modelRef = useRef(model);
  const abortRef = useRef(null);
  const loadedRef = useRef(false);
  const messagesRef = useRef(messages);
  const [useServer, setUseServer] = useState(true);
  const serverAvailableRef = useRef(true);
  const [serverStatus, setServerStatus] = useState('connected');
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  // Load an existing session.
  useEffect(() => {
    if (loadedRef.current || !options.initialSessionId)
      return;
    loadedRef.current = true;
    (async () => {
      try {
        const session = await Sessions.get(options.initialSessionId);
        if (!session)
          return;
        if (session.messages && Array.isArray(session.messages)) {
          const restored = session.messages.map((m) => ({
            id: m.id || nextId('restored'),
            role: m.role || 'assistant',
            parts: m.parts || (m.content ? [{ type: 'text', text: m.content }] : []),
            mode: m.metadata?.mode || session.mode,
            model: m.metadata?.model || session.model,
            timestamp: Date.now(),
          }));
          setMessages(restored);
        }
        if (session.mode && (session.mode === 'BUILD' || session.mode === 'PLAN' || session.mode === 'REVIEW'))
          setMode(session.mode);
        if (session.model)
          setModel(session.model);
      }
      catch {
        // Silently fall back if server is unavailable
      }
    })();
  }, [options.initialSessionId]);
  const appendMessage = useCallback((m) => {
    setMessages((prev) => [...prev, { ...m, id: nextId(), timestamp: Date.now() }]);
  }, []);
  const updateLastMessage = useCallback((updater) => {
    setMessages((prev) => {
      if (prev.length === 0)
        return prev;
      const next = prev.slice();
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);
  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setLoading(false);
  }, []);
    /**
     * Fire-and-collect chat request used exclusively by the context compactor.
     * Does NOT touch React message state — just returns the full response text.
     */
  const submitAndWaitForCompaction = useCallback(async (prompt, mode = 'PLAN') => {
    const sid = sessionIdRef.current;
    if (!sid)
      return '';
    const summaryUserMsg = {
      id: `compaction-req-${Date.now()}`,
      role: 'user',
      content: prompt,
      parts: [{ type: 'text', text: prompt }],
      metadata: { mode, model: modelRef.current },
    };
    const stream = streamChat({
      id: sid,
      messages: [summaryUserMsg],
      mode,
      model: modelRef.current,
    });
    let collected = '';
    try {
      for await (const ev of stream) {
        if (ev.event === 'text') {
          collected += ev.data?.delta || '';
        }
        else if (ev.event === 'done' || ev.event === 'finish') {
          break;
        }
      }
    }
    catch {
      // If the server call fails, return whatever was collected (may be empty).
    }
    return collected;
  }, []);
  useEffect(() => {
    if (compacting || messages.length === 0)
      return;
    if (!shouldCompact(messages))
      return;
    setCompacting(true);
    const snapshot = messages;
    compactMessages(snapshot, submitAndWaitForCompaction, {
      onProgress: (phase) => {
        if (phase === 'done')
          setCompacting(false);
      },
    }).then((result) => {
      if (result.compacted) {
        setMessages((prev) => {
          const snapshotIds = new Set(snapshot.map((m) => m.id));
          const addedSince = prev.filter((m) => !snapshotIds.has(m.id));
          return [...result.messages, ...addedSince];
        });
        const newEstimated = estimateTokens(result.messages);
        setTokenUsage({
          estimated: newEstimated,
          limit: 40_000,
          percentage: Math.round(newEstimated / 400),
        });
      }
      setCompacting(false);
    }).catch(() => {
      setCompacting(false);
    });
  }, [messages, compacting, submitAndWaitForCompaction]);
  const submit = useCallback(async (userText) => {
    if (!userText.trim())
      return;
    setError(null);
    // Build a session if needed.
    let sid = sessionIdRef.current;
    if (!sid) {
      const session = await Sessions.create({
        title: userText.slice(0, 100),
        mode: modeRef.current,
        model: modelRef.current,
        projectPath: process.cwd(),
      });
      if (session) {
        sid = session.id;
        setSessionId(sid);
        sessionIdRef.current = sid;
        options.onSessionCreated?.(sid);
      }
      else {
        // Server not available — fall back to local mode
        serverAvailableRef.current = false;
        setServerStatus('local');
        sid = randomUUID();
        setSessionId(sid);
        sessionIdRef.current = sid;
      }
    }
    // Append user message.
    appendMessage({
      role: 'user',
      mode: modeRef.current,
      model: modelRef.current,
      parts: [{ type: 'text', text: userText }],
    });
    // Append placeholder assistant message.
    const assistantId = nextId('assistant');
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        mode: modeRef.current,
        model: modelRef.current,
        parts: [],
        timestamp: Date.now(),
      },
    ]);
    setLoading(true);
    setStatus('submitted');
    setStreamedText('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const allMessages = [
        // Snapshot of messages BEFORE the placeholder
        ...messagesRef.current,
        {
          id: nextId('user'),
          role: 'user',
          mode: modeRef.current,
          model: modelRef.current,
          parts: [{ type: 'text', text: userText }],
          timestamp: Date.now(),
        },
      ];
      const stream = streamChat({
        id: sid,
        messages: allMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.parts.find((p) => p.type === 'text')?.text,
          parts: m.parts,
          metadata: { mode: m.mode, model: m.model },
        })),
        mode: modeRef.current,
        model: modelRef.current,
      });
      for await (const ev of stream) {
        if (ctrl.signal.aborted)
          break;
        setStatus('streaming');
        handleEvent(ev, assistantId);
      }
    }
    catch (e) {
      if (!serverAvailableRef.current) {
        // Fallback to local orchestrator
        try {
          let systemPrompt;
          try {
            const { buildSystemPrompt } = await import('../../server/api/lib/system-prompt.js');
            systemPrompt = buildSystemPrompt({ mode: modeRef.current });
          }
          catch {
            systemPrompt = buildLocalSystemPrompt(modeRef.current);
          }
          const { getLLMOrchestrator } = await import('../../llm/llmOrchestrator.js');
          const orchestrator = getLLMOrchestrator({});
          const stream = await orchestrator.streamChat(userText, { systemPrompt });
          for await (const chunk of stream) {
            if (ctrl.signal.aborted)
              break;
            setStatus('streaming');
            if (chunk.type === 'content') {
              handleEvent({ event: 'text', data: { delta: chunk.content } }, assistantId);
            }
            else if (chunk.type === 'error') {
              handleEvent({ event: 'error', data: { message: chunk.content } }, assistantId);
            }
            else if (chunk.type === 'done') {
              break;
            }
          }
        }
        catch (fallbackErr) {
          setError(fallbackErr);
          appendMessage({
            role: 'error',
            parts: [{ type: 'text', text: fallbackErr?.message || String(fallbackErr) }],
          });
        }
      }
      else {
        setError(e);
        appendMessage({
          role: 'error',
          parts: [{ type: 'text', text: e?.message || String(e) }],
        });
      }
    }
    finally {
      setStatus('idle');
      setLoading(false);
      abortRef.current = null;
      // Update token usage after each response completes.
      setMessages((currentMsgs) => {
        const estimated = estimateTokens(currentMsgs);
        setTokenUsage({
          estimated,
          limit: 40_000,
          percentage: Math.round(estimated / 400),
        });
        return currentMsgs;
      });
    }
  }, [messages, appendMessage, options, submitAndWaitForCompaction]);
  const handleEvent = useCallback((ev, assistantId) => {
    switch (ev.event) {
    case 'text': {
      const delta = ev.data?.delta || '';
      setStreamedText((t) => t + delta);
      updateLastMessage((msg) => {
        if (msg.id !== assistantId)
          return msg;
        const last = msg.parts[msg.parts.length - 1];
        if (last?.type === 'text') {
          return {
            ...msg,
            parts: [
              ...msg.parts.slice(0, -1),
              { type: 'text', text: last.text + delta },
            ],
          };
        }
        return {
          ...msg,
          parts: [...msg.parts, { type: 'text', text: delta }],
        };
      });
      break;
    }
    case 'reasoning': {
      const text = ev.data?.text || '';
      updateLastMessage((msg) => {
        if (msg.id !== assistantId)
          return msg;
        const last = msg.parts[msg.parts.length - 1];
        if (last?.type === 'reasoning') {
          return {
            ...msg,
            parts: [
              ...msg.parts.slice(0, -1),
              { type: 'reasoning', text: last.text + text },
            ],
          };
        }
        return {
          ...msg,
          parts: [...msg.parts, { type: 'reasoning', text }],
        };
      });
      break;
    }
    case 'tool_call': {
      const { toolName, toolCallId, input } = ev.data;
      updateLastMessage((msg) => {
        if (msg.id !== assistantId)
          return msg;
        return {
          ...msg,
          parts: [
            ...msg.parts,
            {
              type: 'tool-call',
              toolName,
              toolCallId,
              input,
              state: 'pending',
            },
          ],
        };
      });
      // Execute the tool locally. PLAN mode blocks write/edit/bash.
      (async () => {
        const output = await runLocalTool(toolName, input, modeRef.current);
        if (abortRef.current?.signal.aborted)
          return;
        updateLastMessage((msg) => {
          if (msg.id !== assistantId)
            return msg;
          return {
            ...msg,
            parts: msg.parts.map((p) => p.type === 'tool-call' && p.toolCallId === toolCallId
              ? output && typeof output === 'object' && 'error' in output
                ? { ...p, state: 'output-error', errorText: output.error }
                : { ...p, state: 'output-available', output }
              : p),
          };
        });
      })();
      break;
    }
    case 'tool_result': {
      const { toolCallId, output } = ev.data;
      updateLastMessage((msg) => {
        if (msg.id !== assistantId)
          return msg;
        return {
          ...msg,
          parts: msg.parts.map((p) => p.type === 'tool-call' && p.toolCallId === toolCallId
            ? { ...p, state: 'output-available', output }
            : p),
        };
      });
      break;
    }
    case 'error': {
      appendMessage({
        role: 'error',
        parts: [{ type: 'text', text: ev.data?.message || 'Unknown error' }],
      });
      break;
    }
    case 'finish':
    case 'done':
      break;
    }
  }, [appendMessage, updateLastMessage]);
  const clear = useCallback(() => {
    setMessages([]);
    setStreamedText('');
    setError(null);
  }, []);
  return {
    sessionId,
    setSessionId,
    messages,
    loading,
    status,
    error,
    mode,
    setMode,
    toggleMode: () => setMode((m) => (m === 'BUILD' ? 'PLAN' : 'BUILD')),
    model,
    setModel,
    submit,
    stop,
    clear,
    appendMessage,
    streamedText,
    useServer,
    setUseServer,
    serverStatus,
    compacting,
    tokenUsage,
  };
}
export { Mode, isReadOnlyTool };
