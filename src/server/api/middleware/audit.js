/**
 * Audit logging middleware — wires the production AuditLogger into Hono routes.
 *
 * Automatically logs:
 * - All authenticated requests (user, method, path, status, duration)
 * - Security events (failed auth, rate limit hits)
 * - Data access (session reads/writes, chat messages)
 * - Configuration changes
 *
 * The AuditLogger provides hash-chained entries, PII redaction,
 * JSONL file output, and compliance reports (SOC2, HIPAA, GDPR).
 */

import { createMiddleware } from 'hono/factory';
import AuditLogger from '../../../core/audit/auditLogger.js';

// Singleton audit logger instance for the server
let auditLogger = null;

/**
 * Get or create the server audit logger.
 * @param {object} [options] - AuditLogger options
 * @returns {AuditLogger}
 */
export function getAuditLogger(options) {
  if (!auditLogger) {
    auditLogger = new AuditLogger({
      logDir: '.sentinel/audit',
      enableConsole: process.env.NODE_ENV !== 'test',
      enableFile: true,
      enableWebhook: !!process.env.AUDIT_WEBHOOK_URL,
      webhookUrl: process.env.AUDIT_WEBHOOK_URL,
      bufferSize: 50,
      flushInterval: 3000,
      ...options,
    });
  }
  return auditLogger;
}

/**
 * Reset the audit logger (for testing).
 */
export function resetAuditLogger() {
  if (auditLogger) {
    auditLogger.flush().catch(() => {});
  }
  auditLogger = null;
}

/**
 * Hono middleware — logs every request as an audit event.
 */
export function auditMiddleware() {
  return createMiddleware(async (c, next) => {
    const start = Date.now();
    const logger = getAuditLogger();
    const requestId = c.get('requestId') || `req_${Date.now()}`;

    // Extract user info from auth context (if available)
    const userId = c.get('userId') || c.get('authUserId') || null;
    const userEmail = c.get('userEmail') || null;

    await next();

    const duration = Date.now() - start;
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    const status = c.res.status;

    // Determine category based on path
    let category = 'api';
    if (path.startsWith('/auth')) category = 'authentication';
    else if (path.startsWith('/sessions')) category = 'data_access';
    else if (path.startsWith('/chat')) category = 'data_access';
    else if (path.startsWith('/webhook')) category = 'webhook';
    else if (path.startsWith('/billing')) category = 'billing';
    else if (path.startsWith('/health')) category = 'health';

    // Determine action
    let action = `${method.toLowerCase()}_${path.replace(/\//g, '_').replace(/^_/, '')}`;
    if (category === 'authentication') {
      if (path.includes('login')) action = 'user_login';
      else if (path.includes('logout')) action = 'user_logout';
      else if (path.includes('register')) action = 'user_register';
    }

    // Log at appropriate level
    let level = 'info';
    if (status >= 400 && status < 500) level = 'warn';
    if (status >= 500) level = 'error';
    if (status === 401 || status === 403) level = 'security';

    // Don't audit health checks (too noisy)
    if (category === 'health') return;

    logger.log({
      category,
      action,
      userId,
      userEmail,
      ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
      userAgent: c.req.header('user-agent')?.slice(0, 200),
      resourceType: path.split('/')[1] || 'api',
      resourceId: path.split('/')[2] || null,
      details: {
        method,
        path,
        status,
        duration,
      },
      success: status < 400,
      errorCode: status >= 400 ? `HTTP_${status}` : null,
      level,
      requestId,
      sessionId: c.get('sessionId') || null,
    }).catch(() => {}); // Non-blocking
  });
}

/**
 * Helper to log specific security events from route handlers.
 */
export function logSecurityEvent(eventType, details, c) {
  const logger = getAuditLogger();
  return logger.logSecurityEvent(
    c?.get('userId') || null,
    eventType,
    details,
    c?.req.header('x-forwarded-for') || c?.req.header('x-real-ip') || 'unknown'
  );
}

/**
 * Helper to log data access from route handlers.
 */
export function logDataAccess(resourceType, resourceId, action, c) {
  const logger = getAuditLogger();
  return logger.logDataAccess(
    c?.get('userId') || null,
    resourceType,
    resourceId,
    action,
    c?.req.header('x-forwarded-for') || c?.req.header('x-real-ip') || 'unknown'
  );
}
