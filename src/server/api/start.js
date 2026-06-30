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
import { getLogger } from '../../utils/structuredLogger.js';
import { app } from './app.js';
import { refreshModels } from '../../shared/models/index.js';

// Wire global error handlers before anything else
setupGlobalErrorHandlers();

const PORT = Number(process.env.PORT || 3000);
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const isBun = typeof Bun !== 'undefined';

  let serverHandle = null;

  const log = getLogger().child({ service: 'sentinel-api' });

  if (isBun) {
    log.info(`listening on http://localhost:${PORT} (bun)`);
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
      log.error('No runtime detected. Install Bun or run `npm i @hono/node-server`.', { err: e });
      process.exit(1);
    }
    log.info(`listening on http://localhost:${PORT} (node)`);
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
    log.info(`${signal} received, shutting down gracefully...`);

    const drainTimer = setTimeout(() => {
      log.error('shutdown timeout reached, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    drainTimer.unref?.();

    try {
      if (serverHandle && typeof serverHandle.close === 'function') {
        await serverHandle.close();
      } else if (serverHandle && typeof serverHandle.stop === 'function') {
        await serverHandle.stop();
      }
      log.info('server closed');
    } catch (err) {
      log.error('error during shutdown', { err });
    }

    clearTimeout(drainTimer);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  const log = getLogger().child({ service: 'sentinel-api' });
  log.error('fatal startup error', { err: e });
  process.exit(1);
});
