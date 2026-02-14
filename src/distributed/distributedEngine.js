/**
 * DISTRIBUTED WORKER ARCHITECTURE
 *
 * Inspired by:
 * - Karpathy's micrograd architecture (simple, composable)
 * - Anthropic's distributed inference system
 * - DeepMind's AlphaCode parallel evaluation
 *
 * Key Principles:
 * 1. Horizontal scalability (add more workers)
 * 2. Fault tolerance (retry failed tasks)
 * 3. Load balancing (distribute work evenly)
 * 4. Backpressure handling (don't overwhelm workers)
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import os from 'os';

export class DistributedAnalysisEngine extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxWorkers: options.maxWorkers || os.cpus().length,
      workerIdleTimeout: options.workerIdleTimeout || 60000, // 1 minute
      taskTimeout: options.taskTimeout || 300000, // 5 minutes
      maxRetries: options.maxRetries || 3,
      batchSize: options.batchSize || 100,
      queueHighWaterMark: options.queueHighWaterMark || 1000,
      ...options
    };

    this.workers = [];
    this.taskQueue = [];
    this.runningTasks = new Map();
    this.completedTasks = new Map();
    this.failedTasks = new Map();

    this.metrics = {
      tasksQueued: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      totalProcessingTime: 0,
      avgProcessingTime: 0
    };

    this.isShuttingDown = false;
  }

  /**
   * Initialize worker pool
   */
  async initialize() {
    console.log(`🚀 Initializing ${this.options.maxWorkers} workers...`);

    for (let i = 0; i < this.options.maxWorkers; i++) {
      await this.createWorker(i);
    }

    // Start task distributor
    this.startTaskDistributor();

    console.log(`✅ Worker pool initialized`);
  }

  /**
   * Create a worker
   */
  async createWorker(id) {
    const worker = new Worker('./src/workers/analysisWorker.js', {
      workerData: { workerId: id }
    });

    const workerState = {
      id,
      worker,
      busy: false,
      currentTask: null,
      tasksCompleted: 0,
      lastActivity: Date.now(),
      errors: 0
    };

    worker.on('message', (message) => this.handleWorkerMessage(workerState, message));
    worker.on('error', (error) => this.handleWorkerError(workerState, error));
    worker.on('exit', (code) => this.handleWorkerExit(workerState, code));

    this.workers.push(workerState);

    return workerState;
  }

  /**
   * Handle worker message
   */
  handleWorkerMessage(workerState, message) {
    const { type, taskId, result, error, metrics } = message;

    switch (type) {
      case 'ready':
        workerState.busy = false;
        workerState.lastActivity = Date.now();
        this.emit('worker:ready', workerState.id);
        break;

      case 'progress':
        this.emit('task:progress', { taskId, progress: result });
        break;

      case 'result':
        this.handleTaskComplete(taskId, result, metrics, workerState);
        break;

      case 'error':
        this.handleTaskError(taskId, error, workerState);
        break;
    }
  }

  /**
   * Handle worker error
   */
  handleWorkerError(workerState, error) {
    console.error(`Worker ${workerState.id} error:`, error);
    workerState.errors++;

    // Restart worker if too many errors
    if (workerState.errors > 5) {
      this.restartWorker(workerState);
    }
  }

  /**
   * Handle worker exit
   */
  async handleWorkerExit(workerState, code) {
    if (code !== 0 && !this.isShuttingDown) {
      console.warn(`Worker ${workerState.id} exited with code ${code}. Restarting...`);
      await this.restartWorker(workerState);
    }
  }

  /**
   * Restart worker
   */
  async restartWorker(workerState) {
    const index = this.workers.indexOf(workerState);

    // Remove old worker
    this.workers.splice(index, 1);

    // Create new worker
    const newWorker = await this.createWorker(workerState.id);
    this.workers.push(newWorker);

    // Re-queue current task if exists
    if (workerState.currentTask) {
      this.taskQueue.unshift(workerState.currentTask);
    }
  }

  /**
   * Add task to queue
   */
  async addTask(task) {
    if (this.taskQueue.length >= this.options.queueHighWaterMark) {
      throw new Error('Task queue full. Apply backpressure.');
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const enrichedTask = {
      id: taskId,
      ...task,
      retries: 0,
      queuedAt: Date.now()
    };

    this.taskQueue.push(enrichedTask);
    this.metrics.tasksQueued++;

    this.emit('task:queued', taskId);

    return taskId;
  }

  /**
   * Add batch of tasks
   */
  async addBatch(tasks) {
    const taskIds = [];

    for (let i = 0; i < tasks.length; i += this.options.batchSize) {
      const batch = tasks.slice(i, i + this.options.batchSize);

      for (const task of batch) {
        const taskId = await this.addTask(task);
        taskIds.push(taskId);
      }

      // Yield to event loop
      await new Promise(resolve => setImmediate(resolve));
    }

    return taskIds;
  }

  /**
   * Start task distributor
   */
  startTaskDistributor() {
    this.distributorInterval = setInterval(() => {
      this.distributeTasks();
    }, 100); // Check every 100ms
  }

  /**
   * Distribute tasks to available workers
   */
  distributeTasks() {
    if (this.taskQueue.length === 0) return;

    const availableWorkers = this.workers.filter(w => !w.busy);

    for (const workerState of availableWorkers) {
      if (this.taskQueue.length === 0) break;

      const task = this.taskQueue.shift();
      this.assignTaskToWorker(task, workerState);
    }
  }

  /**
   * Assign task to worker
   */
  assignTaskToWorker(task, workerState) {
    workerState.busy = true;
    workerState.currentTask = task;
    workerState.lastActivity = Date.now();

    this.runningTasks.set(task.id, {
      task,
      workerId: workerState.id,
      startTime: Date.now()
    });

    // Send task to worker
    workerState.worker.postMessage({
      type: 'execute',
      taskId: task.id,
      task: task.data
    });

    // Set timeout
    const timeout = setTimeout(() => {
      this.handleTaskTimeout(task.id, workerState);
    }, this.options.taskTimeout);

    this.runningTasks.get(task.id).timeout = timeout;

    this.emit('task:started', { taskId: task.id, workerId: workerState.id });
  }

  /**
   * Handle task completion
   */
  handleTaskComplete(taskId, result, metrics, workerState) {
    const taskInfo = this.runningTasks.get(taskId);
    if (!taskInfo) return;

    // Clear timeout
    clearTimeout(taskInfo.timeout);

    const processingTime = Date.now() - taskInfo.startTime;

    // Update metrics
    this.metrics.tasksCompleted++;
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.avgProcessingTime =
      this.metrics.totalProcessingTime / this.metrics.tasksCompleted;

    // Store result
    this.completedTasks.set(taskId, {
      result,
      metrics,
      processingTime,
      completedAt: Date.now()
    });

    // Clean up
    this.runningTasks.delete(taskId);
    workerState.busy = false;
    workerState.currentTask = null;
    workerState.tasksCompleted++;

    this.emit('task:completed', { taskId, result, processingTime });
  }

  /**
   * Handle task error
   */
  handleTaskError(taskId, error, workerState) {
    const taskInfo = this.runningTasks.get(taskId);
    if (!taskInfo) return;

    clearTimeout(taskInfo.timeout);

    const task = taskInfo.task;
    task.retries++;

    // Retry if under max retries
    if (task.retries < this.options.maxRetries) {
      console.warn(`Task ${taskId} failed, retrying (${task.retries}/${this.options.maxRetries})`);
      this.taskQueue.push(task);
    } else {
      console.error(`Task ${taskId} failed after ${task.retries} retries:`, error);
      this.metrics.tasksFailed++;
      this.failedTasks.set(taskId, { error, task, failedAt: Date.now() });
      this.emit('task:failed', { taskId, error });
    }

    this.runningTasks.delete(taskId);
    workerState.busy = false;
    workerState.currentTask = null;
  }

  /**
   * Handle task timeout
   */
  handleTaskTimeout(taskId, workerState) {
    console.warn(`Task ${taskId} timed out`);

    this.handleTaskError(
      taskId,
      new Error('Task timeout'),
      workerState
    );

    // Terminate and restart worker
    workerState.worker.terminate();
    this.restartWorker(workerState);
  }

  /**
   * Wait for all tasks to complete
   */
  async waitForCompletion() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.taskQueue.length === 0 && this.runningTasks.size === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queuedTasks: this.taskQueue.length,
      runningTasks: this.runningTasks.size,
      workers: {
        total: this.workers.length,
        busy: this.workers.filter(w => w.busy).length,
        idle: this.workers.filter(w => !w.busy).length
      }
    };
  }

  /**
   * Get worker stats
   */
  getWorkerStats() {
    return this.workers.map(w => ({
      id: w.id,
      busy: w.busy,
      tasksCompleted: w.tasksCompleted,
      errors: w.errors,
      idleTime: Date.now() - w.lastActivity
    }));
  }

  /**
   * Scale workers dynamically
   */
  async scaleWorkers(targetCount) {
    const currentCount = this.workers.length;

    if (targetCount > currentCount) {
      // Scale up
      for (let i = currentCount; i < targetCount; i++) {
        await this.createWorker(i);
      }
      console.log(`📈 Scaled up to ${targetCount} workers`);
    } else if (targetCount < currentCount) {
      // Scale down
      const workersToRemove = currentCount - targetCount;
      const idleWorkers = this.workers.filter(w => !w.busy);

      for (let i = 0; i < Math.min(workersToRemove, idleWorkers.length); i++) {
        const worker = idleWorkers[i];
        await worker.worker.terminate();
        this.workers = this.workers.filter(w => w.id !== worker.id);
      }
      console.log(`📉 Scaled down to ${this.workers.length} workers`);
    }
  }

  /**
   * Auto-scale based on queue size
   */
  enableAutoScaling(options = {}) {
    const {
      minWorkers = 2,
      maxWorkers = os.cpus().length * 2,
      scaleUpThreshold = 100,
      scaleDownThreshold = 10,
      checkInterval = 5000
    } = options;

    this.autoScaleInterval = setInterval(() => {
      const queueSize = this.taskQueue.length;
      const currentWorkers = this.workers.length;

      if (queueSize > scaleUpThreshold && currentWorkers < maxWorkers) {
        const newWorkerCount = Math.min(
          currentWorkers + Math.ceil(currentWorkers * 0.5),
          maxWorkers
        );
        this.scaleWorkers(newWorkerCount);
      } else if (queueSize < scaleDownThreshold && currentWorkers > minWorkers) {
        const newWorkerCount = Math.max(
          currentWorkers - Math.floor(currentWorkers * 0.25),
          minWorkers
        );
        this.scaleWorkers(newWorkerCount);
      }
    }, checkInterval);
  }

  /**
   * Shutdown gracefully
   */
  async shutdown() {
    console.log('🛑 Shutting down worker pool...');
    this.isShuttingDown = true;

    // Stop distributor
    if (this.distributorInterval) {
      clearInterval(this.distributorInterval);
    }

    if (this.autoScaleInterval) {
      clearInterval(this.autoScaleInterval);
    }

    // Wait for running tasks
    await this.waitForCompletion();

    // Terminate all workers
    await Promise.all(
      this.workers.map(w => w.worker.terminate())
    );

    console.log('✅ Worker pool shutdown complete');
  }
}

/**
 * Factory function
 */
export function createDistributedEngine(options) {
  return new DistributedAnalysisEngine(options);
}

export default DistributedAnalysisEngine;
