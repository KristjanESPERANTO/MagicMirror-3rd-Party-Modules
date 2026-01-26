#!/usr/bin/env node
/**
 * Parallel Module Processing Stage (P7.3)
 *
 * Replaces stages 3+4+5 with parallel worker pool processing.
 * Reads modules.stage.2.json and outputs modules.stage.5.json
 */

import { createLogger, createStageProgressLogger } from "../scripts/shared/logger.js";
import { readFile, writeFile } from "node:fs/promises";
import { WorkerPool } from "../pipeline/workers/worker-pool.js";
import { cpus } from "node:os";
import process from "node:process";
import { resolve } from "node:path";
import { stringifyDeterministic } from "../scripts/shared/deterministic-output.js";

const logger = createLogger({ name: "parallel-processing" });
const PROJECT_ROOT = resolve(process.cwd());

/**
 * Get worker count from environment or CLI
 */
function getWorkerCount() {
  const envWorkers = process.env.PIPELINE_WORKER_COUNT;
  if (envWorkers) {
    return parseInt(envWorkers, 10);
  }

  // Check CLI args for --workers=N
  const workerArg = process.argv.find(arg => arg.startsWith("--workers="));
  if (workerArg) {
    return parseInt(workerArg.split("=")[1], 10);
  }

  // Default: CPU count - 1
  return Math.max(1, cpus().length - 1);
}

/**
 * Get batch size from CLI
 */
function getBatchSize() {
  const batchArg = process.argv.find(arg => arg.startsWith("--batch-size="));
  if (batchArg) {
    return parseInt(batchArg.split("=")[1], 10);
  }
  return 50; // Default batch size
}

async function main() {
  const startTime = Date.now();

  try {
    // Read input modules from stage 2
    const stage2Path = resolve(PROJECT_ROOT, "website/data/modules.stage.2.json");
    logger.info(`Reading modules from ${stage2Path}...`);
    const modules = JSON.parse(await readFile(stage2Path, "utf-8"));

    logger.info(`Loaded ${modules.length} modules`);

    // Configure worker pool
    const workerCount = getWorkerCount();
    const batchSize = getBatchSize();

    logger.info(`Starting parallel processing with ${workerCount} workers, batch size ${batchSize}`);

    const pool = new WorkerPool({
      workerCount,
      batchSize,
      moduleTimeoutMs: 60000,
      batchTimeoutMs: 1800000
    });

    // Set up progress tracking
    const progressLogger = createStageProgressLogger("parallel-processing", modules.length);
    let processedCount = 0;

    pool.onProgress((event) => {
      if (event.type === "module" && event.status !== "started") {
        processedCount += 1;
        let status = "⊘";
        if (event.status === "success") {
          status = "✓";
        }
        else if (event.status === "failed") {
          status = "✗";
        }
        const cacheInfo = event.fromCache ? " (cached)" : "";

        progressLogger.update(processedCount, {
          current: `${status} ${event.moduleId}${cacheInfo}`
        });
      }
    });

    // Module processing config
    const moduleConfig = {
      projectRoot: PROJECT_ROOT,
      modulesDir: resolve(PROJECT_ROOT, "modules"),
      modulesTempDir: resolve(PROJECT_ROOT, "modules_temp"),
      imagesDir: resolve(PROJECT_ROOT, "website/images"),
      cacheEnabled: true,
      checkGroups: {
        fast: true,
        deep: true,
        eslint: true,
        ncu: true
      },
      timeoutMs: 60000
    };

    // Process all modules
    const results = await pool.processModules(modules, moduleConfig);

    progressLogger.complete();

    // Write results to stage 5 output
    const stage5Path = resolve(PROJECT_ROOT, "website/data/modules.stage.5.json");
    const stage5Data = stringifyDeterministic(results);
    await writeFile(stage5Path, stage5Data, "utf-8");

    const duration = Date.now() - startTime;
    const avgTime = Math.round(duration / results.length);

    // Summary
    const successCount = results.filter(result => result.status === "success").length;
    const failedCount = results.filter(result => result.status === "failed").length;
    const skippedCount = results.filter(result => result.status === "skipped").length;
    const cachedCount = results.filter(result => result.fromCache).length;

    logger.info("\n========== Processing Complete ==========");
    logger.info(`Total modules: ${results.length}`);
    logger.info(`Success: ${successCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);
    logger.info(`Cached: ${cachedCount} (${Math.round(cachedCount / results.length * 100)}%)`);
    logger.info(`Total time: ${(duration / 1000).toFixed(1)}s`);
    logger.info(`Average: ${avgTime}ms per module`);
    logger.info(`Output: ${stage5Path}`);

    if (failedCount > 0) {
      logger.warn(`\n${failedCount} modules failed - check logs for details`);
    }
  }
  catch (error) {
    logger.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
