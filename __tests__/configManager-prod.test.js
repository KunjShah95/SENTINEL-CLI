/**
 * Tests for ConfigManager — covers load, get/set, permissions, and path filters.
 */
import { jest } from '@jest/globals';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';

const TEST_DIR = path.resolve('.sentinel/test-config-' + Date.now());

beforeAll(async () => {
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch {}
});

describe('ConfigManager', () => {
  let configManager;

  beforeEach(async () => {
    // Fresh import to reset singleton
    const mod = await import('../src/config/configManager.js');
    configManager = new mod.ConfigManager.constructor();
  });

  test('has correct default config structure', () => {
    expect(configManager.defaultConfig).toBeDefined();
    expect(configManager.defaultConfig.data).toBeDefined();
    expect(configManager.defaultConfig.data.directory).toBe('.sentinel');
    expect(configManager.defaultConfig.providers).toBeDefined();
    expect(configManager.defaultConfig.agents).toBeDefined();
    expect(configManager.defaultConfig.shell).toBeDefined();
  });

  test('get returns default value when config not loaded', () => {
    expect(configManager.get('nonexistent', 'fallback')).toBe('fallback');
  });

  test('set creates nested structure', () => {
    configManager.set('deeply.nested.key', 'value');
    expect(configManager.get('deeply.nested.key')).toBe('value');
  });

  test('getPermissions returns default permissions', () => {
    const perms = configManager.getPermissions();
    expect(perms).toBeDefined();
    expect(perms.defaults).toBeDefined();
    expect(perms.defaults.read).toBe('allow');
    expect(perms.defaults.write).toBe('allow');
    expect(perms.defaults.shell).toBe('ask');
    expect(perms.defaults.network).toBe('allow');
    expect(perms.defaults.undo).toBe('allow');
  });

  test('getPermissions returns configured permissions', async () => {
    configManager.config = {
      ...configManager.defaultConfig,
      permissions: {
        tools: { bash: 'deny', writeFile: 'allow' },
        defaults: { read: 'allow', write: 'ask', shell: 'deny', network: 'allow', undo: 'allow' }
      }
    };
    const perms = configManager.getPermissions();
    expect(perms.tools.bash).toBe('deny');
    expect(perms.defaults.shell).toBe('deny');
  });

  test('getAutoReviewConfig returns defaults', () => {
    const config = configManager.getAutoReviewConfig();
    expect(config.enabled).toBe(true);
    expect(config.drafts).toBe(false);
    expect(config.base_branches).toContain('main');
  });

  test('getPathFilters returns defaults', () => {
    const filters = configManager.getPathFilters();
    expect(filters.exclude).toContain('node_modules/**');
  });

  test('getSastConfig returns defaults', () => {
    const sast = configManager.getSastConfig();
    expect(sast.auto_detect).toBe(true);
    expect(sast.security).toContain('semgrep');
  });

  test('isProviderEnabled returns false for unconfigured provider', () => {
    configManager.config = { providers: { openai: { apiKey: '', disabled: false } } };
    expect(configManager.isProviderEnabled('openai')).toBe(false);
  });

  test('isProviderEnabled returns true when key and enabled', () => {
    configManager.config = { providers: { openai: { apiKey: 'sk-test-1234', disabled: false } } };
    expect(configManager.isProviderEnabled('openai')).toBe(true);
  });

  test('getMaskedConfig masks API keys', () => {
    configManager.config = { providers: { openai: { apiKey: 'sk-1234567890abcdef' } } };
    const masked = configManager.getMaskedConfig();
    expect(masked.providers.openai.apiKey).toContain('*');
    expect(masked.providers.openai.apiKey).not.toBe('sk-1234567890abcdef');
  });

  test('mergeDeep correctly merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    const source = { a: { b: 10, e: 5 }, f: 6 };
    const result = configManager.mergeDeep(target, source);
    expect(result.a.b).toBe(10);
    expect(result.a.c).toBe(2);
    expect(result.a.e).toBe(5);
    expect(result.d).toBe(3);
    expect(result.f).toBe(6);
  });

  test('getConfiguredProviders filters enabled providers', () => {
    configManager.config = {
      providers: {
        openai: { apiKey: 'sk-test', disabled: false },
        anthropic: { apiKey: '', disabled: false },
        gemini: { apiKey: 'test-key', disabled: true },
      }
    };
    const configured = configManager.getConfiguredProviders();
    expect(configured).toContain('openai');
    expect(configured).not.toContain('anthropic');
    expect(configured).not.toContain('gemini');
  });
});
