/**
 * Worker Pool Orchestrator (P7.3)
 *
 * Manages a pool of worker processes for parallel module processing.
 */

import { dirname, join } from "node:path";
import { cpus } from "node:os";
import { createLogger } from "../../scripts/shared/logger.js";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";

const logger = createLogger({ name: "orchestrator" });
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const WORKER_SCRIPT = join(currentDir, "worker.js");

/**
 * @typedef {Object} WorkerPoolConfig
 * @property {number} workerCount - Number of workers (default: CPU count - 1)
 * @property {number} batchSize - Modules per batch (default: 50)
 * @property {number} moduleTimeoutMs - Timeout per module (default: 60000)
 * @property {number} batchTimeoutMs - Timeout per batch (default: 1800000)
 */

/**
 * @typedef {Object} WorkerInfo
 * @property {number} id
 * @property {ChildProcess} process
 * @property {string} status - 'idle' | 'busy' | 'crashed'
 * @property {number|null} currentBatchId
 * @property {number} modulesProcessed
 * @property {Date} lastHeartbeat
 */

/**
 * Distribute modules into batches
 * @param {Array} modules
 * @param {number} batchSize
 * @returns {Array<{batchId: number, modules: Array}>}
 */
function distributeBatches(modules, batchSize) {
  const batches = [];

  for (let index = 0; index < modules.length; index += batchSize) {
    batches.push({
      batchId: batches.length,
      modules: modules.slice(index, index + batchSize)
    });
  }

  return batches;
}

/**
 * Worker Pool Manager
 */
export class WorkerPool {
  /**
   * @param {WorkerPoolConfig} config
   */
  constructor(config = {}) {
    this.config = {
      workerCount: config.workerCount || Math.max(1, cpus().length - 1),
      batchSize: config.batchSize || 50,
      moduleTimeoutMs: config.moduleTimeoutMs || 60000,
      batchTimeoutMs: config.batchTimeoutMs || 1800000
    };

    this.workers = new Map();
    this.batchQueue = [];
    this.results = [];
    this.totalBatches = 0;
    this.completedBatches = 0;
    this.progressCallback = null;
  }

  /**
   * Set progress callback for UI updates
   * @param {Function} callback
   */
  onProgress(callback) {
    this.progressCallback = callback;
  }

  /**
   * Spawn a worker process
   * @param {number} workerId
   * @returns {Promise<WorkerInfo>}
   */
  spawnWorker(workerId) {
    return new Promise((resolve, reject) => {
      const workerProcess = fork(WORKER_SCRIPT, [], {
        stdio: ["inherit", "inherit", "inherit", "ipc"]
      });

      const workerInfo = {
        id: workerId,
        process: workerProcess,
        status: "idle",
        currentBatchId: null,
        modulesProcessed: 0,
        lastHeartbeat: new Date()
      };

      // Handle worker messages
      workerProcess.on("message", (message) => {
        this.handleWorkerMessage(workerId, message);
      });

      // Handle worker errors
      workerProcess.on("error", (error) => {
        logger.error(`Worker ${workerId} error:`, error);
        workerInfo.status = "crashed";
      });

      // Handle worker exit
      workerProcess.on("exit", (code) => {
        if (code !== 0) {
          logger.error(`Worker ${workerId} exited with code ${code}`);
          workerInfo.status = "crashed";

          // Re-queue batch if worker crashed while processing
          if (workerInfo.currentBatchId !== null) {
            const batch = this.findBatch(workerInfo.currentBatchId);
            if (batch) {
              logger.warn(`Re-queuing batch ${batch.batchId} after worker crash`);
              this.batchQueue.unshift(batch);
            }
          }
        }
        this.workers.delete(workerId);
      });

      // Wait for ready signal
      const readyHandler = (message) => {
        if (message.type === "ready") {
          workerProcess.off("message", readyHandler);
          this.workers.set(workerId, workerInfo);
          logger.info(`Worker ${workerId} ready (PID: ${message.payload.pid})`);
          resolve(workerInfo);
        }
      };
      workerProcess.on("message", readyHandler);

      // Timeout for worker startup
      setTimeout(() => {
        if (workerInfo.status === "idle") {
          reject(new Error(`Worker ${workerId} startup timeout`));
        }
      }, 10000);
    });
  }

  /**
   * Handle message from worker
   * @param {number} workerId
   * @param {Object} message
   */
  handleWorkerMessage(workerId, message) {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    worker.lastHeartbeat = new Date();

    switch (message.type) {
      case "progress":
        if (this.progressCallback) {
          this.progressCallback({
            type: "module",
            workerId,
            ...message.payload
          });
        }
        break;

      case "complete":
        this.handleBatchComplete(workerId, message.payload);
        break;

      case "error":
        logger.error(`Worker ${workerId} reported error:`, message.payload);
        break;
    }
  }

  /**
   * Handle batch completion
   * @param {number} workerId
   * @param {Object} result
   */
  handleBatchComplete(workerId, result) {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }

    this.results.push(result);
    this.completedBatches += 1;
    worker.status = "idle";
    worker.currentBatchId = null;
    worker.modulesProcessed += result.results.length;

    logger.info(
      `Batch ${result.batchId} complete (${result.results.length} modules, ${result.durationMs}ms)`
    );

    if (this.progressCallback) {
      this.progressCallback({
        type: "batch-complete",
        batchId: result.batchId,
        completed: this.completedBatches,
        total: this.totalBatches,
        durationMs: result.durationMs
      });
    }

    // Assign next batch if available
    this.assignBatch(worker);
  }

  /**
   * Assign next batch to worker
   * @param {WorkerInfo} worker
   */
  assignBatch(worker) {
    if (this.batchQueue.length === 0) {
      return;
    }

    const batch = this.batchQueue.shift();
    worker.status = "busy";
    worker.currentBatchId = batch.batchId;

    logger.info(`Assigning batch ${batch.batchId} to worker ${worker.id}`);

    worker.process.send({
      type: "batch",
      payload: batch
    });
  }

  /**
   * Find batch by ID
   * @param {number} batchId
   * @returns {Object|null}
   */
  findBatch(batchId) {
    return this.batchQueue.find(b => b.batchId === batchId) || null;
  }

  /**
   * Process modules using worker pool
   * @param {Array} modules
   * @param {Object} moduleConfig
   * @returns {Promise<Array>}
   */
  async processModules(modules, moduleConfig) {
    // Create batches
    const batches = distributeBatches(modules, this.config.batchSize);
    this.totalBatches = batches.length;
    this.batchQueue = batches.map(batch => ({
      ...batch,
      config: moduleConfig
    }));

    logger.info(
      `Starting worker pool: ${this.config.workerCount} workers, ${batches.length} batches`
    );

    // Spawn workers
    const workerPromises = [];
    for (let workerIndex = 0; workerIndex < this.config.workerCount; workerIndex += 1) {
      workerPromises.push(this.spawnWorker(workerIndex));
    }

    const workers = await Promise.all(workerPromises);

    // Assign initial batches
    workers.forEach(worker => this.assignBatch(worker));

    // Wait for all batches to complete
    await this.waitForCompletion();

    // Shutdown workers
    await this.shutdown();

    // Aggregate and return results
    return this.aggregateResults();
  }

  /**
   * Wait for all batches to complete
   * @returns {Promise<void>}
   */
  waitForCompletion() {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.completedBatches >= this.totalBatches) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Shutdown all workers
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info("Shutting down workers...");

    const shutdownPromises = [];
    for (const worker of this.workers.values()) {
      const promise = new Promise((resolve) => {
        worker.process.once("exit", resolve);
        worker.process.send({ type: "shutdown" });

        // Force kill after timeout
        setTimeout(() => {
          worker.process.kill();
          resolve();
        }, 5000);
      });
      shutdownPromises.push(promise);
    }

    await Promise.all(shutdownPromises);
    this.workers.clear();
  }

  /**
   * Aggregate results from all batches
   * @returns {Array}
   */
  aggregateResults() {
    const allResults = [];

    for (const batchResult of this.results) {
      allResults.push(...batchResult.results);
    }

    logger.info(`Processed ${allResults.length} modules total`);

    return allResults;
  }
}
