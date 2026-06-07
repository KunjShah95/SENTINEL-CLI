import { jsxs as _jsxs, jsx as _jsx } from "@opentui/react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { TextAttributes } from '@opentui/core';
import { useTheme } from '../providers/theme';
import { StatusBar } from '../components/status-bar';
import { SentinelBorderChars } from '../components/border';
import { TOOLS } from '../lib/tools';
import { getProviderInfo, getOllamaModels } from '../lib/chat';
import { getVersion } from '../lib/version';
import { useNavigate } from 'react-router';
import { existsSync, readdirSync, readFileSync } from 'fs';
export function Dashboard() {
    const { colors } = useTheme();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [providers, setProviders] = useState([]);
    const [ollamaModels, setOllamaModels] = useState([]);
    const [sessionCount, setSessionCount] = useState(0);
    const [cacheStats, setCacheStats] = useState('...');
    const [configStatus, setConfigStatus] = useState('...');
    const [gitInfo, setGitInfo] = useState('...');
    useEffect(() => {
        async function load() {
            try {
                const result = await TOOLS.status.execute({});
                setData({
                    status: result.success ? 'healthy' : 'error',
                    version: getVersion(),
                    uptime: process.uptime(),
                });
            }
            catch {
                setData({ status: 'error', version: getVersion() });
            }
            try {
                const info = await getProviderInfo();
                setProviders(info);
            }
            catch { }
            try {
                const models = await getOllamaModels();
                setOllamaModels(models);
            }
            catch { }
            try {
                const home = process.env.HOME || process.env.USERPROFILE || '~';
                const sessDir = `${home}/.sentinel/sessions`;
                if (existsSync(sessDir)) {
                    const files = readdirSync(sessDir).filter(f => f.endsWith('.json'));
                    setSessionCount(files.length);
                }
            }
            catch { }
            try {
                const { cache } = await import('../../utils/cache.js');
                const s = cache.getStats();
                setCacheStats(`${s.memorySize} entries, ${Math.round((s.hitRate || 0) * 100)}% hit rate`);
            }
            catch {
                setCacheStats('unavailable');
            }
            try {
                if (existsSync('.codereviewrc.json')) {
                    const raw = readFileSync('.codereviewrc.json', 'utf-8');
                    const cfg = JSON.parse(raw);
                    const analyzerCount = cfg.analysis?.enabledAnalyzers?.length || 0;
                    const providerCount = cfg.ai?.providers?.length || 0;
                    setConfigStatus(`${analyzerCount} analyzers, ${providerCount} providers`);
                }
                else {
                    setConfigStatus('not found');
                }
            }
            catch {
                setConfigStatus('error reading');
            }
            try {
                const { execSync } = await import('child_process');
                const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
                const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
                setGitInfo(`${branch} @ ${commit}`);
            }
            catch {
                setGitInfo('not a git repo');
            }
        }
        load();
    }, []);
    const handleBack = useCallback(() => {
        navigate('/');
    }, [navigate]);
    return (_jsxs("box", { flexDirection: "column", width: "100%", height: "100%", padding: 2, children: [_jsxs("box", { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 1, children: [_jsxs("text", { attributes: 1, fg: colors.primary, children: ['\u25A0', " Sentinel Dashboard"] }), _jsx("box", { flexDirection: "row", gap: 1, children: _jsx("box", { border: SentinelBorderChars, borderColor: colors.dimSeparator, paddingX: 1, children: _jsxs("text", { selectable: true, fg: colors.info, children: ['\u2190', " Back"] }) }) })] }), _jsxs("box", { flexDirection: "row", gap: 2, flexGrow: 1, children: [_jsxs("box", { flexDirection: "column", width: "50%", gap: 1, children: [_jsxs("box", { border: SentinelBorderChars, borderColor: colors.dimSeparator, padding: 1, flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, fg: colors.primary, children: "System Health" }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Status:" }), _jsx("text", { fg: data?.status === 'healthy' ? colors.success : colors.error, children: data?.status || 'checking...' })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Version:" }), _jsx("text", { children: data?.version || '...' })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Uptime:" }), _jsx("text", { children: data?.uptime ? `${Math.floor(data.uptime / 60)}m` : '...' })] })] }), _jsxs("box", { border: SentinelBorderChars, borderColor: colors.dimSeparator, padding: 1, flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, fg: colors.warning, children: "Quick Actions" }), _jsx("box", { flexDirection: "column", gap: 0.5, children: [
                                            { label: 'Full Scan', cmd: '/full-scan', color: colors.warning },
                                            { label: 'Analyze Code', cmd: '/analyze', color: colors.info },
                                            { label: 'Security Audit', cmd: '/security', color: colors.error },
                                            { label: 'Scan Secrets', cmd: '/secrets', color: colors.primary },
                                            { label: 'Review Diff', cmd: '/diff', color: colors.success },
                                        ].map(action => (_jsx("box", { flexDirection: "row", gap: 1, children: _jsxs("text", { fg: action.color, children: ['\u25B6', " ", action.label] }) }, action.cmd))) })] })] }), _jsxs("box", { flexDirection: "column", width: "50%", gap: 1, children: [_jsxs("box", { border: SentinelBorderChars, borderColor: colors.dimSeparator, padding: 1, flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, fg: colors.info, children: "Recent Activity" }), _jsx("text", { attributes: TextAttributes.DIM, children: sessionCount > 0 ? `${sessionCount} saved session(s)` : 'No recent activity' })] }), _jsxs("box", { border: SentinelBorderChars, borderColor: colors.dimSeparator, padding: 1, flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, fg: colors.secure, children: "Ollama Models" }), ollamaModels.length === 0 ? (_jsx("text", { attributes: TextAttributes.DIM, children: "No models found (is Ollama running?)" })) : (_jsxs("box", { flexDirection: "column", gap: 0.5, children: [ollamaModels.slice(0, 6).map(m => {
                                                const size = m.size > 1e9
                                                    ? `${(m.size / 1e9).toFixed(1)}GB`
                                                    : `${(m.size / 1e6).toFixed(0)}MB`;
                                                return (_jsxs("box", { flexDirection: "row", gap: 1, children: [_jsx("text", { fg: colors.primary, children: '\u25C9' }), _jsx("text", { children: m.name }), _jsx("text", { attributes: TextAttributes.DIM, children: size })] }, m.name));
                                            }), ollamaModels.length > 6 ? (_jsxs("text", { attributes: TextAttributes.DIM, children: ["...and ", ollamaModels.length - 6, " more"] })) : null] }))] }), _jsxs("box", { border: SentinelBorderChars, borderColor: colors.dimSeparator, padding: 1, flexDirection: "column", gap: 1, children: [_jsx("text", { attributes: 1, fg: colors.primary, children: "Configuration" }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "AI Providers:" }), _jsx("text", { children: providers.filter(p => p.hasKey).length > 0
                                                    ? providers
                                                        .filter(p => p.hasKey)
                                                        .map(p => p.provider)
                                                        .join(', ')
                                                    : 'none configured' })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Analyzers:" }), _jsxs("text", { children: [Object.keys(TOOLS).length - 5, "+"] })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Sessions:" }), _jsx("text", { children: sessionCount })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Ollama Models:" }), _jsx("text", { children: ollamaModels.length > 0 ? ollamaModels.length : '\u2014' })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Cache:" }), _jsx("text", { fg: colors.info, children: cacheStats })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Config:" }), _jsx("text", { fg: colors.info, children: configStatus })] }), _jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { attributes: TextAttributes.DIM, children: "Git:" }), _jsx("text", { attributes: TextAttributes.DIM, children: gitInfo })] })] })] })] }), _jsx("box", { paddingTop: 1, children: _jsx(StatusBar, { mode: "BUILD", statusText: "Dashboard" }) })] }));
}
