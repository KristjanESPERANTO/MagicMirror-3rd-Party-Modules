#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */
/**
 * Test Per-Module Logging (P7.4)
 *
 * Simple test to verify the module logger works correctly.
 */

import { createModuleLogger } from "./module-logger.js";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

async function testModuleLogger() {
  console.log("Testing Per-Module Logging (P7.4)...\n");

  const runId = `test-${Date.now()}`;
  const moduleId = "MMM-TestModule-----TestAuthor";

  console.log(`Run ID: ${runId}`);
  console.log(`Module ID: ${moduleId}\n`);

  // Create logger
  const logger = await createModuleLogger({
    projectRoot,
    runId,
    moduleId,
    workerId: process.pid
  });

  console.log(`Log file: ${logger.getLogFilePath()}\n`);

  // Test different log levels and phases
  await logger.info("start", "Module processing started", {
    name: "MMM-TestModule",
    maintainer: "TestAuthor"
  });

  await logger.info("clone", "Starting clone stage", {
    url: "https://github.com/test/repo.git",
    branch: "master"
  });

  await logger.debug("clone", "Checking if repo is up to date");

  await logger.info("clone", "Repository cloned successfully");

  await logger.info("enrich", "Starting enrichment stage");

  await logger.info("enrich", "Loaded package.json", {
    status: "parsed",
    hasKeywords: true
  });

  await logger.info("enrich", "Derived tags from keywords", {
    tags: ["weather", "calendar", "news"]
  });

  await logger.warn("enrich", "No compatible license found", {
    license: "UNKNOWN"
  });

  await logger.info("analyze", "Starting analysis stage");

  await logger.info("analyze", "Analysis complete", {
    issuesCount: 2,
    recommendationsCount: 1
  });

  await logger.info("end", "Module processing completed successfully", {
    processingTimeMs: 1234,
    totalIssues: 2,
    status: "success"
  });

  // Test error logging
  await logger.error("test", "This is a test error", {
    error: "Something went wrong",
    stack: "Error: test\n  at testFunction (file.js:10:5)"
  });

  // Close logger
  await logger.close();

  console.log("✅ Logger closed, flushing logs...\n");

  // Read and display the log file
  const logContent = await fs.readFile(logger.getLogFilePath(), "utf8");
  console.log("=== Log File Contents ===");
  console.log(logContent);
  console.log("=== End of Log ===\n");

  console.log("✅ Test completed successfully!");
  console.log(`\nLog file location: ${logger.getLogFilePath()}`);
}

testModuleLogger().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
