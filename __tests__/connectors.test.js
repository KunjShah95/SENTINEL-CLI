/**
 * connectors — the registry is the single owner of provider metadata, and the
 * credential store must never leak a key.
 *
 * These tests exist because the properties below are all things that used to
 * be true of *different* files simultaneously and disagreed: the four copies
 * of the provider→env-var map, and the discovery path reading `process.env`
 * while inference read the config store.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH,
  CONNECTORS,
  CONNECTOR_IDS,
  TRANSPORT,
  getConnector,
  getConnectorBaseUrl,
  getConnectorEnvVar,
  getConnectorEnvVars,
  getConnectorKeyPrefix,
  hasEnvCredential,
  isLocalConnector,
  listConnectors,
} from '../src/shared/connectors/registry.js';
import {
  SOURCE,
  connectionStatus,
  credentialHint,
  isConnectedSync,
  redact,
  resolveCredentialSync,
} from '../src/shared/connectors/credentials.js';
import { mergeWithCatalog, toRegistryModel } from '../src/shared/connectors/catalog.js';
import { getBareModelId } from '../src/shared/models/index.js';

describe('connector registry', () => {
  it('every connector has the fields a transport dispatch needs', () => {
    for (const [id, conn] of Object.entries(CONNECTORS)) {
      assert.ok(conn.id === id, `${id} ids match its key`);
      assert.ok(conn.label, `${id} has a label`);
      assert.ok(Object.values(TRANSPORT).includes(conn.transport), `${id} has a known transport`);
      assert.ok(typeof conn.baseURL === 'function', `${id} baseURL is callable`);
      assert.match(conn.baseURL(), /^https?:\/\//, `${id} resolves to a URL`);
      assert.ok(Array.isArray(conn.env), `${id} env is an array`);
      assert.ok(Array.isArray(conn.auth) && conn.auth.length > 0, `${id} declares an auth method`);
      assert.ok(conn.docs, `${id} documents where to get a credential`);
    }
  });

  it('a local connector has no credential and says so', () => {
    for (const id of CONNECTOR_IDS.filter(isLocalConnector)) {
      assert.deepEqual(CONNECTORS[id].env, [], `${id} reads no key`);
      assert.deepEqual(CONNECTORS[id].auth, [AUTH.NONE], `${id} needs no auth method`);
    }
  });

  it('a remote connector has somewhere to put its credential', () => {
    for (const id of CONNECTOR_IDS.filter((x) => !isLocalConnector(x))) {
      assert.ok(getConnectorEnvVar(id), `${id} names an env var`);
      assert.notEqual(CONNECTORS[id].auth[0], AUTH.NONE, `${id} is not auth-free`);
    }
  });

  it('Copilot accepts both token names, closing the doctor drift', () => {
    // doctor.js listed GITHUB_COPILOT_TOKEN while /setup wrote GITHUB_TOKEN, so
    // a connected user was told by `sentinel doctor` that they had no key.
    assert.deepEqual(getConnectorEnvVars('github-copilot'), ['GITHUB_TOKEN', 'GITHUB_COPILOT_TOKEN']);
  });

  it('base URLs come from the registry and honour a proxy override', () => {
    assert.equal(getConnectorBaseUrl('groq'), 'https://api.groq.com/openai/v1');
    const previous = process.env.GROQ_BASE_URL;
    process.env.GROQ_BASE_URL = 'https://proxy.internal/v1';
    try {
      assert.equal(getConnectorBaseUrl('groq'), 'https://proxy.internal/v1');
    } finally {
      if (previous === undefined) delete process.env.GROQ_BASE_URL;
      else process.env.GROQ_BASE_URL = previous;
    }
  });

  it('every connector appears exactly once in the id list', () => {
    assert.equal(new Set(CONNECTOR_IDS).size, CONNECTOR_IDS.length);
    assert.equal(CONNECTOR_IDS.length, listConnectors().length);
  });
});

describe('credential store', () => {
  it('resolves from the environment when nothing is stored', () => {
    const previous = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_from_env';
    try {
      const resolved = resolveCredentialSync('groq');
      assert.equal(resolved.key, 'gsk_from_env');
      assert.equal(resolved.source, SOURCE.ENV);
      assert.equal(resolved.envName, 'GROQ_API_KEY');
      assert.equal(isConnectedSync('groq'), true);
    } finally {
      if (previous === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = previous;
    }
  });

  it('an unconfigured connector is unavailable, not merely unlucky', () => {
    const previous = process.env.ZAI_API_KEY;
    delete process.env.ZAI_API_KEY;
    try {
      assert.equal(isConnectedSync('zai'), false);
      assert.equal(resolveCredentialSync('zai').source, SOURCE.NONE);
    } finally {
      if (previous !== undefined) process.env.ZAI_API_KEY = previous;
    }
  });

  it('a local connector is connected with no key at all', () => {
    const resolved = resolveCredentialSync('ollama');
    assert.equal(resolved.key, null);
    assert.equal(resolved.source, 'local');
    assert.equal(isConnectedSync('ollama'), true);
  });

  it('status never returns a credential', async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-secret-value-should-not-appear';
    try {
      const rows = await connectionStatus();
      const openai = rows.find((r) => r.id === 'openai');
      assert.equal(openai.connected, true);
      assert.equal(openai.source, SOURCE.ENV);
      // A status listing ends up in terminal scrollback and in `--json` output
      // pasted into a bug report, so it must carry presence, never the secret.
      assert.equal(JSON.stringify(rows).includes('sk-secret-value-should-not-appear'), false);
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it('redact keeps a prefix and last four, and never leaks a short key', () => {
    assert.equal(redact('sk-abcdefghijklmnop'), 'sk-abc…mnop');
    assert.equal(redact('short'), '*****');
    assert.equal(redact(''), '');
  });

  it('the hint names a command that exists', () => {
    // providers.js told users to run `sentinel auth login <provider>` and no
    // such command did. This pins the message to a real command name.
    assert.match(credentialHint('groq'), /sentinel auth login groq/);
    assert.match(credentialHint('groq'), /GROQ_API_KEY/);
    assert.match(credentialHint('ollama'), /no key needed/);
  });
});

describe('model ids', () => {
  it('strips every registry namespace', () => {
    for (const id of CONNECTOR_IDS) {
      const prefix = getConnectorKeyPrefix(id);
      if (!prefix) continue;
      assert.equal(getBareModelId(`${prefix}some-model`), 'some-model', `${id} namespace stripped`);
    }
  });

  it('strips Fireworks\' wire-level accounts/ namespace', () => {
    // inferProvider recognised this namespace but the old hardcoded prefix
    // list did not, so the id went on the wire still namespaced and 404'd.
    assert.equal(
      getBareModelId('accounts/fireworks/llama-v3p3-70b-instruct'),
      'llama-v3p3-70b-instruct'
    );
  });

  it('leaves an unnamespaced id alone', () => {
    for (const id of ['gpt-4o-mini', 'claude-sonnet-4-6', 'mistral-small-latest']) {
      assert.equal(getBareModelId(id), id);
    }
  });
});

describe('catalog conversion', () => {
  it('namespaces ids only for connectors that declare a prefix', () => {
    const anthropic = toRegistryModel('anthropic', { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' });
    assert.equal(anthropic.id, 'claude-sonnet-4-5');
    const ollama = toRegistryModel('ollama', { id: 'qwen3:8b', name: 'qwen3:8b' });
    assert.equal(ollama.id, 'ollama/qwen3:8b');
  });

  it('carries price, capability and limits through', () => {
    const model = toRegistryModel('anthropic', {
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
      reasoning: true,
      tool_call: true,
      cost: { input: 3, output: 15 },
      limit: { context: 200000, output: 64000 },
    });
    assert.equal(model.inputUsdPerMillionTokens, 3);
    assert.equal(model.outputUsdPerMillionTokens, 15);
    assert.equal(model.thinking, true);
    assert.equal(model.toolCall, true);
    assert.equal(model.contextLength, 200000);
  });

  it('never offers a model that cannot hold a conversation', () => {
    assert.equal(toRegistryModel('openai', { id: 'text-embedding-3-large' }), null);
    assert.equal(toRegistryModel('ollama', { id: 'bge-m3:latest' }), null);
    // Speech-to-text reports no text output modality.
    assert.equal(toRegistryModel('groq', { id: 'whisper-large-v3', modalities: { output: ['audio'] } }), null);
  });

  it('a pinned entry wins over its catalog twin', () => {
    const local = [{ id: 'claude-opus-5-5', provider: 'anthropic', inputUsdPerMillionTokens: 4, outputUsdPerMillionTokens: 20 }];
    const catalog = [
      { id: 'claude-opus-5-5', provider: 'anthropic', inputUsdPerMillionTokens: 5, outputUsdPerMillionTokens: 25 },
      { id: 'claude-sonnet-9', provider: 'anthropic', inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 10 },
    ];
    const merged = mergeWithCatalog(local, catalog);
    const pinned = merged.find((m) => m.id === 'claude-opus-5-5');
    assert.equal(pinned.inputUsdPerMillionTokens, 4, 'pinned pricing survives the merge');
    assert.equal(merged.filter((m) => m.id === 'claude-opus-5-5').length, 1, 'no duplicate id');
    assert.ok(merged.some((m) => m.id === 'claude-sonnet-9'), 'catalog still adds breadth');
  });
});

describe('availability', () => {
  it('reports local connectors as available without a credential', () => {
    assert.equal(hasEnvCredential('ollama'), true);
    assert.equal(hasEnvCredential('lmstudio'), true);
  });

  it('an unknown connector is unavailable rather than throwing', () => {
    assert.equal(getConnector('not-a-connector'), null);
    assert.equal(getConnectorBaseUrl('not-a-connector'), '');
    assert.equal(isLocalConnector('not-a-connector'), false);
    assert.equal(hasEnvCredential('not-a-connector'), false);
  });
});
