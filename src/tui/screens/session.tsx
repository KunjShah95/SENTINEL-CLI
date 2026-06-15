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
    submit, stop, clear, appendMessage, model, setModel, status, sessionId,
    serverStatus,
  } = useAgentChat({
    initialMode: initialMode === 'BUILD' || initialMode === 'PLAN' || initialMode === 'REVIEW' ? initialMode : undefined,
  });

  const tokenUsage = {
    estimated: messages.reduce((acc, m) =>
      acc + m.parts.reduce((s, p) => s + (p.type === 'text' || p.type === 'reasoning' ? (p as any).text?.length ?? 0 : 0), 0), 0
    ) / 4,
    limit: 40000,
    get percentage() { return Math.min(100, Math.round(this.estimated / this.limit * 100)); },
  };
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
              const { injectContextIntoPrompt } = await import('../lib/context-file.js');
              const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
              const diff = getGitDiff({ file: arg });
              if (!diff) { toast.info(`No changes detected for ${arg}.`); setMode(prevMode); return; }
              const [sast] = await Promise.all([runSast()]);
              const sastSummary = sast.findings.length > 0 ? formatSastForPrompt(sast) : undefined;
              const basePrompt = buildReviewPrompt(diff, { files: [arg], focus: 'security', sastSummary });
              submit(injectContextIntoPrompt(basePrompt));
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
              const { injectContextIntoPrompt } = await import('../lib/context-file.js');
              const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
              const diff = getGitDiff({ branch });
              if (!diff) { toast.info(`No changes detected vs ${branch}.`); setMode(prevMode); return; }
              const files = getChangedFiles({ branch });
              const sast = await runSast();
              const sastSummary = sast.findings.length > 0 ? formatSastForPrompt(sast) : undefined;
              const basePrompt = buildReviewPrompt(diff, { files, focus: 'all', sastSummary });
              submit(injectContextIntoPrompt(basePrompt));
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
        if (cmd === 'loop') {
          navigate('/loop');
          return;
        }
        if (cmd === 'watch') {
          navigate('/loop');
          toast.info('Loop Engine opened. Select Watch Loop and press Enter.');
          return;
        }
        if (cmd === 'pipeline') {
          navigate('/loop');
          toast.info('Loop Engine opened. Select Pipeline Loop and press Enter.');
          return;
        }
        if (cmd === 'ci') {
          navigate('/loop');
          toast.info('Loop Engine opened. Select CI Loop and press Enter.');
          return;
        }
        if (cmd === 'sast') {
          const target = value.replace(/^\/sast\s*/i, '').trim() || '.';
          (async () => {
            try {
              appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `/sast ${target}` }] });
              const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
              toast.info('Running SAST analysis…');
              const result = await runSast({ target });
              const formatted = formatSastForPrompt(result);
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: formatted }] });
              if (result.errors.length > 0) toast.error(`SAST warnings: ${result.errors.slice(0, 2).join('; ')}`);
            } catch (e) { toast.error('SAST failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'commit') {
          (async () => {
            try {
              const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
              const diff = getGitDiff({ staged: true }) || getGitDiff();
              if (!diff) { toast.error('No changes to commit.'); return; }
              const files = getChangedFiles({ staged: true });
              const prompt = `Generate a concise git commit message for these changes. Output ONLY the commit message (subject line + optional body). No preamble.\n\nChanged files: ${files.join(', ')}\n\n\`\`\`diff\n${diff.slice(0, 6000)}\n\`\`\``;
              const prevMode = mode;
              setMode('PLAN' as AgentMode);
              await submit(prompt);
              setMode(prevMode);
            } catch (e) { toast.error('Commit generation failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'context') {
          (async () => {
            try {
              const { loadContextFiles, createDefaultContextFile } = await import('../lib/context-file.js');
              const files = loadContextFiles();
              if (files.length === 0) {
                createDefaultContextFile();
                toast.success('Created SENTINEL.md — edit it to add project context.');
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: '## Context File Created\n\nA `SENTINEL.md` file was created in your project root. Edit it to add:\n- Project overview\n- Security-sensitive areas\n- Architecture notes\n- Areas to exclude from review\n\nSentinel will auto-inject this context into every review.' }] });
              } else {
                const content = files.map(f => `**${f.source}** (${f.content.length} chars)\n\`\`\`\n${f.content.slice(0, 500)}${f.content.length > 500 ? '\n...' : ''}\n\`\`\``).join('\n\n');
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## Active Context Files\n\n${content}` }] });
              }
            } catch (e) { toast.error('Context command failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'parallel') {
          const target = value.replace(/^\/parallel\s*/i, '').trim();
          (async () => {
            try {
              const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
              const diff = getGitDiff();
              if (!diff) { toast.error('No git diff found for parallel scan.'); return; }
              const files = getChangedFiles();
              toast.info('Launching 4 specialist agents in parallel…');
              const { runParallelAgents } = await import('../lib/parallel-agents.js');
              const result = await runParallelAgents(diff, files, async (prompt, m) => {
                const prevMode = mode;
                setMode((m || 'REVIEW') as AgentMode);
                await submit(prompt);
                setMode(prevMode);
                return '';
              }, {
                onProgress: (agent, done) => {
                  if (done) toast.info(`Agent done: ${agent}`);
                },
              });
              const summary = `## Parallel Scan Complete\n\n**${result.mergedIssues.length} unique issues** across ${result.agentResults.length} agents\n\n${result.agentResults.map(a => `- **${a.agent}**: ${a.issues.length} issues (${Math.round(a.durationMs / 1000)}s)`).join('\n')}`;
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: summary }] });
            } catch (e) { toast.error('Parallel scan failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'models') {
          (async () => {
            try {
              const { SUPPORTED_CHAT_MODELS } = await import('../../shared/models/index.js');
              const byProvider: Record<string, string[]> = {};
              for (const m of SUPPORTED_CHAT_MODELS as any[]) {
                if (!byProvider[m.provider]) byProvider[m.provider] = [];
                const price = m.inputUsdPerMillionTokens > 0
                  ? ` ($${m.inputUsdPerMillionTokens}/$${m.outputUsdPerMillionTokens} per M)`
                  : ' (free/local)';
                const flag = m.thinking ? ' 🧠' : '';
                byProvider[m.provider].push(`  \`${m.id}\` — ${m.label}${flag}${price}`);
              }
              const lines = ['## Available Models by Provider', ''];
              for (const [provider, models] of Object.entries(byProvider)) {
                lines.push(`### ${provider.charAt(0).toUpperCase() + provider.slice(1)}`);
                lines.push(...models);
                lines.push('');
              }
              lines.push('> Switch model: type the model ID in your message, or set `MODEL=<id>` env var.');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
            } catch (e) { toast.error('Failed to list models: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'health') {
          (async () => {
            try {
              const { checkServerHealth } = await import('../lib/api-client.js');
              const serverOk = await checkServerHealth();
              const mem = process.memoryUsage();
              const uptime = process.uptime();
              const uptimeStr = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`;
              const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
              const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
              const providerChecks: Array<[string, boolean]> = [
                ['Anthropic', !!process.env.ANTHROPIC_API_KEY],
                ['OpenAI', !!process.env.OPENAI_API_KEY],
                ['Gemini', !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY)],
                ['Groq', !!process.env.GROQ_API_KEY],
                ['Mistral', !!process.env.MISTRAL_API_KEY],
                ['DeepSeek', !!process.env.DEEPSEEK_API_KEY],
                ['xAI/Grok', !!process.env.XAI_API_KEY],
                ['Together', !!process.env.TOGETHER_API_KEY],
                ['Fireworks', !!process.env.FIREWORKS_API_KEY],
                ['Perplexity', !!process.env.PERPLEXITY_API_KEY],
                ['OpenRouter', !!process.env.OPENROUTER_API_KEY],
                ['Ollama', !!(process.env.OLLAMA_HOST || true)],
                ['LM Studio', !!(process.env.LMSTUDIO_HOST || true)],
              ];
              const activeProviders = providerChecks.filter(([, ok]) => ok).map(([n]) => `${n} ✓`).join(' · ');
              const providers = activeProviders || 'None configured — set ANTHROPIC_API_KEY etc.';
              const tokenEst = Math.round(tokenUsage.estimated);
              const healthText = [
                '## System Health',
                '',
                `**Server:** ${serverOk ? '🟢 Connected (localhost:3000)' : '🔴 Offline — running in local mode'}`,
                `**Uptime:** ${uptimeStr}  **Memory:** ${heapMB}MB heap / ${rssMB}MB RSS`,
                `**Model:** ${model}  **Mode:** ${mode}`,
                `**Context:** ~${tokenEst.toLocaleString()} tokens used of 40,000 limit (${tokenUsage.percentage}%)`,
                `**AI Providers:** ${providers}`,
                '',
                serverOk ? '' : '> Tip: `npm run sentinel:server` starts the API server for session persistence.',
              ].filter(l => l !== undefined).join('\n');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: healthText }] });
            } catch (e) { toast.error('Health check failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'help') {
          toast.info('Commands: /clear /new /wizard /mode /review /loop /watch /pipeline /ci /scan /sast /commit /context /parallel /health /undo /background /agents /help');
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

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await Sessions.delete(id);
      clear();
    } catch { toast.error('Failed to delete session'); }
  }, [clear, toast]);

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
          sessionId={sessionId ?? undefined}
          statusText={`${messages.length} msgs · ${theme.name}`}
          tokenUsage={tokenUsage.estimated > 0 ? tokenUsage : undefined}
          serverStatus={serverStatus}
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
