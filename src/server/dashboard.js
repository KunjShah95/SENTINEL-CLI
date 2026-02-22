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

    this.app.get('/api/trends', (req, res) => {
      const { period = '7d', analyzer = null } = req.query;
      const trends = this.calculateTrends(period, analyzer);
      res.json(trends);
    });

    this.app.get('/api/trends/sevities', (req, res) => {
      const { period = '30d' } = req.query;
      const trends = this.getSeverityTrends(period);
      res.json(trends);
    });

    this.app.get('/api/trends/remediation', (req, res) => {
      const { period = '30d' } = req.query;
      const trends = this.getRemediationTrends(period);
      res.json(trends);
    });

    this.app.get('/api/trends/confidence', (req, res) => {
      const trends = this.getConfidenceTrends();
      res.json(trends);
    });

    this.app.get('/api/trends/compliance', (req, res) => {
      const { period = '30d' } = req.query;
      const trends = this.getComplianceTrends(period);
      res.json(trends);
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

  calculateTrends(period = '7d', analyzer = null) {
    const days = parseInt(period) || 7;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const filtered = this.analysisHistory.filter(a => 
      a.timestamp > cutoff && (!analyzer || a.analyzer === analyzer)
    );

    const dailyData = {};
    
    for (const analysis of filtered) {
      const date = new Date(analysis.timestamp).toISOString().split('T')[0];
      
      if (!dailyData[date]) {
        dailyData[date] = { issues: 0, fixes: 0, scans: 0 };
      }
      
      dailyData[date].issues += analysis.results?.issues || 0;
      dailyData[date].fixes += analysis.results?.fixes || 0;
      dailyData[date].scans += 1;
    }

    const trendData = Object.entries(dailyData).map(([date, data]) => ({
      date,
      ...data,
    })).sort((a, b) => a.date.localeCompare(b.date));

    const totalIssues = trendData.reduce((sum, d) => sum + d.issues, 0);
    const totalFixes = trendData.reduce((sum, d) => sum + d.fixes, 0);
    const avgDaily = totalIssues / Math.max(trendData.length, 1);

    const firstHalf = trendData.slice(0, Math.floor(trendData.length / 2));
    const secondHalf = trendData.slice(Math.floor(trendData.length / 2));
    const firstAvg = firstHalf.reduce((s, d) => s + d.issues, 0) / Math.max(firstHalf.length, 1);
    const secondAvg = secondHalf.reduce((s, d) => s + d.issues, 0) / Math.max(secondHalf.length, 1);
    
    const trend = secondAvg > firstAvg ? 'increasing' : secondAvg < firstAvg ? 'decreasing' : 'stable';
    const changePercent = firstAvg > 0 ? (((secondAvg - firstAvg) / firstAvg) * 100).toFixed(1) : 0;

    return {
      period: `${days}d`,
      analyzer,
      data: trendData,
      summary: {
        totalIssues,
        totalFixes,
        avgDaily,
        trend,
        changePercent: `${changePercent}%`,
      },
    };
  }

  getSeverityTrends(period = '30d') {
    const days = parseInt(period) || 30;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    
    for (const analysis of this.analysisHistory) {
      if (analysis.timestamp > cutoff && analysis.results?.bySeverity) {
        for (const [sev, count] of Object.entries(analysis.results.bySeverity)) {
          severityCounts[sev] = (severityCounts[sev] || 0) + count;
        }
      }
    }

    const total = Object.values(severityCounts).reduce((a, b) => a + b, 0);
    const breakdown = Object.entries(severityCounts).map(([severity, count]) => ({
      severity,
      count,
      percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0,
    }));

    return {
      period: `${days}d`,
      total,
      bySeverity: severityCounts,
      breakdown,
    };
  }

  getRemediationTrends(period = '30d') {
    const days = parseInt(period) || 30;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    let generated = 0, validated = 0, accepted = 0, rejected = 0;
    
    for (const analysis of this.analysisHistory) {
      if (analysis.timestamp > cutoff && analysis.results) {
        generated += analysis.results.fixesGenerated || 0;
        validated += analysis.results.fixesValidated || 0;
        accepted += analysis.results.fixesAccepted || 0;
        rejected += analysis.results.fixesRejected || 0;
      }
    }

    const acceptanceRate = (generated + validated) > 0 
      ? (((accepted) / (accepted + rejected)) * 100).toFixed(1)
      : 0;

    return {
      period: `${days}d`,
      summary: { generated, validated, accepted, rejected, acceptanceRate: `${acceptanceRate}%` },
      chart: [
        { label: 'Generated', value: generated, color: '#3b82f6' },
        { label: 'Validated', value: validated, color: '#10b981' },
        { label: 'Accepted', value: accepted, color: '#22c55e' },
        { label: 'Rejected', value: rejected, color: '#ef4444' },
      ],
    };
  }

  getConfidenceTrends() {
    const byAnalyzer = {};
    
    for (const analysis of this.analysisHistory) {
      if (analysis.results?.avgConfidence) {
        const analyzer = analysis.analyzer || 'overall';
        if (!byAnalyzer[analyzer]) {
          byAnalyzer[analyzer] = { total: 0, count: 0 };
        }
        byAnalyzer[analyzer].total += analysis.results.avgConfidence;
        byAnalyzer[analyzer].count += 1;
      }
    }

    const trends = Object.entries(byAnalyzer).map(([analyzer, data]) => ({
      analyzer,
      avgConfidence: (data.total / data.count).toFixed(2),
      sampleSize: data.count,
    }));

    return {
      timestamp: new Date().toISOString(),
      byAnalyzer: trends,
    };
  }

  getComplianceTrends(period = '30d') {
    const days = parseInt(period) || 30;
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    let compliant = 0, nonCompliant = 0;
    let totalScore = 0, count = 0;
    
    for (const analysis of this.analysisHistory) {
      if (analysis.timestamp > cutoff && analysis.results?.policyResult) {
        if (analysis.results.policyResult.compliant) compliant++;
        else nonCompliant++;
        
        totalScore += analysis.results.policyResult.score || 0;
        count++;
      }
    }

    return {
      period: `${days}d`,
      summary: {
        compliant,
        nonCompliant,
        complianceRate: (compliant + nonCompliant) > 0 
          ? ((compliant / (compliant + nonCompliant)) * 100).toFixed(1)
          : 100,
        avgScore: count > 0 ? (totalScore / count).toFixed(1) : 100,
      },
    };
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
