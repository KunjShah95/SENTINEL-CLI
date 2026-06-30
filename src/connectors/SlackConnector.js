/**
 * SlackConnector — Slack webhook connector with standard ConnectorBase interface.
 *
 * Env vars: SLACK_WEBHOOK_URL
 * Integrates with the existing SlackNotifier for sending formatted
 * Sentinel analysis results to Slack channels.
 *
 * Usage:
 *   import { SlackConnector } from './connectors/SlackConnector.js';
 *   const slack = new SlackConnector();
 *   await slack.connect();
 *   const result = await slack.notify(issues, { projectName: 'my-repo' });
 */

import { ConnectorBase } from './ConnectorBase.js';
import { SlackNotifier } from '../integrations/notifications.js';

export class SlackConnector extends ConnectorBase {
  id = 'slack';
  name = 'Slack';
  description = 'Connect to Slack via webhook to receive Sentinel analysis notifications and alerts';
  docsUrl = 'https://api.slack.com/messaging/webhooks';

  static configSchema = {
    envVars: ['SLACK_WEBHOOK_URL'],
    fields: [
      { key: 'webhookUrl', label: 'Slack Webhook URL', type: 'password', env: 'SLACK_WEBHOOK_URL' },
      { key: 'channel', label: 'Channel override (optional)', type: 'text', optional: true },
      { key: 'username', label: 'Bot display name', type: 'text', default: 'Sentinel CLI' },
    ],
  };

  constructor(options = {}) {
    super(options);
    this.notifier = null;
    this.webhookUrl = null;
  }

  async connect() {
    this.webhookUrl = this.config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    if (!this.webhookUrl) {
      return { success: false, message: 'SLACK_WEBHOOK_URL not set. Provide via config or SLACK_WEBHOOK_URL env var.' };
    }

    // Validate webhook URL format
    try {
      const parsed = new URL(this.webhookUrl);
      if (parsed.protocol !== 'https:') {
        return { success: false, message: 'Slack webhook URL must use HTTPS' };
      }
      if (!parsed.hostname.includes('hooks.slack.com') && !parsed.hostname.includes('slack.com')) {
        return { success: false, message: 'Invalid Slack webhook URL hostname' };
      }
    } catch {
      return { success: false, message: 'Invalid URL format for SLACK_WEBHOOK_URL' };
    }

    // Create the notifier instance
    this.notifier = new SlackNotifier({
      webhookUrl: this.webhookUrl,
      channel: this.config.channel || null,
      username: this.config.username || 'Sentinel CLI',
      iconEmoji: ':shield:',
    });

    // Verify by sending a lightweight test ping
    try {
      await this._ping();
      this.connected = true;
      return { success: true, message: `Connected to Slack${this.config.channel ? ` (channel: ${this.config.channel})` : ''}` };
    } catch (err) {
      this.connected = false;
      return { success: false, message: `Slack webhook verification failed: ${err.message}` };
    }
  }

  async disconnect() {
    this.notifier = null;
    this.webhookUrl = null;
    this.connected = false;
    return { success: true, message: 'Slack disconnected' };
  }

  async healthCheck() {
    if (!this.webhookUrl) {
      return { alive: false, error: 'Not connected' };
    }
    try {
      const start = Date.now();
      const result = await this._ping();
      const latencyMs = Date.now() - start;
      if (result) {
        return { alive: true, latencyMs, details: `Webhook endpoint responding (${latencyMs}ms)` };
      }
      return { alive: false, error: 'Webhook ping failed', latencyMs };
    } catch (err) {
      return { alive: false, error: err.message };
    }
  }

  // ─── Slack-specific convenience methods ───────────────────────────────────

  /**
   * Send a notification with Sentinel analysis results to Slack.
   * Delegates to SlackNotifier.notify() for formatting.
   *
   * @param {Array} issues — Sentinel analysis issues array
   * @param {object} [options]
   * @param {string} [options.projectName] — Project name for the header
   * @param {string} [options.branch] — Branch name
   * @param {string} [options.commitSha] — Commit SHA
   * @returns {Promise<{ success: boolean, issuesReported: number }>}
   */
  async notify(issues, options = {}) {
    if (!this.notifier) throw new Error('Not connected. Call connect() first.');
    return this.notifier.notify(issues, {
      projectName: options.projectName || 'Sentinel Project',
      branch: options.branch || 'main',
      commitSha: options.commitSha || '',
    });
  }

  /**
   * Send a simple text message to Slack.
   * Useful for alerts, status updates, or custom messages.
   *
   * @param {string} text — Message text (supports Markdown)
   * @returns {Promise<{ success: boolean }>}
   */
  async sendMessage(text) {
    if (!this.webhookUrl) throw new Error('Not connected. Call connect() first.');

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        username: this.config.username || 'Sentinel CLI',
        icon_emoji: ':shield:',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack message failed: ${errorText}`);
    }

    return { success: true };
  }

  /**
   * Send custom blocks to Slack.
   *
   * @param {Array} blocks — Slack Block Kit blocks
   * @returns {Promise<{ success: boolean }>}
   */
  async sendBlocks(blocks) {
    if (!this.webhookUrl) throw new Error('Not connected. Call connect() first.');

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks,
        username: this.config.username || 'Sentinel CLI',
        icon_emoji: ':shield:',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack blocks message failed: ${errorText}`);
    }

    return { success: true };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /**
   * Send a lightweight ping to verify the webhook endpoint.
   * Slack webhooks always return HTTP 200 OK if the URL is valid,
   * even for an empty payload (though we send a minimal message).
   */
  async _ping() {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '🛡️ Sentinel connector health check — OK' }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }
    return true;
  }
}

export default SlackConnector;
