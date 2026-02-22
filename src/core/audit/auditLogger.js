import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const SCHEMA_VERSION = '1.0.0';

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
    this.currentRunId = null;
    this.currentPromptId = null;
    this.currentPolicyId = null;
    this.previousHash = null;
    this.chainHashes = [];
    this.alertHooks = [];
    this.suppressionSpikeThreshold = options.suppressionSpikeThreshold || 50;
    this.suppressionWindowMinutes = options.suppressionWindowMinutes || 60;
    
    this.startAutoFlush();
  }

  setRunContext(runId, promptId = null, policyId = null) {
    this.currentRunId = runId;
    this.currentPromptId = promptId;
    this.currentPolicyId = policyId;
  }

  registerAlertHook(hook) {
    this.alertHooks.push({
      id: `hook_${Date.now()}`,
      type: hook.type,
      config: hook.config,
      enabled: true,
    });
  }

  unregisterAlertHook(hookId) {
    const index = this.alertHooks.findIndex(h => h.id === hookId);
    if (index !== -1) {
      this.alertHooks.splice(index, 1);
      return true;
    }
    return false;
  }

  async triggerAlert(alert) {
    for (const hook of this.alertHooks) {
      if (!hook.enabled) continue;

      try {
        if (hook.type === 'webhook') {
          await this.sendWebhookAlert(hook.config.url, alert);
        } else if (hook.type === 'email') {
          await this.sendEmailAlert(hook.config, alert);
        } else if (hook.type === 'slack') {
          await this.sendSlackAlert(hook.config, alert);
        }
      } catch (error) {
        console.error(`Alert hook ${hook.id} failed:`, error.message);
      }
    }
  }

  async sendWebhookAlert(url, alert) {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alert),
    });
  }

  async sendEmailAlert(config, alert) {
    console.log(`[EMAIL ALERT] To: ${config.to}, Subject: ${alert.title}`);
  }

  async sendSlackAlert(config, alert) {
    console.log(`[SLACK ALERT] Channel: ${config.channel}, Message: ${alert.title}`);
  }

  checkForAnomalies() {
    const recentSuppressions = this.buffer.filter(entry => 
      entry.action === 'issue_suppressed' &&
      entry.timestamp > Date.now() - (this.suppressionWindowMinutes * 60 * 1000)
    );

    if (recentSuppressions.length > this.suppressionSpikeThreshold) {
      this.triggerAlert({
        type: 'suppression_spike',
        title: 'Anomalous Suppression Spike Detected',
        severity: 'high',
        details: {
          suppressionCount: recentSuppressions.length,
          windowMinutes: this.suppressionWindowMinutes,
          threshold: this.suppressionSpikeThreshold,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }

  clearRunContext() {
    this.currentRunId = null;
    this.currentPromptId = null;
    this.currentPolicyId = null;
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
    const entryData = {
      schemaVersion: SCHEMA_VERSION,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      unixTimestamp: Date.now(),
      level: event.level || 'info',
      category: event.category || 'general',
      action: event.action,
      runId: event.runId || this.currentRunId,
      promptId: event.promptId || this.currentPromptId,
      policyId: event.policyId || this.currentPolicyId,
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
        runId: event.runId || this.currentRunId,
        promptId: event.promptId || this.currentPromptId,
        policyId: event.policyId || this.currentPolicyId,
      },
      result: {
        success: event.success !== false,
        errorCode: event.errorCode,
        errorMessage: event.errorMessage,
      },
      chain: {
        previousHash: this.previousHash,
        entryHash: this.computeEntryHash(entryData),
      },
    };

    this.previousHash = entryData.chain.entryHash;
    this.chainHashes.push(entryData.chain.entryHash);

    return entryData;
  }

  computeEntryHash(entry) {
    const dataToHash = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      runId: entry.runId,
      details: entry.details,
    });
    return crypto.createHash('sha256').update(dataToHash).digest('hex');
  }

  verifyChainIntegrity(entries) {
    let previousHash = null;
    
    for (const entry of entries) {
      if (!entry.chain) {
        return { valid: false, brokenAt: entry.id, reason: 'Missing chain data' };
      }

      if (previousHash && entry.chain.previousHash !== previousHash) {
        return { valid: false, brokenAt: entry.id, reason: 'Chain link broken' };
      }

      const computedHash = this.computeEntryHash(entry);
      if (computedHash !== entry.chain.entryHash) {
        return { valid: false, brokenAt: entry.id, reason: 'Entry hash mismatch' };
      }

      previousHash = entry.chain.entryHash;
    }

    return { valid: true };
  }

  getChainHashes() {
    return [...this.chainHashes];
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

  async generateComplianceEvidenceBundle(options = {}) {
    const {
      framework = 'SOC2',
      startDate,
      endDate,
      tenantId = null,
      includeChainVerification = true,
    } = options;

    const logs = await this.query({
      startDate,
      endDate,
      tenantId,
    });

    const chainVerification = includeChainVerification 
      ? this.verifyChainIntegrity(logs)
      : null;

    const evidenceBundle = {
      metadata: {
        framework,
        period: { start: startDate, end: endDate },
        generatedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
        tenantId,
      },
      chainIntegrity: chainVerification,
      evidence: {},
    };

    switch (framework.toUpperCase()) {
      case 'SOC2':
        evidenceBundle.evidence = this.generateSOC2Evidence(logs);
        break;
      case 'HIPAA':
        evidenceBundle.evidence = this.generateHIPAACEvidence(logs);
        break;
      case 'GDPR':
        evidenceBundle.evidence = this.generateGDPREvidence(logs);
        break;
      default:
        evidenceBundle.evidence = this.generateSOC2Evidence(logs);
    }

    evidenceBundle.signature = this.signEvidenceBundle(evidenceBundle);

    return evidenceBundle;
  }

  generateSOC2Evidence(logs) {
    return {
      accessControls: logs.filter(l => l.category === 'authentication'),
      dataProtection: logs.filter(l => l.category === 'security' || l.action === 'issue_suppressed'),
      auditTrails: logs.filter(l => l.category === 'analysis' || l.category === 'policy'),
      changeManagement: logs.filter(l => l.action.includes('fix_')),
    };
  }

  generateHIPAACEvidence(logs) {
    return {
      privacyAccess: logs.filter(l => l.action === 'user_login' || l.action === 'user_logout'),
      dataBreachNotification: logs.filter(l => l.category === 'security' && l.level === 'error'),
      auditLogging: logs.filter(l => l.category === 'analysis'),
      patientDataAccess: logs.filter(l => l.details?.patientData),
    };
  }

  generateGDPREvidence(logs) {
    return {
      dataSubjectAccess: logs.filter(l => l.action === 'user_login'),
      dataProcessing: logs.filter(l => l.category === 'security'),
      consentManagement: logs.filter(l => l.action === 'consent'),
      breachNotification: logs.filter(l => l.level === 'error'),
    };
  }

  signEvidenceBundle(bundle) {
    const dataToSign = JSON.stringify({
      metadata: bundle.metadata,
      evidence: bundle.evidence,
    });
    return crypto.createHash('sha256').update(dataToSign).digest('hex');
  }

  async exportEvidenceBundle(bundle, outputPath) {
    await fs.writeFile(outputPath, JSON.stringify(bundle, null, 2), 'utf8');
    return outputPath;
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

  async logAnalysisStageCompleted(runId, stageName, duration, issueCount, details = {}) {
    return this.log({
      category: 'analysis',
      action: 'analysis_stage_completed',
      runId,
      details: { stageName, duration, issueCount, ...details },
      success: true,
      level: 'info',
    });
  }

  async logPolicyGateFailed(runId, policyId, policyName, violations, score, details = {}) {
    return this.log({
      category: 'policy',
      action: 'policy_gate_failed',
      runId,
      policyId,
      details: { policyName, violations, score, ...details },
      success: false,
      level: 'warn',
    });
  }

  async logIssueSuppressed(runId, issueId, analyzer, type, reason, suppressionCategory, details = {}) {
    return this.log({
      category: 'analysis',
      action: 'issue_suppressed',
      runId,
      details: { issueId, analyzer, type, reason, suppressionCategory, ...details },
      success: true,
      level: 'info',
    });
  }

  getSchemaVersion() {
    return SCHEMA_VERSION;
  }

  async logFixGenerated(runId, fixId, issueId, issueType, confidence, details = {}) {
    return this.log({
      category: 'remediation',
      action: 'fix_generated',
      runId,
      details: { fixId, issueId, issueType, confidence, ...details },
      success: true,
      level: 'info',
    });
  }

  async logFixValidated(runId, fixId, isValid, errors, warnings, details = {}) {
    return this.log({
      category: 'remediation',
      action: 'fix_validated',
      runId,
      details: { fixId, isValid, errors, warnings, ...details },
      success: isValid,
      level: isValid ? 'info' : 'warn',
    });
  }

  async logFixRejected(runId, fixId, reason, details = {}) {
    return this.log({
      category: 'remediation',
      action: 'fix_rejected',
      runId,
      details: { fixId, reason, ...details },
      success: false,
      level: 'warn',
    });
  }

  async logFixAccepted(runId, fixId, issueId, details = {}) {
    return this.log({
      category: 'remediation',
      action: 'fix_accepted',
      runId,
      details: { fixId, issueId, ...details },
      success: true,
      level: 'info',
    });
  }

  async logWaiverCreated(runId, waiverId, issueId, justification, expiresAt, details = {}) {
    return this.log({
      category: 'policy',
      action: 'waiver_created',
      runId,
      details: { waiverId, issueId, justification, expiresAt, ...details },
      success: true,
      level: 'info',
    });
  }

  async generateRemediationReport(startDate, endDate, tenantId = null) {
    const logs = await this.query({
      startDate,
      endDate,
      tenantId,
      category: 'remediation',
    });

    const report = {
      period: { start: startDate, end: endDate },
      generatedAt: new Date().toISOString(),
      summary: {
        totalRemediationEvents: logs.length,
        fixesGenerated: 0,
        fixesValidated: 0,
        fixesRejected: 0,
        fixesAccepted: 0,
      },
      byIssueType: {},
      acceptanceRate: 0,
      mttr: null,
    };

    for (const log of logs) {
      if (log.action === 'fix_generated') report.summary.fixesGenerated++;
      if (log.action === 'fix_validated') report.summary.fixesValidated++;
      if (log.action === 'fix_rejected') report.summary.fixesRejected++;
      if (log.action === 'fix_accepted') report.summary.fixesAccepted++;

      const issueType = log.details?.issueType || 'unknown';
      report.byIssueType[issueType] = (report.byIssueType[issueType] || 0) + 1;
    }

    const totalCompleted = report.summary.fixesAccepted + report.summary.fixesRejected;
    if (totalCompleted > 0) {
      report.acceptanceRate = ((report.summary.fixesAccepted / totalCompleted) * 100).toFixed(2);
    }

    const criticalLogs = logs.filter(l => 
      l.details?.severity === 'critical' && l.action === 'fix_accepted'
    );
    
    if (criticalLogs.length > 0) {
      const times = criticalLogs.map(l => l.unixTimestamp).sort((a, b) => a - b);
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      report.mttr = {
        criticalIssuesFixed: criticalLogs.length,
        averageTimeToFix: `${Math.round(avgTime / 60000)} minutes`,
      };
    }

    return report;
  }
}

export default AuditLogger;
