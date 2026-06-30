/**
 * Database helpers — small wrappers around the adapter for the
 * operations the Hono routes need.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from './adapter.js';

export async function createSession({ userId, title, mode = 'BUILD', model, projectPath }) {
  const db = await getDatabase();
  const now = new Date();
  return await db.createSession({
    id: randomUUID(),
    userId,
    title,
    mode,
    model: model || 'claude-sonnet-4-6',
    projectPath: projectPath || null,
    messages: [],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
}

export async function getSession({ id, userId }) {
  const db = await getDatabase();
  return await db.findSession(id, userId);
}

export async function listSessions({ userId }) {
  const db = await getDatabase();
  return await db.findSessions(userId);
}

export async function appendMessages({ id, userId, messages }) {
  const db = await getDatabase();
  const existing = await db.findSession(id, userId);
  if (!existing) return null;
  // Merge incoming messages with previous ones by id (replace existing, append new)
  const byId = new Map();
  for (const m of existing.messages || []) byId.set(m.id, m);
  for (const m of messages) byId.set(m.id, m);
  const merged = Array.from(byId.values());
  return await db.updateSession(id, userId, { messages: merged });
}

export async function updateSessionStatus({ id, userId, status }) {
  const db = await getDatabase();
  return await db.updateSession(id, userId, { status });
}

export async function deleteSession({ id, userId }) {
  const db = await getDatabase();
  return await db.deleteSession(id, userId);
}

export async function recordCredit({ userId, sessionId, credits, provider, model }) {
  const db = await getDatabase();
  if (typeof db.recordCreditEvent === 'function') {
    return await db.recordCreditEvent({
      id: randomUUID(),
      userId,
      sessionId,
      credits,
      provider,
      model,
    });
  }
  // JSON adapter has no credit table — log only.
  return null;
}

export async function getUsedCredits({ userId }) {
  const db = await getDatabase();
  if (typeof db.getUsedCredits === 'function') {
    return await db.getUsedCredits(userId);
  }
  return 0;
}
