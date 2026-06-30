import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useLocation, useNavigate } from 'react-router';
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
import type { CommandContext } from '../components/command-menu/types.js';
import type { AgentMode, AgentMessagePart } from '../hooks/use-agent-chat.js';

export function Session() {
  const location = useLocation();
  const initialState = location.state as {
    message?: string;
    mode?: 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX';
  } | null;
  const initialMessage = initialState?.message;
  const initialMode = initialState?.mode;
  const initialSent = useRef(false);

  const toast = useToast();
  const dialog = useDialog();
  const { requestPermission } = usePermission();

  const {
    messages, loading, mode, setMode, toggleMode,
    submit, stop, clear, appendMessage, model, setModel, status, sessionId,
    serverStatus, compacting, submitAndWaitForCompaction, submitWithModel,
  } = useAgentChat({
    initialMode: initialMode === 'BUILD' || initialMode === 'PLAN' || initialMode === 'REVIEW' ? initialMode : undefined,
    onPermissionRequest: useCallback(async (toolName: string, toolCallId: string, input: unknown) => {
      return requestPermission({ toolName, toolCallId, input });
    }, [requestPermission]),
  });

  const [showThinking, setShowThinking] = useState(true);
  const [showDetails, setShowDetails] = useState(true);

  const [loopState, setLoopState] = useState<{
    active: boolean;
    prompt: string;
    iterations: number;
    maxIterations: number;
  }>({ active: false, prompt: '', iterations: 0, maxIterations: 20 });

  const prevLoadingRef = useRef(loading);
  const loopPromptRef = useRef('');
  const loopActiveRef = useRef(false);
  const loopIterationsRef = useRef(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect agent idle while loop is active
  useEffect(() => {
    if (prevLoadingRef.current && !loading && loopActiveRef.current) {
      const lastMsg = messages[messages.length - 1];
      const hasPromise = lastMsg?.parts?.some(p =>
        p.type === 'text' && typeof p.text === 'string' && p.text.includes('<promise>DONE</promise>')
      );

      if (hasPromise) {
        toast.success(`Loop completed after ${loopIterationsRef.current} iteration(s)`);
        setLoopState({ active: false, prompt: '', iterations: 0, maxIterations: 20 });
        loopActiveRef.current = false;
        appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✓ Loop completed after ${loopIterationsRef.current} iteration(s).` }] });
      } else {
        const nextIter = loopIterationsRef.current + 1;
        if (nextIter >= (loopState.maxIterations || 20)) {
          toast.warning('Max iterations reached, stopping loop');
          appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `⚠ Loop stopped after ${nextIter} iterations (max reached).` }] });
          setLoopState({ active: false, prompt: '', iterations: 0, maxIterations: 20 });
          loopActiveRef.current = false;
        } else {
          loopIterationsRef.current = nextIter;
          setLoopState(s => ({ ...s, iterations: nextIter }));
          toast.info(`Loop iteration ${nextIter}/${loopState.maxIterations}`);
          if (loopTimeoutRef.current) clearTimeout(loopTimeoutRef.current);
          loopTimeoutRef.current = setTimeout(() => submit(loopPromptRef.current), 500);
        }
      }
    }
    prevLoadingRef.current = loading;
    return () => {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, [loading, messages]);

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

  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleSetMode = useCallback((m: 'BUILD' | 'PLAN' | 'REVIEW' | 'SCAN' | 'FIX') => {
    if (m === 'BUILD' || m === 'PLAN' || m === 'REVIEW') {
      setMode(m);
    }
  }, [setMode]);

  const commandCtx: CommandContext = {
    exit: () => process.exit(0),
    navigate: (path: string) => navigate(path),
    execute: (action: string) => { submit(`/${action}`); },
    mode,
    setMode: handleSetMode,
  };

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

  const handleThinkingToggle = useCallback(() => setShowThinking(v => !v), []);

  const wrappedSubmit = useCallback(
    async (value: string) => {
      if (value.startsWith('/')) {
        const cmd = value.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
        const args = value.replace(/^\/(\w+)\s*/i, '').trim();

        // Route to extracted command handlers
        const handled = await executeCommand(cmd, {
          cmd, args, mode, model, messages, showThinking, showDetails,
          loading, compacting, sessionId: sessionId || null,
          navigate, toast, dialog, appendMessage: appendMessage as any, submit, clear,
          setMode, setModel, toggleMode, setShowThinking, setShowDetails,
          setLoopState, handleExternalEditor, handleSelectSession,
          submitAndWaitForCompaction,
        });
        if (handled) return;

        if (cmd === 'clear') { clear(); return; }
        if (cmd === 'new') { navigate('/'); return; }
        if (cmd === 'mode') { toggleMode(); return; }
        if (cmd === 'editor') { handleExternalEditor(); return; }
        if (cmd === 'thinking') { setShowThinking(v => !v); toast.info(`Thinking blocks ${showThinking ? 'hidden' : 'shown'}`); return; }
        if (cmd === 'details') { setShowDetails(v => !v); toast.info(`Tool details ${showDetails ? 'hidden' : 'shown'}`); return; }
        if (cmd === 'watch') { navigate('/loop'); toast.info('Loop Engine opened. Select Watch Loop and press Enter.'); return; }
        if (cmd === 'pipeline') { navigate('/loop'); toast.info('Loop Engine opened. Select Pipeline Loop and press Enter.'); return; }

        if (cmd === 'ensemble') {
          const args = value.replace(/^\/ensemble\s*/i, '').trim();
          const modeOverride = args.match(/--mode\s+(\w+)/)?.[1]?.toUpperCase() as 'BUILD' | 'PLAN' | 'REVIEW' | undefined;

          (async () => {
            try {
              const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
              const { runEnsembleReview, formatEnsembleResult } = await import('../lib/ensemble-review.js');
              const diff = getGitDiff();
              if (!diff) {
                toast.error('No git diff found for ensemble review.');
                return;
              }
              const files = getChangedFiles();

              toast.info('Running 3-model ensemble review (Critic has veto power)...');
              const result = await runEnsembleReview(
                diff,
                files,
                (prompt, modelId) => submitWithModel(prompt, modelId, modeOverride || 'REVIEW')
              );

              // Show results
              const formatted = formatEnsembleResult(result);
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: formatted }] });

              // Summary toast
              const highCount = result.issues.filter(i => i.ensembleConfidence >= 0.7).length;
              const medCount = result.issues.filter(i => i.ensembleConfidence >= 0.4 && i.ensembleConfidence < 0.7).length;
              toast.success(`Ensemble complete: ${highCount} high-confidence, ${medCount} medium-confidence findings`);
            } catch (e) {
              toast.error('Ensemble failed: ' + String(e));
            }
          })();
          return;
        }

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
          if (agentResult.mode !== prevMode) {
            setTimeout(() => setMode(prevMode), 100);
          }
          return;
        }
      }
      submit(value);
    },
    [clear, navigate, dialog, appendMessage, mode, model, toggleMode, toast, submit, setMode, handleExternalEditor]
  );

  const handleSelectSession = useCallback(async (id: string) => {
    try {
      const session = await Sessions.get(id);
      if (!session) { toast.error('Session not found'); return; }
      clear();
      if (session.messages && Array.isArray(session.messages)) {
        for (const m of session.messages) {
          appendMessage({
            role: m.role === 'user' || m.role === 'assistant' || m.role === 'error' ? m.role : 'assistant',
            parts: (m.parts || (m.content ? [{ type: 'text', text: m.content }] : [])) as AgentMessagePart[],
            mode: (m.metadata?.mode === 'BUILD' || m.metadata?.mode === 'PLAN' ? m.metadata.mode : session.mode) as AgentMode | undefined,
            model: (m.metadata?.model as string) || session.model,
          });
        }
      }
      if (session.mode === 'BUILD' || session.mode === 'PLAN' || session.mode === 'REVIEW') setMode(session.mode as AgentMode);
      if (session.model) setModel(session.model);
      setShowSessionPanel(false);
    } catch { toast.error('Failed to load session'); }
  }, [clear, appendMessage, setMode, setModel, toast]);

  const handleForkSession = useCallback(async (id: string) => {
    try {
      const session = await Sessions.get(id);
      if (!session) { toast.error('Session not found'); return; }
      const newSession = await Sessions.create({
        title: session.title + ' (fork)',
        mode: session.mode,
        model: session.model,
        projectPath: process.cwd(),
      });
      if (!newSession || !newSession.id) { toast.error('Failed to create session'); return; }
      await handleSelectSession(newSession.id);
      toast.success('Session forked');
    } catch { toast.error('Failed to fork session'); }
  }, [handleSelectSession, toast]);

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
      if (ch === 'n')       { navigate('/'); return; }
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

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      submit(initialMessage);
    }
  }, [initialMessage, submit]);

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

  const autoCompactRef = useRef(false);
  const autoCompactTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (autoCompactRef.current) return;
    autoCompactRef.current = true;
    autoCompactTimerRef.current = setInterval(() => {
      if (loading || compacting) return;
      import('../lib/context-compactor.js').then(({ getCompactionState, compactMessages }) => {
        const state = getCompactionState(messages);
        if (state.atSyncThreshold) {
          appendLog('warn', `Auto-compact triggered at ${state.percentage}% token usage`);
          toast.warning(`Token usage at ${state.percentage}% — auto-compacting...`);
          (async () => {
            try {
              const result = await compactMessages(messages, submitAndWaitForCompaction);
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
    return () => {
      if (autoCompactTimerRef.current) clearInterval(autoCompactTimerRef.current);
    };
  }, [loading, compacting, messages, toast, submitAndWaitForCompaction, clear, appendMessage]);

  const handleModeToggle = useCallback(() => toggleMode(), [toggleMode]);
  const handleCommandPalette = useCallback(() => setShowCommands(v => !v), []);

  const isLoading = loading || status === 'streaming';

  return (
    <Box flexGrow={1} width="100%" flexDirection="row">
      {showSessionPanel ? (
        <SessionPanel
          currentSessionId={undefined}
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
          inputDisabled={isLoading}
          loading={isLoading}
          mode={mode}
          onModeToggle={handleModeToggle}
          onCommandPalette={handleCommandPalette}
          model={model}
          sessionId={sessionId ?? undefined}
          statusText={`${messages.length} msgs · ${theme.name}`}
          tokenUsage={tokenUsage.estimated > 0 ? tokenUsage : undefined}
          serverStatus={serverStatus}
          costUsd={costUsd}
          showThinking={showThinking}
          showDetails={showDetails}
          compacting={compacting}
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
