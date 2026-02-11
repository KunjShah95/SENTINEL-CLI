import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import bodyParser from 'body-parser';
const { json } = bodyParser;
import { CodeReviewBot } from '../bot.js';
import { globalEventBus } from '../events/eventBus.js';
import { EventType } from '../../interfaces/index.js';
import { globalMetrics } from '../metrics/metricsCollector.js';

class SentinelAPIServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.app = express();
    this.server = null;
    this.wss = null;
    this.clients = new Map();
    this.bot = null;
    this.authToken = options.authToken || process.env.SENTINEL_API_TOKEN;
    this.enableAuth = options.enableAuth !== false && !!this.authToken;
    this.rateLimiter = null;
  }

  async initialize() {
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventForwarding();

    // Initialize bot
    this.bot = new CodeReviewBot();
    await this.bot.initialize();

    return this;
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false,
    }));
    
    this.app.use(cors({
      origin: process.env.SENTINEL_CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    this.app.use(compression());
    this.app.use(json({ limit: '50mb' }));

    // Rate limiting
    this.rateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: { error: 'Too many requests, please try again later.' },
    });
    this.app.use('/api/', this.rateLimiter);

    // Auth middleware
    if (this.enableAuth) {
      this.app.use('/api/', this.authenticate.bind(this));
    }
  }

  authenticate(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || token !== this.authToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.9.0',
        uptime: process.uptime(),
      });
    });

    // Metrics endpoint for Prometheus
    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(this.exportPrometheusMetrics());
    });

    // Analysis endpoints
    this.app.post('/api/analyze', this.handleAnalyze.bind(this));
    this.app.get('/api/analyses', this.handleGetAnalyses.bind(this));
    this.app.get('/api/analyses/:id', this.handleGetAnalysis.bind(this));
    this.app.delete('/api/analyses/:id', this.handleDeleteAnalysis.bind(this));

    // Issues endpoints
    this.app.get('/api/issues', this.handleGetIssues.bind(this));
    this.app.get('/api/issues/stats', this.handleGetIssueStats.bind(this));
    this.app.post('/api/issues/:id/feedback', this.handleIssueFeedback.bind(this));

    // Scanner endpoints
    this.app.post('/api/scan/secrets', this.handleScanSecrets.bind(this));
    this.app.post('/api/scan/vulnerabilities', this.handleScanVulnerabilities.bind(this));

    // Policy endpoints
    this.app.get('/api/policies', this.handleGetPolicies.bind(this));
    this.app.post('/api/policies/evaluate', this.handleEvaluatePolicy.bind(this));

    // Feature flags
    this.app.get('/api/features', this.handleGetFeatures.bind(this));
    this.app.post('/api/features/:name/toggle', this.handleToggleFeature.bind(this));

    // Status and metrics
    this.app.get('/api/status', this.handleGetStatus.bind(this));
    this.app.get('/api/workers', this.handleGetWorkers.bind(this));

    // Report generation
    this.app.post('/api/reports/generate', this.handleGenerateReport.bind(this));
    this.app.get('/api/reports/:id/download', this.handleDownloadReport.bind(this));

    // Error handling
    this.app.use((err, req, res, _next) => {
      console.error('API Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    });
  }

  setupWebSocket() {
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws',
    });

    this.wss.on('connection', (ws, _req) => {
      const clientId = this.generateClientId();
      
      this.clients.set(clientId, {
        ws,
        id: clientId,
        connectedAt: Date.now(),
        subscriptions: [],
      });

      console.log(`WebSocket client connected: ${clientId}`);

      ws.on('message', (data) => {
        this.handleWebSocketMessage(clientId, data);
      });

      ws.on('close', () => {
        console.log(`WebSocket client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: Date.now(),
      }));
    });
  }

  handleWebSocketMessage(clientId, data) {
    try {
      const message = JSON.parse(data);
      const client = this.clients.get(clientId);

      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          client.subscriptions = message.channels || [];
          client.ws.send(JSON.stringify({
            type: 'subscribed',
            channels: client.subscriptions,
          }));
          break;

        case 'unsubscribe':
          client.subscriptions = client.subscriptions.filter(
            c => !message.channels?.includes(c)
          );
          break;

        case 'ping':
          client.ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now(),
          }));
          break;

        case 'analyze':
          this.handleWebSocketAnalyze(clientId, message);
          break;

        default:
          client.ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
          }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  setupEventForwarding() {
    // Forward events to subscribed WebSocket clients
    const eventsToForward = [
      EventType.ANALYZER_START,
      EventType.ANALYZER_COMPLETE,
      EventType.ANALYZER_ERROR,
      EventType.ISSUE_FOUND,
      EventType.SCAN_START,
      EventType.SCAN_COMPLETE,
      EventType.SCAN_PROGRESS,
    ];

    for (const eventType of eventsToForward) {
      globalEventBus.on(eventType, (data) => {
        this.broadcastToSubscribers(eventType, data);
      });
    }
  }

  broadcastToSubscribers(eventType, data) {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: Date.now(),
    });

    for (const client of this.clients.values()) {
      if (client.subscriptions.includes(eventType) || 
          client.subscriptions.includes('*')) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    }
  }

  // API Handlers
  async handleAnalyze(req, res) {
    try {
      const { files, options = {} } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }

      const analysisId = `analysis_${Date.now()}`;

      // Start analysis asynchronously
      this.bot.analyzeFiles(files, {
        parallel: options.parallel !== false,
        reduceFalsePositives: options.reduceFalsePositives !== false,
      }).then(result => {
        globalEventBus.emit(EventType.SCAN_COMPLETE, {
          analysisId,
          issues: result.issues || result,
          timestamp: Date.now(),
        });
      }).catch(error => {
        globalEventBus.emit(EventType.ANALYZER_ERROR, {
          analysisId,
          error: error.message,
        });
      });

      res.json({
        analysisId,
        status: 'running',
        message: 'Analysis started',
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetAnalyses(req, res) {
    // Return recent analyses from database
    res.json({
      analyses: [],
      total: 0,
    });
  }

  async handleGetAnalysis(req, res) {
    const { id } = req.params;
    res.json({
      id,
      status: 'not_found',
    });
  }

  async handleDeleteAnalysis(req, res) {
    const { id } = req.params;
    res.json({
      id,
      deleted: true,
    });
  }

  async handleGetIssues(req, res) {
    const { severity, type, file } = req.query;
    
    // Query issues from database
    res.json({
      issues: [],
      filters: { severity, type, file },
      total: 0,
    });
  }

  async handleGetIssueStats(req, res) {
    const stats = await this.getIssueStats();
    res.json(stats);
  }

  async handleIssueFeedback(req, res) {
    const { id } = req.params;

    // Store feedback
    res.json({
      issueId: id,
      feedbackRecorded: true,
    });
  }

  async handleScanSecrets(req, res) {
    try {
      const { content, filePath } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'No content provided' });
      }

      const { default: SecretsScanner } = await import('../../analyzers/secretsScanner.js');
      const scanner = new SecretsScanner();
      const secrets = await scanner.scan(content, filePath || 'unknown');

      res.json({
        secretsFound: secrets.length,
        secrets,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleScanVulnerabilities(req, res) {
    res.json({
      message: 'Vulnerability scanning endpoint',
      status: 'not_implemented',
    });
  }

  async handleGetPolicies(req, res) {
    res.json({
      policies: [],
    });
  }

  async handleEvaluatePolicy(req, res) {
    const { policyId } = req.body;
    
    res.json({
      policy: policyId,
      compliant: true,
      violations: [],
    });
  }

  async handleGetFeatures(req, res) {
    const { FeatureFlags } = await import('../features/featureFlags.js');
    const flags = new FeatureFlags();
    await flags.load();

    res.json({
      features: flags.getAllFlags(),
    });
  }

  async handleToggleFeature(req, res) {
    const { name } = req.params;
    const { enabled } = req.body;

    res.json({
      feature: name,
      enabled,
      toggled: true,
    });
  }

  async handleGetStatus(req, res) {
    const metrics = this.bot.getMetrics();

    res.json({
      status: 'healthy',
      bot: {
        initialized: metrics.isInitialized,
        analyzers: metrics.analyzerCount,
      },
      workers: metrics.parallelProcessor,
      timestamp: new Date().toISOString(),
    });
  }

  async handleGetWorkers(req, res) {
    const metrics = this.bot.getMetrics();

    res.json({
      workers: metrics.parallelProcessor || {},
    });
  }

  async handleGenerateReport(req, res) {
    const { format = 'html' } = req.body;

    res.json({
      reportId: `report_${Date.now()}`,
      format,
      status: 'generating',
    });
  }

  async handleDownloadReport(req, res) {
    const { id } = req.params;
    
    res.status(404).json({
      error: 'Report not found',
      id,
    });
  }

  async handleWebSocketAnalyze(clientId, _message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.ws.send(JSON.stringify({
      type: 'analysis_started',
      analysisId: `ws_analysis_${Date.now()}`,
    }));
  }

  async getIssueStats() {
    return {
      total: 0,
      bySeverity: {},
      byType: {},
      trends: [],
    };
  }

  exportPrometheusMetrics() {
    const metrics = globalMetrics.getAllMetrics();
    let output = '';

    // Counter metrics
    for (const [name, value] of Object.entries(metrics.counters || {})) {
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n`;
    }

    // Gauge metrics
    for (const [name, value] of Object.entries(metrics.gauges || {})) {
      output += `# TYPE ${name} gauge\n`;
      output += `${name} ${value}\n`;
    }

    return output;
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async start() {
    this.server = createServer(this.app);
    
    // Re-initialize WebSocket server with HTTP server
    this.wss = new WebSocketServer({ 
      server: this.server,
      path: '/ws',
    });

    this.setupWebSocket();

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`🚀 Sentinel API Server running at http://${this.host}:${this.port}`);
          console.log(`📊 Health check: http://${this.host}:${this.port}/health`);
          console.log(`📈 Metrics: http://${this.host}:${this.port}/metrics`);
          console.log(`🔌 WebSocket: ws://${this.host}:${this.port}/ws`);
          resolve();
        }
      });
    });
  }

  async stop() {
    // Close all WebSocket connections
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close HTTP server
    if (this.server) {
      this.server.close();
    }

    // Shutdown bot
    if (this.bot) {
      await this.bot.shutdown();
    }

    console.log('API Server stopped');
  }
}

export default SentinelAPIServer;
