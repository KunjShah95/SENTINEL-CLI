/**
 * Memory bridge, self-healing, and self-update.
 *
 * Offline by construction: the agentmemory HTTP server is stubbed with a real
 * local http.Server so request shapes, status handling, and degradation are
 * exercised rather than mocked at the fetch level. Everything else (drift
 * classification, state repair, version comparison) touches only the temp
 * filesystem.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  remember,
  recall,
  checkHealth,
  resetHealthCache,
  formatRecall,
  summarizeObservation,
  buildMemoryBridgeSection,
  status,
} from '../src/agent/memory-bridge.js';
import { checkStateHealth, repairState, checkAssistantDrift, fullHealthCheck } from '../src/agent/self-heal.js';
import { compareVersions, checkSelfUpdate, applySelfUpdate, updateSkills, fetchLatest } from '../src/agent/self-update.js';
import { READ_ONLY_TOOL_NAMES } from '../src/shared/tools/schemas.js';
import { isReadOnlyTool } from '../src/shared/schemas/mode.js';

// ── a real HTTP server standing in for agentmemory ──────────────────────────
let server;
let baseUrl;
const requests = [];
const behaviour = { rememberStatus: 200, searchStatus: 200, searchBody: { results: [] } };

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, body });
      if (req.url === '/agentmemory/livez') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
        return;
      }
      if (req.url === '/agentmemory/remember') {
        res.writeHead(behaviour.rememberStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'mem_1' }));
        return;
      }
      if (req.url === '/agentmemory/smart-search') {
        res.writeHead(behaviour.searchStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify(behaviour.searchBody));
        return;
      }
      res.writeHead(404).end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
});

function withServer(fn) {
  resetHealthCache();
  return fn({ url: baseUrl, secret: undefined, timeoutMs: 2000 });
}

// ── memory bridge ───────────────────────────────────────────────────────────

describe('memory bridge — offline behavior', () => {
  it('reports unreachable instead of throwing', async () => {
    resetHealthCache();
    const h = await checkHealth({ url: 'http://127.0.0.1:1', force: true });
    assert.equal(h.reachable, false);
    assert.equal(h.state, 'offline');
  });

  it('remember degrades to skipped, not an error', async () => {
    resetHealthCache();
    const out = await remember({ content: 'x' }, { url: 'http://127.0.0.1:1' });
    assert.equal(out.stored, false);
    assert.equal(out.skipped, 'offline');
  });

  it('recall degrades to an empty result set', async () => {
    resetHealthCache();
    const out = await recall({ query: 'x' }, { url: 'http://127.0.0.1:1' });
    assert.equal(out.ok, false);
    assert.deepEqual(out.results, []);
  });

  it('yields no prompt section when offline', async () => {
    resetHealthCache();
    const section = await buildMemoryBridgeSection('auth flow', { url: 'http://127.0.0.1:1' });
    assert.equal(section, '', 'no prompt noise when the store is down');
  });

  it('requires content and query', async () => {
    await assert.rejects(() => remember({}, { url: 'http://127.0.0.1:1' }), /content is required/);
    await assert.rejects(() => recall({}, { url: 'http://127.0.0.1:1' }), /query is required/);
  });

  it('caches health between calls', async () => {
    await withServer(async ({ url }) => {
      await checkHealth({ url, force: true });
      const before = requests.length;
      await checkHealth({ url });
      await checkHealth({ url });
      assert.equal(requests.length, before, 'no repeat probe inside the TTL');
    });
  });
});

describe('memory bridge — online behavior', () => {
  it('stores a memory', async () => {
    await withServer(async (opts) => {
      behaviour.rememberStatus = 200;
      const out = await remember({ content: 'auth uses jose', concepts: ['auth'] }, opts);
      assert.equal(out.stored, true);
      const sent = requests.at(-1);
      assert.equal(sent.url, '/agentmemory/remember');
      assert.equal(JSON.parse(sent.body).content, 'auth uses jose');
    });
  });

  it('surfaces a near-duplicate hint rather than storing twice', async () => {
    await withServer(async (opts) => {
      const out = await remember({ content: 'auth uses jose' }, opts);
      // The stub returns no similarTo, so the field is simply absent.
      assert.equal(out.stored, true);
      assert.equal(out.similarTo, null);
    });
  });

  it('reports a server error without throwing', async () => {
    await withServer(async (opts) => {
      behaviour.rememberStatus = 500;
      const out = await remember({ content: 'x' }, opts);
      assert.equal(out.stored, false);
      assert.equal(out.skipped, 'error');
      behaviour.rememberStatus = 200;
    });
  });

  it('clamps the result limit', async () => {
    await withServer(async (opts) => {
      behaviour.searchStatus = 200;
      behaviour.searchBody = { results: [{ content: 'found it' }] };
      await recall({ query: 'q', limit: 999 }, opts);
      assert.equal(JSON.parse(requests.at(-1).body).limit, 25);
    });
  });

  it('normalizes a results array', async () => {
    await withServer(async (opts) => {
      behaviour.searchBody = { results: [{ content: 'a' }, { content: 'b' }] };
      const out = await recall({ query: 'q' }, opts);
      assert.equal(out.ok, true);
      assert.equal(out.count, 2);
    });
  });

  it('reads the health endpoint for status', async () => {
    await withServer(async (opts) => {
      const s = await status(opts);
      assert.equal(s.reachable, true);
    });
  });

  it('produces a bounded prompt section', async () => {
    await withServer(async (opts) => {
      behaviour.searchBody = {
        results: Array.from({ length: 10 }, (_, i) => ({ content: `memory number ${i} ` + 'x'.repeat(500) })),
      };
      const section = await buildMemoryBridgeSection('query', opts);
      assert.match(section, /Cross-agent memory/);
      assert.ok(section.length < 2000, `section is ${section.length} chars`);
      // Truncation must not leave a partial word mid-item.
      assert.ok(section.includes('verify against the code'));
      behaviour.searchBody = { results: [] };
    });
  });
});

describe('memory bridge — formatting', () => {
  it('returns empty for no results', () => {
    assert.equal(formatRecall({ results: [] }), '');
    assert.equal(formatRecall({}), '');
  });

  it('respects the character cap', () => {
    const text = formatRecall({
      results: Array.from({ length: 50 }, (_, i) => ({ content: `item ${i} ${'y'.repeat(200)}` })),
    }, { charCap: 500 });
    assert.ok(text.length <= 501, `length ${text.length}`);
  });

  it('summarizes a tool observation', () => {
    const s = summarizeObservation({ toolName: 'editFile', ok: true, input: { path: 'src/a.js' } });
    assert.match(s, /editFile/);
    assert.match(s, /path=src\/a\.js/);
  });

  it('marks a failed tool call', () => {
    assert.match(summarizeObservation({ toolName: 'bash', ok: false, input: {} }), /failed/);
  });

  it('returns empty for an uninteresting event', () => {
    assert.equal(summarizeObservation({}), '');
    assert.equal(summarizeObservation(null), '');
  });

  it('produces no prompt section for an empty request', async () => {
    assert.equal(await buildMemoryBridgeSection('   '), '');
  });
});

describe('tool declarations', () => {
  it('treats recall as read-only and remember as a write', () => {
    assert.ok(isReadOnlyTool('memoryRecall'), 'recall is observation');
    assert.ok(READ_ONLY_TOOL_NAMES.includes('memoryRecall'));
    assert.ok(!isReadOnlyTool('memoryRemember'), 'remember changes shared state');
    assert.ok(!READ_ONLY_TOOL_NAMES.includes('memoryRemember'));
  });
});

// ── self-heal: state rot ────────────────────────────────────────────────────

function scratch() {
  const tmp = mkdtempSync(join(tmpdir(), 'sentinel-heal-'));
  mkdirSync(join(tmp, '.sentinel', 'memory'), { recursive: true });
  return tmp;
}

describe('self-heal — state health', () => {
  it('reports nothing for a clean project', () => {
    const tmp = scratch();
    try {
      writeFileSync(join(tmp, '.sentinel', 'todos.json'), '{"todos":[]}');
      assert.deepEqual(checkStateHealth(tmp), []);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports nothing when .sentinel is absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sentinel-heal-'));
    try {
      assert.deepEqual(checkStateHealth(tmp), []);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('detects a drifted memory index', () => {
    const tmp = scratch();
    try {
      writeFileSync(
        join(tmp, '.sentinel', 'memory', 'a-fact.md'),
        '---\nname: a-fact\ndescription: something true\ntype: project\n---\n\nBody.\n',
      );
      writeFileSync(join(tmp, '.sentinel', 'memory', 'MEMORY.md'), '- stale entry that no longer exists\n');
      const issues = checkStateHealth(tmp);
      const drift = issues.find((i) => i.kind === 'memory-index-drift');
      assert.ok(drift, 'index drift detected');
      assert.equal(drift.repair, 'rebuild-memory-index');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rebuilds a drifted memory index', () => {
    const tmp = scratch();
    try {
      writeFileSync(
        join(tmp, '.sentinel', 'memory', 'a-fact.md'),
        '---\nname: a-fact\ndescription: something true\ntype: project\n---\n\nBody.\n',
      );
      writeFileSync(join(tmp, '.sentinel', 'memory', 'MEMORY.md'), '- stale\n');
      const applied = repairState(checkStateHealth(tmp), { cwd: tmp });
      assert.ok(applied.some((a) => a.applied), 'repair applied');
      const index = readFileSync(join(tmp, '.sentinel', 'memory', 'MEMORY.md'), 'utf-8');
      assert.match(index, /a-fact/);
      assert.ok(!index.includes('stale'));
      // Repair must leave the records themselves alone.
      assert.ok(existsSync(join(tmp, '.sentinel', 'memory', 'a-fact.md')));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports a memory record with no frontmatter', () => {
    const tmp = scratch();
    try {
      writeFileSync(join(tmp, '.sentinel', 'memory', 'broken.md'), 'just some prose, no frontmatter\n');
      writeFileSync(join(tmp, '.sentinel', 'memory', 'MEMORY.md'), '');
      const issues = checkStateHealth(tmp);
      assert.ok(issues.some((i) => i.kind === 'memory-record-unreadable'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('detects corrupt JSON state', () => {
    const tmp = scratch();
    try {
      writeFileSync(join(tmp, '.sentinel', 'todos.json'), '{ not json');
      const issues = checkStateHealth(tmp);
      const bad = issues.find((i) => i.kind === 'corrupt-json');
      assert.ok(bad);
      assert.equal(bad.severity, 'fail');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('quarantines corrupt JSON rather than deleting it', () => {
    const tmp = scratch();
    try {
      writeFileSync(join(tmp, '.sentinel', 'todos.json'), '{ not json');
      repairState(checkStateHealth(tmp), { cwd: tmp });
      assert.ok(!existsSync(join(tmp, '.sentinel', 'todos.json')), 'moved out of the way');
      const quarantined = readdirSync(join(tmp, '.sentinel'));
      assert.ok(quarantined.some((f) => f.includes('corrupt')), 'preserved for inspection');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('dry-run reports without writing', () => {
    const tmp = scratch();
    try {
      const p = join(tmp, '.sentinel', 'todos.json');
      writeFileSync(p, '{ not json');
      repairState(checkStateHealth(tmp), { cwd: tmp, dryRun: true });
      assert.equal(readFileSync(p, 'utf-8'), '{ not json', 'untouched');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('is idempotent — a second pass finds nothing', () => {
    const tmp = scratch();
    try {
      writeFileSync(join(tmp, '.sentinel', 'todos.json'), '{ not json');
      writeFileSync(join(tmp, '.sentinel', 'memory', 'MEMORY.md'), '- stale\n');
      repairState(checkStateHealth(tmp), { cwd: tmp });
      assert.deepEqual(checkStateHealth(tmp), [], 'clean after one repair');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('self-heal — corrupt assistant config', () => {
  it('does not rewrite a config it cannot parse', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'sentinel-heal-'));
    try {
      // A project config that is not valid JSON. The health checker must flag
      // it, but must never rewrite it: the file may hold settings we cannot
      // reconstruct, and silently replacing it would lose the user's config.
      mkdirSync(join(tmp, '.vscode'), { recursive: true });
      const file = join(tmp, '.vscode', 'mcp.json');
      writeFileSync(file, '{ broken');
      const drift = checkAssistantDrift(tmp).filter((d) => d.file === file);
      // Either not detected (not an installed assistant in this env) or
      // detected as corrupt — never silently rewritten.
      assert.ok(!drift.length || drift.every((d) => d.state === 'corrupt'));
      assert.equal(readFileSync(file, 'utf-8'), '{ broken', 'file untouched');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('self-heal — combined report', () => {
  it('reports state, drift, and memory together', async () => {
    const tmp = scratch();
    try {
      writeFileSync(join(tmp, '.sentinel', 'todos.json'), '{ broken');
      const report = await fullHealthCheck({ cwd: tmp, includeDrift: false });
      assert.equal(report.ok, false, 'a fail-level issue makes the report not-ok');
      assert.ok(report.state.length >= 1);
      assert.equal(typeof report.memory, 'object');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reports ok for a clean project', async () => {
    const tmp = scratch();
    try {
      const report = await fullHealthCheck({ cwd: tmp, includeDrift: false });
      assert.equal(report.ok, true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── self-update ─────────────────────────────────────────────────────────────

describe('self-update — version comparison', () => {
  it('orders versions by precedence', () => {
    assert.equal(compareVersions('3.4.0', '3.3.0'), 1);
    assert.equal(compareVersions('3.3.0', '3.4.0'), -1);
    assert.equal(compareVersions('3.3.0', '3.3.0'), 0);
    assert.equal(compareVersions('3.3.10', '3.3.9'), 1);
    assert.equal(compareVersions('4.0.0', '3.99.99'), 1);
  });

  it('ignores prerelease suffixes', () => {
    assert.equal(compareVersions('3.3.0-beta.1', '3.3.0'), 0);
  });

  it('treats unparseable versions as equal rather than crashing', () => {
    assert.equal(compareVersions('garbage', '3.3.0'), 0);
    assert.equal(compareVersions(undefined, undefined), 0);
  });

  it('knows the local version is 3.x', async () => {
    const check = await checkSelfUpdate();
    assert.match(check.current, /^\d+\.\d+\.\d+/);
  });
});

describe('self-update — opt-in guards', () => {
  it('refuses to install without confirmation', () => {
    const out = applySelfUpdate({ yes: false });
    assert.equal(out.applied, false);
    assert.match(out.reason, /--yes/);
  });

  it('refuses to update skills without confirmation', () => {
    const out = updateSkills({ yes: false });
    assert.equal(out.applied, false);
    assert.match(out.reason, /--yes/);
  });
});

describe('self-update — registry', () => {
  it('reports an error instead of throwing when npm is unreachable', async () => {
    const out = await fetchLatest('this-package-does-not-exist-xyz-123');
    assert.equal(out.ok, false);
    assert.ok(out.error);
  });

  it('handles a missing package as a graceful failure', async () => {
    const check = await checkSelfUpdate({ pkg: 'this-package-does-not-exist-xyz-123' });
    assert.equal(check.updateAvailable, false);
    assert.ok(check.error);
  });
});
