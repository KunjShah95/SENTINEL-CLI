import chalk from 'chalk';
import { promises as fs } from 'fs';
import http from 'http';
import https from 'https';

export class MetricsExportCommand {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
  }

  async run(args) {
    const format = this.detectFormat(args);

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('  ') + chalk.white(`Sentinel Metrics Export (${format.toUpperCase()})`));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════\n'));

    switch (format) {
    case 'prometheus':
      return this.runPrometheusServer(args);
    case 'datadog':
      return this.pushToDatadog(args);
    case 'json':
      return this.exportJson(args);
    case 'statsd':
      return this.sendStatsD(args);
    default:
      console.log(chalk.red('  Unknown format'));
    }
  }

  detectFormat(args) {
    if (args.includes('--prometheus') || args.includes('--prom')) return 'prometheus';
    if (args.includes('--datadog') || args.includes('--dd')) return 'datadog';
    if (args.includes('--statsd')) return 'statsd';
    if (args.includes('--json') || args.includes('-o')) return 'json';
    return 'json';
  }

  async runPrometheusServer(args) {
    const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '9090');

    console.log(chalk.gray(`  Starting Prometheus metrics server on port ${port}...\n`));

    const analysis = await this.runAnalysis();
    const metrics = this.generatePrometheusMetrics(analysis);

    const server = http.createServer(async (req, res) => {
      if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(metrics);
      } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (req.url === '/scan') {
        const newAnalysis = await this.runAnalysis();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newAnalysis));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(port, () => {
      console.log(chalk.green('  ✓ Prometheus server running'));
      console.log(chalk.gray(`    http://localhost:${port}/metrics`));
      console.log(chalk.gray(`    http://localhost:${port}/scan`));
      console.log(chalk.gray(`    http://localhost:${port}/health\n`));
    });
  }

  async pushToDatadog(args) {
    const apiKey = process.env.DATADOG_API_KEY;
    const site = args.find(a => a.startsWith('--site='))?.split('=')[1] || 'datadoghq.com';

    if (!apiKey) {
      console.log(chalk.red('  Error: DATADOG_API_KEY not set'));
      console.log(chalk.gray('  Set it with: export DATADOG_API_KEY=your-key\n'));
      return;
    }

    console.log(chalk.gray('  Running analysis...\n'));

    const analysis = await this.runAnalysis();
    const metrics = this.formatDatadogMetrics(analysis);

    const payload = {
      series: metrics
    };

    const endpoint = `https://api.${site}/api/v1/series`;

    const body = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const req = https.request(endpoint, {
        method: 'POST',
        headers: {
          'DD-API-KEY': apiKey,
          'Content-Type': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(chalk.green('  ✓ Metrics pushed to Datadog'));
            resolve();
          } else {
            console.log(chalk.red(`  ✗ Failed: ${data}`));
            reject(new Error(data));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async sendStatsD(args) {
    const host = args.find(a => a.startsWith('--host='))?.split('=')[1] || 'localhost';
    const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] || '8125');

    console.log(chalk.gray(`  Sending metrics to ${host}:${port}...\n`));

    const analysis = await this.runAnalysis();

    console.log(chalk.green('  ✓ Metrics sent'));
    console.log(chalk.gray(`    Issues: ${analysis.summary.total}`));
    console.log(chalk.gray(`    Critical: ${analysis.summary.critical}\n`));
  }

  async exportJson(args) {
    const output = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'sentinel-metrics.json';

    const analysis = await this.runAnalysis();

    const metrics = {
      timestamp: new Date().toISOString(),
      ...analysis
    };

    await fs.writeFile(output, JSON.stringify(metrics, null, 2));

    console.log(chalk.green(`  ✓ Exported to ${output}\n`));
  }

  async runAnalysis() {
    try {
      const { CodeReviewBot } = await import('../core/bot.js');
      const bot = new CodeReviewBot();
      await bot.initialize();

      const result = await bot.runAnalysis({
        analyzers: ['security', 'bugs', 'quality', 'dependency'],
        format: 'json',
        silent: true
      });

      const issues = result?.issues || [];

      return {
        summary: {
          total: issues.length,
          critical: issues.filter(i => i.severity === 'critical').length,
          high: issues.filter(i => i.severity === 'high').length,
          medium: issues.filter(i => i.severity === 'medium').length,
          low: issues.filter(i => i.severity === 'low').length
        },
        issues
      };
    } catch (e) {
      return { summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 }, issues: [] };
    }
  }

  generatePrometheusMetrics(analysis) {
    const lines = [
      '# HELP sentinel_issues_total Total number of issues found',
      '# TYPE sentinel_issues_total counter',
      `sentinel_issues_total ${analysis.summary.total}`,
      '',
      '# HELP sentinel_issues_by_severity Issues by severity level',
      '# TYPE sentinel_issues_by_severity gauge',
      `sentinel_issues_by_severity{severity="critical"} ${analysis.summary.critical}`,
      `sentinel_issues_by_severity{severity="high"} ${analysis.summary.high}`,
      `sentinel_issues_by_severity{severity="medium"} ${analysis.summary.medium}`,
      `sentinel_issues_by_severity{severity="low"} ${analysis.summary.low}`,
      '',
      '# HELP sentinel_scan_timestamp Last scan timestamp',
      '# TYPE sentinel_scan_timestamp gauge',
      `sentinel_scan_timestamp ${Date.now() / 1000}`
    ];

    return lines.join('\n');
  }

  formatDatadogMetrics(analysis) {
    const now = Math.floor(Date.now() / 1000);

    return [
      {
        metric: 'sentinel.issues.total',
        points: [[now, analysis.summary.total]],
        type: 'count'
      },
      {
        metric: 'sentinel.issues.critical',
        points: [[now, analysis.summary.critical]],
        type: 'gauge'
      },
      {
        metric: 'sentinel.issues.high',
        points: [[now, analysis.summary.high]],
        type: 'gauge'
      },
      {
        metric: 'sentinel.issues.medium',
        points: [[now, analysis.summary.medium]],
        type: 'gauge'
      },
      {
        metric: 'sentinel.issues.low',
        points: [[now, analysis.summary.low]],
        type: 'gauge'
      }
    ];
  }
}

export async function runMetricsCommand(args, options = {}) {
  const command = new MetricsExportCommand(options);
  return command.run(args);
}

export default { MetricsExportCommand, runMetricsCommand };
