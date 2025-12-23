const DEFAULT_RPS = parseInt(process.env.SENTINEL_RATE_LIMIT_RPS || process.env.RATE_LIMIT_RPS || '5', 10);

class RateLimiter {
  constructor(rps = DEFAULT_RPS) {
    this.rps = Math.max(1, Number(rps) || 1);
    this.interval = Math.ceil(1000 / this.rps);
    this.queue = [];
    this.running = false;
  }

  schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._start();
    });
  }

  _start() {
    if (this.running) return;
    this.running = true;

    const processNext = async () => {
      const job = this.queue.shift();
      if (!job) {
        this.running = false;
        return;
      }

      try {
        const result = await job.fn();
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      }

      setTimeout(processNext, this.interval);
    };

    processNext();
  }
}

const singleton = new RateLimiter(DEFAULT_RPS);
export default singleton;
