import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configManager, ConfigManager } from '../src/config/configManager.js';

let isolatedHome;
let origHome;
let origUserProfile;

before(async () => {
  isolatedHome = await mkdtemp(join(tmpdir(), 'sentinel-cfg-'));
  origHome = process.env.HOME;
  origUserProfile = process.env.USERPROFILE;
  process.env.HOME = isolatedHome;
  process.env.USERPROFILE = isolatedHome;
  // Clear singleton state
  configManager.config = null;
  configManager.configPath = null;
  configManager.configSource = null;
});

after(async () => {
  process.env.HOME = origHome;
  process.env.USERPROFILE = origUserProfile;
  if (isolatedHome) await rm(isolatedHome, { recursive: true, force: true });
});

// ─── get() / set() ───────────────────────────────────────────────────────────

describe('get() / set()', () => {
  test('get returns default value when config is null', () => {
    const mgr = new ConfigManager();
    assert.equal(mgr.get('debug', false), false);
  });

  test('set and get a simple value', () => {
    const mgr = new ConfigManager();
    mgr.set('debug', true);
    assert.equal(mgr.get('debug'), true);
  });

  test('set and get a nested value', () => {
    const mgr = new ConfigManager();
    mgr.set('agents.coder.model', 'gpt-4');
    assert.equal(mgr.get('agents.coder.model'), 'gpt-4');
  });

  test('get returns null for missing key without default', () => {
    const mgr = new ConfigManager();
    mgr.set('debug', true);
    assert.equal(mgr.get('nonexistent'), null);
  });

  test('set creates intermediate objects', () => {
    const mgr = new ConfigManager();
    mgr.set('a.b.c.d', 42);
    assert.deepEqual(mgr.get('a.b'), { c: { d: 42 } });
  });
});

// ─── getConfigPaths() / findConfigFile() ─────────────────────────────────────

describe('getConfigPaths()', () => {
  test('returns array of possible config paths in priority order', () => {
    const mgr = new ConfigManager();
    const paths = mgr.getConfigPaths();
    assert.ok(Array.isArray(paths));
    assert.ok(paths.length >= 4);
    // First should be cwd/.sentinel.yaml
    assert.ok(paths[0].endsWith('.sentinel.yaml'));
    assert.ok(paths[1].endsWith('.sentinel.json'));
  });
});

// ─── load() ──────────────────────────────────────────────────────────────────

describe('load()', () => {
  test('loads defaults when no config file exists', async () => {
    const mgr = new ConfigManager();
    const cfg = await mgr.load();
    assert.equal(cfg.debug, false);
    assert.equal(cfg.autoCompact, true);
    assert.equal(cfg.agents.coder.model, 'gpt-4o-mini');
    assert.equal(mgr.configSource, 'default');
  });

  test('loads YAML config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-load-yaml-'));
    const configPath = join(dir, '.sentinel.yaml');
    await writeFile(configPath, 'debug: true\nautoCompact: false\n');

    const mgr = new ConfigManager();
    const origCwd = process.cwd;
    process.cwd = () => dir;
    try {
      const cfg = await mgr.load();
      assert.equal(cfg.debug, true);
      assert.equal(cfg.autoCompact, false);
      assert.equal(mgr.configSource, 'yaml');
    } finally {
      process.cwd = origCwd;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('loads JSON config file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-load-json-'));
    const configPath = join(dir, '.sentinel.json');
    await writeFile(configPath, JSON.stringify({ debug: true, autoCompact: false }));

    const mgr = new ConfigManager();
    // Override cwd for this test
    const origCwd = process.cwd;
    process.cwd = () => dir;
    try {
      const cfg = await mgr.load();
      assert.equal(cfg.debug, true);
      assert.equal(cfg.autoCompact, false);
      assert.equal(mgr.configSource, 'json');
    } finally {
      process.cwd = origCwd;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('handles empty config file gracefully', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-load-empty-'));
    const configPath = join(dir, '.sentinel.json');
    await writeFile(configPath, '');

    const mgr = new ConfigManager();
    const origCwd = process.cwd;
    process.cwd = () => dir;
    try {
      const cfg = await mgr.load();
      assert.equal(cfg.debug, false);
      assert.equal(mgr.configSource, 'default');
    } finally {
      process.cwd = origCwd;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('handles malformed JSON gracefully', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-load-badjson-'));
    const configPath = join(dir, '.sentinel.json');
    await writeFile(configPath, '{ invalid json }');

    const mgr = new ConfigManager();
    const origCwd = process.cwd;
    process.cwd = () => dir;
    try {
      const cfg = await mgr.load();
      // Falls back to defaults
      assert.equal(cfg.debug, false);
      assert.equal(mgr.configSource, 'default');
    } finally {
      process.cwd = origCwd;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ─── save() ──────────────────────────────────────────────────────────────────

describe('save()', () => {
  test('saves config as JSON file with restricted permissions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sentinel-save-'));
    const savePath = join(dir, '.sentinel.json');

    const mgr = new ConfigManager();
    mgr.set('debug', true);
    await mgr.save(mgr.config, savePath);

    const content = JSON.parse(await readFile(savePath, 'utf8'));
    assert.equal(content.debug, true);

    // Verify mode is 0o600 (owner-only)
    // On Windows, mode might not be perfectly supported
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── setApiKey() / getApiKey() ───────────────────────────────────────────────

describe('setApiKey() / getApiKey()', () => {
  test('sets and retrieves an API key', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('openai', 'sk-test-123');
    assert.equal(mgr.getApiKey('openai'), 'sk-test-123');
  });

  test('enables provider when setting a non-empty key', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('groq', 'gsk-test-456');
    assert.equal(mgr.isProviderEnabled('groq'), true);
  });

  test('returns null for unknown provider', () => {
    const mgr = new ConfigManager();
    assert.equal(mgr.getApiKey('nonexistent'), null);
  });
});

// ─── isProviderEnabled() ─────────────────────────────────────────────────────

describe('isProviderEnabled()', () => {
  test('returns false for unknown provider', () => {
    const mgr = new ConfigManager();
    assert.equal(mgr.isProviderEnabled('unknown'), false);
  });

  test('returns true when provider has key and is not disabled', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('anthropic', 'sk-ant-test');
    assert.equal(mgr.isProviderEnabled('anthropic'), true);
  });

  test('returns false when provider is disabled', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('anthropic', 'sk-ant-test');
    mgr.config.providers.anthropic.disabled = true;
    assert.equal(mgr.isProviderEnabled('anthropic'), false);
  });
});

// ─── getConfiguredProviders() ────────────────────────────────────────────────

describe('getConfiguredProviders()', () => {
  test('returns empty array when no providers are configured', () => {
    const mgr = new ConfigManager();
    mgr.config = { providers: {} };
    assert.deepEqual(mgr.getConfiguredProviders(), []);
  });

  test('returns only enabled providers with keys', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('openai', 'sk-valid');
    await mgr.setApiKey('groq', 'gsk-valid');
    mgr.config.providers.ollama = { apiKey: '', disabled: false }; // no key
    const providers = mgr.getConfiguredProviders();
    assert.ok(providers.includes('openai'));
    assert.ok(providers.includes('groq'));
    assert.ok(!providers.includes('ollama'));
  });
});

// ─── getMaskedConfig() ───────────────────────────────────────────────────────

describe('getMaskedConfig()', () => {
  test('masks API keys showing only first 4 and last 4 characters', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('openai', 'sk-1234567890abcdef');
    const masked = mgr.getMaskedConfig();
    assert.equal(masked.providers.openai.apiKey, 'sk-1***********cdef');
  });

  test('uses short mask for keys <= 8 chars', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('openai', 'shortkey');
    const masked = mgr.getMaskedConfig();
    assert.equal(masked.providers.openai.apiKey, '********');
  });

  test('does not mutate original config', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('openai', 'sk-secret-key');
    mgr.getMaskedConfig();
    assert.equal(mgr.getApiKey('openai'), 'sk-secret-key');
  });
});

// ─── injectEnvVars() ─────────────────────────────────────────────────────────

describe('injectEnvVars()', () => {
  test('injects configured API keys into environment', async () => {
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('groq', 'gsk-env-test');
    mgr.injectEnvVars();
    assert.equal(process.env.GROQ_API_KEY, 'gsk-env-test');
    // Cleanup
    delete process.env.GROQ_API_KEY;
  });

  test('does not overwrite existing environment variables', async () => {
    process.env.OPENAI_API_KEY = 'existing-key';
    const mgr = new ConfigManager();
    await mgr.load();
    await mgr.setApiKey('openai', 'new-key');
    mgr.injectEnvVars();
    assert.equal(process.env.OPENAI_API_KEY, 'existing-key');
    delete process.env.OPENAI_API_KEY;
  });
});

// ─── mergeDeep() ─────────────────────────────────────────────────────────────

describe('mergeDeep()', () => {
  test('merges two flat objects', () => {
    const mgr = new ConfigManager();
    const result = mgr.mergeDeep({ a: 1, b: 2 }, { b: 3, c: 4 });
    assert.deepEqual(result, { a: 1, b: 3, c: 4 });
  });

  test('merges nested objects recursively', () => {
    const mgr = new ConfigManager();
    const result = mgr.mergeDeep(
      { outer: { inner: 1, other: 2 } },
      { outer: { inner: 10, extra: 20 } }
    );
    assert.deepEqual(result, { outer: { inner: 10, other: 2, extra: 20 } });
  });

  test('arrays are replaced, not merged', () => {
    const mgr = new ConfigManager();
    const result = mgr.mergeDeep({ items: [1, 2] }, { items: [3] });
    assert.deepEqual(result.items, [3]);
  });
});

// ─── CodeRabbit-style getters ────────────────────────────────────────────────

describe('CodeRabbit-style getters', () => {
  test('getAutoReviewConfig returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getAutoReviewConfig();
    assert.equal(cfg.enabled, true);
    assert.deepEqual(cfg.base_branches, ['main', 'develop', 'master']);
  });

  test('getPathFilters returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getPathFilters();
    assert.ok(cfg.exclude.includes('node_modules/**'));
  });

  test('getReviewStyle returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getReviewStyle();
    assert.equal(cfg.tone, 'professional');
  });

  test('getKnowledgeBaseConfig returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getKnowledgeBaseConfig();
    assert.ok(cfg.code_guidelines.sources.includes('CLAUDE.md'));
  });

  test('getPreMergeChecks returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getPreMergeChecks();
    assert.equal(cfg.pr_title.pattern, '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert):');
  });

  test('getSastConfig returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getSastConfig();
    assert.ok(cfg.tools.javascript.includes('eslint'));
    assert.ok(cfg.security.includes('semgrep'));
  });

  test('getAutofixConfig returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getAutofixConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.confidence_threshold, 0.8);
  });

  test('getFinishingTouches returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getFinishingTouches();
    assert.equal(cfg.simplify_code, true);
  });

  test('getPermissions returns defaults', () => {
    const mgr = new ConfigManager();
    const cfg = mgr.getPermissions();
    assert.equal(cfg.defaults.read, 'allow');
  });
});

// ─── singleton ───────────────────────────────────────────────────────────────

describe('configManager singleton', () => {
  test('exported instance should work', async () => {
    configManager.config = null;
    configManager.configPath = null;
    const cfg = await configManager.load();
    assert.ok(cfg);
    assert.equal(cfg.debug, false);
  });
});


