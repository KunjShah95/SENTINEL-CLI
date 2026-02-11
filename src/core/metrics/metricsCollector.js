import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import crypto from 'crypto';

class MetricsCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.metrics = new Map();
    this.counters = new Map();
    this.histograms = new Map();
    this.timers = new Map();
    this.spans = new Map();
    this.serviceName = options.serviceName || 'sentinel-cli';
    this.instanceId = options.instanceId || this.generateInstanceId();
    this.flushInterval = options.flushInterval || 60000;
    this.buffer = [];
    this.flushTimer = null;
    this.maxBufferSize = options.maxBufferSize || 1000;
  }

  generateInstanceId() {
    return `${this.serviceName}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  startTimer(name, labels = {}) {
    const timerId = `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
    this.timers.set(timerId, {
      name,
      labels,
      startTime: performance.now(),
      startTimestamp: Date.now(),
    });
    return timerId;
  }

  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) return null;

    const duration = performance.now() - timer.startTime;
    this.timers.delete(timerId);

    this.recordHistogram(timer.name, duration, timer.labels);

    this.emit('timer', {
      name: timer.name,
      duration,
      labels: timer.labels,
    });

    return duration;
  }

  timeSync(name, fn, labels = {}) {
    const startTime = performance.now();
    const result = fn();
    const duration = performance.now() - startTime;
    this.recordHistogram(name, duration, labels);
    return result;
  }

  async timeAsync(name, fn, labels = {}) {
    const startTime = performance.now();
    const result = await fn();
    const duration = performance.now() - startTime;
    this.recordHistogram(name, duration, labels);
    return result;
  }

  incrementCounter(name, value = 1, labels = {}) {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    this.buffer.push({
      type: 'counter',
      name,
      value,
      labels,
      timestamp: Date.now(),
      service: this.serviceName,
      instance: this.instanceId,
    });

    this.flushBufferIfNeeded();
  }

  recordGauge(name, value, labels = {}) {
    this.metrics.set(name, {
      value,
      labels,
      timestamp: Date.now(),
    });

    this.buffer.push({
      type: 'gauge',
      name,
      value,
      labels,
      timestamp: Date.now(),
      service: this.serviceName,
      instance: this.instanceId,
    });

    this.flushBufferIfNeeded();
  }

  recordHistogram(name, value, labels = {}) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        values: [],
        labels: {},
        min: Infinity,
        max: -Infinity,
        sum: 0,
        count: 0,
      });
    }

    const hist = this.histograms.get(name);
    hist.values.push(value);
    hist.min = Math.min(hist.min, value);
    hist.max = Math.max(hist.max, value);
    hist.sum += value;
    hist.count++;

    this.buffer.push({
      type: 'histogram',
      name,
      value,
      labels,
      timestamp: Date.now(),
      service: this.serviceName,
      instance: this.instanceId,
    });

    this.flushBufferIfNeeded();
  }

  startSpan(name, options = {}) {
    const spanId = options.spanId || this.generateSpanId();
    const parentSpanId = options.parentSpanId || null;
    const traceId = options.traceId || this.generateTraceId();

    const span = {
      spanId,
      parentSpanId,
      traceId,
      name,
      startTime: performance.now(),
      startTimestamp: Date.now(),
      labels: options.labels || {},
      events: [],
      status: 'ok',
    };

    this.spans.set(spanId, span);

    return spanId;
  }

  endSpan(spanId, options = {}) {
    const span = this.spans.get(spanId);
    if (!span) return null;

    const duration = performance.now() - span.startTime;
    span.duration = duration;
    span.endTimestamp = Date.now();
    span.status = options.status || 'ok';
    span.error = options.error || null;

    if (options.labels) {
      span.labels = { ...span.labels, ...options.labels };
    }

    this.buffer.push({
      type: 'span',
      ...span,
      service: this.serviceName,
    });

    this.spans.delete(spanId);

    this.emit('span', span);
    return span;
  }

  addSpanEvent(spanId, eventName, payload = {}) {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      name: eventName,
      timestamp: Date.now(),
      payload,
    });
  }

  recordSpanError(spanId, error) {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.status = 'error';
    span.error = {
      message: error.message,
      stack: error.stack,
      code: error.code,
    };
  }

  generateSpanId() {
    return crypto.randomBytes(8).toString('hex');
  }

  generateTraceId() {
    return crypto.randomBytes(16).toString('hex');
  }

  getKey(name, labels) {
    const sortedLabels = Object.keys(labels)
      .sort()
      .map(k => `${k}=${labels[k]}`)
      .join(',');
    return `${name}${sortedLabels ? `{${sortedLabels}}` : ''}`;
  }

  getCounter(name, labels = {}) {
    return this.counters.get(this.getKey(name, labels)) || 0;
  }

  getGauge(name) {
    return this.metrics.get(name)?.value || null;
  }

  getHistogramStats(name, labels = {}) {
    const hist = this.histograms.get(this.getKey(name, labels));
    if (!hist || hist.count === 0) return null;

    const values = hist.values.sort((a, b) => a - b);
    const sum = hist.sum;
    const count = hist.count;

    const getPercentile = p => {
      if (values.length === 0) return 0;
      const idx = Math.floor(p * (values.length - 1));
      return values[idx];
    };

    return {
      min: hist.min,
      max: hist.max,
      avg: sum / count,
      count,
      sum,
      median: getPercentile(0.5),
      p95: getPercentile(0.95),
      p99: getPercentile(0.99),
    };
  }

  getAllMetrics() {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Array.from(this.metrics.entries()).reduce((acc, [name, data]) => {
        acc[name] = data.value;
        return acc;
      }, {}),
      histograms: Object.fromEntries(this.histograms),
    };
  }

  resetCounters(name = null, labels = {}) {
    if (name) {
      const key = this.getKey(name, labels);
      this.counters.delete(key);
    } else {
      this.counters.clear();
    }
  }

  resetHistograms(name = null, labels = {}) {
    if (name) {
      const key = this.getKey(name, labels);
      this.histograms.delete(key);
    } else {
      this.histograms.clear();
    }
  }

  resetAll() {
    this.metrics.clear();
    this.counters.clear();
    this.histograms.clear();
    this.timers.clear();
    this.spans.clear();
    this.buffer = [];
  }

  flushBufferIfNeeded() {
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  flush() {
    const data = [...this.buffer];
    this.buffer = [];

    this.emit('flush', data);

    return data;
  }

  startAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  createTimer(labels = {}) {
    return {
      startTime: performance.now(),
      labels,
      stop: () => {
        const duration = performance.now() - this.startTime;
        this.recordHistogram('timer', duration, this.labels);
        return duration;
      },
    };
  }

  createScope(labels = {}) {
    const scope = {
      metrics: this,
      labels,
      child(name, additionalLabels = {}) {
        return scope.child(name, { ...labels, ...additionalLabels });
      },
      counter(name, value = 1) {
        this.metrics.incrementCounter(name, value, labels);
      },
      gauge(name, value) {
        this.metrics.recordGauge(name, value, labels);
      },
      histogram(name, value) {
        this.metrics.recordHistogram(name, value, labels);
      },
      timer(name) {
        return this.metrics.startTimer(name, labels);
      },
      span(name, options = {}) {
        return this.metrics.startSpan(name, {
          ...options,
          labels: { ...labels, ...options.labels },
        });
      },
    };

    return scope;
  }
}

const globalMetrics = new MetricsCollector({
  serviceName: 'sentinel-cli',
  flushInterval: 30000,
});

export default MetricsCollector;
export { MetricsCollector, globalMetrics };
