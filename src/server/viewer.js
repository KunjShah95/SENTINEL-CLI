/**
 * Session Viewer — local web interface for browsing review history
 * and LLM request/response traces.
 *
 * Inspired by open-code-review's `ocr viewer` command that launches
 * a WebUI on localhost:5483.
 */

import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sentinel Viewer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  .header { background: #1e293b; padding: 16px 24px; border-bottom: 1px solid #334155;
            display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 18px; font-weight: 600; color: #38bdf8; }
  .header .port { color: #64748b; font-size: 12px; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px;
          padding: 16px; margin-bottom: 12px; cursor: pointer; }
  .card:hover { border-color: #38bdf8; }
  .card .time { color: #64748b; font-size: 12px; }
  .card .summary { display: flex; gap: 16px; margin-top: 8px; }
  .card .stat { font-size: 13px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px;
           font-size: 11px; font-weight: 600; }
  .badge.critical { background: #dc2626; color: white; }
  .badge.high { background: #ea580c; color: white; }
  .badge.medium { background: #ca8a04; color: white; }
  .badge.low { background: #2563eb; color: white; }
  .empty { text-align: center; padding: 48px; color: #64748b; }
  .empty h2 { font-size: 24px; margin-bottom: 8px; }
  pre { background: #0f172a; padding: 16px; border-radius: 6px; overflow-x: auto;
        font-size: 13px; margin-top: 12px; }
  .detail-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .btn { background: #334155; border: none; color: #e2e8f0; padding: 8px 16px;
         border-radius: 6px; cursor: pointer; font-size: 13px; }
  .btn:hover { background: #475569; }
  .tab-bar { display: flex; gap: 4px; margin-bottom: 16px; }
  .tab { padding: 8px 16px; border-radius: 6px 6px 0 0; cursor: pointer; font-size: 13px;
         background: #1e293b; border: 1px solid #334155; border-bottom: none; color: #94a3b8; }
  .tab.active { background: #334155; color: #38bdf8; }
  .tab:hover { color: #e2e8f0; }
</style>
</head>
<body>
<div class="header">
  <h1>🛡️ Sentinel Viewer</h1>
  <span class="port" id="port"></span>
</div>
<div class="container" id="app">
  <div class="empty"><h2>Loading...</h2></div>
</div>
<script>
const BASE = '';
async function load() {
  const app = document.getElementById('app');
  try {
    const res = await fetch(BASE + '/api/sessions');
    const data = await res.json();
    if (data.sessions.length === 0) {
      app.innerHTML = '<div class="empty"><h2>No review sessions</h2><p>Run <code>sentinel review</code> to create one.</p></div>';
      return;
    }
    app.innerHTML = data.sessions.map(s => '<div class="card" onclick="showDetail('\\'' + s.id + '\\'')">' +
      '<div class="time">' + s.timestamp + ' — ' + (s.duration || '?') + 'ms</div>' +
      '<div class="summary">' +
        '<span class="stat">📁 ' + s.files + ' files</span>' +
        '<span class="stat">🔍 ' + s.issues + ' issues</span>' +
        '<span class="stat">⚡ ' + s.analyzer + '</span>' +
      '</div></div>').join('');
  } catch (e) {
    app.innerHTML = '<div class="empty"><h2>Error loading sessions</h2><p>' + e.message + '</p></div>';
  }
}
async function showDetail(id) {
  const app = document.getElementById('app');
  try {
    const res = await fetch(BASE + '/api/sessions/' + id);
    const s = await res.json();
    app.innerHTML = '<div class="detail-header">' +
      '<h2>Session: ' + id.slice(0, 12) + '...</h2>' +
      '<button class="btn" onclick="load()">← Back</button></div>' +
      '<div class="tab-bar">' +
        '<div class="tab active" onclick="showTab(this, \\'overview\\')">Overview</div>' +
        '<div class="tab" onclick="showTab(this, \\'issues\\')">Issues</div>' +
        '<div class="tab" onclick="showTab(this, \\'traces\\')">LLM Traces</div>' +
      '</div>' +
      '<div id="tab-content"><pre>' + JSON.stringify(s, null, 2) + '</pre></div>';
  } catch (e) {
    app.innerHTML = '<div class="empty"><h2>Error</h2><p>' + e.message + '</p></div>';
  }
}
function showTab(el, tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const tc = document.getElementById('tab-content');
  const data = window.__detailData || {};
  if (tab === 'overview') tc.innerHTML = '<pre>' + JSON.stringify(data.overview || data, null, 2) + '</pre>';
  else if (tab === 'issues') tc.innerHTML = '<pre>' + JSON.stringify(data.issues || [], null, 2) + '</pre>';
  else tc.innerHTML = '<pre>' + JSON.stringify(data.traces || [], null, 2) + '</pre>';
}
load();
document.getElementById('port').textContent = ':' + window.location.port;
</script>
</body>
</html>`;

export class SessionViewer {
  constructor(options = {}) {
    this.port = options.port || 5483;
    this.host = options.host || '127.0.0.1';
    this.sessionsDir = options.sessionsDir || join(process.cwd(), '.sentinel', 'sessions');
    this.server = null;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        const url = new URL(req.url, `http://${this.host}:${this.port}`);

        res.setHeader('Access-Control-Allow-Origin', '*');

        if (url.pathname === '/api/sessions' || url.pathname === '/api/sessions/') {
          this._handleListSessions(req, res);
        } else if (url.pathname.startsWith('/api/sessions/')) {
          const id = url.pathname.replace('/api/sessions/', '');
          this._handleGetSession(id, req, res);
        } else {
          this._serveHtml(res);
        }
      });

      this.server.listen(this.port, this.host, () => {
        resolve(`http://${this.host}:${this.port}`);
      });
    });
  }

  async stop() {
    if (this.server) {
      await new Promise(r => this.server.close(r));
      this.server = null;
    }
  }

  // ─── Private handlers ──────────────────────────────────────────────────

  _serveHtml(res) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  }

  _json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  _handleListSessions(_req, res) {
    if (!existsSync(this.sessionsDir)) {
      return this._json(res, { sessions: [] });
    }

    try {
      const entries = readdirSync(this.sessionsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const fp = join(this.sessionsDir, f);
          const stat = statSync(fp);
          return { id: f.replace('.json', ''), path: fp, mtime: stat.mtime };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        .slice(0, 50);

      const sessions = entries.map(e => {
        try {
          const content = JSON.parse(readFileSync(e.path, 'utf-8'));
          return {
            id: e.id,
            timestamp: content.timestamp || e.mtime.toISOString(),
            files: content.files || content.filesAnalyzed || 0,
            issues: content.issues?.length || content.totalIssues || 0,
            analyzer: content.analyzer || content.mode || 'review',
            duration: content.duration || content.stageMetrics ?
              Object.values(content.stageMetrics || {}).reduce((s, m) => s + (m.duration || 0), 0) : null,
          };
        } catch {
          return null;
        }
      }).filter(Boolean);

      this._json(res, { sessions });
    } catch {
      this._json(res, { sessions: [], error: 'Failed to read sessions directory' });
    }
  }

  _handleGetSession(id, _req, res) {
    // Prevent path traversal
    if (!/^[\w-]+$/.test(id)) {
      return this._json(res, { error: 'Invalid session ID' }, 400);
    }
    const filePath = join(this.sessionsDir, `${id}.json`);
    if (!existsSync(filePath)) {
      return this._json(res, { error: 'Session not found' }, 404);
    }

    try {
      const content = JSON.parse(readFileSync(filePath, 'utf-8'));
      this._json(res, content);
    } catch (e) {
      this._json(res, { error: `Failed to parse session: ${e.message}` }, 500);
    }
  }
}

export default SessionViewer;

/**
 * Record a review session to disk for later viewing.
 */
export function recordSession(sessionDir, data) {
  try {
    const dir = sessionDir || join(process.cwd(), '.sentinel', 'sessions');
    mkdirSync(dir, { recursive: true });
    const id = `session_${Date.now()}`;
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({
      ...data,
      _recordedAt: new Date().toISOString(),
      _id: id,
    }, null, 2), 'utf-8');
    return id;
  } catch {
    return null;
  }
}
