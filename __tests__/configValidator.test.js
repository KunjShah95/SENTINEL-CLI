import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigValidator, createValidatedConfig, configValidator } from '../src/config/configValidator.js';

describe('ConfigValidator.validateProvider()', () => {
  test('validates a correct provider', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ provider: 'openai', model: 'gpt-4' }, 0);
    assert.deepEqual(errors, []);
  });

  test('rejects missing provider', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ model: 'gpt-4' }, 0);
    assert.ok(errors.some(e => e.includes('providers[0].provider must be a string')));
  });

  test('rejects invalid provider name', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ provider: 'invalid-ai', model: 'gpt-4' }, 1);
    assert.ok(errors.some(e => e.includes('providers[1].provider must be one of')));
  });

  test('rejects missing model', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ provider: 'groq' }, 2);
    assert.ok(errors.some(e => e.includes('providers[2].model must be a string')));
  });

  test('rejects non-boolean enabled', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ provider: 'groq', model: 'llama', enabled: 'yes' }, 0);
    assert.ok(errors.some(e => e.includes('enabled must be a boolean')));
  });

  test('rejects non-number weight', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ provider: 'groq', model: 'llama', weight: 'heavy' }, 0);
    assert.ok(errors.some(e => e.includes('weight must be a number')));
  });

  test('rejects non-string apiKeyEnv', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateProvider({ provider: 'groq', model: 'llama', apiKeyEnv: true }, 0);
    assert.ok(errors.some(e => e.includes('apiKeyEnv must be a string')));
  });
});

describe('ConfigValidator.validateAI()', () => {
  test('accepts undefined (AI config is optional)', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI(undefined);
    assert.deepEqual(errors, []);
  });

  test('rejects non-boolean enabled', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({ enabled: 'yes' });
    assert.ok(errors.some(e => e.includes('ai.enabled must be a boolean')));
  });

  test('rejects non-string provider', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({ provider: 42 });
    assert.ok(errors.some(e => e.includes('ai.provider must be a string')));
  });

  test('rejects non-string model', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({ model: true });
    assert.ok(errors.some(e => e.includes('ai.model must be a string')));
  });

  test('rejects temperature outside 0-2 range', () => {
    const validator = new ConfigValidator();
    const errors1 = validator.validateAI({ temperature: -1 });
    const errors2 = validator.validateAI({ temperature: 3 });
    const errors3 = validator.validateAI({ temperature: 'hot' });
    assert.ok(errors1.some(e => e.includes('temperature must be a number between 0 and 2')));
    assert.ok(errors2.some(e => e.includes('temperature must be a number between 0 and 2')));
    assert.ok(errors3.some(e => e.includes('temperature must be a number between 0 and 2')));
  });

  test('accepts valid temperature', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({ temperature: 0.7 });
    assert.deepEqual(errors, []);
  });

  test('rejects non-positive maxTokens', () => {
    const validator = new ConfigValidator();
    const errors1 = validator.validateAI({ maxTokens: 0 });
    const errors2 = validator.validateAI({ maxTokens: -100 });
    const errors3 = validator.validateAI({ maxTokens: 'lots' });
    assert.ok(errors1.some(e => e.includes('maxTokens must be a positive number')));
    assert.ok(errors2.some(e => e.includes('maxTokens must be a positive number')));
    assert.ok(errors3.some(e => e.includes('maxTokens must be a positive number')));
  });

  test('rejects non-array providers', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({ providers: 'not-an-array' });
    assert.ok(errors.some(e => e.includes('ai.providers must be an array')));
  });

  test('validates provider entries in providers array', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({
      providers: [
        { provider: 'openai', model: 'gpt-4' },
        { model: 'llama' }, // Missing provider
      ],
    });
    assert.ok(errors.some(e => e.includes('providers[1].provider must be a string')));
  });

  test('accepts valid AI config', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAI({
      enabled: true,
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.5,
      maxTokens: 4000,
      providers: [
        { provider: 'groq', model: 'llama-3.1-8b-instant', enabled: true, weight: 1 },
      ],
    });
    assert.deepEqual(errors, []);
  });
});

describe('ConfigValidator.validateAnalyzers()', () => {
  test('accepts undefined (analyzers config is optional)', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAnalyzers(undefined);
    assert.deepEqual(errors, []);
  });

  test('rejects unknown analyzer', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAnalyzers({ unknownAnalyzer: true });
    assert.ok(errors.some(e => e.includes('Unknown analyzer')));
  });

  test('rejects non-boolean analyzer value', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAnalyzers({ security: 'yes' });
    assert.ok(errors.some(e => e.includes('analyzers.security must be a boolean')));
  });

  test('accepts valid analyzers', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateAnalyzers({
      security: true,
      quality: false,
      bugs: true,
    });
    assert.deepEqual(errors, []);
  });
});

describe('ConfigValidator.validateGitHub()', () => {
  test('accepts undefined (GitHub config is optional)', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub(undefined);
    assert.deepEqual(errors, []);
  });

  test('rejects non-string token', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ token: 123 });
    assert.ok(errors.some(e => e.includes('github.token must be a string')));
  });

  test('rejects non-string baseUrl', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ baseUrl: 42 });
    assert.ok(errors.some(e => e.includes('github.baseUrl must be a string')));
  });

  test('rejects non-array allowedHostnames', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ allowedHostnames: 'not-an-array' });
    assert.ok(errors.some(e => e.includes('github.allowedHostnames must be an array')));
  });

  test('rejects non-string hostname in allowedHostnames', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ allowedHostnames: [42] });
    assert.ok(errors.some(e => e.includes('github.allowedHostnames[0] must be a string')));
  });

  test('rejects non-object enterprise config', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ enterprise: 'yes' });
    assert.ok(errors.some(e => e.includes('github.enterprise must be an object')));
  });

  test('validates enterprise.baseUrl', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ enterprise: { baseUrl: 42 } });
    assert.ok(errors.some(e => e.includes('github.enterprise.baseUrl must be a string')));
  });

  test('validates enterprise.allowlist', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({ enterprise: { allowlist: 'not-array' } });
    assert.ok(errors.some(e => e.includes('github.enterprise.allowlist must be an array')));
  });

  test('accepts valid GitHub config', () => {
    const validator = new ConfigValidator();
    const errors = validator.validateGitHub({
      token: 'ghp_xxxx',
      baseUrl: 'https://api.github.com',
      allowedHostnames: ['github.com', 'github.enterprise.com'],
      enterprise: { baseUrl: 'https://github.enterprise.com', allowlist: ['repo-owner'] },
    });
    assert.deepEqual(errors, []);
  });
});

describe('ConfigValidator.validate()', () => {
  test('rejects non-object config', () => {
    const validator = new ConfigValidator();
    const result = validator.validate(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('must be an object'));
  });

  test('rejects invalid output format', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({ output: { format: 'xml' } });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('output.format')));
  });

  test('rejects invalid output minSeverity', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({ output: { minSeverity: 'fatal' } });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('output.minSeverity')));
  });

  test('rejects non-array rules', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({ rules: 'string-rule' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('rules must be an array')));
  });

  test('rejects non-array exclude', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({ exclude: 'node_modules' });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('exclude must be an array')));
  });

  test('validates AI sub-config aggregating errors', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({ ai: { enabled: 'not-boolean', temperature: -1 } });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('ai.enabled')));
    assert.ok(result.errors.some(e => e.includes('temperature')));
  });

  test('returns valid for empty config', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({});
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  test('returns valid for fully correct config', () => {
    const validator = new ConfigValidator();
    const result = validator.validate({
      ai: { enabled: true, provider: 'openai', model: 'gpt-4' },
      analyzers: { security: true, quality: true },
      output: { format: 'json', minSeverity: 'high' },
      rules: ['no-var'],
      exclude: ['dist/**'],
    });
    assert.equal(result.valid, true);
  });
});

describe('ConfigValidator.validateOrThrow()', () => {
  test('returns true for valid config', () => {
    const validator = new ConfigValidator();
    assert.equal(validator.validateOrThrow({}), true);
  });

  test('throws for invalid config', () => {
    const validator = new ConfigValidator();
    assert.throws(() => validator.validateOrThrow(null), { message: /Configuration validation failed/ });
  });
});

describe('createValidatedConfig()', () => {
  test('applies default AI config when not provided', () => {
    const config = createValidatedConfig({});
    assert.equal(config.ai.enabled, true);
    assert.equal(config.ai.provider, 'openai');
    assert.equal(config.ai.model, 'gpt-3.5-turbo');
    assert.equal(config.ai.temperature, 0.3);
    assert.equal(config.ai.maxTokens, 2000);
  });

  test('merges user AI config over defaults', () => {
    const config = createValidatedConfig({ ai: { provider: 'groq', model: 'llama-3.1-8b-instant' } });
    assert.equal(config.ai.provider, 'groq');
    assert.equal(config.ai.model, 'llama-3.1-8b-instant');
    // Inherits defaults for unspecified fields
    assert.equal(config.ai.temperature, 0.3);
    assert.equal(config.ai.maxTokens, 2000);
  });

  test('applies default analyzers', () => {
    const config = createValidatedConfig({});
    assert.equal(config.analyzers.security, true);
    assert.equal(config.analyzers.quality, true);
    assert.equal(config.analyzers.bugs, true);
  });

  test('merges user analyzers over defaults', () => {
    const config = createValidatedConfig({ analyzers: { security: false } });
    assert.equal(config.analyzers.security, false);
    assert.equal(config.analyzers.quality, true); // Still inherits defaults
  });

  test('applies default output config', () => {
    const config = createValidatedConfig({});
    assert.equal(config.output.format, 'text');
    assert.equal(config.output.minSeverity, 'low');
  });

  test('merges user output over defaults', () => {
    const config = createValidatedConfig({ output: { format: 'sarif' } });
    assert.equal(config.output.format, 'sarif');
    assert.equal(config.output.minSeverity, 'low');
  });

  test('applies default exclude list', () => {
    const config = createValidatedConfig({});
    assert.ok(config.exclude.includes('node_modules/**'));
    assert.ok(config.exclude.includes('dist/**'));
  });

  test('merges user rules', () => {
    const config = createValidatedConfig({ rules: ['custom-rule'] });
    assert.deepEqual(config.rules, ['custom-rule']);
  });

  test('throws for invalid user config', () => {
    assert.throws(() => createValidatedConfig({ output: { format: 'xml' } }), {
      message: /output.format/,
    });
  });
});

describe('configValidator singleton', () => {
  test('exported instance is a ConfigValidator', () => {
    assert.ok(configValidator instanceof ConfigValidator);
    const result = configValidator.validate({ ai: { enabled: true } });
    assert.equal(result.valid, true);
  });
});
