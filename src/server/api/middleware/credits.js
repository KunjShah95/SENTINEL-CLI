/**
 * Credit-balance middleware.
 *
 * Mirrors packages/server/src/middleware/require-credits-balance.ts from
 * Nightcode. For dev mode (no Polar configured), it allows requests through
 * but records usage. With a credits meter configured, it returns 402 if the
 * user has no balance.
 */

import { getAvailableCreditsBalance, ingestAiUsage } from '../lib/polar.js';

export function requireCreditsBalance() {
  return async (c, next) => {
    // Dev mode (no Polar configured) — always allow.
    if (!process.env.POLAR_ACCESS_TOKEN || !process.env.POLAR_CREDITS_METER_ID) {
      await next();
      return;
    }

    const userId = c.get('userId');
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    try {
      const balance = await getAvailableCreditsBalance(userId);
      if (balance <= 0) {
        return c.json(
          { error: 'No credits remaining. Run /upgrade to buy more credits.' },
          402
        );
      }
    } catch (e) {
      return c.json({ error: 'Unable to verify credits balance right now.' }, 503);
    }
    await next();
  };
}

/**
 * Re-export for callers that want to bill directly.
 */
export { ingestAiUsage };
