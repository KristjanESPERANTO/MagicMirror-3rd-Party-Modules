#!/usr/bin/env node
/**
 * Test script for worker pool (P7.3)
 *
 * Tests the worker pool with a small subset of modules.
 */

import { WorkerPool } from "./worker-pool.js";
import { createLogger } from "../../scripts/shared/logger.js";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const logger = createLogger({ name: "test-pool" });

async function testWorkerPool() {
  try {
    // Load a small subset of modules from stage 2
    const stage2Path = resolve(process.cwd(), "website/data/modules.stage.2.json");
    const stage2Data = JSON.parse(await readFile(stage2Path, "utf-8"));

    // Stage 2 is an array of modules
    const testModules = stage2Data.slice(0, 10);

    logger.info(`Testing worker pool with ${testModules.length} modules`);

    // Configure worker pool
    const pool = new WorkerPool({
      workerCount: 2, // Use only 2 workers for testing
      batchSize: 5 // Small batches
    });

    // Set up progress callback
    let modulesProcessed = 0;
    pool.onProgress((event) => {
      if (event.type === "module" && event.status !== "started") {
        modulesProcessed += 1;
        logger.info(
          `Progress: ${modulesProcessed}/${testModules.length} - ${event.moduleId} (${event.status}${event.fromCache ? ", cached" : ""})`
        );
      }

      if (event.type === "batch-complete") {
        logger.info(
          `Batch ${event.batchId} complete: ${event.completed}/${event.total} (${event.durationMs}ms)`
        );
      }
    });

    // Module processing config
    const moduleConfig = {
      projectRoot: resolve(process.cwd()),
      modulesDir: resolve(process.cwd(), "modules"),
      modulesTempDir: resolve(process.cwd(), "modules_temp"),
      imagesDir: resolve(process.cwd(), "website/images"),
      cacheEnabled: true,
      checkGroups: {
        fast: true,
        deep: false, // Disable deep checks for faster testing
        eslint: false,
        ncu: false
      },
      timeoutMs: 60000
    };

    const startTime = Date.now();

    // Process modules
    const results = await pool.processModules(testModules, moduleConfig);

    const duration = Date.now() - startTime;

    // Display results
    logger.info("\n========== Test Results ==========");
    logger.info(`Total modules: ${results.length}`);
    logger.info(`Total time: ${duration}ms`);
    logger.info(`Average time per module: ${Math.round(duration / results.length)}ms`);

    const successCount = results.filter(result => result.status === "success").length;
    const failedCount = results.filter(result => result.status === "failed").length;
    const skippedCount = results.filter(result => result.status === "skipped").length;
    const cachedCount = results.filter(result => result.fromCache).length;

    logger.info(`\nStatus breakdown:`);
    logger.info(`  ✓ Success: ${successCount}`);
    logger.info(`  ✗ Failed: ${failedCount}`);
    logger.info(`  ⊘ Skipped: ${skippedCount}`);
    logger.info(`  ⚡ Cached: ${cachedCount}`);

    if (failedCount > 0) {
      logger.info(`\nFailed modules:`);
      results
        .filter(result => result.status === "failed")
        .forEach((result) => {
          logger.info(`  - ${result.name}: ${result.error || "unknown error"}`);
        });
    }

    logger.info("\n✅ Worker pool test completed successfully!");
  }
  catch (error) {
    logger.error("Test failed:", error);
    process.exit(1);
  }
}

testWorkerPool();
