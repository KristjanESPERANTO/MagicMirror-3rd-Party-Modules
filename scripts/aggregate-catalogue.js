#!/usr/bin/env node

import { createLogger } from "./shared/logger.js";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writePublishedCatalogueOutputs } from "./shared/module-catalogue-output.js";

const logger = createLogger({ name: "aggregate-catalogue" });
const PROJECT_ROOT = resolve(process.cwd());

export async function runAggregateCatalogue({
  stage5Modules,
  projectRoot = PROJECT_ROOT,
  outputWriter = writePublishedCatalogueOutputs,
  runLogger = logger
} = {}) {
  if (!Array.isArray(stage5Modules)) {
    throw new TypeError("runAggregateCatalogue requires a stage5Modules array");
  }

  const outputPaths = outputWriter
    ? await outputWriter(stage5Modules, projectRoot)
    : null;

  runLogger.info(`Aggregated ${stage5Modules.length} module(s) into published catalogue outputs`);
  return {
    outputPaths,
    stage5ModulesCount: stage5Modules.length
  };
}

function parseStage5Modules(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.modules)) {
    return payload.modules;
  }

  throw new TypeError("modules.stage.5.json must contain either an array or an object with a modules array");
}

async function main() {
  try {
    const stage5Path = resolve(PROJECT_ROOT, "website/data/modules.stage.5.json");
    logger.info(`Reading stage-5 modules from ${stage5Path}...`);
    const payload = JSON.parse(await readFile(stage5Path, "utf-8"));
    const stage5Modules = parseStage5Modules(payload);

    await runAggregateCatalogue({
      projectRoot: PROJECT_ROOT,
      stage5Modules
    });
  }
  catch (error) {
    logger.error("Fatal error:", error);
    process.exit(1);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const isMainEntry = Boolean(process.argv[1]) && resolve(process.argv[1]) === currentFile;

if (isMainEntry) {
  main();
}
