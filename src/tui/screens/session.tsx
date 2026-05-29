import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { SessionShell } from '../components/session-shell';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages';
import { CommandMenu } from '../components/command-menu';
import { useTheme } from '../providers/theme';
import { useChat } from '../hooks/use-chat';
import type { CommandContext } from '../components/command-menu/types';

export function Session() {
  const location = useLocation();
  const initialState = location.state as {
    message?: string;
    mode?: 'BUILD' | 'PLAN' | 'SCAN' | 'FIX';
  } | null;
  const initialMessage = initialState?.message;
  const initialMode = initialState?.mode;
  const initialSent = useRef(false);

  const { messages, loading, mode, sendInput, sendCommand, toggleMode, setMode } = useChat({
    persistKey: 'session',
    initialMode,
  });
  const [showCommands, setShowCommands] = useState(false);

  const exitApp = useCallback(() => process.exit(0), []);
  const navigate = useNavigate();
  const { theme } = useTheme();

  const commandCtx: CommandContext = {
    exit: exitApp,
    navigate: (path: string) => navigate(path),
    execute: (action: string) => {
      sendCommand(`/${action}`);
    },
    mode,
    setMode,
  };

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      sendInput(initialMessage);
    }
  }, [initialMessage, sendInput]);

  const handleModeToggle = useCallback(() => toggleMode(), [toggleMode]);
  const handleCommandPalette = useCallback(() => setShowCommands(v => !v), []);

  return (
    <box flexGrow={1} width="100%" height="100%" flexDirection="column">
      <SessionShell
        onSubmit={sendInput}
        onCommand={sendCommand}
        inputDisabled={loading}
        loading={loading}
        mode={mode}
        onModeToggle={handleModeToggle}
        onCommandPalette={handleCommandPalette}
        model="Sentinel v2.0.0"
        statusText={`${messages.length} msgs | ${theme.name}`}
      >
        {messages.length === 0 ? (
          <box padding={2} alignItems="center" justifyContent="center">
            <text attributes={2}>Start a conversation or type /help for commands</text>
          </box>
        ) : null}
        {messages.map(msg => {
          if (msg.role === 'error') {
            return <ErrorMessage key={msg.id} message={msg.content} />;
          }
          if (msg.role === 'user') {
            return <UserMessage key={msg.id} message={msg.content} mode={msg.mode || mode} />;
          }
          if (msg.role === 'assistant' || msg.role === 'system') {
            return <BotMessage key={msg.id} parts={msg.parts} />;
          }
          return null;
        })}
      </SessionShell>

      {showCommands ? (
        <CommandMenu onClose={() => setShowCommands(false)} ctx={commandCtx} />
      ) : null}
    </box>
  );
}
