import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useLocation, useNavigate } from 'react-router';
import { SessionShell } from '../components/session-shell.js';
import { SessionPanel } from '../components/session-panel.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { CommandMenu } from '../components/command-menu/index.js';
import { MultiStepAnalyzeDialog } from '../components/dialogs/multi-step-analyze.js';
import { ProviderSetupDialog } from '../components/dialogs/provider-setup.js';
import { PROVIDER_ENV_KEYS } from '../components/dialogs/provider-setup.js';
import { ModelPickerDialog } from '../components/dialogs/model-picker.js';
import { useTheme } from '../providers/theme/index.js';
import { useDialog } from '../providers/dialog/index.js';
import { useToast } from '../providers/toast/index.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { Sessions } from '../lib/api-client.js';
import { TOOLS } from '../lib/tools.js';
import { listCustomCommandNames, executeCustomCommand } from '../lib/custom-commands.js';
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

  const {
    messages, loading, mode, setMode, toggleMode,
    submit, stop, clear, appendMessage, model, setModel, status, sessionId,
    serverStatus, compacting, submitAndWaitForCompaction,
  } = useAgentChat({
    initialMode: initialMode === 'BUILD' || initialMode === 'PLAN' || initialMode === 'REVIEW' ? initialMode : undefined,
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
    (value: string) => {
      if (value.startsWith('/')) {
        const cmd = value.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
        if (cmd === 'clear') { clear(); return; }
        if (cmd === 'new') { navigate('/'); return; }
        if (cmd === 'init') {
          (async () => {
            try {
              const { analyzeProject, generateAgentsMd } = await import('../lib/init.js');
              const path = await import('node:path');
              const fs = await import('node:fs/promises');
              toast.info('Analyzing project structure...');
              const info = await analyzeProject();
              const md = generateAgentsMd(process.cwd(), info);
              await fs.writeFile(path.join(process.cwd(), 'AGENTS.md'), md, 'utf-8');
              toast.success('AGENTS.md created');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Project initialized!\n\n**Detected:** ${info.language}, ${info.frameworks.join(', ') || 'no frameworks'}, ${info.packageManager}\n**Test:** ${info.testFramework}\n**Entry:** ${info.entryPoints.join(', ') || 'none'}\n\nCreated \`AGENTS.md\` with project context. Commit it to share conventions with other agents.` }] });
            } catch (e) { toast.error('Init failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'thinking') { setShowThinking(v => !v); toast.info(`Thinking blocks ${showThinking ? 'hidden' : 'shown'}`); return; }
        if (cmd === 'details') { setShowDetails(v => !v); toast.info(`Tool details ${showDetails ? 'hidden' : 'shown'}`); return; }
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
              } else {
                toast.info('Session already compact, nothing to do');
              }
            } catch (e) { toast.error('Compact failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'redo') {
          (async () => {
            try {
              const { executeLocalTool } = await import('../../shared/tools/index.js');
              const result = await executeLocalTool('redoLastUndo', {}, 'BUILD');
              if (result?.success) {
                toast.success(result.message || 'Changes redone.');
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Redo complete: ${result.message}` }] });
              } else {
                toast.error('Nothing to redo.');
              }
            } catch (e) { toast.error('Redo failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'editor') {
          appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: 'Set EDITOR env var to use external editor (e.g., `export EDITOR="code --wait"`).' }] });
          return;
        }
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
        if (cmd === 'setup' || cmd === 'connect') {
          dialog.open({
            title: 'AI Provider Setup',
            width: 72,
            height: 35,
            children: (
              <ProviderSetupDialog onComplete={() => {
                toast.success('Provider setup complete. Run /health to verify.');
                dialog.close();
              }} />
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
          const loopPrompt = value.replace(/^\/loop\s*/i, '').trim();
          if (!loopPrompt) {
            navigate('/loop');
            return;
          }
          const maxIterMatch = loopPrompt.match(/--max-iter\s+(\d+)/i);
          const maxIter = maxIterMatch ? parseInt(maxIterMatch[1], 10) : 20;
          const cleanPrompt = loopPrompt.replace(/--max-iter\s+\d+/i, '').trim();
          toast.info(`Loop started: ${cleanPrompt.slice(0, 60)}... (max ${maxIter} iterations)`);
          setLoopState({ active: true, prompt: cleanPrompt, iterations: 0, maxIterations: maxIter });
          loopActiveRef.current = true;
          loopPromptRef.current = cleanPrompt;
          loopIterationsRef.current = 0;
          submit(cleanPrompt);
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
              if (result.errors.length > 0) {
                const timeoutErrors = result.errors.filter(e => e.includes('TIMEOUT'));
                const otherErrors = result.errors.filter(e => !e.includes('TIMEOUT'));
                if (timeoutErrors.length > 0) toast.warning(`SAST tool timed out: ${timeoutErrors.join('; ')} — results may be partial. Increase timeout or run each tool individually.`);
                if (otherErrors.length > 0) toast.error(`SAST warnings: ${otherErrors.slice(0, 2).join('; ')}`);
              }
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
        if (cmd === 'dismiss') {
          const args = value.replace(/^\/dismiss\s*/i, '').trim();
          if (!args) { toast.error('Usage: /dismiss <file:line:rule> [reason]'); return; }
          (async () => {
            try {
              const { dismissIssue } = await import('../../utils/dismissedIssues.js');
              const parts = args.split(/\s+/);
              const key = parts[0];
              const reason = parts.slice(1).join(' ') || 'User dismissed';
              const keyParts = key.split(':');
              if (keyParts.length < 3) { toast.error('Key format: file:line:rule (e.g., src/app.ts:42:no-eval)'); return; }
              const [file, lineStr, ...ruleParts] = keyParts;
              const line = parseInt(lineStr, 10);
              const rule = ruleParts.join(':');
              dismissIssue(file, line, rule, reason, {});
              toast.success(`Dismissed ${key}`);
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Dismissed finding: ${key}\nReason: ${reason}\n\nThis finding will be skipped in future scans. Use /dismiss-list to show all dismissals, /dismiss-remove to undo.` }] });
            } catch (e) { toast.error('Dismiss failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'dismiss-list') {
          (async () => {
            try {
              const { getDismissals } = await import('../../utils/dismissedIssues.js');
              const data = getDismissals();
              const keys = Object.keys(data.dismissals || {});
              if (keys.length === 0) { toast.info('No dismissed findings.'); return; }
              const lines = keys.map(k => `• ${k} — ${data.dismissals[k].reason || 'No reason'}`).join('\n');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## Dismissed Findings (${keys.length})\n\n${lines}` }] });
            } catch (e) { toast.error('Failed to list dismissals: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'dismiss-remove') {
          const args = value.replace(/^\/dismiss-remove\s*/i, '').trim();
          if (!args) { toast.error('Usage: /dismiss-remove <file:line:rule>'); return; }
          (async () => {
            try {
              const { undismissIssue } = await import('../../utils/dismissedIssues.js');
              const keyParts = args.split(':');
              if (keyParts.length < 3) { toast.error('Key format: file:line:rule'); return; }
              const [file, lineStr, ...ruleParts] = keyParts;
              const line = parseInt(lineStr, 10);
              const rule = ruleParts.join(':');
              const ok = undismissIssue(file, line, rule);
              if (ok) { toast.success(`Removed dismissal for ${args}`); } else { toast.error('Dismissal not found'); }
            } catch (e) { toast.error('Failed to remove dismissal: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'test') {
          const file = value.replace(/^\/test\s*/i, '').trim();
          if (!file) { toast.error('Usage: /test <file-path> — Generate AI unit tests for the specified file'); return; }
          (async () => {
            try {
              appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `/test ${file}` }] });
              const fs = await import('fs');
              if (!fs.existsSync(file)) { toast.error(`File not found: ${file}`); return; }
              toast.info(`Generating tests for ${file}...`);
              const content = fs.readFileSync(file, 'utf-8');
              const testPrompt = `Generate a comprehensive unit test file for the following code. Use the project's existing test framework (Jest/Vitest). Output ONLY valid test code, no explanations. Include edge cases, error paths, and main success paths.\n\nFile: ${file}\n\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``;
              submit(testPrompt);
            } catch (e) { toast.error('Test generation failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'export') {
          (async () => {
            try {
              toast.info('Exporting session...');
              const lines: string[] = ['# Sentinel Session Export', '', `**Date:** ${new Date().toISOString()}`, `**Mode:** ${mode}`, `**Model:** ${model}`, `**Messages:** ${messages.length}`, ''];
              for (const msg of messages) {
                const role = msg.role.toUpperCase();
                const text = msg.parts.filter(p => p.type === 'text').map(p => (p as any).text).join('\n');
                if (text) { lines.push(`### ${role}`); lines.push(''); lines.push(text); lines.push(''); }
                const toolCalls = msg.parts.filter(p => p.type === 'tool-call');
                for (const tc of toolCalls) { lines.push(`> _Tool: ${(tc as any).toolName}_`); }
              }
              const exportDir = process.cwd() + '/.sentinel/exports';
              const fs = await import('fs');
              fs.mkdirSync(exportDir, { recursive: true });
              const exportPath = `${exportDir}/session-${sessionId || Date.now()}.md`;
              fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');
              toast.success(`Session exported to ${exportPath}`);
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Session exported to \`${exportPath}\`` }] });
            } catch (e) { toast.error('Export failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'sessions' || cmd === 'session') {
          const sub = value.replace(/^\/sessions?\s*/i, '').trim();
          (async () => {
            try {
              if (!sub || sub === 'list') {
                const list = await Sessions.list();
                if (!list || list.length === 0) { appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: 'No sessions found.' }] }); return; }
                const lines = list.map((s: any, i: number) => `${i + 1}. \`${s.id.slice(0, 8)}\` — ${s.title || 'untitled'} (${s.mode || '?'}, ${new Date(s.createdAt).toLocaleDateString()})`);
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `**Sessions:**\n${lines.join('\n')}\n\nUse \`/session switch <id>\` to load a session.` }] });
              } else if (sub.startsWith('switch ') || sub.startsWith('load ')) {
                const id = sub.replace(/^(switch|load)\s+/i, '');
                await handleSelectSession(id);
              } else if (sub.startsWith('delete ') || sub.startsWith('rm ')) {
                const id = sub.replace(/^(delete|rm)\s+/i, '');
                const ok = await Sessions.delete(id);
                toast.success(ok ? 'Session deleted' : 'Failed to delete session');
              } else {
                toast.error('Usage: /session [list|switch <id>|delete <id>]');
              }
            } catch (e) { toast.error('Session command failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'mcp') {
          appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: '## MCP Server\n\nThe Sentinel MCP server exposes these tools to MCP-compatible AI assistants (Claude Code, Cursor, Zed):\n- 📄 `sentinel_analyze` — Scan files/directories\n- 🔒 `sentinel_security_audit` — Security audit\n- 📝 `sentinel_review_code` — Review code snippets\n- 🔄 `sentinel_review_pr` — Review PR changes\n- 💡 `sentinel_explain_issue` — Explain findings\n- 🔧 `sentinel_fix` — Auto-fix issues\n- 📊 `sentinel_score` — Project health score\n- 📦 `sentinel_check_dependencies` — CVE scan\n\n**How to start:** The MCP server needs its own terminal. Open a **new terminal** and run:\n\n```bash\nsentinel mcp\n```\n\nThen configure your AI tool to connect to it. See `mcp/README.md` for setup instructions per tool (Cursor, Claude Code, Codex, Continue).' }] });
          return;
        }
        if (cmd === 'sarif') {
          const target = value.replace(/^\/sarif\s*/i, '').trim() || 'sentinel-results.sarif';
          (async () => {
            try {
              const { SarifGenerator } = await import('../../output/sarifGenerator.js');
              const { runSast } = await import('../lib/sast-runner.js');
              toast.info('Running SAST scan for SARIF export...');
              const sast = await runSast();
              const generator = new SarifGenerator();
              const sarifPath = await generator.saveToFile(sast.findings, target);
              toast.success(`SARIF report saved to ${sarifPath}`);
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ SARIF report exported to \`${sarifPath}\`\n\n**Findings:** ${sast.findings.length} issues\n**Tools run:** ${sast.toolsRun.join(', ')}` }] });
            } catch (e) { toast.error('SARIF export failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'diff') {
          const arg = value.replace(/^\/diff\s*/i, '').trim();
          (async () => {
            try {
              const { getGitDiff } = await import('../lib/security-reviewer.js');
              const isStaged = arg === '--staged';
              const branch = !isStaged && arg ? arg : undefined;
              const file = !isStaged && !branch && arg ? arg : undefined;

              const diff = isStaged ? getGitDiff({ staged: true })
                : branch ? getGitDiff({ branch })
                : file ? getGitDiff({ file })
                : getGitDiff();

              if (!diff) {
                toast.info('No changes detected.');
                return;
              }

              // Parse diff into per-file sections with line counts
              const fileSections: Array<{ path: string; added: number; deleted: number; hunks: string[] }> = [];
              let currentFile: { path: string; added: number; deleted: number; hunks: string[] } | null = null;

              for (const line of diff.split('\n')) {
                if (line.startsWith('diff --git ')) {
                  const m = line.match(/diff --git a\/(.+) b\/(.+)/);
                  const path = m ? m[2] : 'unknown';
                  if (currentFile) fileSections.push(currentFile);
                  currentFile = { path, added: 0, deleted: 0, hunks: [] };
                }
                if (currentFile) {
                  if (line.startsWith('+') && !line.startsWith('+++')) currentFile.added++;
                  else if (line.startsWith('-') && !line.startsWith('---')) currentFile.deleted++;
                  currentFile.hunks.push(line);
                }
              }
              if (currentFile) fileSections.push(currentFile);

              // Build formatted diff output
              const totalAdded = fileSections.reduce((s, f) => s + f.added, 0);
              const totalDeleted = fileSections.reduce((s, f) => s + f.deleted, 0);
              const lines: string[] = [];
              lines.push(`## Git Diff Preview`);
              lines.push('');
              if (branch) lines.push(`**Branch:** \`${branch}\``);
              if (isStaged) lines.push('**Scope:** Staged changes');
              if (file) lines.push(`**File:** \`${file}\``);
              lines.push(`**Files changed:** ${fileSections.length}  **+${totalAdded}**  **-${totalDeleted}**`);
              lines.push('');
              lines.push('```diff');

              for (const section of fileSections) {
                lines.push(`--- a/${section.path}`);
                lines.push(`+++ b/${section.path}`);
                lines.push(`# change: -${section.deleted} +${section.added} lines`);

                // Show up to 50 lines per file to avoid huge messages
                const maxLines = 50;
                const hunkLines = section.hunks.filter(l => {
                  // Keep content lines (+/-/space) AND @@ hunk headers
                  if (l.startsWith('@@')) return true;
                  if (l.startsWith('+') || l.startsWith('-') || l.startsWith(' ')) {
                    return !l.startsWith('+++') && !l.startsWith('---') && !l.startsWith('diff --git');
                  }
                  return false;
                });

                if (hunkLines.length > maxLines) {
                  // Show first 20 + last 20 lines with [...] in between
                  lines.push(...hunkLines.slice(0, 20));
                  lines.push(`  ... ${hunkLines.length - 40} lines truncated ...`);
                  lines.push(...hunkLines.slice(hunkLines.length - 20));
                } else {
                  lines.push(...hunkLines);
                }
                lines.push('');
              }

              lines.push('```');
              lines.push('');

              // Summary per file
              lines.push('### Summary');
              lines.push('');
              for (const section of fileSections) {
                const icon = section.deleted > section.added
                  ? '🔴' : section.added > 0 ? '🟢' : '⚪';
                lines.push(`- ${icon} \`${section.path}\` — **+${section.added}** **-${section.deleted}**`);
              }

              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
            } catch (e) {
              toast.error('Diff failed: ' + String(e));
            }
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
              const { getRankedModels } = await import('../../shared/models/index.js');
              const ranked = getRankedModels();
              const byProvider: Record<string, string[]> = {};
              for (const m of ranked) {
                if (!byProvider[m.provider]) byProvider[m.provider] = [];
                const price = m.inputUsdPerMillionTokens > 0
                  ? ` (\$${m.inputUsdPerMillionTokens}/\$${m.outputUsdPerMillionTokens} per M)`
                  : ' (free/local)';
                const flag = m.thinking ? ' 🧠' : '';
                byProvider[m.provider].push(`  \`${m.id}\` — ${m.label}${flag}${price}`);
              }
              const lines = ['## Available Models', '', 'Free models listed first, then by capability:', ''];
              for (const [provider, models] of Object.entries(byProvider)) {
                const capName = provider.charAt(0).toUpperCase() + provider.slice(1);
                lines.push(`### ${capName}`);
                lines.push(...models);
                lines.push('');
              }
              lines.push('> Switch: `/model <id>` in chat, or set `MODEL=<id>` env var.');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
            } catch (e) { toast.error('Failed to list models: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'trust') {
          const target = value.replace(/^\/trust\s*/i, '').trim();
          (async () => {
            try {
              const { TrustScorer } = await import('../../shared/models/trust-scoring.js');
              const scorer = new TrustScorer();
              if (target) {
                const score = await scorer.getModelScore(target);
                if (!score) { toast.error(`No trust data for model "${target}"`); return; }
                const fpPct = (score.fpRate * 100).toFixed(1);
                const accPct = (score.accuracy * 100).toFixed(1);
                const lines = [
                  `## Trust Score: ${target}`,
                  '',
                  `  Total issues:  ${score.totalIssues}`,
                  `  Confirmed:     ${score.confirmed}`,
                  `  False pos:     ${score.falsePositives} (${fpPct}% FP rate)`,
                  `  Unrated:       ${score.unrated}`,
                  `  Accuracy:      ${accPct}%`,
                  `  Avg confidence: ${(score.avgConfidence * 100).toFixed(1)}%`,
                ];
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
              } else {
                const stats = await scorer.getStats();
                if (stats.models.length === 0) {
                  appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: 'No trust data available yet. Run some reviews first!' }] });
                  return;
                }
                const lines = ['## Model Trust Scores', '', 'Ranked by false-positive rate (lowest first):', ''];
                for (const m of stats.models) {
                  const fpPct = (m.fpRate * 100).toFixed(1);
                  const accPct = (m.accuracy * 100).toFixed(1);
                  const icon = m.fpRate === 0 ? '🟢' : m.fpRate < 0.2 ? '🟡' : '🔴';
                  lines.push(`  ${icon} ${m.modelId}`);
                  lines.push(`      ${m.totalIssues} issues · ${accPct}% accuracy · ${fpPct}% FP · ${m.unrated} unrated`);
                  lines.push('');
                }
                lines.push('> Use `/trust <modelId>` for details, `/feedback <issueId> accurate|fp` to rate.');
                appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
              }
            } catch (e) { toast.error('Trust command failed: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'feedback') {
          const args = value.replace(/^\/feedback\s*/i, '').trim();
          if (!args) { toast.error('Usage: /feedback <issueId> accurate|fp'); return; }
          const parts = args.split(/\s+/);
          if (parts.length < 2) { toast.error('Usage: /feedback <issueId> accurate|fp'); return; }
          const [issueId, verdict] = parts;
          if (verdict !== 'accurate' && verdict !== 'fp') { toast.error('Verdict must be "accurate" or "fp"'); return; }
          (async () => {
            try {
              const { TrustScorer } = await import('../../shared/models/trust-scoring.js');
              const scorer = new TrustScorer();
              const ok = await scorer.recordFeedback(issueId, verdict === 'accurate');
              if (ok) {
                toast.success(`Feedback recorded: ${issueId} → ${verdict}`);
              } else {
                toast.error('Could not record feedback — issue ID not found');
              }
            } catch (e) { toast.error('Feedback failed: ' + String(e)); }
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
                ['Ollama', !!process.env.OLLAMA_HOST],
                ['LM Studio', !!process.env.LMSTUDIO_HOST],
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
        if (cmd === 'model') {
          const target = value.replace(/^\/model\s*/i, '').trim();
          if (!target) {
            dialog.open({
              title: 'Select Model',
              width: 72,
              height: 35,
              children: (
                <ModelPickerDialog
                  currentModel={model}
                  onSelect={(modelId) => {
                    setModel(modelId);
                    toast.success(`Switched to ${modelId}`);
                    dialog.close();
                  }}
                />
              ),
            });
            return;
          }
          (async () => {
            try {
              const { findSupportedChatModel, getRankedModels } = await import('../../shared/models/index.js');
              const exact = findSupportedChatModel(target);
              if (exact) {
                setModel(exact.id);
                toast.success(`Switched to ${exact.label}`);
                return;
              }
              const ranked = getRankedModels();
              const matches = ranked.filter(m =>
                m.id.toLowerCase().includes(target.toLowerCase()) ||
                m.label.toLowerCase().includes(target.toLowerCase())
              );
              if (matches.length === 0) {
                toast.error(`No model matches "${target}". Use /models to list available.`);
                return;
              }
              if (matches.length === 1) {
                setModel(matches[0].id);
                toast.success(`Switched to ${matches[0].label}`);
                return;
              }
              const suggestions = matches.slice(0, 8).map(m => `\`${m.id}\` — ${m.label}`).join('\n');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `Models matching "${target}":\n${suggestions}\n\nUse \`/model <exact-id>\` to switch.` }] });
            } catch (e) { toast.error('Failed to switch model: ' + String(e)); }
          })();
          return;
        }
        if (cmd === 'help') {
          const custom = listCustomCommandNames();
          const customStr = custom.length > 0 ? custom.join(', ') : '';
          const builtin = '/clear /new /wizard /mode /setup /connect /review /review-file /review-branch /scan /sast /sarif /dismiss /test /export /loop /pipeline /ci /commit /context /parallel /models /health /model /trust /feedback /undo /redo /background /agents /thinking /details /init /session';
          appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: customStr ? `**Built-in commands:**\n${builtin}\n\n**Custom commands:**\n${customStr}` : builtin }] });
          return;
        }
        // Check custom commands from .sentinel/commands/
        const customPrompt = executeCustomCommand(cmd, value.replace(/^\/(\w+)/, '').trim(), { mode, model });
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
      if (input === 'x')    { return; } // ignore double Ctrl+X
      toast.info(`Unknown leader key: ${ch}`);
      return;
    }

    if (key.ctrl && input === 's') {
      setShowSessionPanel(v => !v);
      return;
    }

    if (key.ctrl && input === 'x') {
      setLeaderKey('ctrl-x');
      toast.info('Leader: press T(thinking) D(details) M(model) P(palette) C(clear) N(new) S(session)');
      leaderTimeoutRef.current = setTimeout(() => { setLeaderKey('none'); }, 3000);
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
      if (configured.length > 0 || hasEnvKeys) {
        const { autoSelectBestModel } = await import('../../shared/models/index.js');
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
