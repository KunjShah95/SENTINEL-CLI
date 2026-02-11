import crypto from 'crypto';
import { globalEventBus, EventType } from '../events/eventBus.js';

class WebhookManager {
  constructor(options = {}) {
    this.webhooks = new Map();
    this.deliveryAttempts = new Map();
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 5000;
    this.timeout = options.timeout || 30000;
    this.secret = options.secret || process.env.WEBHOOK_SECRET || this.generateSecret();
    this.enableSigning = options.enableSigning !== false;
    
    this.setupEventListeners();
  }

  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  setupEventListeners() {
    // Subscribe to events that should trigger webhooks
    const events = [
      EventType.ANALYZER_COMPLETE,
      EventType.ISSUE_FOUND,
      EventType.SCAN_COMPLETE,
    ];

    for (const eventType of events) {
      globalEventBus.on(eventType, (data) => {
        this.triggerWebhooks(eventType, data);
      });
    }
  }

  // Register a new webhook
  register(webhook) {
    const id = `wh_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const config = {
      id,
      url: webhook.url,
      events: webhook.events || ['*'],
      secret: webhook.secret || this.generateSecret(),
      active: webhook.active !== false,
      createdAt: Date.now(),
      metadata: webhook.metadata || {},
      headers: webhook.headers || {},
      filters: webhook.filters || {},
      retryConfig: {
        maxRetries: webhook.maxRetries || this.maxRetries,
        retryDelay: webhook.retryDelay || this.retryDelay,
      },
    };

    this.webhooks.set(id, config);
    
    return {
      id,
      url: config.url,
      events: config.events,
      active: config.active,
      createdAt: config.createdAt,
    };
  }

  // Unregister a webhook
  unregister(id) {
    return this.webhooks.delete(id);
  }

  // Get webhook by ID
  get(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;
    return this.sanitizeWebhook(webhook);
  }

  // Get all webhooks
  getAll(filters = {}) {
    let webhooks = Array.from(this.webhooks.values());
    
    if (filters.active !== undefined) {
      webhooks = webhooks.filter(wh => wh.active === filters.active);
    }
    
    if (filters.event) {
      webhooks = webhooks.filter(wh => 
        wh.events.includes(filters.event) || wh.events.includes('*')
      );
    }
    
    return webhooks.map(wh => this.sanitizeWebhook(wh));
  }

  // Update webhook
  update(id, updates) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    const allowedFields = ['url', 'events', 'active', 'metadata', 'headers', 'filters'];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        webhook[field] = updates[field];
      }
    }

    webhook.updatedAt = Date.now();
    return this.sanitizeWebhook(webhook);
  }

  // Trigger webhooks for an event
  async triggerWebhooks(eventType, data) {
    const matchingWebhooks = this.getAll({ event: eventType, active: true });
    
    for (const webhook of matchingWebhooks) {
      // Check filters
      if (!this.matchesFilters(data, webhook.filters)) {
        continue;
      }
      
      // Send webhook asynchronously
      this.sendWebhook(webhook, eventType, data).catch(error => {
        console.error(`Webhook delivery failed for ${webhook.id}:`, error.message);
      });
    }
  }

  // Check if data matches webhook filters
  matchesFilters(data, filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return true;
    }

    for (const [key, value] of Object.entries(filters)) {
      const dataValue = this.getNestedValue(data, key);
      
      if (Array.isArray(value)) {
        if (!value.includes(dataValue)) {
          return false;
        }
      } else if (typeof value === 'object') {
        // Handle operator-based filters
        if (value.operator && value.value !== undefined) {
          if (!this.evaluateOperator(dataValue, value.operator, value.value)) {
            return false;
          }
        }
      } else {
        if (dataValue !== value) {
          return false;
        }
      }
    }

    return true;
  }

  evaluateOperator(actual, operator, expected) {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'gt': return actual > expected;
      case 'gte': return actual >= expected;
      case 'lt': return actual < expected;
      case 'lte': return actual <= expected;
      case 'in': return expected.includes(actual);
      case 'contains': return String(actual).includes(expected);
      case 'matches': return new RegExp(expected).test(String(actual));
      default: return false;
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
  }

  // Send webhook with retries
  async sendWebhook(webhook, eventType, data, attempt = 1) {
    const payload = {
      id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      data,
      attempt,
    };

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Sentinel-Webhook/1.9.0',
      'X-Webhook-ID': webhook.id,
      'X-Event-Type': eventType,
      'X-Attempt': attempt.toString(),
      ...webhook.headers,
    };

    // Add signature if enabled
    if (this.enableSigning) {
      headers['X-Webhook-Signature'] = this.signPayload(payload, webhook.secret);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = {
        webhookId: webhook.id,
        eventId: payload.id,
        attempt,
        timestamp: Date.now(),
        success: response.ok,
        statusCode: response.status,
      };

      // Record delivery attempt
      this.recordDelivery(result);

      if (!response.ok && attempt < webhook.retryConfig.maxRetries) {
        // Retry with exponential backoff
        const delay = webhook.retryConfig.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
        return this.sendWebhook(webhook, eventType, data, attempt + 1);
      }

      return result;
    } catch (error) {
      clearTimeout(timeout);

      const result = {
        webhookId: webhook.id,
        eventId: payload.id,
        attempt,
        timestamp: Date.now(),
        success: false,
        error: error.message,
      };

      this.recordDelivery(result);

      if (attempt < webhook.retryConfig.maxRetries) {
        const delay = webhook.retryConfig.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
        return this.sendWebhook(webhook, eventType, data, attempt + 1);
      }

      return result;
    }
  }

  // Sign webhook payload
  signPayload(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  // Verify webhook signature
  verifySignature(payload, signature, secret) {
    const expected = this.signPayload(payload, secret);
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  // Record delivery attempt
  recordDelivery(result) {
    if (!this.deliveryAttempts.has(result.webhookId)) {
      this.deliveryAttempts.set(result.webhookId, []);
    }
    
    const attempts = this.deliveryAttempts.get(result.webhookId);
    attempts.push(result);
    
    // Keep only last 1000 attempts per webhook
    if (attempts.length > 1000) {
      attempts.shift();
    }
  }

  // Get delivery history
  getDeliveryHistory(webhookId, options = {}) {
    const attempts = this.deliveryAttempts.get(webhookId) || [];
    
    let filtered = [...attempts];
    
    if (options.since) {
      filtered = filtered.filter(a => a.timestamp >= options.since);
    }
    
    if (options.success !== undefined) {
      filtered = filtered.filter(a => a.success === options.success);
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    // Limit results
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }

  // Test webhook
  async testWebhook(webhookId) {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload = {
      id: `test_${Date.now()}`,
      type: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook' },
      attempt: 1,
    };

    try {
      const result = await this.sendWebhook(
        { ...webhook, retryConfig: { maxRetries: 0 } },
        'webhook.test',
        testPayload.data
      );
      
      return {
        success: result.success,
        statusCode: result.statusCode,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Get webhook statistics
  getStats(webhookId = null) {
    if (webhookId) {
      const attempts = this.deliveryAttempts.get(webhookId) || [];
      return this.calculateStats(attempts);
    }

    // Global stats
    const allAttempts = [];
    for (const attempts of this.deliveryAttempts.values()) {
      allAttempts.push(...attempts);
    }

    return {
      ...this.calculateStats(allAttempts),
      totalWebhooks: this.webhooks.size,
      activeWebhooks: this.getAll({ active: true }).length,
    };
  }

  calculateStats(attempts) {
    const total = attempts.length;
    const successful = attempts.filter(a => a.success).length;
    const failed = total - successful;
    
    const byStatus = attempts.reduce((acc, a) => {
      const status = a.statusCode || 'error';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      totalDeliveries: total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) : 0,
      byStatus,
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  sanitizeWebhook(webhook) {
    // eslint-disable-next-line no-unused-vars
    const { secret, ...sanitized } = webhook;
    return sanitized;
  }

  // Enable/disable webhook
  setActive(id, active) {
    return this.update(id, { active });
  }

  // Rotate webhook secret
  rotateSecret(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    const newSecret = this.generateSecret();
    webhook.secret = newSecret;
    webhook.secretRotatedAt = Date.now();

    return {
      id,
      secret: newSecret,
      rotatedAt: webhook.secretRotatedAt,
    };
  }
}

export default WebhookManager;
