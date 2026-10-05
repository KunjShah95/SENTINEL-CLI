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
import { expandPromptTemplate } from '../../agent/prompt-templates.js';
import { getTotals as getCostTotals } from '../../agent/cost.js';
import { Home } from '../components/oc/chrome.js';
import { Overlay } from '../components/oc/overlay.js';
import {
  chordOf,
  isInputAction,
  keybinds,
  leaderHints,
  LEADER_TIMEOUT_DEFAULT,
  loadKeybindOverrides,
  setKeybindOverrides,
} from '../keybinds.js';
import { ThemePickerDialog } from '../components/dialogs/theme-picker.js';
import { formatContextReport } from '../lib/context-report.js';
import { getVersion } from '../lib/version.js';
import type { CommandContext } from '../commands/types.js';
import type { CommandContext as PaletteCommandContext } from '../components/command-menu/types.js';
import type { AgentMode, AgentMessage, AgentMessagePart } from '../hooks/use-agent-chat.js';

export function Session() {
  const toast = useToast();
  const dialog = useDialog();
  const { requestPermission } = usePermission();

  const {
    messages, loading, mode, setMode, toggleMode,
    submit, stop, clear, appendMessage, model, setModel, status, sessionId, setSessionId,
    serverStatus, compacting, submitAndWaitForCompaction, microcompactSaved,
    streamedText, waiting,
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

  const [showThinking, setShowThinking] = useState(false); // opencode: one collapsed "Thinking:" line; /thinking expands
  const [showDetails, setShowDetails] = useState(true);

  const tokenUsage = {
    estimated: messages.reduce((acc, m) =>
      acc + m.parts.reduce((s, p) => s + (p.type === 'text' || p.type === 'reasoning' ? (p as any).text?.length ?? 0 : 0), 0), 0
    ) / 3.8,
    limit: 40000,
    get percentage() { return Math.min(100, Math.round(this.estimated / this.limit * 100)); },
  };

  // Real spend: cumulative provider-reported usage × registry price.
  const costUsd = getCostTotals().usd;
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

  const { theme, themes, setTheme } = useTheme();

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
      // Continue IN the selected session: new turns persist there.
      setSessionId(id);
      setShowSessionPanel(false);
    } catch { toast.error('Failed to load session'); }
  }, [clear, appendMessage, setMode, setModel, setSessionId, toast]);

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

  /** Branch the session (pi-mono session tree): the original stays intact. */
  const handleForkSession = useCallback(async (id: string) => {
    try {
      const fork = await Sessions.fork(id);
      toast.success(`Forked → ${fork.title} (${fork.messages} msgs)`);
      await handleSelectSession(fork.id);
    } catch (e) {
      toast.error(`Fork failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [handleSelectSession, toast]);

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

        if (cmd === 'goal') {
          if (!args) { toast.error('Usage: /goal <completion condition>, e.g. /goal npm test exits 0'); return; }
          toast.info(`Goal set: ${args}`);
          submit(`Make this true: ${args}`, { goal: args });
          return;
        }
        if (cmd === 'fork') {
          if (!sessionId) { toast.error('No session to fork yet'); return; }
          await handleForkSession(sessionId);
          return;
        }
        if (cmd === 'theme' || cmd === 'themes') {
          if (args) {
            const found = themes.find((t) => t.name.toLowerCase() === args.toLowerCase());
            if (found) { setTheme(found.name); toast.success(`Theme: ${found.name}`); } else toast.error(`Unknown theme "${args}"`);
            return;
          }
          dialog.open({
            title: `Themes (${themes.length})`, width: 60, height: 24,
            children: <ThemePickerDialog onClose={() => dialog.close()} />,
          });
          return;
        }
        if (cmd === 'context') {
          appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: formatContextReport(messages, tokenUsage.limit) }] });
          return;
        }
        if (cmd === 'steer') {
          if (!args) { toast.error('Usage: /steer <message> (or just type while a turn is running)'); return; }
          submit(args);
          return;
        }
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
        // Prompt templates (.sentinel/prompts/<name>.md) — expanded in submit().
        if (expandPromptTemplate(value).template) {
          toast.info(`Prompt template: /${cmd}`);
          submit(value);
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
    [clear, dialog, appendMessage, mode, model, toggleMode, toast, submit, setMode, handleExternalEditor, appendMessageSafe, messages, showThinking, showDetails, loading, compacting, sessionId, setModel, submitAndWaitForCompaction, handleSelectSession, handleForkSession]
  );

  const [leaderPending, setLeaderPending] = useState(false);
  const leaderTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [leaderTimeout, setLeaderTimeout] = useState(LEADER_TIMEOUT_DEFAULT);

  // Compile the bindings once the config is readable, so a user's keybinds take
  // effect everywhere at the same time rather than per-component.
  useEffect(() => {
    let cancelled = false;
    loadKeybindOverrides().then(({ keybinds: overrides, leaderTimeout: ms }) => {
      if (cancelled) return;
      setKeybindOverrides(overrides);
      setLeaderTimeout(ms);
    });
    return () => { cancelled = true; };
  }, []);

  const runAction = useCallback((action: string) => {
    switch (action) {
      case 'session.toggle.thinking': setShowThinking((v) => !v); return true;
      case 'session.toggle.details': setShowDetails((v) => !v); return true;
      case 'sentinel.mode.toggle': toggleMode(); return true;
      case 'model.list':
        dialog.open({ title: 'Model Picker', width: 60, height: 25, children: <ModelPickerDialog currentModel={model} onSelect={(m) => { setModel(m); dialog.close(); }} /> });
        return true;
      case 'command.palette.show': setShowCommands((v) => !v); return true;
      case 'session.new': clear(); toast.info('New session'); return true;
      case 'session.list': setShowSessionPanel(true); return true;
      case 'session.sidebar.toggle': setShowSessionPanel((v) => !v); return true;
      case 'session.status': wrappedSubmit('/health'); return true;
      case 'session.compact': wrappedSubmit('/compact'); return true;
      case 'session.undo': wrappedSubmit('/undo'); return true;
      case 'session.redo': wrappedSubmit('/redo'); return true;
      case 'session.export': wrappedSubmit('/export'); return true;
      case 'session.background': wrappedSubmit('/background'); return true;
      case 'agent.list': wrappedSubmit('/agents'); return true;
      case 'prompt.editor': handleExternalEditor(); return true;
      case 'help.show': handleHelp(); return true;
      case 'sentinel.logs': handleLogs(); return true;
      case 'app.exit': process.exit(0);
      default: return false;
    }
  }, [clear, dialog, handleExternalEditor, handleHelp, handleLogs, model, setModel, toast, toggleMode, wrappedSubmit]);

  useInput((input, key) => {
    const { leader, app } = keybinds();
    const chord = chordOf(input, key as any);
    if (!chord) return;

    // Leader is a prefix, not an action: swallow it and read the next chord.
    if (leaderPending) {
      clearTimeout(leaderTimeoutRef.current);
      setLeaderPending(false);
      if (chord === 'escape') return;
      const action = app.get(leader + chord);
      if (action && runAction(action)) return;
      toast.info(`Unknown leader key: ${chord}`);
      return;
    }

    if (chord === leader) {
      setLeaderPending(true);
      leaderTimeoutRef.current = setTimeout(() => setLeaderPending(false), leaderTimeout);
      const hints = leaderHints(leader, app);
      if (hints) toast.info(`Leader — ${hints}`);
      return;
    }

    const action = app.get(chord);
    // Prompt-owned actions are PromptInput's business; ignore them here.
    if (action && !isInputAction(action) && runAction(action)) return;
  }, { isActive: !dialog.isOpen && !showCommands });

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
        const { findSupportedChatModel, refreshModels } = await import('../../shared/models/index.js');
        // Local models (Ollama, LM Studio) only exist after discovery; without
        // this a saved local pick was dropped and overwritten on every launch.
        if (!findSupportedChatModel(saved)) await refreshModels();
        // A local model that is missing only because its daemon is down stays
        // selected: the first turn then says "start ollama serve" instead of
        // silently switching to a provider the user never chose.
        if (findSupportedChatModel(saved) || /^(ollama|lmstudio)\//.test(saved)) {
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
        if (best) {
          // An automatic pick is not a preference: mark it seen so the save
          // effect above does not overwrite the user's saved choice with it.
          lastModelRef.current = best;
          setModel(best);
        }
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
          onFork={handleForkSession}
          onDelete={handleDeleteSession}
          onClose={() => setShowSessionPanel(false)}
        />
      ) : null}
      <Box flexGrow={1} flexDirection="column">
        <SessionShell
          onSubmit={wrappedSubmit}
          onShellCommand={handleShell}
          inputDisabled={compacting || dialog.isOpen || showCommands}
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
          streamedChars={streamedText.length}
          waiting={waiting}
          modalOpen={dialog.isOpen || showCommands}
        >
          {messages.length === 0 ? <Home version={getVersion()} /> : null}
          {messages.map((msg, idx) => {
            if (msg.role === 'error') {
              const textPart = msg.parts.find((p): p is { type: 'text'; text: string } => p.type === 'text');
              return <ErrorMessage key={msg.id} message={textPart?.text || 'Unknown error'} />;
            }
            if (msg.role === 'user') {
              const textPart = msg.parts.find((p): p is { type: 'text'; text: string } => p.type === 'text');
              return <UserMessage key={msg.id} message={textPart?.text || ''} mode={msg.mode || mode} />;
            }
            if (msg.role === 'assistant') {
              const inFlight = isLoading && idx === messages.length - 1;
              return (
                <BotMessage
                  key={msg.id}
                  parts={msg.parts as any}
                  model={msg.model || model}
                  mode={msg.mode || mode}
                  done={!inFlight}
                  duration={msg.durationMs}
                  interrupted={msg.interrupted}
                  showThinking={showThinking}
                  showDetails={showDetails}
                />
              );
            }
            return null;
          })}
        </SessionShell>

        {showCommands ? (
          <Overlay title="Command Palette" width={80} hint="↑↓ navigate · Enter run · Esc close">
            <CommandMenu onClose={() => setShowCommands(false)} ctx={commandCtx} />
          </Overlay>
        ) : null}
      </Box>
    </Box>
  );
}
