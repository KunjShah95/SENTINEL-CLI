import { promises as fs } from 'fs';
import path from 'path';

class AuditLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || '.sentinel/audit';
    this.retentionDays = options.retentionDays || 90;
    this.bufferSize = options.bufferSize || 100;
    this.buffer = [];
    this.flushInterval = options.flushInterval || 5000;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;
    this.enableWebhook = options.enableWebhook || false;
    this.webhookUrl = options.webhookUrl;
    this.sensitiveFields = options.sensitiveFields || ['password', 'token', 'secret', 'apiKey', 'privateKey'];
    
    this.startAutoFlush();
  }

  async log(event) {
    const auditEntry = this.createAuditEntry(event);
    
    // Add to buffer
    this.buffer.push(auditEntry);
    
    // Console output
    if (this.enableConsole) {
      this.logToConsole(auditEntry);
    }
    
    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      await this.flush();
    }
    
    return auditEntry.id;
  }

  createAuditEntry(event) {
    return {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      unixTimestamp: Date.now(),
      level: event.level || 'info',
      category: event.category || 'general',
      action: event.action,
      actor: {
        id: event.userId,
        email: event.userEmail,
        ip: event.ipAddress,
        userAgent: event.userAgent,
      },
      resource: {
        type: event.resourceType,
        id: event.resourceId,
        name: event.resourceName,
      },
      tenant: {
        id: event.tenantId,
        name: event.tenantName,
      },
      details: this.sanitizeData(event.details || {}),
      metadata: {
        source: event.source || 'api',
        sessionId: event.sessionId,
        requestId: event.requestId,
        correlationId: event.correlationId,
      },
      result: {
        success: event.success !== false,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
      },
    };
  }

  sanitizeData(data) {
    const sanitized = { ...data };
    
    for (const field of this.sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
      
      // Check nested objects
      for (const key of Object.keys(sanitized)) {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
          sanitized[key] = this.sanitizeData(sanitized[key]);
        }
      }
    }
    
    return sanitized;
  }

  logToConsole(entry) {
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      security: '\x1b[35m', // Magenta
      audit: '\x1b[32m',   // Green
    };
    
    const reset = '\x1b[0m';
    const color = colors[entry.level] || colors.info;
    
    console.log(
      `${color}[AUDIT]${reset} ${entry.timestamp} | ` +
      `${entry.category} | ${entry.action} | ` +
      `User: ${entry.actor.email || 'anonymous'} | ` +
      `Result: ${entry.result.success ? 'SUCCESS' : 'FAILED'}`
    );
  }

  async flush() {
    if (this.buffer.length === 0) return;
    
    const entries = [...this.buffer];
    this.buffer = [];
    
    const promises = [];
    
    if (this.enableFile) {
      promises.push(this.flushToFile(entries));
    }
    
    if (this.enableWebhook && this.webhookUrl) {
      promises.push(this.flushToWebhook(entries));
    }
    
    await Promise.allSettled(promises);
  }

  async flushToFile(entries) {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      
      const date = new Date().toISOString().split('T')[0];
      const fileName = `audit-${date}.jsonl`;
      const filePath = path.join(this.logDir, fileName);
      
      const lines = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.appendFile(filePath, lines);
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }

  async flushToWebhook(entries) {
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      
      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to send audit log to webhook:', error);
    }
  }

  startAutoFlush() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
    
    // Flush on process exit
    process.on('beforeExit', () => {
      this.flush();
    });
  }

  // Query audit logs
  async query(filters = {}) {
    const logs = await this.loadLogs(filters);
    
    return logs.filter(entry => {
      if (filters.startDate && new Date(entry.timestamp) < new Date(filters.startDate)) {
        return false;
      }
      
      if (filters.endDate && new Date(entry.timestamp) > new Date(filters.endDate)) {
        return false;
      }
      
      if (filters.userId && entry.actor.id !== filters.userId) {
        return false;
      }
      
      if (filters.tenantId && entry.tenant.id !== filters.tenantId) {
        return false;
      }
      
      if (filters.category && entry.category !== filters.category) {
        return false;
      }
      
      if (filters.action && entry.action !== filters.action) {
        return false;
      }
      
      if (filters.level && entry.level !== filters.level) {
        return false;
      }
      
      if (filters.success !== undefined && entry.result.success !== filters.success) {
        return false;
      }
      
      return true;
    });
  }

  async loadLogs(_filters = {}) {
    const logs = [];
    
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));
      
      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
          if (line) {
            try {
              logs.push(JSON.parse(line));
            } catch {
              // Skip invalid lines
            }
          }
        }
      }
    } catch (error) {
      // Directory might not exist
    }
    
    return logs.sort((a, b) => b.unixTimestamp - a.unixTimestamp);
  }

  // Cleanup old logs
  async cleanup() {
    try {
      const cutoff = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
      const files = await fs.readdir(this.logDir);
      
      for (const file of files) {
        if (file.startsWith('audit-') && file.endsWith('.jsonl')) {
          const filePath = path.join(this.logDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoff) {
            await fs.unlink(filePath);
            console.log(`Deleted old audit log: ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to cleanup audit logs:', error);
    }
  }

  // Generate compliance report
  async generateComplianceReport(startDate, endDate, tenantId = null) {
    const logs = await this.query({
      startDate,
      endDate,
      tenantId,
    });

    const report = {
      period: { start: startDate, end: endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: logs.length,
        byCategory: {},
        byAction: {},
        byUser: {},
        byResult: { success: 0, failed: 0 },
      },
      securityEvents: [],
      dataAccessEvents: [],
      authenticationEvents: [],
    };

    for (const log of logs) {
      // Category counts
      report.summary.byCategory[log.category] = 
        (report.summary.byCategory[log.category] || 0) + 1;
      
      // Action counts
      report.summary.byAction[log.action] = 
        (report.summary.byAction[log.action] || 0) + 1;
      
      // User counts
      if (log.actor.email) {
        report.summary.byUser[log.actor.email] = 
          (report.summary.byUser[log.actor.email] || 0) + 1;
      }
      
      // Result counts
      if (log.result.success) {
        report.summary.byResult.success++;
      } else {
        report.summary.byResult.failed++;
      }

      // Categorize events
      if (log.category === 'security') {
        report.securityEvents.push(log);
      } else if (log.category === 'data_access') {
        report.dataAccessEvents.push(log);
      } else if (log.category === 'authentication') {
        report.authenticationEvents.push(log);
      }
    }

    return report;
  }

  generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Predefined audit events
  async logUserLogin(userId, email, ip, success, errorMessage = null) {
    return this.log({
      category: 'authentication',
      action: 'user_login',
      userId,
      userEmail: email,
      ipAddress: ip,
      success,
      errorMessage,
      level: success ? 'info' : 'warn',
    });
  }

  async logUserLogout(userId, email, ip) {
    return this.log({
      category: 'authentication',
      action: 'user_logout',
      userId,
      userEmail: email,
      ipAddress: ip,
      success: true,
    });
  }

  async logDataAccess(userId, resourceType, resourceId, action, ip) {
    return this.log({
      category: 'data_access',
      action,
      userId,
      resourceType,
      resourceId,
      ipAddress: ip,
      success: true,
    });
  }

  async logSecurityEvent(userId, eventType, details, ip) {
    return this.log({
      category: 'security',
      action: eventType,
      userId,
      details,
      ipAddress: ip,
      level: 'security',
    });
  }

  async logConfigChange(userId, configKey, oldValue, newValue, ip) {
    return this.log({
      category: 'configuration',
      action: 'config_change',
      userId,
      details: { configKey, oldValue, newValue },
      ipAddress: ip,
      success: true,
    });
  }

  async logAnalysisRun(tenantId, analysisId, fileCount, issueCount) {
    return this.log({
      category: 'analysis',
      action: 'analysis_run',
      tenantId,
      details: { analysisId, fileCount, issueCount },
      success: true,
    });
  }
}

export default AuditLogger;
