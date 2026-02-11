import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class SentinelDashboard {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || 'localhost';
    this.app = express();
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.analysisHistory = [];
    this.analyzers = new Map();
  }

  async start() {
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();

    this.server = createServer(this.app);
    this.server.listen(this.port, this.host, () => {
      console.log(`🚀 Sentinel Dashboard running at http://${this.host}:${this.port}`);
      console.log(`📊 WebSocket server ready for real-time updates`);
    });

    return this;
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(join(__dirname, '../../frontend/build')));
  }

  setupRoutes() {
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.8.0',
      });
    });

    this.app.get('/api/analyses', (req, res) => {
      res.json({
        analyses: this.analysisHistory.slice(-100),
        total: this.analysisHistory.length,
      });
    });

    this.app.get('/api/analyses/:id', (req, res) => {
      const analysis = this.analysisHistory.find(a => a.id === req.params.id);
      if (analysis) {
        res.json(analysis);
      } else {
        res.status(404).json({ error: 'Analysis not found' });
      }
    });

    this.app.get('/api/analyzers', (req, res) => {
      const analyzers = Array.from(this.analyzers.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        enabled: data.enabled,
        version: data.version,
        categories: data.categories,
      }));
      res.json({ analyzers });
    });

    this.app.get('/api/metrics', (req, res) => {
      res.json({
        clients: this.clients.size,
        analysesCount: this.analysisHistory.length,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      });
    });

    this.app.get('/api/issues/stats', (req, res) => {
      const stats = this.calculateIssueStats();
      res.json(stats);
    });

    this.app.post('/api/analyze', async (req, res) => {
      const { target, options } = req.body;

      try {
        const analysisId = await this.startAnalysis(target, options);
        res.json({ analysisId, status: 'started' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/config', (req, res) => {
      res.json({
        port: this.port,
        host: this.host,
        features: {
          websocket: true,
          realTimeUpdates: true,
        },
      });
    });

    this.app.get('*', (req, res) => {
      res.sendFile(join(__dirname, '../../frontend/build/index.html'));
    });
  }

  setupWebSocket() {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log(`Client connected. Total: ${this.clients.size}`);

      ws.on('message', (message) => {
        this.handleWebSocketMessage(ws, message);
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`Client disconnected. Total: ${this.clients.size}`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
      }));
    });
  }

  handleWebSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'subscribe':
          ws.subscriptions = data.channels || [];
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  async startAnalysis(target, options = {}) {
    const analysisId = `analysis_${Date.now()}`;

    const analysis = {
      id: analysisId,
      target,
      options,
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      results: null,
    };

    this.analysisHistory.push(analysis);

    this.broadcast({
      type: 'analysis:started',
      analysis,
    });

    setTimeout(() => this.completeAnalysis(analysisId), 1000);

    return analysisId;
  }

  async completeAnalysis(analysisId) {
    const analysis = this.analysisHistory.find(a => a.id === analysisId);
    if (!analysis) return;

    analysis.status = 'completed';
    analysis.completedAt = new Date().toISOString();
    analysis.progress = 100;
    analysis.results = {
      issues: Math.floor(Math.random() * 50),
      analyzers: 12,
      files: Math.floor(Math.random() * 200),
    };

    this.broadcast({
      type: 'analysis:completed',
      analysis,
    });

    this.broadcast({
      type: 'stats:updated',
      stats: this.calculateIssueStats(),
    });
  }

  calculateIssueStats() {
    const stats = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      total: 0,
      byCategory: {},
      trend: [],
    };

    for (const analysis of this.analysisHistory) {
      if (analysis.results) {
        stats.total += analysis.results.issues;
      }
    }

    return stats;
  }

  broadcast(message) {
    const data = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  registerAnalyzer(id, data) {
    this.analyzers.set(id, data);
    this.broadcast({
      type: 'analyzer:registered',
      analyzer: { id, ...data },
    });
  }

  async stop() {
    this.broadcast({ type: 'server:shuttingdown' });

    for (const client of this.clients) {
      client.close();
    }

    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
    }

    console.log('Dashboard stopped');
  }
}

export default SentinelDashboard;
