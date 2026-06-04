import { configManager } from '../src/config/configManager.js';

describe('ConfigManager', () => {
  beforeEach(() => {
    configManager.config = null;
    configManager.configPath = null;
  });

  describe('getConfigPaths', () => {
    it('should return 3 config paths', () => {
      const paths = configManager.getConfigPaths();
      expect(paths).toHaveLength(3);
      paths.forEach(p => expect(p).toContain('.sentinel.json'));
    });
  });

  describe('get and set', () => {
    beforeEach(() => {
      configManager.config = JSON.parse(JSON.stringify(configManager.defaultConfig));
    });

    it('should return null for missing key', () => {
      expect(configManager.get('nonexistent.key')).toBeNull();
    });

    it('should return value for existing key', () => {
      expect(configManager.get('debug')).toBe(false);
      expect(configManager.get('agents.coder.model')).toBe('gpt-4o-mini');
    });

    it('should set values via dot-notation', () => {
      configManager.set('debug', true);
      expect(configManager.get('debug')).toBe(true);
    });

    it('should create nested objects on set', () => {
      configManager.set('custom.nested.key', 'val');
      expect(configManager.get('custom.nested.key')).toBe('val');
    });
  });

  describe('isProviderEnabled', () => {
    beforeEach(() => {
      configManager.config = JSON.parse(JSON.stringify(configManager.defaultConfig));
    });

    it('should return false for missing provider', () => {
      expect(configManager.isProviderEnabled('nonexistent')).toBe(false);
    });

    it('should return false for disabled provider with no key', () => {
      expect(configManager.isProviderEnabled('openai')).toBe(false);
    });

    it('should return true for enabled provider with key', () => {
      configManager.config.providers.openai.apiKey = 'sk-test';
      expect(configManager.isProviderEnabled('openai')).toBe(true);
    });
  });

  describe('getConfiguredProviders', () => {
    beforeEach(() => {
      configManager.config = JSON.parse(JSON.stringify(configManager.defaultConfig));
    });

    it('should return empty array when no providers configured', () => {
      expect(configManager.getConfiguredProviders()).toEqual([]);
    });

    it('should return providers with apiKey and not disabled', () => {
      configManager.config.providers.openai.apiKey = 'sk-test';
      configManager.config.providers.anthropic.apiKey = 'sk-ant';
      expect(configManager.getConfiguredProviders()).toEqual(['openai', 'anthropic']);
    });
  });

  describe('getMaskedConfig', () => {
    beforeEach(() => {
      configManager.config = JSON.parse(JSON.stringify(configManager.defaultConfig));
    });

    it('should mask API keys', () => {
      configManager.config.providers.openai.apiKey = 'sk-abcdefghijklmnop';
      const masked = configManager.getMaskedConfig();
      expect(masked.providers.openai.apiKey).toBe('sk-a***********mnop');
    });

    it('should mask short API keys fully', () => {
      configManager.config.providers.openai.apiKey = 'short';
      const masked = configManager.getMaskedConfig();
      expect(masked.providers.openai.apiKey).toBe('********');
    });
  });

  describe('mergeDeep', () => {
    it('should merge objects deeply', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      const result = configManager.mergeDeep(target, source);
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
    });

    it('should override scalar values', () => {
      const result = configManager.mergeDeep({ a: 1 }, { a: 2 });
      expect(result.a).toBe(2);
    });

    it('should return source if target is not object', () => {
      const result = configManager.mergeDeep(null, { a: 1 });
      expect(result).toEqual({ a: 1 });
    });
  });
});
