import { Hono } from 'hono';
import { listSessionFiles, readSessionFile } from '../../database/session-logger.js';

const viewer = new Hono();

const HTML_HEAD = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sentinel Sessions</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
  h1 { color: #58a6ff; margin-bottom: 16px; }
  h2 { color: #8b949e; font-size: 16px; margin: 20px 0 8px; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .session-list { list-style: none; }
  .session-item { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; }
  .session-item:hover { border-color: #58a6ff; }
  .session-id { font-size: 14px; color: #c9d1d9; }
  .session-meta { font-size: 12px; color: #8b949e; margin-top: 4px; }
  .session-meta span { margin-right: 16px; }
  .record { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 12px 16px; margin-bottom: 8px; }
  .record-type { font-weight: 600; font-size: 13px; text-transform: uppercase; }
  .record-type.llm_request { color: #d29922; }
  .record-type.llm_response { color: #3fb950; }
  .record-type.llm_error { color: #f85149; }
  .record-type.tool_call { color: #58a6ff; }
  .record-type.session_start { color: #8b949e; }
  .record-type.session_end { color: #8b949e; }
  .record-time { font-size: 11px; color: #484f58; float: right; }
  .record-detail { font-size: 13px; margin-top: 6px; color: #8b949e; }
  pre { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 8px; margin-top: 6px; overflow-x: auto; font-size: 12px; color: #c9d1d9; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: #1f6f31; color: #7ee787; }
  .badge.err { background: #6e1f1f; color: #ff7b72; }
  .back { margin-bottom: 16px; display: inline-block; }
  .repo-path { font-size: 14px; color: #8b949e; margin-bottom: 16px; }
</style></head><body>\n`;

const HTML_FOOT = '</body></html>';

viewer.get('/', async c => {
  const repoPath = process.cwd();
  const sessions = await listSessionFiles(repoPath);
  const repoName = repoPath.split(/[/\\]/).pop() || 'unknown';

  let html = HTML_HEAD +
    '<h1>Sentinel Session Viewer</h1>' +
    `<div class="repo-path">${repoName}</div>`;

  if (sessions.length === 0) {
    html += '<p>No sessions found.</p>';
  } else {
    html += `<h2>${sessions.length} session(s)</h2><ul class="session-list">`;
    for (const s of sessions) {
      const startDate = s.startTime ? new Date(s.startTime).toLocaleString() : 'unknown';
      html += `<li class="session-item">
        <a href="/viewer/${s.sessionId}"><span class="session-id">${s.sessionId.slice(0, 16)}...</span></a>
        <div class="session-meta">
          <span>${startDate}</span>
          <span>branch: ${s.branch || '?'}</span>
          <span>${s.totalMessages} messages</span>
          <span>${s.totalToolCalls} tool calls</span>
        </div>
      </li>`;
    }
    html += '</ul>';
  }

  html += HTML_FOOT;
  return c.html(html);
});

viewer.get('/:sessionId', async c => {
  const sessionId = c.req.param('sessionId');
  const repoPath = process.cwd();
  const records = await readSessionFile(sessionId, repoPath);

  if (records.length === 0) {
    return c.html(HTML_HEAD + '<a href="/viewer" class="back">&larr; Back</a><h2>Session not found</h2>' + HTML_FOOT);
  }

  let html = HTML_HEAD +
    '<a href="/viewer" class="back">&larr; Back to sessions</a>' +
    `<h1>Session: ${sessionId.slice(0, 16)}...</h1>` +
    `<div class="repo-path">${records.length} records</div>`;

  for (const record of records) {
    const time = record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : '?';
    html += '<div class="record">' +
      '<span class="record-type ' + record.type + '">' + record.type + '</span>' +
      '<span class="record-time">' + time + '</span>';

    switch (record.type) {
    case 'llm_request':
      html += `<div class="record-detail">Model: ${record.model || '?'} | Tools: ${(record.tools || []).join(', ') || 'none'} | MaxTokens: ${record.maxTokens || '?'}</div>`;
      if (record.messages) {
        html += `<pre>${record.messages.map(m => `[${m.role}] ${(m.content || '').slice(0, 300)}`).join('\n')}</pre>`;
      }
      break;
    case 'llm_response':
      html += `<div class="record-detail">Usage: ${JSON.stringify(record.usage)} | Duration: ${record.duration ? (record.duration / 1000).toFixed(1) + 's' : '?'} | Finish: ${record.finishReason}</div>`;
      break;
    case 'llm_error':
      html += `<div class="record-detail">Error: ${record.error} (${record.code})</div>`;
      break;
    case 'tool_call':
      html += `<div class="record-detail">Tool: ${record.toolName} <span class="badge ${record.success ? 'ok' : 'err'}">${record.success ? 'OK' : 'FAIL'}</span>${record.duration ? ' (' + record.duration + 'ms)' : ''}</div>`;
      if (record.args) html += `<pre>${JSON.stringify(JSON.parse(record.args || '{}'), null, 2).slice(0, 500)}</pre>`;
      break;
    case 'session_start':
      html += `<div class="record-detail">Branch: ${record.branch || '?'} | Repo: ${record.repoPath || '?'}</div>`;
      break;
    case 'session_end':
      html += `<div class="record-detail">Duration: ${record.duration || '?'} | Messages: ${record.totalMessages || 0} | Tool calls: ${record.totalToolCalls || 0} | Errors: ${record.totalErrors || 0}</div>`;
      break;
    }
    html += '</div>';
  }

  html += HTML_FOOT;
  return c.html(html);
});

export default viewer;
