import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ParallelProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxWorkers = options.maxWorkers || 4;
    this.workerPath = options.workerPath || path.join(__dirname, 'workers', 'analyzerWorker.js');
    this.workers = [];
    this.taskQueue = [];
    this.activeWorkers = new Map();
    this.results = new Map();
    this.metrics = {
      tasksSubmitted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
    };
  }

  async initialize() {
    for (let i = 0; i < this.maxWorkers; i++) {
      await this.spawnWorker(i);
    }
    return this;
  }

  async spawnWorker(index) {
    return new Promise((resolve) => {
      const worker = new Worker(this.workerPath, {
        workerData: { workerId: index },
      });

      worker.on('message', (result) => {
        this.handleWorkerMessage(index, result);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(index, error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.warn(`Worker ${index} exited with code ${code}`);
          this.spawnWorker(index);
        }
      });

      this.workers.push(worker);
      this.activeWorkers.set(index, { busy: false, worker });

      resolve(worker);
    });
  }

  async process(tasks, options = {}) {
    const { timeout = 60000, batchSize = null, parallel = true } = options;

    this.emit('processing:start', { taskCount: tasks.length });

    if (batchSize && !parallel) {
      const batches = this.chunkArray(tasks, batchSize);
      const allResults = [];

      for (const batch of batches) {
        const batchResults = await this.processBatch(batch, timeout);
        allResults.push(...batchResults);
      }

      return allResults;
    }

    return this.processParallel(tasks, timeout);
  }

  async processParallel(tasks, timeout) {
    const taskPromises = tasks.map(task => this.submitTask(task, timeout));
    return Promise.allSettled(taskPromises);
  }

  async processBatch(batch, timeout) {
    const results = [];

    for (const task of batch) {
      const result = await this.submitTask(task, timeout);
      results.push(result);
    }

    return results;
  }

  async submitTask(task, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const taskId = this.generateTaskId();

      const timeoutTimer = setTimeout(() => {
        reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
      }, timeout);

      this.taskQueue.push({
        task,
        taskId,
        timeoutTimer,
        resolve,
        reject,
        submittedAt: Date.now(),
      });

      this.metrics.tasksSubmitted++;
      this.scheduleTasks();
    });
  }

  scheduleTasks() {
    const availableWorkers = Array.from(this.activeWorkers.entries())
      .filter(([_, data]) => !data.busy);

    while (this.taskQueue.length > 0 && availableWorkers.length > 0) {
      const [workerId, workerData] = availableWorkers.shift();
      const taskEntry = this.taskQueue.shift();

      if (!taskEntry) continue;

      clearTimeout(taskEntry.timeoutTimer);

      workerData.busy = true;

      workerData.worker.postMessage({
        type: 'task',
        taskId: taskEntry.taskId,
        task: taskEntry.task,
      });

      this.results.set(taskEntry.taskId, {
        task: taskEntry.task,
        resolve: taskEntry.resolve,
        reject: taskEntry.reject,
        workerId,
        startedAt: Date.now(),
      });

      this.emit('task:assigned', {
        taskId: taskEntry.taskId,
        workerId,
        task: taskEntry.task,
      });
    }

    if (this.taskQueue.length > 0 && availableWorkers.length === 0) {
      this.emit('queue:full', { queueSize: this.taskQueue.length });
    }
  }

  handleWorkerMessage(workerId, message) {
    const { taskId, type, result, error } = message;

    const taskResult = this.results.get(taskId);
    if (!taskResult) return;

    const { resolve, reject, startedAt } = taskResult;
    const processingTime = Date.now() - startedAt;

    this.metrics.totalProcessingTime += processingTime;

    if (type === 'result') {
      this.metrics.tasksCompleted++;

      this.emit('task:completed', {
        taskId,
        workerId,
        processingTime,
        result,
      });

      resolve({
        taskId,
        workerId,
        processingTime,
        result,
      });

      this.results.delete(taskId);
    } else if (type === 'error') {
      this.metrics.tasksFailed++;

      this.emit('task:failed', {
        taskId,
        workerId,
        error,
        processingTime,
      });

      reject(new Error(error?.message || 'Unknown worker error'));

      this.results.delete(taskId);
    }

    const workerData = this.activeWorkers.get(workerId);
    if (workerData) {
      workerData.busy = false;
    }

    this.scheduleTasks();
  }

  handleWorkerError(workerId, error) {
    this.metrics.tasksFailed++;

    this.emit('worker:error', { workerId, error });

    const workerData = this.activeWorkers.get(workerId);
    if (workerData) {
      workerData.busy = false;
    }

    for (const [taskId, taskResult] of this.results) {
      if (taskResult.workerId === workerId) {
        taskResult.reject(new Error(`Worker ${workerId} crashed`));
        this.results.delete(taskId);
      }
    }

    this.spawnWorker(workerId);
    this.scheduleTasks();
  }

  async shutdown() {
    for (const worker of this.workers) {
      await worker.terminate();
    }

    this.workers = [];
    this.activeWorkers.clear();
    this.taskQueue = [];
    this.results.clear();

    this.emit('shutdown:complete');
  }

  getMetrics() {
    const avgProcessingTime = this.metrics.tasksCompleted > 0
      ? this.metrics.totalProcessingTime / this.metrics.tasksCompleted
      : 0;

    return {
      ...this.metrics,
      avgProcessingTime: Math.round(avgProcessingTime),
      activeWorkers: this.activeWorkers.size,
      queuedTasks: this.taskQueue.length,
      busyWorkers: Array.from(this.activeWorkers.values()).filter(w => w.busy).length,
    };
  }

  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export default ParallelProcessor;
