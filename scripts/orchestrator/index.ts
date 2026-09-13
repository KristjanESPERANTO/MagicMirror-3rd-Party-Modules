#!/usr/bin/env node

import { basename, dirname, join, relative, resolve } from "node:path";
import { buildExecutionPlan, loadStageGraph } from "./stage-graph.ts";
import { createLogger, createStageProgressLogger } from "../shared/logger.ts";
import type { LogFormat } from "../shared/logger.ts";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { runAggregateCatalogue } from "../aggregate-catalogue.ts";
import { runCollectMetadata } from "../collect-metadata/index.ts";
import { runGenerateResultMarkdown } from "../generate-result-markdown.ts";
import { runParallelProcessing, writeSkippedModulesFile } from "../parallel-processing.ts";
import { validateStageFile } from "../lib/schemaValidator.ts";
import type { ArtifactDefinition, ResolvedStageDefinition } from "./stage-graph.ts";

type PipelineExecutionError = Error & {
  stage?: ResolvedStageDefinition;
  stepNumber?: number;
  totalStages?: number;
};

interface DirectPipelineState {
  modules?: unknown[];
  processedModules?: unknown[];
  stats?: unknown;
}

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const PROJECT_ROOT = resolve(currentDir, "..", "..");
const DEFAULT_GRAPH_PATH = join(PROJECT_ROOT, "pipeline", "stage-graph.json");

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

function formatStageDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds >= 1 ? `${seconds.toFixed(1)}s` : `${durationMs}ms`;
}

async function runStagesDirectly(
  stages: ResolvedStageDefinition[],
  {
    logger,
    projectRoot,
    validateArtifacts
  }: {
    logger: ReturnType<typeof createStageProgressLogger>;
    projectRoot: string;
    validateArtifacts: ReturnType<typeof createArtifactValidator>;
  }
): Promise<void> {
  const state: DirectPipelineState = {};

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const stepNumber = index + 1;
    const total = stages.length;
    const startedAt = Date.now();

    logger.start(stage, { stepNumber, total });

    try {
      switch (stage.id) {
        case "collect-metadata": {
          const result = await runCollectMetadata();
          state.modules = result.modules;
          break;
        }
        case "parallel-processing": {
          if (!state.modules) {
            throw new Error("parallel-processing requires collect-metadata output");
          }

          const result = await runParallelProcessing({
            modules: state.modules as never,
            projectRoot,
            runLogger: logger
          });
          state.processedModules = result.processedModules;
          await writeSkippedModulesFile(result.results, projectRoot);
          break;
        }
        case "aggregate-catalogue": {
          if (!state.processedModules) {
            throw new Error("aggregate-catalogue requires parallel-processing output");
          }

          const result = await runAggregateCatalogue({
            processedModules: state.processedModules as never,
            projectRoot,
            runLogger: logger
          });
          state.stats = result.stats;
          break;
        }
        case "generate-result-markdown": {
          if (!state.processedModules || !state.stats) {
            throw new Error("generate-result-markdown requires aggregate-catalogue output");
          }

          await runGenerateResultMarkdown({
            processedModules: state.processedModules,
            projectRoot,
            runLogger: logger,
            stats: state.stats as never
          });
          break;
        }
        default:
          throw new Error(`Unsupported direct pipeline stage "${stage.id}".`);
      }

      await validateArtifacts(stage, { cwd: projectRoot, logger });
    }
    catch (error) {
      logger.fail(stage, { stepNumber, total, error });

      if (error instanceof Error) {
        const pipelineError = error as PipelineExecutionError;
        pipelineError.stage = stage;
        pipelineError.stepNumber = stepNumber;
        pipelineError.totalStages = total;
      }

      throw error;
    }

    const durationMs = Date.now() - startedAt;
    logger.succeed(stage, {
      stepNumber,
      total,
      durationMs,
      formattedDuration: formatStageDuration(durationMs)
    });
  }
}

async function runPipeline(
): Promise<void> {
  const graphPath = DEFAULT_GRAPH_PATH;
  const pipelineId = "full-refresh-parallel";
  const graph = await loadStageGraph(graphPath);
  const { pipeline, stages } = buildExecutionPlan(graph, pipelineId);
  const logFormat = process.env.LOG_FORMAT ?? "text";
  const baseLogger = createLogger({ name: "pipeline", format: logFormat as LogFormat });
  const stageLogger = createStageProgressLogger(baseLogger);
  const validateArtifacts = createArtifactValidator();

  if (logFormat !== "json") {
    console.log(`Running pipeline "${pipeline.id}" using graph ${relative(PROJECT_ROOT, graphPath)}\n`);
  }

  try {
    await runStagesDirectly(stages, {
      logger: stageLogger,
      projectRoot: PROJECT_ROOT,
      validateArtifacts
    });

    if (logFormat === "json") {
      baseLogger.info(`Pipeline "${pipeline.id}" completed successfully.`, {
        event: "pipeline_succeed",
        pipelineId: pipeline.id
      });
    }
    else {
      console.log(`\nPipeline "${pipeline.id}" completed successfully.`);
    }
  }
  catch (error) {
    if (logFormat === "json") {
      baseLogger.error(`Pipeline execution failed: ${error instanceof Error ? error.message : error}`, {
        event: "pipeline_fail",
        pipelineId: pipeline.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    throw error;
  }
}

export async function main(): Promise<void> {
  try {
    await runPipeline();
  }
  catch (error) {
    console.error(`\nPipeline execution failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${currentFile}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
