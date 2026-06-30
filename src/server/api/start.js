/**
 * Standalone server bootstrap.
 *
 * Runs the Hono app on Node via @hono/node-server (preferred) or on
 * Bun if available. Listens on PORT (default 3000) and applies a long
 * idleTimeout so LLM tool-call streams don't get killed mid-flight.
 *
 * Production features:
 * - Global error handlers wired before any async work
 * - Graceful shutdown on SIGTERM/SIGINT with drain timeout
 *
 * Mirrors packages/server/src/index.ts from Nightcode.
 */

import { setupGlobalErrorHandlers } from '../../utils/errorHandler.js';
import { app } from './app.js';
import { refreshModels } from '../../shared/models/index.js';

// Wire global error handlers before anything else
setupGlobalErrorHandlers();

const PORT = Number(process.env.PORT || 3000);
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const isBun = typeof Bun !== 'undefined';

  let serverHandle = null;

  if (isBun) {
    console.log(`[sentinel-api] listening on http://localhost:${PORT} (bun)`);
    serverHandle = Bun.serve({
      port: PORT,
      fetch: app.fetch,
      idleTimeout: 255,
    });
  } else {
    let serve;
    try {
      ({ serve } = await import('@hono/node-server'));
    } catch (e) {
      console.error(
        '[sentinel-api] No runtime detected. Install Bun (https://bun.sh) or run `npm i @hono/node-server`.'
      );
      process.exit(1);
    }
    console.log(`[sentinel-api] listening on http://localhost:${PORT} (node)`);
    serverHandle = serve({
      port: PORT,
      fetch: app.fetch,
      idleTimeout: 255_000,
    });
  }

  // Discover latest models from provider APIs (non-blocking)
  refreshModels().catch(() => {});

  // ── Graceful shutdown ──────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[sentinel-api] ${signal} received, shutting down gracefully...`);

    const drainTimer = setTimeout(() => {
      console.error('[sentinel-api] shutdown timeout reached, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    drainTimer.unref?.();

    try {
      if (serverHandle && typeof serverHandle.close === 'function') {
        await serverHandle.close();
      } else if (serverHandle && typeof serverHandle.stop === 'function') {
        await serverHandle.stop();
      }
      console.log('[sentinel-api] server closed');
    } catch (err) {
      console.error('[sentinel-api] error during shutdown:', err.message);
    }

    clearTimeout(drainTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[sentinel-api] fatal:', e);
  process.exit(1);
});
