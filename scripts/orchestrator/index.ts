#!/usr/bin/env node

import { applyStageFilters, normalizeStageFilters, parseCommaSeparatedList } from "./stage-filters.ts";
import { basename, dirname, join, relative, resolve } from "node:path";
import { buildExecutionPlan, loadStageGraph } from "./stage-graph.ts";
import { createLogger, createStageProgressLogger } from "../shared/logger.ts";
import type { LogFormat } from "../shared/logger.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { Command } from "commander";
import { createInProcessStageRunner } from "./in-process-stage-runner.ts";
import { createResourceMonitor } from "./resource-monitor.ts";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { promisify } from "node:util";
import { registerAdditionalCommands } from "./cli-commands.ts";
import { runStagesSequentially } from "./stage-executor.ts";
import { validateStageFile } from "../lib/schemaValidator.ts";
import type { ArtifactDefinition, ResolvedStageDefinition } from "./stage-graph.ts";
import type { StageFilters } from "./stage-filters.ts";
import type { ProcessResourceUsage } from "./resource-monitor.ts";
import type { StageExecutionResult } from "./stage-executor.ts";

type PipelineExecutionError = Error & {
  completedStages?: StageExecutionResult<ResolvedStageDefinition>[];
  stage?: ResolvedStageDefinition;
  stepNumber?: number;
  totalStages?: number;
};

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const PROJECT_ROOT = resolve(currentDir, "..", "..");
const DEFAULT_GRAPH_PATH = join(PROJECT_ROOT, "pipeline", "stage-graph.json");
const RUNS_DIRECTORY = join(PROJECT_ROOT, ".pipeline-runs");
const MIN_NODE_VERSION = { major: 22, minor: 6, patch: 0 };
const execFileAsync = promisify(execFile);

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && error.code === "ENOENT";
}

function getSchemaIdFromPath(schemaPath: string): string | null {
  const filename = basename(schemaPath);
  if (!filename.endsWith(".schema.json")) {
    return null;
  }

  const suffixLength = ".schema.json".length;
  return filename.slice(0, filename.length - suffixLength);
}

function logOptionalArtifactMissing(artifact: ArtifactDefinition, schemaId: string | null, logger: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = logger as any;
  if (log && log.format === "json") {
    log.info(`Optional artifact not present: ${artifact.id}`, {
      artifactId: artifact.id,
      event: "artifact_optional_missing",
      path: artifact.path,
      schemaId
    });
    return;
  }

  console.log(`   ↳ optional artifact ${artifact.id} not written (in-memory handoff)`);
}

function createArtifactValidator() {
  return async (
    stage: ResolvedStageDefinition,
    { logger }: { cwd?: string; logger?: unknown } = {}
  ): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = logger as any;
    const outputs = stage.resolvedOutputs ?? [];

    for (const output of outputs) {
      const artifact = output.artifact;

      const isWriteMode = !output.mode || output.mode === "write";

      if (isWriteMode && artifact.schema) {
        const schemaId = getSchemaIdFromPath(artifact.schema);

        if (schemaId) {
          const artifactPath = resolve(PROJECT_ROOT, artifact.path);

          try {
            await validateStageFile(schemaId, artifactPath);
            if (log && log.format === "json") {
              log.info(`Validated ${artifact.id}`, {
                event: "artifact_validated",
                artifactId: artifact.id,
                schemaId,
                path: artifact.path
              });
            }
            else {
              console.log(`   ↳ validated ${artifact.id} against ${schemaId}`);
            }
          }
          catch (error) {
            if (output.optional && isMissingFileError(error)) {
              logOptionalArtifactMissing(artifact, schemaId, log);

              continue;
            }

            if (error instanceof Error) {
              error.message = `Stage "${stage.id}" produced invalid artifact "${artifact.id}" (${artifact.path}):\n${error.message}`;
            }
            throw error;
          }
        }
        else if (log && log.format === "json") {
          log.warn(`Skipping validation for artifact "${artifact.id}"`, {
            event: "artifact_validation_skipped",
            artifactId: artifact.id,
            reason: "unsupported schema reference",
            schema: artifact.schema
          });
        }
        else {
          console.warn(`Skipping validation for artifact "${artifact.id}" — unsupported schema reference "${artifact.schema}".`);
        }
      }
    }
  };
}

async function ensureRunsDirectoryExists() {
  await mkdir(RUNS_DIRECTORY, { recursive: true });
}

function sanitizePipelineIdForFilename(pipelineId: string): string {
  const fallback = pipelineId && pipelineId.length > 0 ? pipelineId : "pipeline";
  const normalized = fallback
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || "pipeline";
}

function buildRunRecordFilePath(startedAt: number, pipelineId: string): string {
  const timestamp = new Date(startedAt).toISOString()
    .replace(/[:.]/gu, "-");
  const safePipelineId = sanitizePipelineIdForFilename(pipelineId);
  const filename = `${timestamp}_${safePipelineId}.json`;

  return join(RUNS_DIRECTORY, filename);
}

function extractFailureDetails(failure: unknown) {
  if (!(failure instanceof Error)) {
    return {
      message: String(failure)
    };
  }

  const pipelineError = failure as PipelineExecutionError;
  const stage = pipelineError.stage;

  return {
    message: failure.message,
    stageId: stage?.id ?? null,
    stageName: stage?.name ?? null,
    stepNumber: pipelineError.stepNumber ?? null,
    totalStages: pipelineError.totalStages ?? null
  };
}

function mapStageResults({
  orderedStages,
  completedStages,
  skippedStages,
  failure
}: {
  orderedStages: ResolvedStageDefinition[];
  completedStages: StageExecutionResult<ResolvedStageDefinition>[];
  skippedStages: ResolvedStageDefinition[];
  failure: unknown;
}) {
  const results: Array<{
    id: string;
    name: string | null;
    status: string;
    durationMs?: number;
    error?: string | null;
  }> = [];
  const completedMap = new Map<string, StageExecutionResult<ResolvedStageDefinition>>();
  for (const entry of completedStages) {
    completedMap.set(entry.stage.id, entry);
  }

  const skippedSet = new Set(skippedStages.map(stage => stage.id));
  const pipelineError = failure instanceof Error ? failure as PipelineExecutionError : null;
  const failureStageId = pipelineError?.stage?.id ?? null;
  let failureMessage = null;
  if (failure instanceof Error) {
    failureMessage = failure.message;
  }
  else if (failure) {
    failureMessage = String(failure);
  }

  for (const stage of orderedStages) {
    const base = {
      id: stage.id,
      name: stage.name ?? null
    };

    if (skippedSet.has(stage.id)) {
      results.push({
        ...base,
        status: "skipped"
      });
      continue;
    }

    if (completedMap.has(stage.id)) {
      const { durationMs } = completedMap.get(stage.id)!;
      results.push({
        ...base,
        status: "succeeded",
        durationMs
      });
      continue;
    }

    if (failureStageId === stage.id) {
      results.push({
        ...base,
        status: "failed",
        error: failureMessage
      });
      continue;
    }

    results.push({
      ...base,
      status: "pending"
    });
  }

  return results;
}

async function writePipelineRunRecord({
  pipelineId,
  graphPath,
  filters,
  plannedStages,
  skippedStages,
  orderedStages,
  completedStages,
  startedAt,
  finishedAt,
  status,
  resourceUsage,
  failure
}: {
  completedStages: StageExecutionResult<ResolvedStageDefinition>[];
  failure?: unknown;
  filters: StageFilters;
  finishedAt: number;
  graphPath: string;
  orderedStages: ResolvedStageDefinition[];
  pipelineId: string;
  plannedStages: ResolvedStageDefinition[];
  resourceUsage?: ProcessResourceUsage | null;
  skippedStages: ResolvedStageDefinition[];
  startedAt: number;
  status: string;
}) {
  const durationMs = finishedAt - startedAt;
  const record = {
    pipelineId,
    graphPath: relative(PROJECT_ROOT, graphPath),
    filters,
    status,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs,
    plannedStageIds: plannedStages.map(stage => stage.id),
    skippedStageIds: skippedStages.map(stage => stage.id),
    stageResults: mapStageResults({
      orderedStages,
      completedStages,
      skippedStages,
      failure
    }),
    failure: undefined as ReturnType<typeof extractFailureDetails> | undefined,
    resourceUsage: undefined as ProcessResourceUsage | undefined
  };

  if (status === "failed" && failure) {
    record.failure = extractFailureDetails(failure);
  }

  if (resourceUsage) {
    record.resourceUsage = resourceUsage;
  }

  try {
    await ensureRunsDirectoryExists();
    const outputPath = buildRunRecordFilePath(startedAt, pipelineId);
    await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return outputPath;
  }
  catch (error) {
    console.warn(`Unable to persist pipeline run metadata: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function runPipeline(
  pipelineId: string,
  { graphPath = DEFAULT_GRAPH_PATH, filters, jsonLogs }: {
    filters?: Partial<StageFilters>;
    graphPath?: string;
    jsonLogs?: boolean;
  } = {}
): Promise<void> {
  const graph = await loadStageGraph(graphPath);
  const { pipeline, stages } = buildExecutionPlan(graph, pipelineId);
  const logFormat = jsonLogs ? "json" : process.env.LOG_FORMAT ?? "text";
  const baseLogger = createLogger({ name: "pipeline", format: logFormat as LogFormat });
  const stageLogger = createStageProgressLogger(baseLogger);
  const stageRunner = createInProcessStageRunner({ projectRoot: PROJECT_ROOT });
  const validateArtifacts = createArtifactValidator();
  const normalizedFilters = normalizeStageFilters(filters);
  const { selectedStages, skippedStages } = applyStageFilters(stages, normalizedFilters);

  if (logFormat !== "json") {
    console.log(`Running pipeline "${pipeline.id}" using graph ${relative(PROJECT_ROOT, graphPath)}\n`);
  }

  if (normalizedFilters.only.length > 0 || normalizedFilters.skip.length > 0) {
    if (logFormat !== "json") {
      console.log(`Filters applied — running ${selectedStages.length} of ${stages.length} stages.`);

      if (normalizedFilters.only.length > 0) {
        console.log(`   --only: ${normalizedFilters.only.join(", ")}`);
      }

      if (normalizedFilters.skip.length > 0) {
        console.log(`   --skip: ${normalizedFilters.skip.join(", ")}`);
      }

      console.log("");
    }
  }

  const resourceMonitor = createResourceMonitor();
  resourceMonitor.start();
  const startedAt = Date.now();

  try {
    const completedStages = await runStagesSequentially(selectedStages, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, LOG_FORMAT: logFormat },
      logger: stageLogger,
      stageRunner,
      validateArtifacts
    });

    const finishedAt = Date.now();
    const resourceUsage = resourceMonitor.stop();
    const recordPath = await writePipelineRunRecord({
      pipelineId: pipeline.id,
      graphPath,
      filters: normalizedFilters,
      plannedStages: selectedStages,
      skippedStages,
      orderedStages: stages,
      completedStages,
      startedAt,
      finishedAt,
      resourceUsage,
      status: "success"
    });

    if (logFormat === "json") {
      baseLogger.info(`Pipeline "${pipeline.id}" completed successfully.`, {
        event: "pipeline_succeed",
        pipelineId: pipeline.id,
        durationMs: finishedAt - startedAt,
        resourceUsage,
        runRecordPath: recordPath ? relative(PROJECT_ROOT, recordPath) : null
      });
    }
    else {
      console.log(`\nPipeline "${pipeline.id}" completed successfully.`);

      if (recordPath) {
        console.log(`Run metadata saved to ${relative(PROJECT_ROOT, recordPath)}`);
      }
    }
  }
  catch (error) {
    const finishedAt = Date.now();
    const resourceUsage = resourceMonitor.stop();
    const pipelineError = error as PipelineExecutionError;
    const completedStages: StageExecutionResult<ResolvedStageDefinition>[] =
      error instanceof Error && Array.isArray(pipelineError.completedStages)
        ? pipelineError.completedStages
        : [];

    const recordPath = await writePipelineRunRecord({
      pipelineId: pipeline.id,
      graphPath,
      filters: normalizedFilters,
      plannedStages: selectedStages,
      skippedStages,
      orderedStages: stages,
      completedStages,
      startedAt,
      finishedAt,
      resourceUsage,
      status: "failed",
      failure: error
    });

    if (logFormat === "json") {
      baseLogger.error(`Pipeline execution failed: ${error instanceof Error ? error.message : error}`, {
        event: "pipeline_fail",
        pipelineId: pipeline.id,
        durationMs: finishedAt - startedAt,
        resourceUsage,
        runRecordPath: recordPath ? relative(PROJECT_ROOT, recordPath) : null,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    else if (recordPath) {
      console.log(`Run metadata saved to ${relative(PROJECT_ROOT, recordPath)}`);
    }

    throw error;
  }
}

export async function main(argv = process.argv) {
  const program = new Command();

  program
    .name("pipeline")
    .description("MagicMirror pipeline orchestrator");

  registerAdditionalCommands(program, {
    defaultGraphPath: DEFAULT_GRAPH_PATH,
    projectRoot: PROJECT_ROOT,
    runsDirectory: RUNS_DIRECTORY,
    minNodeVersion: MIN_NODE_VERSION,
    execFileAsync
  });

  program
    .command("run [pipelineId]")
    .description("Execute the stages defined for the given pipeline")
    .option("-g, --graph <path>", "Path to the stage graph", DEFAULT_GRAPH_PATH)
    .option("--only <stageIds>", "Comma-separated list of stage ids to run exclusively", parseCommaSeparatedList, [])
    .option("--skip <stageIds>", "Comma-separated list of stage ids to skip", parseCommaSeparatedList, [])
    .option("--json-logs", "Output logs in JSON format")
    .action(async (pipelineId, options) => {
      const graphPath = resolve(options.graph);
      const selectedPipeline = pipelineId ?? "full-refresh-parallel";
      const filters = {
        only: options.only,
        skip: options.skip
      };
      const jsonLogs = options.jsonLogs;

      try {
        await runPipeline(selectedPipeline, { graphPath, filters, jsonLogs });
      }
      catch (error) {
        if (!jsonLogs) {
          const message = error instanceof Error ? error.message : error;
          console.error(`\nPipeline execution failed: ${message}`);
        }
        process.exitCode = 1;
      }
    });

  await program.parseAsync(argv);
}

if (import.meta.url === `file://${currentFile}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
