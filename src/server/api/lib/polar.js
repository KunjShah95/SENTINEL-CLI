/**
 * Polar billing adapter.
 *
 * Wraps @polar-sh/sdk for production parity with Nightcode. Falls back to
 * a no-op implementation when POLAR_ACCESS_TOKEN is not configured so the
 * server boots in dev without a Polar account.
 *
 * The dev fallback records usage to the local DB (via recordCredit in
 * database/sessions.js) and returns a fixed balance from
 * SENTINEL_DEV_CREDITS (default 1000) so the credit-gate middleware
 * always passes.
 */

import { getUsedCredits } from '../../database/index.js';
import { recordCredit } from '../../database/sessions.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let polarClient = null;

function getClient() {
  if (polarClient !== null) return polarClient;
  if (!process.env.POLAR_ACCESS_TOKEN) {
    polarClient = false;
    return false;
  }
  try {
    // eslint-disable-next-line global-require
    const { Polar } = require('@polar-sh/sdk');
    polarClient = new Polar({
      accessToken: process.env.POLAR_ACCESS_TOKEN,
      server: process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox',
    });
    return polarClient;
  } catch {
    polarClient = false;
    return false;
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} environment variable is required`);
  return v;
}

export async function createCheckoutUrl({ customerExternalId, requestUrl }) {
  const client = getClient();
  if (!client) {
    return `${requestUrl}/billing/success?dev=1`;
  }
  const productId = requireEnv('POLAR_PRODUCT_ID');
  const result = await client.checkouts.create({
    products: [productId],
    successUrl: new URL('/billing/success', requestUrl).toString(),
    externalCustomerId: customerExternalId,
    metadata: { source: 'sentinel-cli' },
  });
  return result.url;
}

export async function createCustomerPortalUrl({ externalCustomerId, requestUrl }) {
  const client = getClient();
  if (!client) {
    return `${requestUrl}/billing/success?dev=1`;
  }
  const result = await client.customerSessions.create({
    externalCustomerId,
    returnUrl: new URL('/billing/success', requestUrl).toString(),
  });
  return result.customerPortalUrl;
}

export async function getAvailableCreditsBalance(customerExternalId) {
  const client = getClient();
  if (!client) {
    // Dev mode: fixed allocation minus usage.
    const allocation = Number(process.env.SENTINEL_DEV_CREDITS || 1000);
    const used = await getUsedCredits({ userId: customerExternalId });
    return Math.max(0, allocation - used);
  }
  const meterId = requireEnv('POLAR_CREDITS_METER_ID');
  try {
    const state = await client.customers.getStateExternal({ externalId: customerExternalId });
    const meters = state.activeMeters || [];
    const matching = meters.filter((m) => m.meterId === meterId);
    if (matching.length > 1) {
      throw new Error('Expected exactly one matching Polar credits meter');
    }
    return matching[0]?.balance ?? 0;
  } catch (e) {
    if (e?.statusCode === 404) return 0;
    throw e;
  }
}

export async function ingestAiUsage({ externalCustomerId, eventId, credits, provider, model, sessionId }) {
  if (credits <= 0) return;
  const client = getClient();
  if (!client) {
    // Dev mode: record in local DB.
    await recordCredit({
      userId: externalCustomerId,
      sessionId,
      credits,
      provider,
      model,
    });
    return;
  }
  await client.events.ingest({
    events: [
      {
        name: 'sentinel_usage',
        externalId: eventId,
        externalCustomerId,
        metadata: { credits },
      },
    ],
  });
}

export function isPolarConfigured() {
  return Boolean(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_CREDITS_METER_ID);
}
