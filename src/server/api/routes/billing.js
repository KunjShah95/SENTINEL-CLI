/**
 * Billing route — Polar checkout + customer portal.
 *
 * Mirrors packages/server/src/routes/billing.ts from Nightcode.
 *
 * The `/billing/success` endpoint is public and returns a friendly
 * confirmation message. The `/billing/checkout` and `/billing/portal`
 * endpoints require auth.
 */

import { Hono } from 'hono';
import { createCheckoutUrl, createCustomerPortalUrl } from '../lib/polar.js';
import { requireAuth } from '../middleware/auth.js';

const billing = new Hono();

billing.post('/checkout', requireAuth(), async (c) => {
  const userId = c.get('userId');
  try {
    const url = await createCheckoutUrl({
      customerExternalId: userId,
      requestUrl: c.req.url,
    });
    return c.json({ url });
  } catch (e) {
    return c.json({ error: e.message || 'Checkout failed' }, 500);
  }
});

billing.post('/portal', requireAuth(), async (c) => {
  const userId = c.get('userId');
  try {
    const url = await createCustomerPortalUrl({
      customerExternalId: userId,
      requestUrl: c.req.url,
    });
    return c.json({ url });
  } catch (e) {
    return c.json({ error: e.message || 'Portal failed' }, 500);
  }
});

billing.get('/success', (c) => {
  return c.text('Done. You can close this tab and return to Sentinel.');
});

export default billing;
