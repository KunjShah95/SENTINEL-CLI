import { EventEmitter } from 'events';

class NotificationManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.channels = new Map();
    this.history = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.defaultChannel = options.defaultChannel || 'console';
  }

  registerChannel(name, channel) {
    this.channels.set(name, channel);
    this.emit('channel:registered', { name, channel });
  }

  async send(notification, channelName = null) {
    const channel = channelName || this.defaultChannel;
    const channelInstance = this.channels.get(channel);

    if (!channelInstance) {
      throw new Error(`Channel ${channel} not found`);
    }

    const enrichedNotification = {
      ...notification,
      id: this.generateId(),
      timestamp: Date.now(),
      channel,
    };

    try {
      await channelInstance.send(enrichedNotification);

      this.history.push(enrichedNotification);
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }

      this.emit('notification:sent', enrichedNotification);

      return { success: true, notification: enrichedNotification };
    } catch (error) {
      this.emit('notification:failed', { notification: enrichedNotification, error });
      throw error;
    }
  }

  async sendToMultiple(notification, channels) {
    const results = await Promise.allSettled(
      channels.map(channel => this.send(notification, channel))
    );

    return results.map((result, index) => ({
      channel: channels[index],
      success: result.status === 'fulfilled',
      error: result.status === 'rejected' ? result.reason : null,
    }));
  }

  async broadcast(notification) {
    const channels = Array.from(this.channels.keys());
    return this.sendToMultiple(notification, channels);
  }

  getHistory(filter = {}) {
    let filtered = [...this.history];

    if (filter.channel) {
      filtered = filtered.filter(n => n.channel === filter.channel);
    }

    if (filter.type) {
      filtered = filtered.filter(n => n.type === filter.type);
    }

    if (filter.since) {
      filtered = filtered.filter(n => n.timestamp >= filter.since);
    }

    return filtered;
  }

  getChannelStatus() {
    const status = {};
    for (const [name, channel] of this.channels) {
      status[name] = {
        name,
        healthy: typeof channel.healthCheck === 'function'
          ? channel.healthCheck()
          : true,
        configured: channel.isConfigured?.() ?? true,
      };
    }
    return status;
  }

  generateId() {
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

class SlackChannel {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    this.channel = options.channel || '#alerts';
    this.username = options.username || 'Sentinel Bot';
    this.icon = options.icon || ':shield:';
  }

  isConfigured() {
    return !!this.webhookUrl;
  }

  async send(notification) {
    if (!this.webhookUrl) {
      throw new Error('Slack webhook URL not configured');
    }

    const { default: fetch } = await import('node-fetch');

    const payload = this.formatPayload(notification);

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    return true;
  }

  formatPayload(notification) {
    const severityColors = {
      critical: '#FF0000',
      high: '#FF8C00',
      medium: '#FFD700',
      low: '#00CED1',
      info: '#808080',
    };

    return {
      channel: this.channel,
      username: this.username,
      icon_emoji: this.icon,
      attachments: [{
        color: severityColors[notification.severity] || '#808080',
        title: notification.title,
        text: notification.message,
        fields: [
          { title: 'Type', value: notification.type, short: true },
          { title: 'Severity', value: notification.severity, short: true },
        ],
        footer: 'Sentinel Security CLI',
        ts: Math.floor(Date.now() / 1000),
      }],
    };
  }
}

class DiscordChannel {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
  }

  isConfigured() {
    return !!this.webhookUrl;
  }

  async send(notification) {
    if (!this.webhookUrl) {
      throw new Error('Discord webhook URL not configured');
    }

    const { default: fetch } = await import('node-fetch');

    const payload = this.formatPayload(notification);

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.statusText}`);
    }

    return true;
  }

  formatPayload(notification) {
    const severityColors = {
      critical: 0xFF0000,
      high: 0xFF8C00,
      medium: 0xFFD700,
      low: 0x00CED1,
      info: 0x808080,
    };

    return {
      embeds: [{
        title: notification.title,
        description: notification.message,
        color: severityColors[notification.severity] || 0x808080,
        fields: [
          { name: 'Type', value: notification.type, inline: true },
          { name: 'Severity', value: notification.severity, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Sentinel Security CLI' },
      }],
    };
  }
}

class EmailChannel {
  constructor(options = {}) {
    this.smtpConfig = options.smtpConfig;
    this.from = options.from || 'sentinel@example.com';
    this.to = options.to || [];
  }

  isConfigured() {
    return !!this.smtpConfig;
  }

  async send(notification) {
    // Email implementation would use nodemailer
    console.log(`[Email] Would send: ${notification.title}`);
    return true;
  }
}

class ConsoleChannel {
  constructor(options = {}) {
    this.colorize = options.colorize !== false;
  }

  isConfigured() {
    return true;
  }

  async send(notification) {
    const chalk = await import('chalk').then(m => m.default);

    const severityColor = {
      critical: chalk.red,
      high: chalk.red,
      medium: chalk.yellow,
      low: chalk.blue,
      info: chalk.gray,
    }[notification.severity] || chalk.white;

    console.log('\n' + '═'.repeat(60));
    console.log(severityColor.bold(notification.title));
    console.log('═'.repeat(60));
    console.log(notification.message);
    console.log(chalk.gray(`Type: ${notification.type} | Severity: ${notification.severity}`));
    console.log();

    return true;
  }
}

export {
  NotificationManager,
  SlackChannel,
  DiscordChannel,
  EmailChannel,
  ConsoleChannel,
};
