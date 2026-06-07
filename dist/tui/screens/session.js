import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useKeyboard } from '@opentui/react';
import { SessionShell } from '../components/session-shell';
import { SessionPanel } from '../components/session-panel';
import { UserMessage, BotMessage, ErrorMessage } from '../components/messages';
import { CommandMenu } from '../components/command-menu';
import { MultiStepAnalyzeDialog } from '../components/dialogs/multi-step-analyze';
import { useTheme } from '../providers/theme';
import { useDialog } from '../providers/dialog';
import { useToast } from '../providers/toast';
import { useAgentChat } from '../hooks/use-agent-chat';
import { Sessions } from '../lib/api-client';
import { TOOLS } from '../lib/tools';
export function Session() {
    const location = useLocation();
    const initialState = location.state;
    const initialMessage = initialState?.message;
    const initialMode = initialState?.mode;
    const initialSent = useRef(false);
    const toast = useToast();
    const { messages, loading, mode, setMode, toggleMode, submit, stop, clear, appendMessage, model, setModel, status, } = useAgentChat({
        initialMode: initialMode === 'BUILD' || initialMode === 'PLAN' || initialMode === 'REVIEW' ? initialMode : undefined,
    });
    const [showCommands, setShowCommands] = useState(false);
    const [showSessionPanel, setShowSessionPanel] = useState(false);
    const dialog = useDialog();
    const exitApp = useCallback(() => process.exit(0), []);
    const navigate = useNavigate();
    const { theme } = useTheme();
    const handleSetMode = useCallback((m) => {
        if (m === 'BUILD' || m === 'PLAN' || m === 'REVIEW') {
            setMode(m);
        }
    }, [setMode]);
    const commandCtx = {
        exit: exitApp,
        navigate: (path) => navigate(path),
        execute: (action) => {
            submit(`/${action}`);
        },
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
                                    appendMessage({
                                        role: 'assistant',
                                        mode,
                                        model,
                                        parts: [{ type: 'text', text: result.output }],
                                    });
                                }
                                else {
                                    appendMessage({
                                        role: 'error',
                                        parts: [{ type: 'text', text: result.error || 'Analysis failed' }],
                                    });
                                }
                            }
                            catch (e) {
                                appendMessage({
                                    role: 'error',
                                    parts: [{ type: 'text', text: String(e) }],
                                });
                            }
                        } })),
                });
                return;
            }
            if (cmd === 'mode') {
                toggleMode();
                return;
            }
            if (cmd === 'review') {
                const prevMode = mode;
                setMode('REVIEW');
                (async () => {
                    try {
                        const { executeLocalTool } = await import('../../shared/tools/index.js');
                        let diffResult = await executeLocalTool('bash', { command: 'git diff --staged' }, 'BUILD');
                        let diffText = diffResult?.stdout?.trim();
                        if (!diffText) {
                            diffResult = await executeLocalTool('bash', { command: 'git diff HEAD' }, 'BUILD');
                            diffText = diffResult?.stdout?.trim();
                        }
                        if (!diffText) {
                            toast.info('No changes detected. Stage changes with git add first.');
                            setMode(prevMode);
                            return;
                        }
                        submit(`Review this diff for bugs, security issues, and best practices:\n\n\`\`\`diff\n${diffText}\n\`\`\``);
                    }
                    catch (e) {
                        toast.error('Failed to get git diff: ' + String(e));
                        setMode(prevMode);
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
                            appendMessage({
                                role: 'assistant',
                                mode,
                                model,
                                parts: [{ type: 'text', text: `✅ Undo complete: ${result.message}` }],
                            });
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
                        appendMessage({
                            role: 'assistant',
                            mode,
                            model,
                            parts: [{ type: 'text', text: `🚀 Background agent \`${agent.id}\` started.\nPrompt: "${prompt.slice(0, 80)}"\nCheck status with /agents` }],
                        });
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
                        appendMessage({
                            role: 'assistant',
                            mode,
                            model,
                            parts: [{ type: 'text', text: `**Background Agents:**\n${lines}` }],
                        });
                    }
                    catch (e) {
                        toast.error('Failed to list agents: ' + String(e));
                    }
                })();
                return;
            }
            if (cmd === 'help') {
                toast.info('Commands: /clear /new /wizard /mode /review /undo /background /agents /help');
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
            if (!newSession) {
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
    const handleDeleteSession = useCallback((_id) => {
        if (messages.length > 0) {
            clear();
        }
    }, [clear, messages.length]);
    useKeyboard((key) => {
        if (key.name === 's' && key.ctrl) {
            setShowSessionPanel((v) => !v);
            return;
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
    return (_jsxs("box", { flexGrow: 1, width: "100%", height: "100%", flexDirection: "row", children: [showSessionPanel ? (_jsx(SessionPanel, { currentSessionId: undefined, onSelect: handleSelectSession, onFork: handleForkSession, onDelete: handleDeleteSession, onClose: () => setShowSessionPanel(false) })) : null, _jsxs("box", { flexGrow: 1, width: showSessionPanel ? undefined : '100%', height: "100%", flexDirection: "column", children: [_jsxs(SessionShell, { onSubmit: wrappedSubmit, inputDisabled: isLoading, loading: isLoading, mode: mode, onModeToggle: handleModeToggle, onCommandPalette: handleCommandPalette, model: model, statusText: `${messages.length} msgs | ${theme.name}`, children: [messages.length === 0 ? (_jsx("box", { padding: 2, alignItems: "center", justifyContent: "center", children: _jsx("text", { attributes: 2, children: "Start a conversation or type /help for commands" }) })) : null, messages.map(msg => {
                                if (msg.role === 'error') {
                                    const text = msg.parts.find(p => p.type === 'text')?.text || 'Unknown error';
                                    return _jsx(ErrorMessage, { message: text }, msg.id);
                                }
                                if (msg.role === 'user') {
                                    const text = msg.parts.find(p => p.type === 'text')?.text || '';
                                    return _jsx(UserMessage, { message: text, mode: msg.mode || mode }, msg.id);
                                }
                                if (msg.role === 'assistant') {
                                    return _jsx(BotMessage, { parts: msg.parts, model: msg.model || model }, msg.id);
                                }
                                return null;
                            })] }), showCommands ? (_jsx(CommandMenu, { onClose: () => setShowCommands(false), ctx: commandCtx })) : null] })] }));
}
