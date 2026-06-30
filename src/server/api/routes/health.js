/**
 * Enhanced health check route — provides deep diagnostics for production.
 *
 * GET /health          — quick liveness probe (JSON)
 * GET /health/ready    — readiness probe (checks dependencies)
 * GET /health/live     — liveness probe (always 200 if process alive)
 * GET /health/details  — full diagnostic report (memory, uptime, deps)
 */

import { Hono } from 'hono';
import { existsSync } from 'node:fs';
import path from 'node:path';

const health = new Hono();

/**
 * Quick liveness check — existing endpoint enhanced.
 */
health.get('/', (c) => c.json({
  ok: true,
  ts: Date.now(),
  uptime: process.uptime(),
}));

/**
 * Liveness probe — always returns 200 if the process is running.
 */
health.get('/live', (c) => c.json({
  status: 'alive',
  ts: Date.now(),
  pid: process.pid,
}));

/**
 * Readiness probe — checks that the server can accept traffic.
 * Verifies: file system access, memory within bounds.
 */
health.get('/ready', async (c) => {
  const checks = [];

  // 1. File system check
  try {
    const tmpFile = path.join(process.cwd(), '.sentinel', '.health-check');
    const { promises: fs } = await import('node:fs');
    await fs.mkdir(path.dirname(tmpFile), { recursive: true });
    await fs.writeFile(tmpFile, 'ok', 'utf-8');
    await fs.unlink(tmpFile);
    checks.push({ name: 'filesystem', status: 'ok' });
  } catch (err) {
    checks.push({ name: 'filesystem', status: 'error', message: err.message });
  }

  // 2. Memory check (warn if > 90% of heap used)
  const mem = process.memoryUsage();
  const heapUsedPct = (mem.heapUsed / mem.heapTotal) * 100;
  checks.push({
    name: 'memory',
    status: heapUsedPct > 90 ? 'warning' : 'ok',
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    heapUsedPct: Math.round(heapUsedPct),
  });

  // 3. Event loop lag (basic check)
  const start = performance.now();
  await new Promise(r => setImmediate(r));
  const lag = performance.now() - start;
  checks.push({
    name: 'eventLoop',
    status: lag > 100 ? 'warning' : 'ok',
    lagMs: Math.round(lag * 100) / 100,
  });

  const allOk = checks.every(c => c.status === 'ok');

  return c.json({
    ready: allOk,
    ts: Date.now(),
    checks,
  }, allOk ? 200 : 503);
});

/**
 * Detailed diagnostics — full system report.
 */
health.get('/details', async (c) => {
  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const versions = process.versions;

  // Check AI provider environment variables
  const providers = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY),
    groq: !!process.env.GROQ_API_KEY,
    mistral: !!process.env.MISTRAL_API_KEY,
    deepseek: !!process.env.DEEPSEEK_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
    ollama: !!process.env.OLLAMA_HOST,
  };

  const configuredProviders = Object.entries(providers)
    .filter(([, ok]) => ok)
    .map(([name]) => name);

  // Check critical file paths
  const criticalPaths = {
    nodeModules: existsSync(path.join(process.cwd(), 'node_modules')),
    packageJson: existsSync(path.join(process.cwd(), 'package.json')),
    sentinelConfig: existsSync(path.join(process.cwd(), '.sentinel.json')) ||
                    existsSync(path.join(process.cwd(), '.sentinel.yaml')),
  };

  return c.json({
    status: 'healthy',
    ts: Date.now(),
    pid: process.pid,
    uptime: process.uptime(),
    uptimeHuman: formatUptime(process.uptime()),

    runtime: {
      node: versions.node,
      v8: versions.v8,
      platform: process.platform,
      arch: process.arch,
    },

    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      externalMB: Math.round((mem.external || 0) / 1024 / 1024),
      heapUsedPct: Math.round((mem.heapUsed / mem.heapTotal) * 100),
    },

    cpu: {
      userMicros: cpuUsage.user,
      systemMicros: cpuUsage.system,
    },

    providers: {
      configured: configuredProviders,
      total: configuredProviders.length,
      details: providers,
    },

    paths: criticalPaths,

    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || '3000',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    },
  });
});

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default health;
