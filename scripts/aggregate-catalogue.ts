#!/usr/bin/env node

import { createLogger } from "./shared/logger.ts";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writePublishedCatalogueOutputs } from "./shared/module-catalogue-output.ts";

interface Stage5Module {
  id: string;
  [key: string]: unknown;
}

interface OutputPaths {
  modulesJsonPath: string;
  modulesMinPath: string;
  statsPath: string;
}

interface ChangeSummary {
  addedCount: number;
  changedCount: number;
  hasChanges: boolean;
  removedCount: number;
  unchangedCount: number;
}

interface OutputResult {
  changeSummary?: ChangeSummary | null;
  modulesJsonPath?: string;
  modulesMinPath?: string;
  outputPaths?: OutputPaths | null;
  stats?: unknown;
  statsPath?: string;
  wroteOutputs?: boolean;
}

interface NormalizedOutputDetails {
  changeSummary: ChangeSummary | null;
  outputPaths: OutputPaths | null;
  stats?: unknown;
  wroteOutputs: boolean;
}

interface AggregateLogger {
  error: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
}

type OutputWriter = (stage5Modules: Stage5Module[], projectRoot: string) => Promise<OutputResult | OutputPaths> | OutputResult | OutputPaths;

interface RunAggregateCatalogueOptions {
  outputWriter?: OutputWriter | null;
  projectRoot?: string;
  runLogger?: AggregateLogger;
  stage5Modules?: Stage5Module[];
}

export interface AggregateCatalogueResult {
  changeSummary: ChangeSummary | null;
  outputPaths: OutputPaths | null;
  stage5ModulesCount: number;
  stats?: unknown;
  wroteOutputs: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const logger = createLogger({ name: "aggregate-catalogue" });
const PROJECT_ROOT = resolve(process.cwd());

function normalizeOutputDetails(outputResult: OutputResult | OutputPaths | null): NormalizedOutputDetails {
  if (!outputResult || typeof outputResult !== "object") {
    return {
      changeSummary: null,
      outputPaths: null,
      wroteOutputs: true
    };
  }

  const result = outputResult as OutputResult;
  const outputPaths = result.outputPaths
    ?? (result.modulesJsonPath && result.modulesMinPath && result.statsPath
      ? {
        modulesJsonPath: result.modulesJsonPath,
        modulesMinPath: result.modulesMinPath,
        statsPath: result.statsPath
      }
      : null);

  return {
    changeSummary: result.changeSummary ?? null,
    outputPaths,
    stats: result.stats,
    wroteOutputs: typeof result.wroteOutputs === "boolean" ? result.wroteOutputs : true
  };
}

export async function runAggregateCatalogue({
  stage5Modules,
  projectRoot = PROJECT_ROOT,
  outputWriter = writePublishedCatalogueOutputs,
  runLogger = logger
}: RunAggregateCatalogueOptions): Promise<AggregateCatalogueResult> {
  const resolvedStage5Modules = Array.isArray(stage5Modules)
    ? stage5Modules
    : await readStage5ModulesFromDisk(projectRoot);

  const outputResult = outputWriter
    ? await outputWriter(resolvedStage5Modules, projectRoot)
    : null;

  const outputDetails = normalizeOutputDetails(outputResult);

  if (outputDetails.changeSummary) {
    const {
      addedCount,
      changedCount,
      hasChanges,
      removedCount,
      unchangedCount
    } = outputDetails.changeSummary;

    runLogger.info(
      `Diff summary: +${addedCount} ~${changedCount} -${removedCount} =${unchangedCount}`
    );

    if (!hasChanges && !outputDetails.wroteOutputs) {
      runLogger.info("No module-level changes detected; reusing existing published outputs");
    }
  }

  runLogger.info(`Aggregated ${resolvedStage5Modules.length} module(s) into published catalogue outputs`);
  return {
    changeSummary: outputDetails.changeSummary,
    outputPaths: outputDetails.outputPaths,
    stage5ModulesCount: resolvedStage5Modules.length,
    stats: outputDetails.stats,
    wroteOutputs: outputDetails.wroteOutputs
  };
}

function parseStage5Modules(payload: unknown): Stage5Module[] {
  if (Array.isArray(payload)) {
    return payload as Stage5Module[];
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as { modules?: unknown[] }).modules)) {
    return (payload as { modules: Stage5Module[] }).modules;
  }

  throw new TypeError("modules.stage.5.json must contain either an array or an object with a modules array");
}

async function main(): Promise<void> {
  try {
    const stage5Modules = await readStage5ModulesFromDisk(PROJECT_ROOT);

    await runAggregateCatalogue({
      projectRoot: PROJECT_ROOT,
      stage5Modules
    });
  }
  catch (error) {
    logger.error("Fatal error:", getErrorMessage(error));
    process.exit(1);
  }
}

const currentFile = fileURLToPath(import.meta.url);
const isMainEntry = Boolean(process.argv[1]) && resolve(process.argv[1]) === currentFile;

if (isMainEntry) {
  main();
}

async function readStage5ModulesFromDisk(projectRoot: string): Promise<Stage5Module[]> {
  const stage5Path = resolve(projectRoot, "website/data/modules.stage.5.json");
  logger.info(`Reading stage-5 modules from ${stage5Path}...`);
  const payload = JSON.parse(await readFile(stage5Path, "utf-8"));
  return parseStage5Modules(payload);
}
