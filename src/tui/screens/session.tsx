import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SessionShell } from '../components/session-shell.js';
import { SessionPanel } from '../components/session-panel.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { CommandMenu } from '../components/command-menu/index.js';
import { ProviderSetupDialog, PROVIDER_ENV_KEYS } from '../components/dialogs/provider-setup.js';
import { ModelPickerDialog } from '../components/dialogs/model-picker.js';
import { HelpDialog } from '../components/dialogs/help-dialog.js';
import { LogViewer, appendLog } from '../components/dialogs/log-viewer.js';
import { usePermission } from '../components/dialogs/permission-dialog.js';
import { useTheme } from '../providers/theme/index.js';
import { useDialog } from '../providers/dialog/index.js';
import { useToast } from '../providers/toast/index.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { Sessions } from '../lib/api-client.js';
import { executeCommand } from '../commands/index.js';
import { executeCustomCommand } from '../lib/custom-commands.js';
import { parseMentions, buildAgentPrompt } from '../../shared/tools/agent-mentions.js';
import type { CommandContext } from '../commands/types.js';
import type { CommandContext as PaletteCommandContext } from '../components/command-menu/types.js';
import type { AgentMode, AgentMessage, AgentMessagePart } from '../hooks/use-agent-chat.js';

export function Session() {
  const toast = useToast();
  const dialog = useDialog();
  const { requestPermission } = usePermission();

  const {
    messages, loading, mode, setMode, toggleMode,
    submit, stop, clear, appendMessage, model, setModel, status, sessionId,
    serverStatus, compacting, submitAndWaitForCompaction, microcompactSaved,
  } = useAgentChat({
    onPermissionRequest: useCallback(async (toolName: string, toolCallId: string, input: unknown) => {
      return requestPermission({ toolName, toolCallId, input });
    }, [requestPermission]),
    onMicrocompact: useCallback((stats: { droppedCount: number; estimatedTokensSaved: number }) => {
      toast.success(
        `Microcompacted ${stats.droppedCount} stale tool result${stats.droppedCount === 1 ? '' : 's'} — saved ~${stats.estimatedTokensSaved.toLocaleString()} tokens`
      );
    }, [toast]),
  });

  const [showThinking, setShowThinking] = useState(true);
  const [showDetails, setShowDetails] = useState(true);

  const tokenUsage = {
    estimated: messages.reduce((acc, m) =>
      acc + m.parts.reduce((s, p) => s + (p.type === 'text' || p.type === 'reasoning' ? (p as any).text?.length ?? 0 : 0), 0), 0
    ) / 3.8,
    limit: 40000,
    get percentage() { return Math.min(100, Math.round(this.estimated / this.limit * 100)); },
  };

  const costUsd = tokenUsage.estimated > 0
    ? (tokenUsage.estimated / 1_000_000) * 3.0 // ~$3/M tokens blended rate (Claude Sonnet)
    : 0;
  const [showCommands, setShowCommands] = useState(false);
  const [showSessionPanel, setShowSessionPanel] = useState(false);

  const handleHelp = useCallback(() => {
    dialog.open({ title: 'Keyboard & Command Reference', width: 80, height: 40, children: <HelpDialog /> });
  }, [dialog]);

  const handleLogs = useCallback(() => {
    dialog.open({ title: 'Session Logs', width: 90, height: 30, children: <LogViewer /> });
  }, [dialog]);

  const handleExternalEditor = useCallback(async () => {
    try {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const path = await import('node:path');
      const tmpFile = path.join(os.tmpdir(), `sentinel-editor-${Date.now()}.md`);
      const editor = process.env.EDITOR || process.env.VISUAL || (process.platform === 'win32' ? 'notepad' : 'vi');
      fs.writeFileSync(tmpFile, '', 'utf-8');
      const { execSync } = await import('child_process');
      execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit', timeout: 300000 });
      const content = fs.readFileSync(tmpFile, 'utf-8').trim();
      fs.unlinkSync(tmpFile);
      if (content) {
        submit(content);
      } else {
        toast.info('Editor returned empty — nothing submitted');
      }
    } catch (e: any) {
      if (e.message?.includes('timeout')) {
        toast.error('Editor timed out (5 min limit)');
      } else {
        toast.error('Editor failed: ' + String(e.message || e));
      }
    }
  }, [submit, toast]);

  const { theme } = useTheme();

  const appendMessageSafe = useCallback(
    (msg: Omit<AgentMessage, 'id' | 'timestamp'>) => {
      appendMessage({
        role: msg.role,
        mode: msg.mode,
        model: msg.model,
        parts: msg.parts as unknown as AgentMessagePart[],
      });
    },
    [appendMessage]
  );

  const handleShell = useCallback(async (cmd: string) => {
    appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `! ${cmd}` }] });
    try {
      const { execSync } = await import('child_process');
      const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
      const truncated = output.length > 4000 ? output.slice(0, 4000) + '\n... (output truncated)' : output;
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `\`\`\`\n${truncated}\n\`\`\`` }] });
    } catch (e: any) {
      appendMessage({ role: 'error', mode, model, parts: [{ type: 'text', text: `Shell error: ${e.stderr || e.message}` }] });
    }
  }, [appendMessage, mode, model]);

  const handleSelectSession = useCallback(async (id: string) => {
    try {
      const session = await Sessions.get(id);
      if (!session) { toast.error('Session not found'); return; }
      clear();
      if (session.messages && Array.isArray(session.messages)) {
        for (const m of session.messages) {
          appendMessage({
            role: m.role === 'user' || m.role === 'assistant' || m.role === 'error' ? m.role : 'assistant',
            parts: (m.parts || (m.content ? [{ type: 'text', text: m.content }] : [])) as unknown as AgentMessagePart[],
            mode: (m.metadata?.mode === 'BUILD' || m.metadata?.mode === 'PLAN' || m.metadata?.mode === 'REVIEW' ? m.metadata.mode : session.mode) as AgentMode | undefined,
            model: ((m.metadata?.model as string | undefined) ?? session.model) || undefined,
          });
        }
      }
      if (session.mode === 'BUILD' || session.mode === 'PLAN' || session.mode === 'REVIEW') setMode(session.mode as AgentMode);
      if (session.model) setModel(session.model);
      setShowSessionPanel(false);
    } catch { toast.error('Failed to load session'); }
  }, [clear, appendMessage, setMode, setModel, toast]);

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      const ok = await Sessions.delete(id);
      if (ok) {
        if (messages.length > 0) clear();
        toast.success('Session deleted');
      } else {
        toast.error('Failed to delete session');
      }
    } catch {
      toast.error('Failed to delete session');
    }
  }, [clear, toast]);

  const wrappedSubmit = useCallback(
    async (value: string) => {
      if (value.startsWith('/')) {
        const cmd = value.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
        const args = value.replace(/^\/(\w+)\s*/i, '').trim();

        // Route to extracted command handlers
        const handled = await executeCommand(cmd, {
          cmd, args, mode, model, messages, showThinking, showDetails,
          loading, compacting, sessionId: sessionId ?? null,
          toast,
          dialog,
          appendMessage: appendMessageSafe as CommandContext['appendMessage'],
          submit,
          clear,
          setMode, setModel, toggleMode, setShowThinking, setShowDetails,
          handleExternalEditor, handleSelectSession,
          submitAndWaitForCompaction,
        });
        if (handled) return;

        if (cmd === 'clear') { clear(); return; }
        if (cmd === 'new') { clear(); toast.info('New session'); return; }
        if (cmd === 'mode') { toggleMode(); return; }
        if (cmd === 'editor') { handleExternalEditor(); return; }
        if (cmd === 'thinking') { setShowThinking(v => !v); toast.info(`Thinking blocks ${showThinking ? 'hidden' : 'shown'}`); return; }
        if (cmd === 'details') { setShowDetails(v => !v); toast.info(`Tool details ${showDetails ? 'hidden' : 'shown'}`); return; }
        if (cmd === 'sessions' || cmd === 'panel') { setShowSessionPanel(v => !v); return; }

        if (cmd === 'compact') {
          (async () => {
            try {
              const { compactMessages } = await import('../lib/context-compactor.js');
              toast.info('Compacting session...');
              const result = await compactMessages(messages, submitAndWaitForCompaction);
              if (result.compacted && Array.isArray(result.messages)) {
                clear();
                for (const msg of result.messages) {
                  appendMessage({ role: msg.role as any, parts: msg.parts, mode: (msg as any).mode, model: (msg as any).model });
                }
                toast.success(`Compacted: ${result.oldCount} → ${result.newCount} messages, saved ~${result.estimatedTokensSaved} tokens`);
              } else { toast.info('Session already compact, nothing to do'); }
            } catch (e) { toast.error('Compact failed: ' + String(e)); }
          })();
          return;
        }

        if (cmd === 'setup' || cmd === 'connect') {
          dialog.open({
            title: 'AI Provider Setup', width: 72, height: 35,
            children: <ProviderSetupDialog onComplete={() => { toast.success('Provider setup complete. Run /health to verify.'); dialog.close(); }} />,
          });
          return;
        }

        const customPrompt = executeCustomCommand(cmd, args, { mode, model });
        if (customPrompt) {
          toast.info(`Running custom command: /${cmd}`);
          submit(customPrompt);
          return;
        }
        toast.error(`Unknown command "${cmd}". Type /help for commands.`);
        return;
      }
      // Check for @agent mentions and route accordingly
      const { mentions, cleanMessage } = parseMentions(value);
      if (mentions.length > 0) {
        const agentResult = buildAgentPrompt(mentions[0].name, cleanMessage, { mode, model });
        if (agentResult) {
          const prevMode = mode;
          if (agentResult.mode !== mode && (agentResult.mode === 'BUILD' || agentResult.mode === 'PLAN' || agentResult.mode === 'REVIEW')) {
            setMode(agentResult.mode as AgentMode);
          }
          const enhancedPrompt = `[Agent: ${agentResult.agent.label}]\n${agentResult.agentHint}\n\n${agentResult.prompt}`;
          submit(enhancedPrompt);
          return;
        }
      }
      submit(value);
    },
    [clear, dialog, appendMessage, mode, model, toggleMode, toast, submit, setMode, handleExternalEditor, appendMessageSafe, messages, showThinking, showDetails, loading, compacting, sessionId, setModel, submitAndWaitForCompaction, handleSelectSession]
  );

  const [leaderKey, setLeaderKey] = useState<'none' | 'ctrl-x'>('none');
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useInput((input, key) => {
    if (leaderKey === 'ctrl-x') {
      clearTimeout(leaderTimeoutRef.current);
      setLeaderKey('none');
      const ch = input.toLowerCase();
      if (ch === 't')       { setShowThinking(v => !v); toast.info(`Thinking ${showThinking ? 'hidden' : 'shown'}`); return; }
      if (ch === 'd')       { setShowDetails(v => !v); toast.info(`Details ${showDetails ? 'hidden' : 'shown'}`); return; }
      if (ch === 'm')       { dialog.open({ title: 'Model Picker', width: 60, height: 25, children: <ModelPickerDialog currentModel={model} onSelect={(m) => { setModel(m); dialog.close(); }} /> }); return; }
      if (ch === 'p')       { setShowCommands(v => !v); return; }
      if (ch === 'c')       { clear(); return; }
      if (ch === 'n')       { clear(); toast.info('New session'); return; }
      if (ch === 's')       { setShowSessionPanel(v => !v); return; }
      if (ch === 'e' || ch === 'i') { handleExternalEditor(); return; }
      if (ch === 'l')       { handleLogs(); return; }
      if (ch === '/' || ch === '?') { handleHelp(); return; }
      if (input === 'x')    { return; }
      toast.info(`Unknown leader key: ${ch}`);
      return;
    }

    if (key.ctrl && input === 's') {
      setShowSessionPanel(v => !v);
      return;
    }

    if (key.ctrl && input === 'x') {
      setLeaderKey('ctrl-x');
      toast.info('Leader: T(thinking) D(details) M(model) P(palette) C(clear) N(new) S(session) E(editor) L(logs) ?(help)');
      leaderTimeoutRef.current = setTimeout(() => { setLeaderKey('none'); }, 3000);
      return;
    }

    if (key.ctrl && input === '/') {
      handleHelp();
      return;
    }
  });

  const lastModelRef = useRef(model);
  useEffect(() => {
    if (lastModelRef.current === model) return;
    lastModelRef.current = model;
    import('../../shared/models/prefs.js').then(m => m.saveLastModel(model)).catch(() => {});
  }, [model]);

  const firstRunChecked = useRef(false);
  useEffect(() => {
    if (firstRunChecked.current) return;
    firstRunChecked.current = true;
    (async () => {
      const { loadLastModel } = await import('../../shared/models/prefs.js');
      const saved = await loadLastModel();
      if (saved) {
        const { findSupportedChatModel } = await import('../../shared/models/index.js');
        if (findSupportedChatModel(saved)) {
          setModel(saved);
          return;
        }
      }
      const { configManager } = await import('../../config/configManager.js');
      await configManager.load();
      const configured = configManager.getConfiguredProviders();
      const hasEnvKeys = PROVIDER_ENV_KEYS.some(k => process.env[k]);
      // Local providers (Ollama / LM Studio) need no API key — if their daemon is
      // running, discovery returns their installed models. Detecting any means we
      // can skip the provider-setup prompt and just use a local model.
      const { refreshModels, getRankedModels, isLocalProvider, autoSelectBestModel } =
        await import('../../shared/models/index.js');
      await refreshModels();
      const hasLocalModels = getRankedModels().some(m => isLocalProvider(m.provider));
      if (configured.length > 0 || hasEnvKeys || hasLocalModels) {
        const best = autoSelectBestModel();
        if (best) setModel(best);
        return;
      }
      dialog.open({
        title: 'Welcome to Sentinel — Set Up AI Providers',
        width: 72,
        height: 35,
        children: (
          <ProviderSetupDialog onComplete={() => {
            toast.success('Providers configured!');
            dialog.close();
          }} />
        ),
      });
    })();
  }, []);

  // Keep a ref so the interval always reads the latest messages without needing to re-register.
  const autoCompactMessagesRef = useRef(messages);
  useEffect(() => { autoCompactMessagesRef.current = messages; }, [messages]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (loading || compacting) return;
      const currentMessages = autoCompactMessagesRef.current;
      import('../lib/context-compactor.js').then(({ getCompactionState, compactMessages }) => {
        const state = getCompactionState(currentMessages);
        if (state.atSyncThreshold) {
          appendLog('warn', `Auto-compact triggered at ${state.percentage}% token usage`);
          toast.warning(`Token usage at ${state.percentage}% — auto-compacting...`);
          (async () => {
            try {
              const result = await compactMessages(currentMessages, submitAndWaitForCompaction);
              if (result.compacted && Array.isArray(result.messages)) {
                clear();
                for (const msg of result.messages) {
                  appendMessage({ role: msg.role as any, parts: msg.parts, mode: (msg as any).mode, model: (msg as any).model });
                }
                appendLog('info', `Auto-compacted: ${result.oldCount} → ${result.newCount} messages, saved ~${result.estimatedTokensSaved} tokens`);
                toast.success(`Auto-compacted: ~${result.estimatedTokensSaved} tokens saved`);
              }
            } catch (e) {
              appendLog('error', `Auto-compact failed: ${e}`);
            }
          })();
        }
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [toast, submitAndWaitForCompaction, clear, appendMessage]);

  const handleModeToggle = useCallback(() => toggleMode(), [toggleMode]);
  const handleCommandPalette = useCallback(() => setShowCommands(v => !v), []);

  const isLoading = loading || status === 'streaming';

  const commandCtx: PaletteCommandContext = {
    exit: () => process.exit(0),
    navigate: () => {},
    execute: (action: string) => { wrappedSubmit(`/${action}`); },
    toggleSessionPanel: () => setShowSessionPanel(v => !v),
  };

  return (
    <Box flexGrow={1} width="100%" flexDirection="row">
      {showSessionPanel ? (
        <SessionPanel
          currentSessionId={sessionId}
          onSelect={handleSelectSession}
          onFork={async () => { toast.info('Fork: start a new session and /export for history'); }}
          onDelete={handleDeleteSession}
          onClose={() => setShowSessionPanel(false)}
        />
      ) : null}
      <Box flexGrow={1} flexDirection="column">
        <SessionShell
          onSubmit={wrappedSubmit}
          onShellCommand={handleShell}
          inputDisabled={isLoading}
          loading={isLoading}
          mode={mode}
          onModeToggle={handleModeToggle}
          onCommandPalette={handleCommandPalette}
          model={model}
          sessionId={sessionId}
          statusText={`${messages.length} msgs · ${theme.name}`}
          tokenUsage={tokenUsage.estimated > 0 ? tokenUsage : undefined}
          microcompactSaved={microcompactSaved}
          serverStatus={serverStatus}
          costUsd={costUsd}
          showThinking={showThinking}
          showDetails={showDetails}
          compacting={compacting}
          onStop={stop}
        >
          {messages.length === 0 ? (
            <Box padding={2} alignItems="center" justifyContent="center">
              <Text dimColor>{'Start a conversation or type /help for commands'}</Text>
            </Box>
          ) : null}
          {messages.map(msg => {
            if (msg.role === 'error') {
              const textPart = msg.parts.find((p): p is { type: 'text'; text: string } => p.type === 'text');
              return <ErrorMessage key={msg.id} message={textPart?.text || 'Unknown error'} />;
            }
            if (msg.role === 'user') {
              const textPart = msg.parts.find((p): p is { type: 'text'; text: string } => p.type === 'text');
              return <UserMessage key={msg.id} message={textPart?.text || ''} mode={msg.mode || mode} />;
            }
            if (msg.role === 'assistant') {
              return <BotMessage key={msg.id} parts={msg.parts} model={msg.model || model} showThinking={showThinking} showDetails={showDetails} />;
            }
            return null;
          })}
        </SessionShell>

        {showCommands ? (
          <CommandMenu onClose={() => setShowCommands(false)} ctx={commandCtx} />
        ) : null}
      </Box>
    </Box>
  );
}
