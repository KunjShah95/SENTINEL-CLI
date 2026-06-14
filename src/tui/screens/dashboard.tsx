import React, { useCallback, useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../providers/theme/index.js';
import { StatusBar } from '../components/status-bar.js';
import { TOOLS } from '../lib/tools.js';
import { getProviderInfo, getOllamaModels, type OllamaModel } from '../lib/chat.js';
import { getVersion } from '../lib/version.js';
import { useNavigate } from 'react-router';
import { existsSync, readdirSync, readFileSync } from 'fs';

type DashboardData = {
  status: string;
  version?: string;
  uptime?: number;
};

type ProviderInfo = {
  id: string;
  provider: string;
  model: string;
  enabled: boolean;
  hasKey: boolean;
};

export function Dashboard() {
  const { colors } = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [cacheStats, setCacheStats] = useState<string>('...');
  const [configStatus, setConfigStatus] = useState<string>('...');
  const [gitInfo, setGitInfo] = useState<string>('...');

  useEffect(() => {
    async function load() {
      try {
        const result = await TOOLS.status.execute({});
        setData({
          status: result.success ? 'healthy' : 'error',
          version: getVersion(),
          uptime: process.uptime(),
        });
      } catch {
        setData({ status: 'error', version: getVersion() });
      }
      try {
        const info = await getProviderInfo();
        setProviders(info);
      } catch {}
      try {
        const models = await getOllamaModels();
        setOllamaModels(models);
      } catch {}
      try {
        const home = process.env.HOME || process.env.USERPROFILE || '~';
        const sessDir = `${home}/.sentinel/sessions`;
        if (existsSync(sessDir)) {
          const files = readdirSync(sessDir).filter(f => f.endsWith('.json'));
          setSessionCount(files.length);
        }
      } catch {}
      try {
        const { cache } = await import('../../utils/cache.js');
        const s = cache.getStats();
        setCacheStats(`${s.memorySize} entries, ${Math.round((s.hitRate || 0) * 100)}% hit rate`);
      } catch {
        setCacheStats('unavailable');
      }
      try {
        if (existsSync('.codereviewrc.json')) {
          const raw = readFileSync('.codereviewrc.json', 'utf-8');
          const cfg = JSON.parse(raw);
          const analyzerCount = cfg.analysis?.enabledAnalyzers?.length || 0;
          const providerCount = cfg.ai?.providers?.length || 0;
          setConfigStatus(`${analyzerCount} analyzers, ${providerCount} providers`);
        } else {
          setConfigStatus('not found');
        }
      } catch {
        setConfigStatus('error reading');
      }
      try {
        const { execSync } = await import('child_process');
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
        const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
        setGitInfo(`${branch} @ ${commit}`);
      } catch {
        setGitInfo('not a git repo');
      }
    }
    load();
  }, []);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <Box flexDirection="column" width="100%" padding={2}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center" paddingBottom={1}>
        <Text bold color={colors.primary}>{'■ Sentinel Dashboard'}</Text>
        <Box flexDirection="row" gap={1}>
          <Box borderStyle="single" borderColor={colors.dimSeparator} paddingX={1}>
            <Text color={colors.info}>{'← Back'}</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="row" gap={2} flexGrow={1}>
        <Box flexDirection="column" width="50%" gap={1}>
          <Box
            borderStyle="single"
            borderColor={colors.dimSeparator}
            padding={1}
            flexDirection="column"
            gap={1}
          >
            <Text bold color={colors.primary}>{'System Health'}</Text>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Status:'}</Text>
              <Text color={data?.status === 'healthy' ? colors.success : colors.error}>
                {data?.status || 'checking...'}
              </Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Version:'}</Text>
              <Text>{data?.version || '...'}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Uptime:'}</Text>
              <Text>{data?.uptime ? `${Math.floor(data.uptime / 60)}m` : '...'}</Text>
            </Box>
          </Box>

          <Box
            borderStyle="single"
            borderColor={colors.dimSeparator}
            padding={1}
            flexDirection="column"
            gap={1}
          >
            <Text bold color={colors.warning}>{'Quick Actions'}</Text>
            <Box flexDirection="column" gap={1}>
              {[
                { label: 'Full Scan', cmd: '/full-scan', color: colors.warning },
                { label: 'Analyze Code', cmd: '/analyze', color: colors.info },
                { label: 'Security Audit', cmd: '/security', color: colors.error },
                { label: 'Scan Secrets', cmd: '/secrets', color: colors.primary },
                { label: 'Review Diff', cmd: '/diff', color: colors.success },
              ].map(action => (
                <Box key={action.cmd} flexDirection="row" gap={1}>
                  <Text color={action.color}>{`▶ ${action.label}`}</Text>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column" width="50%" gap={1}>
          <Box
            borderStyle="single"
            borderColor={colors.dimSeparator}
            padding={1}
            flexDirection="column"
            gap={1}
          >
            <Text bold color={colors.info}>{'Recent Activity'}</Text>
            <Text dimColor>
              {sessionCount > 0 ? `${sessionCount} saved session(s)` : 'No recent activity'}
            </Text>
          </Box>

          <Box
            borderStyle="single"
            borderColor={colors.dimSeparator}
            padding={1}
            flexDirection="column"
            gap={1}
          >
            <Text bold color={colors.secure}>{'Ollama Models'}</Text>
            {ollamaModels.length === 0 ? (
              <Text dimColor>{'No models found (is Ollama running?)'}</Text>
            ) : (
              <Box flexDirection="column" gap={1}>
                {ollamaModels.slice(0, 6).map(m => {
                  const size =
                    m.size > 1e9
                      ? `${(m.size / 1e9).toFixed(1)}GB`
                      : `${(m.size / 1e6).toFixed(0)}MB`;
                  return (
                    <Box key={m.name} flexDirection="row" gap={1}>
                      <Text color={colors.primary}>{'◉'}</Text>
                      <Text>{m.name}</Text>
                      <Text dimColor>{size}</Text>
                    </Box>
                  );
                })}
                {ollamaModels.length > 6 ? (
                  <Text dimColor>{`...and ${ollamaModels.length - 6} more`}</Text>
                ) : null}
              </Box>
            )}
          </Box>

          <Box
            borderStyle="single"
            borderColor={colors.dimSeparator}
            padding={1}
            flexDirection="column"
            gap={1}
          >
            <Text bold color={colors.primary}>{'Configuration'}</Text>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'AI Providers:'}</Text>
              <Text>
                {providers.filter(p => p.hasKey).length > 0
                  ? providers
                      .filter(p => p.hasKey)
                      .map(p => p.provider)
                      .join(', ')
                  : 'none configured'}
              </Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Analyzers:'}</Text>
              <Text>{`${Object.keys(TOOLS).length - 5}+`}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Sessions:'}</Text>
              <Text>{String(sessionCount)}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Ollama Models:'}</Text>
              <Text>{ollamaModels.length > 0 ? String(ollamaModels.length) : '—'}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Cache:'}</Text>
              <Text color={colors.info}>{cacheStats}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Config:'}</Text>
              <Text color={colors.info}>{configStatus}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>{'Git:'}</Text>
              <Text dimColor>{gitInfo}</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box paddingTop={1}>
        <StatusBar mode="BUILD" statusText="Dashboard" />
      </Box>
    </Box>
  );
}
