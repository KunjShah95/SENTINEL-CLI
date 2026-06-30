/**
 * ConnectorBase — Abstract base class for all Sentinel connectors.
 *
 * Provides a standard lifecycle and interface so any external service
 * (GitHub, Claude, ChatGPT, Slack, Jira, etc.) can be managed uniformly
 * through the connector registry.
 *
 * Subclasses MUST implement:
 *   - connect()        — establish the connection / authenticate
 *   - disconnect()     — tear down the connection
 *   - healthCheck()    — verify the connection is alive
 *   - static meta      — { id, name, description, docsUrl, envVars }
 */

export class ConnectorBase {
  /** Unique connector id (e.g. 'github', 'anthropic', 'openai') */
  id = 'unknown';

  /** Human-readable display name */
  name = 'Unknown Connector';

  /** Short description */
  description = '';

  /** Documentation URL */
  docsUrl = '';

  /** Connection status */
  connected = false;

  /** Last health check timestamp */
  lastChecked = null;

  /** Error from last health check */
  lastError = null;

  /**
   * @param {object} [options]
   * @param {object} [options.config] — provider-specific configuration
   */
  constructor(options = {}) {
    this.config = options.config || {};
    this._options = options;
  }

  // ─── Lifecycle (must override) ────────────────────────────────────────────

  /**
   * Establish the connection / authenticate with the service.
   * @returns {Promise<{ success: boolean, message?: string }>}
   */
  async connect() {
    throw new Error(`${this.id}: connect() not implemented`);
  }

  /**
   * Tear down the connection.
   * @returns {Promise<{ success: boolean, message?: string }>}
   */
  async disconnect() {
    throw new Error(`${this.id}: disconnect() not implemented`);
  }

  /**
   * Verify the connection is alive.
   * @returns {Promise<{ alive: boolean, latencyMs?: number, error?: string }>}
   */
  async healthCheck() {
    throw new Error(`${this.id}: healthCheck() not implemented`);
  }

  // ─── Built-in utilities ───────────────────────────────────────────────────

  /** Returns the configuration schema for this connector (env vars + fields). */
  static get configSchema() {
    return {
      envVars: [],
      fields: [],
    };
  }

  /** Returns a summary object suitable for CLI / UI display. */
  get summary() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      connected: this.connected,
      lastChecked: this.lastChecked?.toISOString?.() ?? null,
      lastError: this.lastError,
      docsUrl: this.docsUrl,
    };
  }

  /** Health check with automatic timestamp + error capture. */
  async check() {
    try {
      const start = Date.now();
      const result = await this.healthCheck();
      const latencyMs = Date.now() - start;

      this.lastChecked = new Date();
      this.connected = result.alive;
      this.lastError = result.error ?? null;

      return { ...result, latencyMs };
    } catch (err) {
      this.connected = false;
      this.lastChecked = new Date();
      this.lastError = err.message;
      return { alive: false, latencyMs: 0, error: err.message };
    }
  }
}

export default ConnectorBase;
