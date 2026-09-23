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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { randomUUID } from "node:crypto";
import { streamChat, Sessions, type ChatEvent } from "../lib/api-client.js";
import { Mode, isReadOnlyTool } from "../lib/local-tools.js";
import { shouldCompact, compactMessages, estimateTokens, getCompactionState, microcompactMessages } from "../lib/context-compactor.js";
import { DEFAULT_CHAT_MODEL_ID, resolveSmallModel } from "../../shared/models/index.js";

export type AgentMode = "BUILD" | "PLAN" | "REVIEW";

export type AgentMessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolName: string; toolCallId: string; input: unknown; state: "pending" | "output-available" | "output-error"; output?: unknown; errorText?: string };

export type AgentMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  parts: AgentMessagePart[];
  mode?: AgentMode;
  model?: string;
  timestamp: number;
};

let idCounter = 0;
function nextId(prefix = "msg"): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

type PermissionResult = 'allow' | 'deny' | 'allow-session';

type UseAgentChatOptions = {
  initialSessionId?: string;
  initialMode?: AgentMode;
  initialModel?: string;
  /** Function to navigate to a new route (e.g. /sessions/new). */
  onSessionCreated?: (id: string) => void;
  /** Callback to request user permission before executing tools. Return 'deny' to skip, 'allow' for one-time, 'allow-session' to auto-allow for the session. */
  onPermissionRequest?: (toolName: string, toolCallId: string, input: unknown) => Promise<PermissionResult>;
  /** Fired after a microcompact gate applies: tombstoned calls and tokens saved. */
  onMicrocompact?: (stats: { droppedCount: number; estimatedTokensSaved: number }) => void;
};

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const [sessionId, setSessionId] = useState<string | undefined>(options.initialSessionId);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitted" | "streaming">("idle");
  const [error, setError] = useState<Error | null>(null);
  const [mode, setMode] = useState<AgentMode>(options.initialMode || "BUILD");
  const [model, setModel] = useState<string>(options.initialModel || DEFAULT_CHAT_MODEL_ID);
  const [streamedText, setStreamedText] = useState<string>("");
  const [compacting, setCompacting] = useState(false);
  const [compactionState, setCompactionState] = useState<{ estimatedTokens: number; percentage: number; atAsyncThreshold: boolean; atSyncThreshold: boolean }>({
    estimatedTokens: 0,
    percentage: 0,
    atAsyncThreshold: false,
    atSyncThreshold: false,
  });
  // Cumulative tokens freed by the microcompact gate this session.
  const [microcompactSaved, setMicrocompactSaved] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<{ estimated: number; limit: number; percentage: number; costUsd?: number }>({
    estimated: 0,
    limit: 40_000,
    percentage: 0,
  });

  const sessionIdRef = useRef(sessionId);
  const modeRef = useRef(mode);
  const modelRef = useRef(model);
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const messagesRef = useRef(messages);
  const compactingGuard = useRef(false);
  const [useServer, setUseServer] = useState(false);
  const serverAvailableRef = useRef(true);
  const [serverStatus, setServerStatus] = useState<"connected" | "local">("local");

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
    if (loadedRef.current || !options.initialSessionId) return;
    loadedRef.current = true;
    (async () => {
      try {
        const session = await Sessions.get(options.initialSessionId!);
        if (!session) return;
        if (session.messages && Array.isArray(session.messages)) {
          const restored: AgentMessage[] = session.messages.map((m: any) => ({
            id: m.id || nextId("restored"),
            role: m.role || "assistant",
            parts: m.parts || (m.content ? [{ type: "text", text: m.content }] : []),
            mode: m.metadata?.mode || session.mode,
            model: m.metadata?.model || session.model,
            timestamp: Date.now(),
          }));
          setMessages(restored);
        }
        if (session.mode && (session.mode === 'BUILD' || session.mode === 'PLAN' || session.mode === 'REVIEW')) setMode(session.mode);
        if (session.model) setModel(session.model);
      } catch {
        // Silently fall back if server is unavailable
      }
    })();
  }, [options.initialSessionId]);

  const appendMessage = useCallback((m: Omit<AgentMessage, "id" | "timestamp">) => {
    setMessages((prev) => [...prev, { ...m, id: nextId(), timestamp: Date.now() }]);
  }, []);

  const updateLastMessage = useCallback((updater: (msg: AgentMessage) => AgentMessage) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = updater(next[next.length - 1]);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setLoading(false);
  }, []);

  /**
   * Fire-and-collect chat request used exclusively by the context compactor.
   * Uses the small_model (cheap model) to keep summarization costs low.
   * Does NOT touch React message state — just returns the full response text.
   */
  const submitAndWaitForCompaction = useCallback(
    async (prompt: string, mode: "BUILD" | "PLAN" | "REVIEW" = "PLAN"): Promise<string> => {
      const sid = sessionIdRef.current;
      if (!sid) return "";

      const compactModel = await resolveSmallModel().catch(() => ({ modelId: modelRef.current, provider: '' }));

      const summaryUserMsg = {
        id: `compaction-req-${Date.now()}`,
        role: "user" as const,
        content: prompt,
        parts: [{ type: "text" as const, text: prompt }],
        metadata: { mode, model: compactModel?.modelId || modelRef.current },
      };

      const stream = streamChat({
        id: sid,
        messages: [summaryUserMsg],
        mode,
        model: compactModel?.modelId || modelRef.current,
      });

      let collected = "";
      try {
        for await (const ev of stream) {
          if (ev.event === "text") {
            collected += ev.data?.delta || "";
          } else if (ev.event === "done" || ev.event === "finish") {
            break;
          }
        }
      } catch {
        // If the server call fails, return whatever was collected (may be empty).
      }
      return collected;
    },
    []
  );

  // Microcompact gate: when superseded tool results alone push usage past
  // the async threshold, tombstone them first — cheaper than a summary.
  const micro = useMemo(() => microcompactMessages(messages), [messages]);
  useEffect(() => {
    if (compactingGuard.current || compacting || micro.droppedCount === 0) return;
    const before = getCompactionState(messages);
    const after = getCompactionState(micro.messages);
    if (before.atAsyncThreshold && !after.atAsyncThreshold) {
      compactingGuard.current = true;
      setMessages(micro.messages);
      const newEstimated = estimateTokens(micro.messages);
      setTokenUsage({
        estimated: newEstimated,
        limit: 40_000,
        percentage: Math.round(newEstimated / 400),
      });
      setMicrocompactSaved((prev) => prev + micro.estimatedTokensSaved);
      options.onMicrocompact?.({
        droppedCount: micro.droppedCount,
        estimatedTokensSaved: micro.estimatedTokensSaved,
      });
      compactingGuard.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micro.droppedCount]);

  useEffect(() => {
    if (compactingGuard.current || compacting || messages.length === 0) return;
    const state = getCompactionState(messages);
    setCompactionState(state);
    if (!state.atAsyncThreshold) return;
    compactingGuard.current = true;
    setCompacting(true);
    const snapshot = messages;
    compactMessages(snapshot, submitAndWaitForCompaction, {
      onProgress: (phase) => {
        if (phase === 'done') setCompacting(false);
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
      setTimeout(() => { compactingGuard.current = false; }, 0);
    }).catch(() => {
      setCompacting(false);
      setTimeout(() => { compactingGuard.current = false; }, 0);
    });
  }, [messages, compacting, submitAndWaitForCompaction]);

  const submit = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;
      setError(null);

      // Build a session if needed.
      let sid: string = sessionIdRef.current || '';
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
        } else {
          // Local store is always available — UUIDs here are only a fallback
          sid = randomUUID();
          setSessionId(sid);
          sessionIdRef.current = sid;
        }
      }

      // Capture history snapshot BEFORE appending the new user message to avoid duplication
      const historySnapshot = messagesRef.current.slice();

      // Append user message.
      appendMessage({
        role: "user",
        mode: modeRef.current,
        model: modelRef.current,
        parts: [{ type: "text", text: userText }],
      });

      // Append placeholder assistant message.
      const assistantId = nextId("assistant");
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          mode: modeRef.current,
          model: modelRef.current,
          parts: [],
          timestamp: Date.now(),
        },
      ]);

      setLoading(true);
      setStatus("submitted");
      setStreamedText("");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const allMessages: AgentMessage[] = [
          // Use pre-append snapshot so the user message appears exactly once
          ...historySnapshot,
          {
            id: nextId("user"),
            role: "user",
            mode: modeRef.current,
            model: modelRef.current,
            parts: [{ type: "text", text: userText }],
            timestamp: Date.now(),
          },
        ];

        const stream = streamChat(
          {
            id: sid,
            messages: allMessages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.parts.find((p) => p.type === "text")?.text,
              parts: m.parts,
              metadata: { mode: m.mode, model: m.model },
            })),
            mode: modeRef.current,
            model: modelRef.current,
          },
          {
            signal: ctrl.signal,
            onPermissionRequest: options.onPermissionRequest,
          }
        );

        for await (const ev of stream) {
          if (ctrl.signal.aborted) break;
          setStatus("streaming");
          handleEvent(ev, assistantId);
        }
      } catch (e: any) {
        setError(e);
        appendMessage({
          role: "error",
          parts: [{ type: "text", text: e?.message || String(e) }],
        });
      } finally {
        setStatus("idle");
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
    },
    [appendMessage, options, submitAndWaitForCompaction]
  );

  const handleEvent = useCallback(
    (ev: ChatEvent, assistantId: string) => {
      switch (ev.event) {
        case "text": {
          const delta = ev.data?.delta || "";
          setStreamedText((t) => t + delta);
          updateLastMessage((msg) => {
            if (msg.id !== assistantId) return msg;
            const last = msg.parts[msg.parts.length - 1];
            if (last?.type === "text") {
              return {
                ...msg,
                parts: [
                  ...msg.parts.slice(0, -1),
                  { type: "text", text: last.text + delta },
                ],
              };
            }
            return {
              ...msg,
              parts: [...msg.parts, { type: "text", text: delta }],
            };
          });
          break;
        }
        case "reasoning": {
          const text = ev.data?.text || "";
          updateLastMessage((msg) => {
            if (msg.id !== assistantId) return msg;
            const last = msg.parts[msg.parts.length - 1];
            if (last?.type === "reasoning") {
              return {
                ...msg,
                parts: [
                  ...msg.parts.slice(0, -1),
                  { type: "reasoning", text: last.text + text },
                ],
              };
            }
            return {
              ...msg,
              parts: [...msg.parts, { type: "reasoning", text }],
            };
          });
          break;
        }
        case "tool_call": {
          const { toolName, toolCallId, input } = ev.data as any;
          updateLastMessage((msg) => {
            if (msg.id !== assistantId) return msg;
            return {
              ...msg,
              parts: [
                ...msg.parts,
                {
                  type: "tool-call",
                  toolName,
                  toolCallId,
                  input,
                  state: "pending",
                },
              ],
            };
          });
          // Execution happens inside the agent loop (src/agent/loop.js);
          // the loop follows up with a 'tool_result' event for this call.
          break;
        }
        case "tool_result": {
          const { toolCallId, output, error } = ev.data as any;
          updateLastMessage((msg) => {
            if (msg.id !== assistantId) return msg;
            return {
              ...msg,
              parts: msg.parts.map((p) =>
                p.type === "tool-call" && p.toolCallId === toolCallId
                  ? error
                    ? { ...p, state: "output-error", errorText: error }
                    : { ...p, state: "output-available", output }
                  : p
              ),
            };
          });
          break;
        }
        case "error": {
          appendMessage({
            role: "error",
            parts: [{ type: "text", text: ev.data?.message || "Unknown error" }],
          });
          break;
        }
        case "finish":
        case "done": {
          const data = (ev as any).data || {};
          const usageData = data.usage;
          if (usageData?.totalTokens || data.costUsd !== undefined) {
            setTokenUsage((prev) => ({
              estimated: usageData?.totalTokens ?? prev.estimated,
              limit: 40_000,
              percentage: Math.round(((usageData?.totalTokens ?? 0) / 40000) * 100),
              costUsd: data.costUsd ?? prev.costUsd,
            }));
          }
          break;
        }
      }
    },
    [appendMessage, updateLastMessage]
  );

  const clear = useCallback(() => {
    setMessages([]);
    setStreamedText("");
    setError(null);
    setMicrocompactSaved(0);
  }, []);

  return {
    sessionId,
    setSessionId,
    messages,
    loading,
    status,
    error,
    microcompactSaved,
    mode,
    setMode,
    toggleMode: () => setMode((m) => (m === "BUILD" ? "PLAN" : "BUILD")),
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
    compactionState,
    tokenUsage,
    submitAndWaitForCompaction,
  };
}

export { Mode, isReadOnlyTool };
export type SubmitAndWait = (prompt: string, mode?: 'BUILD' | 'PLAN' | 'REVIEW') => Promise<string>;
