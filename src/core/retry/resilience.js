import { EventEmitter } from 'events';

class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter !== false;
    this.retryCondition = options.retryCondition || this.defaultRetryCondition;
    this.onRetry = options.onRetry || (() => {});
    this.retryOn = options.retryOn || [];
  }

  defaultRetryCondition(error) {
    if (error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
      return true;
    }

    if (error.status === 429 ||
        error.status === 503 ||
        error.status === 502 ||
        error.status === 504) {
      return true;
    }

    if (error.message && error.message.includes('socket hang up')) {
      return true;
    }

    if (error.message && error.message.includes('network')) {
      return true;
    }

    return false;
  }

  shouldRetry(error, attempt) {
    if (attempt >= this.maxRetries) {
      return { shouldRetry: false, reason: 'max-retries-exceeded' };
    }

    if (this.retryOn.length > 0) {
      const shouldRetryOn = this.retryOn.some(condition => {
        if (typeof condition === 'string') {
          return error instanceof Error && error.name === condition;
        }
        if (typeof condition === 'function') {
          return condition(error);
        }
        if (condition instanceof RegExp) {
          return condition.test(error.message);
        }
        return false;
      });

      if (!shouldRetryOn) {
        return { shouldRetry: false, reason: 'error-not-in-retry-list' };
      }
    }

    if (typeof this.retryCondition === 'function' && this.retryCondition(error)) {
      return { shouldRetry: true, reason: 'condition-matched' };
    }

    return { shouldRetry: false, reason: 'condition-not-matched' };
  }

  calculateDelay(attempt, baseDelay = null) {
    let delay = baseDelay || this.initialDelay * Math.pow(this.backoffMultiplier, attempt);

    if (this.jitter) {
      const jitterAmount = delay * 0.2;
      delay = delay - jitterAmount + Math.random() * jitterAmount * 2;
    }

    return Math.min(delay, this.maxDelay);
  }

  async execute(fn, options = {}) {
    const policy = options.policy || this;
    const args = options.args || [];

    let lastError;
    let result;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = policy.calculateDelay(attempt - 1);
          await this.sleep(delay);
        }

        result = await fn(...args);

        return {
          success: true,
          result,
          attempts: attempt + 1,
          lastError: null,
        };
      } catch (error) {
        lastError = error;

        const retryCheck = policy.shouldRetry(error, attempt);

        if (!retryCheck.shouldRetry) {
          return {
            success: false,
            result: null,
            attempts: attempt + 1,
            lastError,
            reason: retryCheck.reason,
          };
        }

        const delay = policy.calculateDelay(attempt, options.customDelay);
        policy.onRetry({
          attempt: attempt + 1,
          error,
          delay,
          maxRetries: policy.maxRetries,
        });
      }
    }

    return {
      success: false,
      result: null,
      attempts: policy.maxRetries + 1,
      lastError,
      reason: 'max-retries-exceeded',
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class CircuitBreaker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.halfOpenTime = options.halfOpenTime || 30000;
    this.monitoringWindow = options.monitoringWindow || 60000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.history = [];
  }

  getState() {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttempt) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  async execute(fn, ...args) {
    const state = this.getState();

    if (state === 'OPEN') {
      const error = new Error('Circuit breaker is OPEN');
      error.code = 'CIRCUIT_OPEN';
      throw error;
    }

    if (state === 'HALF_OPEN') {
      this.emit('half-open');
    }

    const startTime = Date.now();

    try {
      const result = await Promise.resolve(fn(...args));
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.history.push({ timestamp: Date.now(), duration, success: this.state !== 'OPEN' });
      this.pruneHistory();
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.emit('close');
      }
    } else {
      this.failureCount = 0;
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.halfOpenTime;
      this.emit('open');
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.halfOpenTime;
      this.emit('open');
    }
  }

  pruneHistory() {
    const cutoff = Date.now() - this.monitoringWindow;
    this.history = this.history.filter(entry => entry.timestamp > cutoff);
  }

  getMetrics() {
    const successful = this.history.filter(e => e.success).length;
    const total = this.history.length;
    const successRate = total > 0 ? (successful / total) * 100 : 100;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      successRate: successRate.toFixed(2),
      totalRequests: total,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    this.history = [];
    this.emit('reset');
  }
}

class Bulkhead {
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 10;
    this.maxQueue = options.maxQueue || 100;
    this.timeout = options.timeout || 30000;
    this.running = 0;
    this.queue = [];
    this.timers = new Map();
  }

  async execute(fn, ...args) {
    if (this.running < this.maxConcurrent) {
      return this.run(fn, ...args);
    }

    return this.enqueue(fn, ...args);
  }

  async run(fn, ...args) {
    this.running++;
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        Promise.resolve(fn(...args)),
        this.createTimeout(startTime),
      ]);
      return result;
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  async enqueue(fn, ...args) {
    if (this.queue.length >= this.maxQueue) {
      throw new Error('Bulkhead queue is full');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.queue.findIndex(item => item.fn === fn);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        reject(new Error('Bulkhead queue timeout'));
      }, this.timeout);

      this.queue.push({
        fn,
        args,
        resolve,
        reject,
        timer,
      });

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    clearTimeout(item.timer);

    this.run(item.fn, ...item.args)
      .then(item.resolve)
      .catch(item.reject);
  }

  createTimeout(startTime) {
    const remaining = this.timeout - (Date.now() - startTime);
    if (remaining <= 0) {
      return new Promise((_, reject) => {
        reject(new Error('Execution timeout'));
      });
    }

    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, remaining);
    });
  }

  getMetrics() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
      availableSlots: Math.max(0, this.maxConcurrent - this.running),
    };
  }
}

export { RetryPolicy, CircuitBreaker, Bulkhead };
