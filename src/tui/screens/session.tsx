import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useLocation, useNavigate } from 'react-router';
import { SessionShell } from '../components/session-shell.js';
import { SessionPanel } from '../components/session-panel.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { CommandMenu } from '../components/command-menu/index.js';
import { MultiStepAnalyzeDialog } from '../components/dialogs/multi-step-analyze.js';
import { useTheme } from '../providers/theme/index.js';
import { useDialog } from '../providers/dialog/index.js';
import { useToast } from '../providers/toast/index.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { Sessions } from '../lib/api-client.js';
import { TOOLS } from '../lib/tools.js';
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

  const {
    messages, loading, mode, setMode, toggleMode,
    submit, stop, clear, appendMessage, model, setModel, status,
  } = useAgentChat({
    initialMode: initialMode === 'BUILD' || initialMode === 'PLAN' || initialMode === 'REVIEW' ? initialMode : undefined,
  });
  const [showCommands, setShowCommands] = useState(false);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const dialog = useDialog();

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

  const wrappedSubmit = useCallback(
    (value: string) => {
      if (value.startsWith('/')) {
        const cmd = value.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
        if (cmd === 'clear') { clear(); return; }
        if (cmd === 'new') { navigate('/'); return; }
        if (cmd === 'wizard') {
          dialog.open({
            title: 'Multi-Step Analysis Wizard',
            width: 70,
            height: 35,
            children: (
              <MultiStepAnalyzeDialog
                onRun={async (target, analyzers) => {
                  appendMessage({
                    role: 'user',
                    mode,
                    model,
                    parts: [{ type: 'text', text: `/analyze ${target} (analyzers: ${analyzers.join(', ')})` }],
                  });
                  try {
                    const result = await TOOLS.analyze.execute({ files: target });
                    if (result.output) {
                      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: result.output }] });
                    } else {
                      appendMessage({ role: 'error', parts: [{ type: 'text', text: result.error || 'Analysis failed' }] });
                    }
                  } catch (e) {
                    appendMessage({ role: 'error', parts: [{ type: 'text', text: String(e) }] });
                  }
                }}
              />
            ),
          });
          return;
        }
        if (cmd === 'mode') { toggleMode(); return; }
        if (cmd === 'review') {
          const arg = value.replace(/^\/review\s*/i, '').trim();
          if (!arg) { navigate('/review'); return; }
          const prevMode = mode;
          setMode('REVIEW' as AgentMode);
          (async () => {
            try {
              const { getGitDiff, buildReviewPrompt } = await import('../lib/security-reviewer.js');
              const diff = getGitDiff({ file: arg });
              if (!diff) { toast.info(`No changes detected for ${arg}.`); setMode(prevMode); return; }
              submit(buildReviewPrompt(diff, { files: [arg], focus: 'security' }));
            } catch (e) { toast.error('Review failed: ' + String(e)); setMode(prevMode); }
          })();
          return;
        }
        if (cmd === 'review-branch') {
          const branch = value.replace(/^\/review-branch\s*/i, '').trim();
          if (!branch) { toast.error('Usage: /review-branch <branch-name>'); return; }
          const prevMode = mode;
          setMode('REVIEW' as AgentMode);
          (async () => {
            try {
              const { getGitDiff, getChangedFiles, buildReviewPrompt } = await import('../lib/security-reviewer.js');
              const diff = getGitDiff({ branch });
              if (!diff) { toast.info(`No changes detected vs ${branch}.`); setMode(prevMode); return; }
              const files = getChangedFiles({ branch });
              submit(buildReviewPrompt(diff, { files, focus: 'all' }));
            } catch (e) { toast.error('Review failed: ' + String(e)); setMode(prevMode); }
          })();
          return;
        }
        if (cmd === 'review-file') {
          const file = value.replace(/^\/review-file\s*/i, '').trim();
          if (!file) { toast.error('Usage: /review-file <path>'); return; }
          navigate('/review');
          return;
        }
        if (cmd === 'scan') {
          const target = value.replace(/^\/scan\s*/i, '').trim() || '.';
          (async () => {
            try {
              const result = await TOOLS.securityAudit.execute({ files: target });
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: result.output || result.error || 'Scan complete.' }] });
            } catch (e) { toast.error('Scan failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'undo') {
          (async () => {
            try {
              const { executeLocalTool } = await import('../../shared/tools/index.js');
              const result = await executeLocalTool('undoLastChange', {}, 'BUILD');
              if (result?.success) {
                toast.success(result.message || 'Changes undone.');
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Undo complete: ${result.message}` }] });
              } else {
                toast.error('No checkpoints available.');
              }
            } catch (e) { toast.error('Undo failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'background') {
          const prompt = value.replace(/^\/background\s*/i, '').trim();
          if (!prompt) { toast.error('Usage: /background <prompt>'); return; }
          (async () => {
            try {
              const { launchBackgroundAgent } = await import('../../agents/background-agent.js');
              const agent = launchBackgroundAgent(prompt);
              toast.success(`Background agent launched: ${agent.id}`);
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `🚀 Background agent \`${agent.id}\` started.\nPrompt: "${prompt.slice(0, 80)}"\nCheck status with /agents` }] });
            } catch (e) { toast.error('Failed to launch agent: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'agents') {
          (async () => {
            try {
              const { listAgents } = await import('../../agents/background-agent.js');
              const agents = listAgents();
              if (agents.length === 0) { toast.info('No background agents running.'); return; }
              const lines = agents.map((a: any) => `• ${a.id} — ${a.status} (${a.elapsed}) — "${a.prompt}"`).join('\n');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `**Background Agents:**\n${lines}` }] });
            } catch (e) { toast.error('Failed to list agents: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'help') {
          toast.info('Commands: /clear /new /wizard /mode /review [file] /review-branch <branch> /scan [path] /undo /background /agents /help');
          return;
        }
        toast.error('Unknown command. Type /help for commands.');
        return;
      }
      submit(value);
    },
    [clear, navigate, dialog, appendMessage, mode, model, toggleMode, toast, submit, setMode]
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
      if (!newSession) { toast.error('Failed to create session'); return; }
      await handleSelectSession(newSession.id);
      toast.success('Session forked');
    } catch { toast.error('Failed to fork session'); }
  }, [handleSelectSession, toast]);

  const handleDeleteSession = useCallback((_id: string) => {
    if (messages.length > 0) clear();
  }, [clear, messages.length]);

  useInput((input, key) => {
    if (key.ctrl && input === 's') {
      setShowSessionPanel(v => !v);
    }
  });

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      submit(initialMessage);
    }
  }, [initialMessage, submit]);

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
          inputDisabled={isLoading}
          loading={isLoading}
          mode={mode}
          onModeToggle={handleModeToggle}
          onCommandPalette={handleCommandPalette}
          model={model}
          statusText={`${messages.length} msgs | ${theme.name}`}
        >
          {messages.length === 0 ? (
            <Box padding={2} alignItems="center" justifyContent="center">
              <Text dimColor>{'Start a conversation or type /help for commands'}</Text>
            </Box>
          ) : null}
          {messages.map(msg => {
            if (msg.role === 'error') {
              const text = msg.parts.find((p: any) => p.type === 'text')?.text || 'Unknown error';
              return <ErrorMessage key={msg.id} message={text} />;
            }
            if (msg.role === 'user') {
              const text = msg.parts.find((p: any) => p.type === 'text')?.text || '';
              return <UserMessage key={msg.id} message={text} mode={msg.mode || mode} />;
            }
            if (msg.role === 'assistant') {
              return <BotMessage key={msg.id} parts={msg.parts} model={msg.model || model} />;
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
