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

import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "node:crypto";
import { streamChat, Sessions, checkServerHealth, type ChatEvent } from "../lib/api-client.js";
import { runLocalTool, Mode, isReadOnlyTool } from "../lib/local-tools.js";

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

function buildLocalSystemPrompt(mode: string) {
  if (mode === 'PLAN') {
    return 'You are a senior software engineer. Your task is to explore the codebase and propose a plan. You have access to read-only tools: readFile, listDirectory, glob, grep, searchWeb. Do NOT write any code or make changes. Be thorough in your analysis.';
  }
  return 'You are a senior software engineer working in a terminal. You have access to tools: readFile, listDirectory, glob, grep, searchWeb, writeFile, editFile, batchEdit, bash. You can read, write, and execute commands. Be thorough and precise.';
}

type UseAgentChatOptions = {
  initialSessionId?: string;
  initialMode?: AgentMode;
  initialModel?: string;
  /** Function to navigate to a new route (e.g. /sessions/new). */
  onSessionCreated?: (id: string) => void;
};

export function useAgentChat(options: UseAgentChatOptions = {}) {
  const [sessionId, setSessionId] = useState<string | undefined>(options.initialSessionId);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitted" | "streaming">("idle");
  const [error, setError] = useState<Error | null>(null);
  const [mode, setMode] = useState<AgentMode>(options.initialMode || "BUILD");
  const [model, setModel] = useState<string>(options.initialModel || "claude-sonnet-4-6");
  const [streamedText, setStreamedText] = useState<string>("");

  const sessionIdRef = useRef(sessionId);
  const modeRef = useRef(mode);
  const modelRef = useRef(model);
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const [useServer, setUseServer] = useState(true);
  const serverAvailableRef = useRef(true);
  const [serverStatus, setServerStatus] = useState<"connected" | "local">("connected");

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

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

  const submit = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;
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
        } else {
          // Server not available — fall back to local mode
          serverAvailableRef.current = false;
          setServerStatus("local");
          sid = randomUUID();
          setSessionId(sid);
          sessionIdRef.current = sid;
        }
      }

      // Append user message.
      appendMessage({
        role: "user",
        mode: modeRef.current,
        model: modeRef.current,
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
          model: modeRef.current,
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
          // Snapshot of messages BEFORE the placeholder
          ...messages,
          {
            id: nextId("user"),
            role: "user",
            mode: modeRef.current,
            model: modeRef.current,
            parts: [{ type: "text", text: userText }],
            timestamp: Date.now(),
          },
        ];

        const stream = streamChat({
          id: sid,
          messages: allMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.parts.find((p) => p.type === "text")?.text,
            parts: m.parts,
            metadata: { mode: m.mode, model: m.model },
          })),
          mode: modeRef.current,
          model: modeRef.current,
        });

        for await (const ev of stream) {
          if (ctrl.signal.aborted) break;
          setStatus("streaming");
          handleEvent(ev, assistantId);
        }
      } catch (e: any) {
        if (!serverAvailableRef.current) {
          // Fallback to local orchestrator
          try {
            let systemPrompt: string;
            try {
              const { buildSystemPrompt } = await import("../../server/api/lib/system-prompt.js");
              systemPrompt = buildSystemPrompt({ mode: modeRef.current });
            } catch {
              systemPrompt = buildLocalSystemPrompt(modeRef.current);
            }
            const { getLLMOrchestrator } = await import("../../llm/llmOrchestrator.js");
            const orchestrator = getLLMOrchestrator({});
            const stream = await orchestrator.streamChat(userText, { systemPrompt });
            for await (const chunk of stream) {
              if (ctrl.signal.aborted) break;
              setStatus("streaming");
              if (chunk.type === 'content') {
                handleEvent({ event: 'text', data: { delta: chunk.content } }, assistantId);
              } else if (chunk.type === 'error') {
                handleEvent({ event: 'error', data: { message: chunk.content } }, assistantId);
              } else if (chunk.type === 'done') {
                break;
              }
            }
          } catch (fallbackErr: any) {
            setError(fallbackErr);
            appendMessage({
              role: "error",
              parts: [{ type: "text", text: fallbackErr?.message || String(fallbackErr) }],
            });
          }
        } else {
          setError(e);
          appendMessage({
            role: "error",
            parts: [{ type: "text", text: e?.message || String(e) }],
          });
        }
      } finally {
        setStatus("idle");
        setLoading(false);
        abortRef.current = null;
      }
    },
    [messages, appendMessage, options]
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
          // Execute the tool locally. PLAN mode blocks write/edit/bash.
          (async () => {
            const output = await runLocalTool(toolName, input, modeRef.current);
            updateLastMessage((msg) => {
              if (msg.id !== assistantId) return msg;
              return {
                ...msg,
                parts: msg.parts.map((p) =>
                  p.type === "tool-call" && p.toolCallId === toolCallId
                    ? output && typeof output === "object" && "error" in output
                      ? { ...p, state: "output-error", errorText: output.error as string }
                      : { ...p, state: "output-available", output }
                    : p
                ),
              };
            });
          })();
          break;
        }
        case "tool_result": {
          const { toolCallId, output } = ev.data as any;
          updateLastMessage((msg) => {
            if (msg.id !== assistantId) return msg;
            return {
              ...msg,
              parts: msg.parts.map((p) =>
                p.type === "tool-call" && p.toolCallId === toolCallId
                  ? { ...p, state: "output-available", output }
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
        case "done":
          break;
      }
    },
    [appendMessage, updateLastMessage]
  );

  const clear = useCallback(() => {
    setMessages([]);
    setStreamedText("");
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
  };
}

export { Mode, isReadOnlyTool };
