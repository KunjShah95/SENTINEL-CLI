import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'react/jsx-runtime';
import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import os from 'os';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { TOOLS } from '../lib/tools.js';
import { getProviderInfo, getOllamaModels } from '../lib/chat.js';
import { getVersion } from '../lib/version.js';
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
  const [memoryUsage, setMemoryUsage] = useState({ heapUsed: 0, heapTotal: 0, rss: 0 });
  const [cpuLoad, setCpuLoad] = useState(0);
  useEffect(() => {
    async function load() {
      try {
        const result = await TOOLS.status.execute({});
        setData({ status: result.success ? 'healthy' : 'error', version: getVersion(), uptime: process.uptime() });
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
      try {
        const mem = process.memoryUsage();
        setMemoryUsage({ heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss });
        const cpus = os.cpus();
        const totalIdle = cpus.reduce((s, c) => s + c.times.idle, 0);
        const totalTick = cpus.reduce((s, c) => s + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
        setCpuLoad(Math.round((1 - totalIdle / totalTick) * 100));
      }
      catch { }
    }
    load();
  }, []);
  useInput((_input, key) => {
    if (key.escape || _input === 'q') {
      navigate('/');
    }
  });
  return (_jsxs(Box, { flexDirection: 'column', width: '100%', padding: 2, children: [_jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.primary, children: '■ Sentinel Dashboard' }), _jsx(Text, { dimColor: true, children: 'q/Esc: back' })] }), _jsxs(Box, { flexDirection: 'row', gap: 2, flexGrow: 1, children: [_jsxs(Box, { flexDirection: 'column', width: '50%', children: [_jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, padding: 1, flexDirection: 'column', marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.primary, children: 'System Health' }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Status:' }), _jsx(Text, { color: data?.status === 'healthy' ? colors.success : colors.error, children: data?.status || 'checking...' })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Version:' }), _jsx(Text, { children: data?.version || '...' })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Uptime:' }), _jsx(Text, { children: data?.uptime ? `${Math.floor(data.uptime / 60)}m` : '...' })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Memory:' }), _jsxs(Text, { children: [(memoryUsage.heapUsed / 1024 / 1024).toFixed(0), 'MB / ', (memoryUsage.rss / 1024 / 1024).toFixed(0), 'MB RSS'] })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'CPU:' }), _jsxs(Text, { color: cpuLoad > 80 ? colors.error : cpuLoad > 50 ? colors.warning : colors.success, children: [cpuLoad, '%'] })] })] }), _jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, padding: 1, flexDirection: 'column', children: [_jsx(Text, { bold: true, color: colors.warning, children: 'Quick Actions' }), [
    { label: 'Full Scan', cmd: '/full-scan', color: colors.warning },
    { label: 'Analyze Code', cmd: '/analyze', color: colors.info },
    { label: 'Security Audit', cmd: '/security', color: colors.error },
    { label: 'Scan Secrets', cmd: '/secrets', color: colors.primary },
    { label: 'Review Diff', cmd: '/diff', color: colors.success },
  ].map(action => (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: action.color, children: `▶ ${action.label}` }), _jsx(Text, { dimColor: true, children: action.cmd })] }, action.cmd)))] })] }), _jsxs(Box, { flexDirection: 'column', width: '50%', children: [_jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, padding: 1, flexDirection: 'column', marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.info, children: 'Recent Activity' }), _jsx(Text, { dimColor: true, children: sessionCount > 0 ? `${sessionCount} saved session(s)` : 'No recent activity' })] }), _jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, padding: 1, flexDirection: 'column', marginBottom: 1, children: [_jsx(Text, { bold: true, color: colors.success, children: 'Ollama Models' }), ollamaModels.length === 0 ? (_jsx(Text, { dimColor: true, children: 'No models found (is Ollama running?)' })) : (_jsxs(_Fragment, { children: [ollamaModels.slice(0, 6).map(m => {
    const size = m.size > 1e9 ? `${(m.size / 1e9).toFixed(1)}GB` : `${(m.size / 1e6).toFixed(0)}MB`;
    return (_jsxs(Box, { flexDirection: 'row', gap: 1, children: [_jsx(Text, { color: colors.primary, children: '◉' }), _jsx(Text, { children: m.name }), _jsx(Text, { dimColor: true, children: size })] }, m.name));
  }), ollamaModels.length > 6 ? (_jsx(Text, { dimColor: true, children: `...and ${ollamaModels.length - 6} more` })) : null] }))] }), _jsxs(Box, { borderStyle: 'single', borderColor: colors.dimSeparator, padding: 1, flexDirection: 'column', children: [_jsx(Text, { bold: true, color: colors.primary, children: 'Configuration' }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'AI Providers:' }), _jsx(Text, { children: providers.filter(p => p.hasKey).length > 0
    ? providers.filter(p => p.hasKey).map(p => p.provider).join(', ')
    : 'none configured' })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Analyzers:' }), _jsx(Text, { children: `${Object.keys(TOOLS).length - 5}+` })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Sessions:' }), _jsx(Text, { children: String(sessionCount) })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Ollama Models:' }), _jsx(Text, { children: ollamaModels.length > 0 ? String(ollamaModels.length) : '—' })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Cache:' }), _jsx(Text, { color: colors.info, children: cacheStats })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Config:' }), _jsx(Text, { color: colors.info, children: configStatus })] }), _jsxs(Box, { flexDirection: 'row', justifyContent: 'space-between', children: [_jsx(Text, { dimColor: true, children: 'Git:' }), _jsx(Text, { dimColor: true, children: gitInfo })] })] })] })] }), _jsx(Box, { marginTop: 1, children: _jsx(StatusBar, { mode: 'BUILD', statusText: 'Dashboard' }) })] }));
}
