import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useLocation, useNavigate } from 'react-router';
import { SessionShell } from '../components/session-shell.js';
import { SessionPanel } from '../components/session-panel.js';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages/index.js';
import { CommandMenu } from '../components/command-menu/index.js';
import { MultiStepAnalyzeDialog } from '../components/dialogs/multi-step-analyze.js';
import { ProviderSetupDialog } from '../components/dialogs/provider-setup.js';
import { PROVIDER_ENV_KEYS } from '../components/dialogs/provider-setup.js';
import { useTheme } from '../providers/theme/index.js';
import { useDialog } from '../providers/dialog/index.js';
import { useToast } from '../providers/toast/index.js';
import { useAgentChat } from '../hooks/use-agent-chat.js';
import { Sessions } from '../lib/api-client.js';
import { TOOLS } from '../lib/tools.js';
export function Session() {
  const location = useLocation();
  const initialState = location.state;
  const initialMessage = initialState?.message;
  const initialMode = initialState?.mode;
  const initialSent = useRef(false);
  const toast = useToast();
  const { messages, loading, mode, setMode, toggleMode, submit, stop, clear, appendMessage, model, setModel, status, sessionId, serverStatus } = useAgentChat({
    initialMode: initialMode === 'BUILD' || initialMode === 'PLAN' || initialMode === 'REVIEW' ? initialMode : undefined,
  });
  const tokenUsage = {
    estimated: messages.reduce((acc, m) => acc + m.parts.reduce((s, p) => s + (p.type === 'text' || p.type === 'reasoning' ? p.text?.length ?? 0 : 0), 0), 0) / 3.8,
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
  const handleSetMode = useCallback((m) => {
    if (m === 'BUILD' || m === 'PLAN' || m === 'REVIEW') {
      setMode(m);
    }
  }, [setMode]);
  const commandCtx = {
    exit: () => process.exit(0),
    navigate: (path) => navigate(path),
    execute: (action) => { submit(`/${action}`); },
    mode,
    setMode: handleSetMode,
  };
  const wrappedSubmit = useCallback((value) => {
    if (value.startsWith('/')) {
      const cmd = value.replace(/^\//, '').split(/\s+/)[0].toLowerCase();
      if (cmd === 'clear') {
        clear();
        return;
      }
      if (cmd === 'new') {
        navigate('/');
        return;
      }
      if (cmd === 'wizard') {
        dialog.open({
          title: 'Multi-Step Analysis Wizard',
          width: 70,
          height: 35,
          children: (_jsx(MultiStepAnalyzeDialog, { onRun: async (target, analyzers) => {
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
              }
              else {
                appendMessage({ role: 'error', parts: [{ type: 'text', text: result.error || 'Analysis failed' }] });
              }
            }
            catch (e) {
              appendMessage({ role: 'error', parts: [{ type: 'text', text: String(e) }] });
            }
          } })),
        });
        return;
      }
      if (cmd === 'setup' || cmd === 'connect') {
        dialog.open({
          title: 'AI Provider Setup',
          width: 72,
          height: 35,
          children: (_jsx(ProviderSetupDialog, { onComplete: () => {
            toast.success('Provider setup complete. Run /health to verify.');
            dialog.close();
          } })),
        });
        return;
      }
      if (cmd === 'mode') {
        toggleMode();
        return;
      }
      if (cmd === 'review') {
        const arg = value.replace(/^\/review\s*/i, '').trim();
        if (!arg) {
          navigate('/review');
          return;
        }
        const prevMode = mode;
        setMode('REVIEW');
        (async () => {
          try {
            const { getGitDiff, buildReviewPrompt } = await import('../lib/security-reviewer.js');
            const { injectContextIntoPrompt } = await import('../lib/context-file.js');
            const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
            const diff = getGitDiff({ file: arg });
            if (!diff) {
              toast.info(`No changes detected for ${arg}.`);
              setMode(prevMode);
              return;
            }
            const [sast] = await Promise.all([runSast()]);
            const sastSummary = sast.findings.length > 0 ? formatSastForPrompt(sast) : undefined;
            const basePrompt = buildReviewPrompt(diff, { files: [arg], focus: 'security', sastSummary });
            submit(injectContextIntoPrompt(basePrompt));
          }
          catch (e) {
            toast.error('Review failed: ' + String(e));
            setMode(prevMode);
          }
        })();
        return;
      }
      if (cmd === 'review-branch') {
        const branch = value.replace(/^\/review-branch\s*/i, '').trim();
        if (!branch) {
          toast.error('Usage: /review-branch <branch-name>');
          return;
        }
        const prevMode = mode;
        setMode('REVIEW');
        (async () => {
          try {
            const { getGitDiff, getChangedFiles, buildReviewPrompt } = await import('../lib/security-reviewer.js');
            const { injectContextIntoPrompt } = await import('../lib/context-file.js');
            const { runSast, formatSastForPrompt } = await import('../lib/sast-runner.js');
            const diff = getGitDiff({ branch });
            if (!diff) {
              toast.info(`No changes detected vs ${branch}.`);
              setMode(prevMode);
              return;
            }
            const files = getChangedFiles({ branch });
            const sast = await runSast();
            const sastSummary = sast.findings.length > 0 ? formatSastForPrompt(sast) : undefined;
            const basePrompt = buildReviewPrompt(diff, { files, focus: 'all', sastSummary });
            submit(injectContextIntoPrompt(basePrompt));
          }
          catch (e) {
            toast.error('Review failed: ' + String(e));
            setMode(prevMode);
          }
        })();
        return;
      }
      if (cmd === 'review-file') {
        const file = value.replace(/^\/review-file\s*/i, '').trim();
        if (!file) {
          toast.error('Usage: /review-file <path>');
          return;
        }
        navigate('/review');
        return;
      }
      if (cmd === 'scan') {
        const target = value.replace(/^\/scan\s*/i, '').trim() || '.';
        (async () => {
          try {
            const result = await TOOLS.securityAudit.execute({ files: target });
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: result.output || result.error || 'Scan complete.' }] });
          }
          catch (e) {
            toast.error('Scan failed: ' + String(e));
          }
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
            }
            else {
              toast.error('No checkpoints available.');
            }
          }
          catch (e) {
            toast.error('Undo failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'background') {
        const prompt = value.replace(/^\/background\s*/i, '').trim();
        if (!prompt) {
          toast.error('Usage: /background <prompt>');
          return;
        }
        (async () => {
          try {
            const { launchBackgroundAgent } = await import('../../agents/background-agent.js');
            const agent = launchBackgroundAgent(prompt);
            toast.success(`Background agent launched: ${agent.id}`);
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `🚀 Background agent \`${agent.id}\` started.\nPrompt: "${prompt.slice(0, 80)}"\nCheck status with /agents` }] });
          }
          catch (e) {
            toast.error('Failed to launch agent: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'agents') {
        (async () => {
          try {
            const { listAgents } = await import('../../agents/background-agent.js');
            const agents = listAgents();
            if (agents.length === 0) {
              toast.info('No background agents running.');
              return;
            }
            const lines = agents.map((a) => `• ${a.id} — ${a.status} (${a.elapsed}) — "${a.prompt}"`).join('\n');
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `**Background Agents:**\n${lines}` }] });
          }
          catch (e) {
            toast.error('Failed to list agents: ' + String(e));
          }
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
            if (result.errors.length > 0) {
              const timeoutErrors = result.errors.filter(e => e.includes('TIMEOUT'));
              const otherErrors = result.errors.filter(e => !e.includes('TIMEOUT'));
              if (timeoutErrors.length > 0)
                toast.warning(`SAST tool timed out: ${timeoutErrors.join('; ')} — results may be partial. Increase timeout or run each tool individually.`);
              if (otherErrors.length > 0)
                toast.error(`SAST warnings: ${otherErrors.slice(0, 2).join('; ')}`);
            }
          }
          catch (e) {
            toast.error('SAST failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'commit') {
        (async () => {
          try {
            const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
            const diff = getGitDiff({ staged: true }) || getGitDiff();
            if (!diff) {
              toast.error('No changes to commit.');
              return;
            }
            const files = getChangedFiles({ staged: true });
            const prompt = `Generate a concise git commit message for these changes. Output ONLY the commit message (subject line + optional body). No preamble.\n\nChanged files: ${files.join(', ')}\n\n\`\`\`diff\n${diff.slice(0, 6000)}\n\`\`\``;
            const prevMode = mode;
            setMode('PLAN');
            await submit(prompt);
            setMode(prevMode);
          }
          catch (e) {
            toast.error('Commit generation failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'dismiss') {
        const args = value.replace(/^\/dismiss\s*/i, '').trim();
        if (!args) {
          toast.error('Usage: /dismiss <file:line:rule> [reason]');
          return;
        }
        (async () => {
          try {
            const { dismissIssue } = await import('../../utils/dismissedIssues.js');
            const parts = args.split(/\s+/);
            const key = parts[0];
            const reason = parts.slice(1).join(' ') || 'User dismissed';
            const keyParts = key.split(':');
            if (keyParts.length < 3) {
              toast.error('Key format: file:line:rule (e.g., src/app.ts:42:no-eval)');
              return;
            }
            const [file, lineStr, ...ruleParts] = keyParts;
            const line = parseInt(lineStr, 10);
            const rule = ruleParts.join(':');
            dismissIssue(file, line, rule, reason, {});
            toast.success(`Dismissed ${key}`);
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Dismissed finding: ${key}\nReason: ${reason}\n\nThis finding will be skipped in future scans. Use /dismiss-list to show all dismissals, /dismiss-remove to undo.` }] });
          }
          catch (e) {
            toast.error('Dismiss failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'dismiss-list') {
        (async () => {
          try {
            const { getDismissals } = await import('../../utils/dismissedIssues.js');
            const data = getDismissals();
            const keys = Object.keys(data.dismissals || {});
            if (keys.length === 0) {
              toast.info('No dismissed findings.');
              return;
            }
            const lines = keys.map(k => `• ${k} — ${data.dismissals[k].reason || 'No reason'}`).join('\n');
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## Dismissed Findings (${keys.length})\n\n${lines}` }] });
          }
          catch (e) {
            toast.error('Failed to list dismissals: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'dismiss-remove') {
        const args = value.replace(/^\/dismiss-remove\s*/i, '').trim();
        if (!args) {
          toast.error('Usage: /dismiss-remove <file:line:rule>');
          return;
        }
        (async () => {
          try {
            const { undismissIssue } = await import('../../utils/dismissedIssues.js');
            const keyParts = args.split(':');
            if (keyParts.length < 3) {
              toast.error('Key format: file:line:rule');
              return;
            }
            const [file, lineStr, ...ruleParts] = keyParts;
            const line = parseInt(lineStr, 10);
            const rule = ruleParts.join(':');
            const ok = undismissIssue(file, line, rule);
            if (ok) {
              toast.success(`Removed dismissal for ${args}`);
            }
            else {
              toast.error('Dismissal not found');
            }
          }
          catch (e) {
            toast.error('Failed to remove dismissal: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'test') {
        const file = value.replace(/^\/test\s*/i, '').trim();
        if (!file) {
          toast.error('Usage: /test <file-path> — Generate AI unit tests for the specified file');
          return;
        }
        (async () => {
          try {
            appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `/test ${file}` }] });
            const fs = await import('fs');
            if (!fs.existsSync(file)) {
              toast.error(`File not found: ${file}`);
              return;
            }
            toast.info(`Generating tests for ${file}...`);
            const content = fs.readFileSync(file, 'utf-8');
            const testPrompt = `Generate a comprehensive unit test file for the following code. Use the project's existing test framework (Jest/Vitest). Output ONLY valid test code, no explanations. Include edge cases, error paths, and main success paths.\n\nFile: ${file}\n\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``;
            submit(testPrompt);
          }
          catch (e) {
            toast.error('Test generation failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'export') {
        (async () => {
          try {
            toast.info('Exporting session...');
            const lines = ['# Sentinel Session Export', '', `**Date:** ${new Date().toISOString()}`, `**Mode:** ${mode}`, `**Model:** ${model}`, `**Messages:** ${messages.length}`, ''];
            for (const msg of messages) {
              const role = msg.role.toUpperCase();
              const text = msg.parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
              if (text) {
                lines.push(`### ${role}`);
                lines.push('');
                lines.push(text);
                lines.push('');
              }
              const toolCalls = msg.parts.filter(p => p.type === 'tool-call');
              for (const tc of toolCalls) {
                lines.push(`> _Tool: ${tc.toolName}_`);
              }
            }
            const exportDir = process.cwd() + '/.sentinel/exports';
            const fs = await import('fs');
            fs.mkdirSync(exportDir, { recursive: true });
            const exportPath = `${exportDir}/session-${sessionId || Date.now()}.md`;
            fs.writeFileSync(exportPath, lines.join('\n'), 'utf-8');
            toast.success(`Session exported to ${exportPath}`);
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `✅ Session exported to \`${exportPath}\`` }] });
          }
          catch (e) {
            toast.error('Export failed: ' + String(e));
          }
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
          }
          catch (e) {
            toast.error('SARIF export failed: ' + String(e));
          }
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
            const fileSections = [];
            let currentFile = null;
            for (const line of diff.split('\n')) {
              if (line.startsWith('diff --git ')) {
                const m = line.match(/diff --git a\/(.+) b\/(.+)/);
                const path = m ? m[2] : 'unknown';
                if (currentFile)
                  fileSections.push(currentFile);
                currentFile = { path, added: 0, deleted: 0, hunks: [] };
              }
              if (currentFile) {
                if (line.startsWith('+') && !line.startsWith('+++'))
                  currentFile.added++;
                else if (line.startsWith('-') && !line.startsWith('---'))
                  currentFile.deleted++;
                currentFile.hunks.push(line);
              }
            }
            if (currentFile)
              fileSections.push(currentFile);
            // Build formatted diff output
            const totalAdded = fileSections.reduce((s, f) => s + f.added, 0);
            const totalDeleted = fileSections.reduce((s, f) => s + f.deleted, 0);
            const lines = [];
            lines.push('## Git Diff Preview');
            lines.push('');
            if (branch)
              lines.push(`**Branch:** \`${branch}\``);
            if (isStaged)
              lines.push('**Scope:** Staged changes');
            if (file)
              lines.push(`**File:** \`${file}\``);
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
                if (l.startsWith('@@'))
                  return true;
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
              }
              else {
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
          }
          catch (e) {
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
            }
            else {
              const content = files.map(f => `**${f.source}** (${f.content.length} chars)\n\`\`\`\n${f.content.slice(0, 500)}${f.content.length > 500 ? '\n...' : ''}\n\`\`\``).join('\n\n');
              appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `## Active Context Files\n\n${content}` }] });
            }
          }
          catch (e) {
            toast.error('Context command failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'parallel') {
        const target = value.replace(/^\/parallel\s*/i, '').trim();
        (async () => {
          try {
            const { getGitDiff, getChangedFiles } = await import('../lib/security-reviewer.js');
            const diff = getGitDiff();
            if (!diff) {
              toast.error('No git diff found for parallel scan.');
              return;
            }
            const files = getChangedFiles();
            toast.info('Launching 4 specialist agents in parallel…');
            const { runParallelAgents } = await import('../lib/parallel-agents.js');
            const result = await runParallelAgents(diff, files, async (prompt, m) => {
              const prevMode = mode;
              setMode((m || 'REVIEW'));
              await submit(prompt);
              setMode(prevMode);
              return '';
            }, {
              onProgress: (agent, done) => {
                if (done)
                  toast.info(`Agent done: ${agent}`);
              },
            });
            const summary = `## Parallel Scan Complete\n\n**${result.mergedIssues.length} unique issues** across ${result.agentResults.length} agents\n\n${result.agentResults.map(a => `- **${a.agent}**: ${a.issues.length} issues (${Math.round(a.durationMs / 1000)}s)`).join('\n')}`;
            appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: summary }] });
          }
          catch (e) {
            toast.error('Parallel scan failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'models') {
        (async () => {
          try {
            const { SUPPORTED_CHAT_MODELS } = await import('../../shared/models/index.js');
            const byProvider = {};
            for (const m of SUPPORTED_CHAT_MODELS) {
              if (!byProvider[m.provider])
                byProvider[m.provider] = [];
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
          }
          catch (e) {
            toast.error('Failed to list models: ' + String(e));
          }
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
            const providerChecks = [
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
          }
          catch (e) {
            toast.error('Health check failed: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'model') {
        const target = value.replace(/^\/model\s*/i, '').trim();
        if (!target) {
          toast.info(`Current model: ${model}`);
          return;
        }
        (async () => {
          try {
            const { findSupportedChatModel } = await import('../../shared/models/index.js');
            const m = findSupportedChatModel(target);
            if (!m) {
              toast.error(`Model not found: ${target}. Use /models to list available models.`);
              return;
            }
            setModel(m.id);
            toast.success(`Switched to ${m.label}`);
          }
          catch (e) {
            toast.error('Failed to switch model: ' + String(e));
          }
        })();
        return;
      }
      if (cmd === 'help') {
        toast.info('Commands: /clear /new /wizard /mode /setup /connect /review /review-file /review-branch /scan /sast /sarif /dismiss /test /export /loop /pipeline /ci /commit /context /parallel /models /health /model /undo /background /agents /help');
        return;
      }
      toast.error('Unknown command. Type /help for commands.');
      return;
    }
    submit(value);
  }, [clear, navigate, dialog, appendMessage, mode, model, toggleMode, toast, submit, setMode]);
  const handleSelectSession = useCallback(async (id) => {
    try {
      const session = await Sessions.get(id);
      if (!session) {
        toast.error('Session not found');
        return;
      }
      clear();
      if (session.messages && Array.isArray(session.messages)) {
        for (const m of session.messages) {
          appendMessage({
            role: m.role === 'user' || m.role === 'assistant' || m.role === 'error' ? m.role : 'assistant',
            parts: (m.parts || (m.content ? [{ type: 'text', text: m.content }] : [])),
            mode: (m.metadata?.mode === 'BUILD' || m.metadata?.mode === 'PLAN' ? m.metadata.mode : session.mode),
            model: m.metadata?.model || session.model,
          });
        }
      }
      if (session.mode === 'BUILD' || session.mode === 'PLAN' || session.mode === 'REVIEW')
        setMode(session.mode);
      if (session.model)
        setModel(session.model);
      setShowSessionPanel(false);
    }
    catch {
      toast.error('Failed to load session');
    }
  }, [clear, appendMessage, setMode, setModel, toast]);
  const handleForkSession = useCallback(async (id) => {
    try {
      const session = await Sessions.get(id);
      if (!session) {
        toast.error('Session not found');
        return;
      }
      const newSession = await Sessions.create({
        title: session.title + ' (fork)',
        mode: session.mode,
        model: session.model,
        projectPath: process.cwd(),
      });
      if (!newSession || !newSession.id) {
        toast.error('Failed to create session');
        return;
      }
      await handleSelectSession(newSession.id);
      toast.success('Session forked');
    }
    catch {
      toast.error('Failed to fork session');
    }
  }, [handleSelectSession, toast]);
  const handleDeleteSession = useCallback(async (id) => {
    try {
      const ok = await Sessions.delete(id);
      if (ok) {
        if (messages.length > 0)
          clear();
        toast.success('Session deleted');
      }
      else {
        toast.error('Failed to delete session');
      }
    }
    catch {
      toast.error('Failed to delete session');
    }
  }, [clear, messages.length, toast]);
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
  const firstRunChecked = useRef(false);
  useEffect(() => {
    if (firstRunChecked.current)
      return;
    firstRunChecked.current = true;
    (async () => {
      const { configManager } = await import('../../config/configManager.js');
      await configManager.load();
      const configured = configManager.getConfiguredProviders();
      const hasEnvKeys = PROVIDER_ENV_KEYS.some(k => process.env[k]);
      if (configured.length === 0 && !hasEnvKeys) {
        dialog.open({
          title: 'Welcome to Sentinel — Set Up AI Providers',
          width: 72,
          height: 35,
          children: (_jsx(ProviderSetupDialog, { onComplete: () => {
            toast.success('Providers configured! Run /health to verify.');
            dialog.close();
          } })),
        });
      }
    })();
  }, []);
  const handleModeToggle = useCallback(() => toggleMode(), [toggleMode]);
  const handleCommandPalette = useCallback(() => setShowCommands(v => !v), []);
  const isLoading = loading || status === 'streaming';
  return (_jsxs(Box, { flexGrow: 1, width: '100%', flexDirection: 'row', children: [showSessionPanel ? (_jsx(SessionPanel, { currentSessionId: undefined, onSelect: handleSelectSession, onFork: handleForkSession, onDelete: handleDeleteSession, onClose: () => setShowSessionPanel(false) })) : null, _jsxs(Box, { flexGrow: 1, flexDirection: 'column', children: [_jsxs(SessionShell, { onSubmit: wrappedSubmit, inputDisabled: isLoading, loading: isLoading, mode: mode, onModeToggle: handleModeToggle, onCommandPalette: handleCommandPalette, model: model, sessionId: sessionId ?? undefined, statusText: `${messages.length} msgs · ${theme.name}`, tokenUsage: tokenUsage.estimated > 0 ? tokenUsage : undefined, serverStatus: serverStatus, costUsd: costUsd, children: [messages.length === 0 ? (_jsx(Box, { padding: 2, alignItems: 'center', justifyContent: 'center', children: _jsx(Text, { dimColor: true, children: 'Start a conversation or type /help for commands' }) })) : null, messages.map(msg => {
    if (msg.role === 'error') {
      const textPart = msg.parts.find((p) => p.type === 'text');
      return _jsx(ErrorMessage, { message: textPart?.text || 'Unknown error' }, msg.id);
    }
    if (msg.role === 'user') {
      const textPart = msg.parts.find((p) => p.type === 'text');
      return _jsx(UserMessage, { message: textPart?.text || '', mode: msg.mode || mode }, msg.id);
    }
    if (msg.role === 'assistant') {
      return _jsx(BotMessage, { parts: msg.parts, model: msg.model || model }, msg.id);
    }
    return null;
  })] }), showCommands ? (_jsx(CommandMenu, { onClose: () => setShowCommands(false), ctx: commandCtx })) : null] })] }));
}
