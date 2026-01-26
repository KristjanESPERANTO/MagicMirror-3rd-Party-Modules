#!/usr/bin/env node
/**
 * Worker Process Entry Point (P7.3)
 *
 * This script runs in a child process and processes batches of modules.
 * Communicates with parent orchestrator via IPC messages.
 */

import { createLogger } from "../../scripts/shared/logger.js";
import process from "node:process";
import { processModule } from "./process-module.js";

const logger = createLogger({ name: "worker" });

/**
 * @typedef {Object} ModuleBatch
 * @property {number} batchId
 * @property {Array} modules
 * @property {Object} config
 */

/**
 * @typedef {Object} WorkerMessage
 * @property {string} type - Message type: 'batch', 'shutdown'
 * @property {*} payload
 */

/**
 * Send message to parent process
 * @param {Object} message
 */
function sendMessage(message) {
  if (process.send) {
    process.send(message);
  }
  else {
    logger.error("Cannot send message: not running as child process");
  }
}

/**
 * Process a batch of modules
 * @param {ModuleBatch} batch
 * @returns {Promise<Object>}
 */
async function processBatch(batch) {
  const { batchId, modules, config } = batch;
  const startTime = Date.now();
  const results = [];
  const errors = [];

  logger.info(`Worker processing batch ${batchId} with ${modules.length} modules`);

  for (const module of modules) {
    try {
      // Send progress event
      sendMessage({
        type: "progress",
        payload: {
          batchId,
          moduleId: `${module.name}-----${module.maintainer}`,
          status: "started"
        }
      });

      // Process the module
      let result;
      try {
        result = await processModule(module, config);
      }
      catch (processError) {
        logger.error(`processModule failed for ${module.name}:`, processError);
        // Create a failed result instead of crashing
        result = {
          name: module.name,
          maintainer: module.maintainer,
          id: module.id || `${module.name}-----${module.maintainer}`,
          url: module.url,
          status: "failed",
          error: processError.message,
          cloned: false,
          issues: [],
          processingTimeMs: 0,
          fromCache: false
        };
      }
      results.push(result);

      // Send completion event
      sendMessage({
        type: "progress",
        payload: {
          batchId,
          moduleId: `${module.name}-----${module.maintainer}`,
          status: result.status,
          fromCache: result.fromCache
        }
      });
    }
    catch (error) {
      const errorInfo = {
        moduleId: `${module.name}-----${module.maintainer}`,
        phase: "unknown",
        error: error.message,
        stack: error.stack
      };
      errors.push(errorInfo);
      logger.error(`Failed to process ${module.name}:`, error);

      // Add failed result
      results.push({
        name: module.name,
        maintainer: module.maintainer,
        id: module.id,
        url: module.url,
        status: "failed",
        error: error.message,
        cloned: false,
        issues: [],
        processingTimeMs: 0,
        fromCache: false
      });
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    batchId,
    processedAt: new Date().toISOString(),
    durationMs,
    results,
    errors
  };
}

/**
 * Main worker loop
 */
function workerMain() {
  logger.info(`Worker started (PID: ${process.pid})`);

  // Listen for messages from parent
  process.on("message", async (message) => {
    const { type, payload } = message;

    try {
      switch (type) {
        case "batch": {
          const result = await processBatch(payload);
          sendMessage({ type: "complete", payload: result });
          break;
        }

        case "shutdown": {
          logger.info("Worker received shutdown signal");
          process.exit(0);
        }
        // Falls through - unreachable after process.exit

        default: {
          logger.warn(`Unknown message type: ${type}`);
          break;
        }
      }
    }
    catch (error) {
      logger.error("Worker error:", error);
      sendMessage({
        type: "error",
        payload: {
          error: error.message,
          stack: error.stack
        }
      });
    }
  });

  // Send ready signal
  sendMessage({ type: "ready", payload: { pid: process.pid } });

  // Keep process alive
  process.on("SIGTERM", () => {
    logger.info("Worker received SIGTERM");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("Worker received SIGINT");
    process.exit(0);
  });
}

// Start worker if run as child process
if (process.send) {
  workerMain().catch((error) => {
    logger.error("Fatal worker error:", error);
    process.exit(1);
  });
}
else {
  console.error("This script must be run as a child process");
  process.exit(1);
}
