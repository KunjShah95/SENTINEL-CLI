/**
 * Browser tools â€” the effect descriptor, the session gate, and the audit gap.
 *
 * These tests are written around the claims the design makes, which are all
 * refusals. Every one of them says the harness declines to act when it cannot
 * tell what it is doing, and each refusal is provoked by removing exactly one
 * fact. If a future change makes one of these pass, a safety property is gone.
 *
 * No browser is launched anywhere in this file. The descriptor, the session
 * accounting, and the auditor are all pure â€” which is the property `onboard.js`
 * and `audit.js` already hold, and the reason browser *decisions* can be tested
 * even though a browser cannot.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  describeEffect, classifyEffect, severity, sameEffect, explainEffect, REVERSIBILITY,
} from '../src/agent/web/effect.js';
import {
  createSession, checkAct, recordAction, revokeSession, isExpired,
  DEFAULT_IRREVERSIBLE_CEILING,
} from '../src/agent/web/session.js';
import { summarizeCall } from '../src/agent/audit-trail.js';
import { auditRun, GAP_CLASSES } from '../src/agent/audit.js';
import { taskPermission, PERMISSIONS } from '../src/agent/task.js';
import { isWebTool, isWebCommitTool, effectCategory, WRITE_TOOLS } from '../src/shared/tool-taxonomy.js';
import { isReadOnlyTool, isToolAllowedInMode, Mode } from '../src/shared/schemas/mode.js';
import { getToolPolicy } from '../src/shared/tools/permissions.js';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'sentinel-web-'));
  process.env.SENTINEL_AUDIT_DIR = join(dir, 'audit');
  mkdirSync(process.env.SENTINEL_AUDIT_DIR, { recursive: true });
  return {
    dir,
    cleanup() {
      delete process.env.SENTINEL_AUDIT_DIR;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const validEffect = (over = {}) => ({
  action: 'click button "Delete customer"',
  origin: 'https://app.example.com/admin/customers',
  resourceId: '/api/customers/4127',
  reversibility: REVERSIBILITY.REVERSIBLE,
  ...over,
});

// â”€â”€ The descriptor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test('describeEffect accepts a complete reversible descriptor', () => {
  const r = describeEffect(validEffect());
  assert.equal(r.ok, true);
  assert.equal(r.effect.host, 'app.example.com');
});

test('describeEffect refuses a missing reversibility class', () => {
  const noClass = { ...validEffect(), reversibility: undefined };
  const r = describeEffect(noClass);
  assert.equal(r.ok, false);
  assert.match(r.error, /reversibility is required/);
});

test('describeEffect treats an undeclared class as unknown, not as mild', () => {
  // The load-bearing refusal: silence must not read as "reversible".
  const r = describeEffect(validEffect({ reversibility: 'probably fine' }));
  assert.equal(r.ok, false);
  assert.equal(classifyEffect(r.effect ?? null), REVERSIBILITY.UNKNOWN);
});

test('unknown outranks external in severity', () => {
  assert.ok(
    severity(null) > severity({ reversibility: REVERSIBILITY.EXTERNAL }),
    'an ungradeable effect must be worse than the worst gradeable one'
  );
});

test('external requires a recipient â€” the question a human needs answered', () => {
  const r = describeEffect(validEffect({
    reversibility: REVERSIBILITY.EXTERNAL,
    resourceId: '/invoices/1/send',
  }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['recipient']);

  const ok = describeEffect(validEffect({
    reversibility: REVERSIBILITY.EXTERNAL,
    recipient: 'customer@example.com',
  }));
  assert.equal(ok.ok, true);
});

test('compensable requires the compensating action', () => {
  const r = describeEffect(validEffect({ reversibility: REVERSIBILITY.COMPENSABLE }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['compensatingAction']);
});

test('a relative origin is refused rather than guessed at', () => {
  const r = describeEffect(validEffect({ origin: '/admin/customers' }));
  assert.equal(r.ok, false);
  assert.match(r.error, /absolute URL/);
});

test('sameEffect treats a newly-added field as a change, not a lenient pass', () => {
  // This is what makes probe/declaration comparison meaningful: silence in the
  // grant is exactly what a broadened dispatch would look like.
  const granted = validEffect();
  const dispatched = { ...validEffect(), recipient: 'someone@example.com' };
  assert.equal(sameEffect(granted, dispatched), false);
  assert.equal(sameEffect(granted, { ...granted }), true);
});

test('explainEffect names the recipient for an external effect', () => {
  const r = describeEffect(validEffect({
    reversibility: REVERSIBILITY.EXTERNAL,
    recipient: 'customer@example.com',
  }));
  assert.match(explainEffect(r.effect), /customer@example\.com/);
  assert.match(explainEffect(r.effect), /cannot un-see/);
});

// â”€â”€ The session gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test('a fresh session refuses an absorbing effect at the default ceiling', () => {
  const s = createSession({ origins: ['https://app.example.com'] });
  const e = describeEffect(validEffect({ reversibility: REVERSIBILITY.ABSORBING })).effect;
  const c = checkAct(s, e);
  assert.equal(c.ok, false);
  assert.match(c.reason, /irreversible ceiling reached/);
});

test('a fresh session allows a reversible effect on an allowlisted origin', () => {
  const s = createSession({ origins: ['https://app.example.com'] });
  const c = checkAct(s, describeEffect(validEffect()).effect);
  assert.equal(c.ok, true);
  assert.equal(c.irreversible, false);
});

test('an origin outside the allowlist is refused', () => {
  const s = createSession({ origins: ['https://app.example.com'] });
  const c = checkAct(s, describeEffect(validEffect({ origin: 'https://evil.test/x' })).effect);
  assert.equal(c.ok, false);
  assert.match(c.reason, /not in this session's allowlist/);
});

test('an expired lease refuses rather than acting one more time', () => {
  const s = createSession({ origins: ['https://app.example.com'], leaseMs: 1000 });
  const later = Date.now() + 5000;
  assert.equal(isExpired(s, later), true);
  const c = checkAct(s, describeEffect(validEffect()).effect, later);
  assert.equal(c.ok, false);
  assert.match(c.reason, /lease expired/);
});

test('a revoked session refuses', () => {
  const s = createSession({ origins: ['https://app.example.com'] });
  revokeSession(s);
  assert.equal(checkAct(s, describeEffect(validEffect()).effect).ok, false);
});

test('only irreversible effects count against the ceiling', () => {
  // A budget that a click can exhaust is a budget that means nothing.
  const s = createSession({
    origins: ['https://app.example.com'],
    irreversibleCeiling: 1,
  });
  for (let i = 0; i < 5; i++) recordAction(s, { reversibility: REVERSIBILITY.REVERSIBLE });
  assert.equal(s.irreversibleSpent, 0);

  recordAction(s, { reversibility: REVERSIBILITY.ABSORBING });
  assert.equal(s.irreversibleSpent, 1);
  const c = checkAct(s, { host: 'app.example.com', reversibility: REVERSIBILITY.ABSORBING });
  assert.equal(c.ok, false, 'the ceiling is now spent');
});

test('the default irreversible ceiling is zero', () => {
  assert.equal(DEFAULT_IRREVERSIBLE_CEILING, 0);
  const s = createSession({ origins: ['https://app.example.com'] });
  assert.equal(s.irreversibleCeiling, 0);
});

test('origins are normalized at creation, not compared raw', () => {
  const s = createSession({ origins: ['https://Example.com/some/path'] });
  assert.deepEqual(s.origins, ['example.com']);
  assert.equal(
    checkAct(s, describeEffect(validEffect({ origin: 'https://example.com/x' })).effect).ok,
    true
  );
});

// â”€â”€ The audit gap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test('summarizeCall maps reversibility onto the existing intent ladder', () => {
  const reversible = summarizeCall('webAct', { effect: validEffect() });
  assert.equal(reversible.intent, 'read_only');

  const absorbing = summarizeCall('webAct', {
    effect: validEffect({ reversibility: REVERSIBILITY.ABSORBING }),
  });
  assert.equal(absorbing.intent, 'state');
  assert.equal(absorbing.destructive, true, 'absorbing is destructive in the checkpoint sense');
});

test('a reversible grant followed by an absorbing dispatch is a Scope finding', () => {
  const s = scratch();
  try {
    const pair = {
      parentTaskId: null,
      ts: new Date().toISOString(),
      v: '1',
      runId: 'r1',
      toolCallId: 'c1',
      tool: 'webAct',
      agent: 'lead',
      rung: 'teammate',
      decision: 'allow',
      mode: 'BUILD',
      workdir: null,
      paths: [],
    };
    const file = join(process.env.SENTINEL_AUDIT_DIR, 'r1.jsonl');
    writeFileSync(file, [
      JSON.stringify({
        ...pair, stage: 'grant',
        input: validEffect(),
        shape: 'web click',
        intent: 'read_only',
        destructive: false,
        effect: validEffect(),
      }),
      JSON.stringify({
        ...pair, stage: 'dispatch',
        input: validEffect({ reversibility: REVERSIBILITY.ABSORBING }),
        shape: 'web click',
        intent: 'state',
        destructive: true,
        effect: validEffect({ reversibility: REVERSIBILITY.ABSORBING }),
      }),
    ].join('\n') + '\n');

    const r = auditRun('r1');
    assert.ok(r.gaps.length > 0, 'an escalation must be reported');
    const classes = r.gaps.map((g) => g.class);
    assert.ok(classes.includes('Scope') || classes.includes('Effect'), `got ${classes.join(',')}`);
  } finally {
    s.cleanup();
  }
});

test('a descriptor that changed between grant and dispatch is an Effect finding', () => {
  const s = scratch();
  try {
    const pair = {
      parentTaskId: null, ts: new Date().toISOString(), v: '1', runId: 'r2',
      toolCallId: 'c1', tool: 'webAct', agent: 'lead', rung: 'teammate',
      decision: 'allow', mode: 'BUILD', workdir: null,
      shape: 'web click', intent: 'read_only', destructive: false, input: {},
    };
    const file = join(process.env.SENTINEL_AUDIT_DIR, 'r2.jsonl');
    writeFileSync(file, [
      JSON.stringify({
        ...pair, stage: 'grant',
        effect: validEffect({ resourceId: '/api/orders/1' }),
      }),
      JSON.stringify({
        ...pair, stage: 'dispatch',
        // Different resource, same shape and same intent â€” invisible to the
        // shape and argument comparisons, which is why this class exists.
        effect: validEffect({ resourceId: '/api/customers/999' }),
      }),
    ].join('\n') + '\n');

    const r = auditRun('r2');
    const e = r.gaps.filter((g) => g.class === 'Effect');
    assert.equal(e.length, 1);
    assert.deepEqual(e[0].changedFields, ['resourceId']);
  } finally {
    s.cleanup();
  }
});

test('Effect is a declared gap class', () => {
  assert.ok(GAP_CLASSES.includes('Effect'));
});

// â”€â”€ The rung ladder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test('a readonly subagent may read and probe but never act', async () => {
  const perm = taskPermission(PERMISSIONS.READONLY);
  assert.equal(await perm('webRead', '1', { sessionId: 's' }), 'allow');
  assert.equal(await perm('webProbe', '1', { sessionId: 's', selector: '#x' }), 'allow');
  assert.equal(await perm('webAct', '1', { effect: validEffect() }), 'deny');
});

test('a readonly subagent cannot act even with a reversible descriptor', async () => {
  const perm = taskPermission(PERMISSIONS.READONLY);
  assert.equal(
    await perm('webAct', '1', { effect: validEffect({ reversibility: REVERSIBILITY.REVERSIBLE }) }),
    'deny'
  );
});

test('an absorbing effect is denied at every rung below inherit', async () => {
  const perm = taskPermission(PERMISSIONS.TEAMMATE);
  assert.equal(
    await perm('webAct', '1', { effect: validEffect({ reversibility: REVERSIBILITY.ABSORBING }) }),
    'deny',
    'a teammate works in its worktree; there is no worktree for a sent message'
  );
});

test('webAct without a descriptor is denied rather than defaulted', async () => {
  const perm = taskPermission(PERMISSIONS.TEAMMATE);
  assert.equal(await perm('webAct', '1', {}), 'deny');
});

// â”€â”€ Taxonomy and modes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

test('observation is read-only and commitment is not', () => {
  assert.equal(isReadOnlyTool('webRead'), true);
  assert.equal(isReadOnlyTool('webProbe'), true);
  assert.equal(isReadOnlyTool('webAct'), false);
});

test('probe survives PLAN mode; act does not', () => {
  // Probing is the last safe moment before a commitment, so it cannot sit
  // behind the commitment.
  assert.equal(isToolAllowedInMode('webProbe', Mode.PLAN), true);
  assert.equal(isToolAllowedInMode('webAct', Mode.PLAN), false);
  assert.equal(isToolAllowedInMode('webAct', Mode.BUILD), true);
});

test('webAct is graded as a write, not as network', () => {
  // Grading it 'network' would let it ride the `network: allow` default past
  // both the blast-radius gate and the mode check.
  assert.equal(getToolPolicy('webAct'), 'allow'); // category default for 'write'
  assert.equal(effectCategory('webAct'), 'webCommit');
  assert.equal(effectCategory('webRead'), 'readOnly');
});

test('web tools are classified, and commits are excluded from WRITE_TOOLS', () => {
  assert.equal(isWebTool('webAct'), true);
  assert.equal(isWebCommitTool('webAct'), true);
  assert.equal(isWebCommitTool('webProbe'), false);
  // A browser commit must not invalidate a test receipt behind it.
  assert.equal(WRITE_TOOLS.includes('webAct'), false);
});
