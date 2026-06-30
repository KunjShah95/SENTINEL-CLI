/**
 * ConnectorRegistry — Central registry for all Sentinel connectors.
 *
 * Manages connector lifecycle: register, discover, connect, disconnect,
 * health-check. Extensible — new connectors just need to implement ConnectorBase.
 */

import { GitHubConnector } from './GitHubConnector.js';
import { AnthropicConnector } from './AnthropicConnector.js';
import { OpenAIConnector } from './OpenAIConnector.js';
import { GitLabConnector } from './GitLabConnector.js';
import { SlackConnector } from './SlackConnector.js';

export class ConnectorRegistry {
  constructor() {
    /** @type {Map<string, ConnectorBase>} */
    this._connectors = new Map();

    // Register built-in connectors
    this._registerBuiltins();
  }

  /** Register all built-in connectors by default. */
  _registerBuiltins() {
    this.register(new GitHubConnector());
    this.register(new AnthropicConnector());
    this.register(new OpenAIConnector());
    this.register(new GitLabConnector());
    this.register(new SlackConnector());
  }

  /**
   * Register a connector instance.
   * @param {import('./ConnectorBase.js').ConnectorBase} connector
   */
  register(connector) {
    if (!connector.id || connector.id === 'unknown') {
      throw new Error('Connector must have a unique `id` property');
    }
    if (this._connectors.has(connector.id)) {
      throw new Error(`Connector '${connector.id}' is already registered`);
    }
    this._connectors.set(connector.id, connector);
  }

  /**
   * Unregister a connector by id.
   * @param {string} id
   */
  unregister(id) {
    const connector = this._connectors.get(id);
    if (connector?.connected) {
      connector.disconnect().catch(() => {});
    }
    this._connectors.delete(id);
  }

  /**
   * Get a connector by id.
   * @param {string} id
   * @returns {import('./ConnectorBase.js').ConnectorBase|undefined}
   */
  get(id) {
    return this._connectors.get(id);
  }

  /**
   * List all registered connectors with their summary.
   * @param {object} [filter] — optional filter
   * @param {boolean} [filter.connectedOnly] — only connected connectors
   * @returns {Array<object>}
   */
  list(filter = {}) {
    const all = Array.from(this._connectors.values());
    if (filter.connectedOnly) {
      return all.filter(c => c.connected).map(c => c.summary);
    }
    return all.map(c => c.summary);
  }

  /**
   * Connect to a specific connector.
   * @param {string} id — connector id
   * @param {object} [config] — override configuration
   * @returns {Promise<{ success: boolean, message?: string }>}
   */
  async connect(id, config) {
    const connector = this._connectors.get(id);
    if (!connector) {
      return { success: false, message: `Unknown connector: '${id}'. Available: ${this.availableIds().join(', ')}` };
    }

    if (config) {
      connector.config = { ...connector.config, ...config };
    }

    const result = await connector.connect();
    if (result.success) {
      // Run health check automatically after connect
      await connector.check();
    }
    return result;
  }

  /**
   * Disconnect a specific connector.
   * @param {string} id
   * @returns {Promise<{ success: boolean, message?: string }>}
   */
  async disconnect(id) {
    const connector = this._connectors.get(id);
    if (!connector) {
      return { success: false, message: `Unknown connector: '${id}'` };
    }
    return connector.disconnect();
  }

  /**
   * Health-check a specific connector (or all if id omitted).
   * @param {string} [id]
   * @returns {Promise<object|Array<object>>}
   */
  async check(id) {
    if (id) {
      const connector = this._connectors.get(id);
      if (!connector) return { error: `Unknown connector: '${id}'` };
      return connector.check();
    }

    // Check all connectors in parallel
    const results = {};
    const checks = Array.from(this._connectors.entries()).map(async ([cid, connector]) => {
      results[cid] = await connector.check();
    });
    await Promise.all(checks);
    return results;
  }

  /**
   * Get the config schema for a specific connector.
   * @param {string} id
   */
  getConfigSchema(id) {
    const connector = this._connectors.get(id);
    if (!connector) return null;
    return connector.constructor.configSchema;
  }

  /**
   * Get ids of all registered connectors.
   * @returns {string[]}
   */
  availableIds() {
    return Array.from(this._connectors.keys());
  }
}

// Singleton
export const connectorRegistry = new ConnectorRegistry();
export default connectorRegistry;
