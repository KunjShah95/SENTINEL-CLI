import { useCallback, useEffect, useRef, useState } from 'react';
import { chat } from '../lib/chat';
import { getModeContext } from '../lib/tools';
import { COMMAND_HANDLERS } from '../lib/commands';
import { loadSession, saveSession, clearSession } from '../lib/session';
import { isAuthPending, handleAuthInput } from '../lib/auth-flow';
let idCounter = 0;
function generateId() {
  return `msg_${Date.now()}_${++idCounter}`;
}
export function useChat(options = {}) {
  const persistKey = options.persistKey || 'default';
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(options.initialMode || 'BUILD');
  const modeRef = useRef(mode);
  const loadedRef = useRef(false);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    if (loadedRef.current)
      return;
    loadedRef.current = true;
    const saved = loadSession(persistKey);
    if (saved && saved.length > 0) {
      setMessages(saved);
    }
  }, [persistKey]);
  useEffect(() => {
    if (loadedRef.current && messages.length > 0) {
      saveSession(persistKey, messages);
    }
  }, [messages, persistKey]);
  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { ...msg, id: generateId(), timestamp: Date.now() }]);
  }, []);
  const removeLastMessage = useCallback(() => {
    setMessages(prev => prev.slice(0, -1));
  }, []);
  const clear = useCallback(() => {
    setMessages([]);
    clearSession(persistKey);
  }, [persistKey]);
  const send = useCallback(async (content) => {
    const currentMode = modeRef.current;
    addMessage({
      role: 'user',
      content,
      mode: currentMode,
      parts: [{ type: 'text', text: content }],
    });
    setLoading(true);
    try {
      const modeCtx = getModeContext(currentMode);
      const augmentedContent = `[${currentMode} MODE]\n${modeCtx}\n\nUser: ${content}`;
      const text = await chat(augmentedContent);
      addMessage({
        role: 'assistant',
        content: text || '(no response)',
        parts: [{ type: 'text', text: text || '(no response)' }],
      });
    }
    catch (err) {
      addMessage({
        role: 'error',
        content: String(err),
        parts: [{ type: 'text', text: String(err) }],
      });
    }
    setLoading(false);
  }, [addMessage]);
  const sendCommand = useCallback(async (command) => {
    const parts = command.slice(1).split(/\s+/);
    const cmdName = parts[0].toLowerCase();
    const cmdArgs = parts.slice(1).join(' ');
    addMessage({
      role: 'user',
      content: command,
      mode: modeRef.current,
      parts: [{ type: 'text', text: command }],
    });
    const handler = COMMAND_HANDLERS[cmdName];
    if (!handler) {
      addMessage({
        role: 'error',
        content: `Unknown command: ${cmdName}. Type /help for available commands.`,
        parts: [
          {
            type: 'text',
            text: `Unknown command: ${cmdName}. Type /help for available commands.`,
          },
        ],
      });
      return;
    }
    setLoading(true);
    try {
      if (cmdName === 'new' || cmdName === 'clear') {
        clear();
        addMessage({
          role: 'assistant',
          content: 'Session cleared. Start a new conversation.',
          parts: [{ type: 'text', text: 'Session cleared. Start a new conversation.' }],
        });
        return;
      }
      const result = await handler.handler(cmdArgs);
      addMessage({ role: 'assistant', content: result, parts: [{ type: 'text', text: result }] });
    }
    catch (err) {
      addMessage({
        role: 'error',
        content: String(err),
        parts: [{ type: 'text', text: String(err) }],
      });
    }
    setLoading(false);
  }, [addMessage, removeLastMessage, clear]);
  const sendInput = useCallback((value) => {
    if (value.startsWith('/')) {
      sendCommand(value);
      return;
    }
    if (isAuthPending()) {
      const key = value;
      addMessage({
        role: 'user',
        content: '(API key entered)',
        mode: modeRef.current,
        parts: [{ type: 'text', text: '(API key entered)' }],
      });
      setLoading(true);
      handleAuthInput(key).then(result => {
        addMessage({
          role: 'assistant',
          content: result,
          parts: [{ type: 'text', text: result }],
        });
        setLoading(false);
      });
      return;
    }
    send(value);
  }, [send, sendCommand, addMessage]);
  const toggleMode = useCallback(() => {
    setMode(prev => {
      const modes = ['BUILD', 'PLAN', 'SCAN', 'FIX'];
      const idx = modes.indexOf(prev);
      return modes[(idx + 1) % modes.length];
    });
  }, []);
  return {
    messages,
    loading,
    mode,
    setMode,
    send,
    sendCommand,
    sendInput,
    clear,
    toggleMode,
    addMessage,
  };
}
