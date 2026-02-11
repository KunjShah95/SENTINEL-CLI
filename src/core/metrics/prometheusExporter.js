import { writeFile } from 'fs/promises';
import { globalMetrics } from '../metrics/metricsCollector.js';

class PrometheusExporter {
  constructor(options = {}) {
    this.metricsEndpoint = options.metricsEndpoint || '/metrics';
    this.defaultLabels = options.defaultLabels || {};
    this.prefix = options.prefix || 'sentinel';
  }

  export(metrics = null) {
    const data = metrics || globalMetrics.getAllMetrics();
    let output = '';

    // Add metadata
    output += `# Sentinel Security CLI Metrics\n`;
    output += `# Generated: ${new Date().toISOString()}\n\n`;

    // Export counters
    for (const [key, value] of Object.entries(data.counters || {})) {
      const metricName = `${this.prefix}_${this.sanitizeName(key)}`;
      output += `# TYPE ${metricName} counter\n`;
      output += `${metricName}${this.formatLabels()} ${value}\n\n`;
    }

    // Export gauges
    for (const [key, value] of Object.entries(data.gauges || {})) {
      if (typeof value === 'number') {
        const metricName = `${this.prefix}_${this.sanitizeName(key)}`;
        output += `# TYPE ${metricName} gauge\n`;
        output += `${metricName}${this.formatLabels()} ${value}\n\n`;
      }
    }

    // Export histograms
    for (const [key, hist] of Object.entries(data.histograms || {})) {
      const metricName = `${this.prefix}_${this.sanitizeName(key)}`;
      
      output += `# TYPE ${metricName} histogram\n`;
      
      // Export buckets
      const buckets = hist.values || [];
      const sortedBuckets = [...buckets].sort((a, b) => a - b);
      
      for (const bucket of [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]) {
        const count = sortedBuckets.filter(v => v <= bucket).length;
        output += `${metricName}_bucket{le="${bucket}"}${this.formatLabels()} ${count}\n`;
      }
      
      output += `${metricName}_bucket{le="+Inf"}${this.formatLabels()} ${buckets.length}\n`;
      output += `${metricName}_sum${this.formatLabels()} ${hist.sum || 0}\n`;
      output += `${metricName}_count${this.formatLabels()} ${hist.count || 0}\n\n`;
    }

    return output;
  }

  sanitizeName(name) {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  formatLabels() {
    const labels = Object.entries(this.defaultLabels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return labels ? `{${labels}}` : '';
  }

  async exportToFile(filePath) {
    const content = this.export();
    await writeFile(filePath, content);
    return filePath;
  }

  createHTTPHandler() {
    return (req, res) => {
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(this.export());
    };
  }
}

export default PrometheusExporter;
