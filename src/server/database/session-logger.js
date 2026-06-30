import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const SESSIONS_DIR = path.join(os.homedir(), '.sentinel', 'sessions');

function encodeRepoPath(repoPath) {
  return repoPath.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // directory already exists
  }
}

export class SessionLogger {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.sessionId = options.sessionId || null;
    this.stream = null;
    this.filePath = null;
    this.enabled = options.enabled !== false;
  }

  async start(sessionId) {
    if (!this.enabled) return;
    this.sessionId = sessionId;
    const repoDir = encodeRepoPath(this.repoPath);
    const dir = path.join(SESSIONS_DIR, repoDir);
    await ensureDir(dir);
    this.filePath = path.join(dir, `${sessionId}.jsonl`);
    await this._writeRecord({
      type: 'session_start',
      timestamp: new Date().toISOString(),
      sessionId,
      repoPath: this.repoPath,
      cwd: process.cwd(),
      branch: await this._getGitBranch(),
    });
  }

  async logLLMRequest(request) {
    if (!this.enabled || !this.sessionId) return;
    await this._writeRecord({
      type: 'llm_request',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      model: request.model,
      messages: request.messages?.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content.slice(0, 2000) : JSON.stringify(m.content).slice(0, 2000),
        tool_calls: m.tool_calls?.length || 0,
      })),
      tools: request.tools?.map(t => t.name || t.function?.name) || [],
      maxTokens: request.maxTokens,
    });
  }

  async logLLMResponse(response) {
    if (!this.enabled || !this.sessionId) return;
    await this._writeRecord({
      type: 'llm_response',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      model: response.model,
      usage: response.usage || {},
      duration: response.duration,
      contentLength: (response.content || '').length,
      toolCalls: response.toolCalls?.length || 0,
      finishReason: response.finishReason || 'unknown',
    });
  }

  async logLLMError(error) {
    if (!this.enabled || !this.sessionId) return;
    await this._writeRecord({
      type: 'llm_error',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      error: error.message || String(error),
      code: error.code || 'UNKNOWN',
    });
  }

  async logToolCall(toolCall) {
    if (!this.enabled || !this.sessionId) return;
    await this._writeRecord({
      type: 'tool_call',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      toolName: toolCall.name || toolCall.toolName,
      args: JSON.stringify(toolCall.input || toolCall.args || {}).slice(0, 1000),
      duration: toolCall.duration,
      success: toolCall.error ? false : true,
      error: toolCall.error || undefined,
    });
  }

  async end(summary = {}) {
    if (!this.enabled || !this.sessionId) return;
    await this._writeRecord({
      type: 'session_end',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      duration: summary.duration,
      totalMessages: summary.totalMessages,
      totalToolCalls: summary.totalToolCalls,
      totalErrors: summary.totalErrors,
    });
    this.sessionId = null;
  }

  async _writeRecord(record) {
    try {
      await fs.appendFile(this.filePath, JSON.stringify(record) + '\n', 'utf-8');
    } catch {
      // ignore write errors
    }
  }

  async _getGitBranch() {
    try {
      const { execSync } = await import('child_process');
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.repoPath,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
    } catch {
      return 'unknown';
    }
  }
}

export async function listSessionFiles(repoPath) {
  const repoDir = encodeRepoPath(repoPath || process.cwd());
  const dir = path.join(SESSIONS_DIR, repoDir);
  try {
    const files = await fs.readdir(dir);
    const sessions = [];
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(dir, file);
      try {
        const firstLine = await readFirstLine(filePath);
        const lastLine = await readLastLine(filePath);
        const start = firstLine ? JSON.parse(firstLine) : null;
        const end = lastLine ? JSON.parse(lastLine) : null;
        sessions.push({
          sessionId: file.replace('.jsonl', ''),
          path: filePath,
          startTime: start?.timestamp || null,
          endTime: end?.timestamp || null,
          branch: start?.branch || null,
          totalMessages: end?.totalMessages || 0,
          totalToolCalls: end?.totalToolCalls || 0,
          totalErrors: end?.totalErrors || 0,
        });
      } catch {
        // skip unparseable session file
      }
    }
    return sessions.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
  } catch {
    return [];
  }
}

async function readFirstLine(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const firstNewline = content.indexOf('\n');
    return firstNewline === -1 ? content : content.slice(0, firstNewline);
  } catch {
    return null;
  }
}

async function readLastLine(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trimEnd().split('\n');
    return lines[lines.length - 1] || null;
  } catch {
    return null;
  }
}

export async function readSessionFile(sessionId, repoPath) {
  const repoDir = encodeRepoPath(repoPath || process.cwd());
  const filePath = path.join(SESSIONS_DIR, repoDir, `${sessionId}.jsonl`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.trimEnd().split('\n').map(line => JSON.parse(line));
  } catch {
    return [];
  }
}
