const DEFAULT_RPS = parseInt(process.env.SENTINEL_RATE_LIMIT_RPS || '5', 10);

class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.state = 'closed';
        this.failureCount = 0;
        this.lastFailure = null;
        this.onStateChange = options.onStateChange || (() => { });
    }

    async execute(fn) {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.state = 'half-open';
                this.onStateChange('half-open');
            } else {
                throw new Error('Circuit breaker is open');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (e) {
            this.onFailure();
            throw e;
        }
    }

    onSuccess() {
        if (this.state === 'half-open') {
            this.state = 'closed';
            this.failureCount = 0;
            this.onStateChange('closed');
        }
    }

    onFailure() {
        this.failureCount++;
        this.lastFailure = Date.now();

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'open';
            this.onStateChange('open');
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            lastFailure: this.lastFailure
        };
    }
}

class EnhancedRateLimiter {
    constructor(options = {}) {
        this.defaultRps = options.rps || DEFAULT_RPS;
        this.providers = new Map();
        this.circuitBreakers = new Map();
    }

    getProviderConfig(provider) {
        const configs = {
            openai: { rps: 10, maxRetries: 3, baseDelay: 1000 },
            anthropic: { rps: 5, maxRetries: 3, baseDelay: 1000 },
            gemini: { rps: 15, maxRetries: 3, baseDelay: 500 },
            groq: { rps: 30, maxRetries: 3, baseDelay: 200 },
            default: { rps: this.defaultRps, maxRetries: 3, baseDelay: 1000 }
        };
        return configs[provider] || configs.default;
    }

    getLimiter(provider) {
        if (!this.providers.has(provider)) {
            const config = this.getProviderConfig(provider);
            const limiter = {
                rps: config.rps,
                interval: Math.ceil(1000 / config.rps),
                queue: [],
                running: false,
                lastCall: 0
            };
            this.providers.set(provider, limiter);
        }
        return this.providers.get(provider);
    }

    getCircuitBreaker(provider) {
        if (!this.circuitBreakers.has(provider)) {
            const config = this.getProviderConfig(provider);
            const breaker = new CircuitBreaker({
                failureThreshold: config.maxRetries,
                onStateChange: (state) => {
                    console.warn(`[RateLimiter] Circuit breaker for ${provider}: ${state}`);
                }
            });
            this.circuitBreakers.set(provider, breaker);
        }
        return this.circuitBreakers.get(provider);
    }

    async schedule(provider, fn, options = {}) {
        const config = this.getProviderConfig(provider);
        const limiter = this.getLimiter(provider);
        const breaker = this.getCircuitBreaker(provider);

        return new Promise((resolve, reject) => {
            limiter.queue.push({
                fn,
                resolve,
                reject,
                maxRetries: options.maxRetries || config.maxRetries,
                baseDelay: options.baseDelay || config.baseDelay,
                retryCount: 0,
                breaker
            });
            this._startProvider(provider);
        });
    }

    _startProvider(provider) {
        const limiter = this.providers.get(provider);
        if (!limiter || limiter.running) return;

        limiter.running = true;

        const processNext = async () => {
            const job = limiter.queue.shift();
            if (!job) {
                limiter.running = false;
                return;
            }

            const now = Date.now();
            const timeSinceLastCall = now - limiter.lastCall;
            if (timeSinceLastCall < limiter.interval) {
                await new Promise(r => setTimeout(r, limiter.interval - timeSinceLastCall));
            }
            limiter.lastCall = Date.now();

            try {
                const result = await job.breaker.execute(() => job.fn());
                job.resolve(result);
            } catch (err) {
                if (err.message === 'Circuit breaker is open') {
                    job.reject(err);
                } else if (job.retryCount < job.maxRetries) {
                    job.retryCount++;
                    const delay = Math.min(job.baseDelay * Math.pow(2, job.retryCount), 30000);
                    setTimeout(() => {
                        limiter.queue.unshift(job);
                        this._startProvider(provider);
                    }, delay);
                } else {
                    job.reject(err);
                }
            }

            setTimeout(() => this._startProvider(provider), limiter.interval);
        };

        processNext();
    }

    async scheduleWithRetry(provider, fn, options = {}) {
        const config = this.getProviderConfig(provider);
        const maxRetries = options.maxRetries || config.maxRetries;
        const baseDelay = options.baseDelay || config.baseDelay;

        let lastError;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await this.schedule(provider, fn, options);
            } catch (err) {
                lastError = err;
                if (attempt < maxRetries) {
                    const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        throw lastError;
    }

    getStats(provider = null) {
        const stats = {};

        if (provider) {
            const limiter = this.providers.get(provider);
            const breaker = this.circuitBreakers.get(provider);
            if (limiter) {
                stats[provider] = {
                    queueSize: limiter.queue.length,
                    rps: limiter.rps,
                    running: limiter.running
                };
            }
            if (breaker) {
                stats[provider + '_circuit'] = breaker.getState();
            }
        } else {
            for (const [prov, limiter] of this.providers) {
                stats[prov] = {
                    queueSize: limiter.queue.length,
                    rps: limiter.rps,
                    running: limiter.running
                };
            }
            for (const [prov, breaker] of this.circuitBreakers) {
                stats[prov + '_circuit'] = breaker.getState();
            }
        }

        return stats;
    }
}

const singleton = new EnhancedRateLimiter();
export default singleton;
export { EnhancedRateLimiter, CircuitBreaker };
