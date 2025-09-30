#!/usr/bin/env node

import {buildExecutionPlan, loadStageGraph} from "./stage-graph.js";
import {mkdir, writeFile} from "node:fs/promises";
import {Command} from "commander";
import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";
import {runStagesSequentially} from "./stage-executor.js";
import {validateStageFile} from "../lib/schemaValidator.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const PROJECT_ROOT = path.resolve(currentDir, "..", "..");
const DEFAULT_GRAPH_PATH = path.join(PROJECT_ROOT, "pipeline", "stage-graph.json");
const RUNS_DIRECTORY = path.join(PROJECT_ROOT, ".pipeline-runs");

function createLogger () {
  return {
    start (stage, {stepNumber, total}) {
      const details = stage.name ? `${stage.id} (${stage.name})` : stage.id;
      console.log(`\n▶︎  [${stepNumber}/${total}] ${details}`);
    },
    succeed (stage, {stepNumber, total, formattedDuration}) {
      const details = stage.name ? `${stage.id} (${stage.name})` : stage.id;
      console.log(`✔︎  [${stepNumber}/${total}] ${details} — completed in ${formattedDuration}`);
    },
    fail (stage, {stepNumber, total, error}) {
      const details = stage.name ? `${stage.id} (${stage.name})` : stage.id;
      console.error(`✖︎  [${stepNumber}/${total}] ${details} — failed`);
      if (error) {
        console.error(error.message);
      }
    }
  };
}

function getSchemaIdFromPath (schemaPath) {
  const filename = path.basename(schemaPath);
  if (!filename.endsWith(".schema.json")) {
    return null;
  }

  const suffixLength = ".schema.json".length;
  return filename.slice(0, filename.length - suffixLength);
}

function createArtifactValidator () {
  return async (stage) => {
    const outputs = stage.resolvedOutputs ?? [];

    for (const output of outputs) {
      const artifact = output.artifact;

      const isWriteMode = !output.mode || output.mode === "write";
      const hasSchema = Boolean(artifact?.schema);

      if (isWriteMode && hasSchema) {
        const schemaId = getSchemaIdFromPath(artifact.schema);

        if (schemaId) {
          const artifactPath = path.resolve(PROJECT_ROOT, artifact.path);

          try {
            await validateStageFile(schemaId, artifactPath);
            console.log(`   ↳ validated ${artifact.id} against ${schemaId}`);
          } catch (error) {
            if (error instanceof Error) {
              error.message = `Stage "${stage.id}" produced invalid artifact "${artifact.id}" (${artifact.path}):\n${error.message}`;
            }
            throw error;
          }
        } else {
          console.warn(`Skipping validation for artifact "${artifact.id}" — unsupported schema reference "${artifact.schema}".`);
        }
      }
    }
  };
}

function parseCommaSeparatedList (value, previous = []) {
  if (!value) {
    return previous;
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return [...previous, ...parsed];
}

function normalizeStageFilters ({only = [], skip = []} = {}) {
  const normalize = (values) => Array.from(new Set(values
    .map((value) => value.trim())
    .filter(Boolean)));

  return {
    only: normalize(only),
    skip: normalize(skip)
  };
}

function applyStageFilters (stages, filters) {
  const stageIdSet = new Set(stages.map((stage) => stage.id));

  const unknownOnly = filters.only.filter((stageId) => !stageIdSet.has(stageId));
  if (unknownOnly.length > 0) {
    throw new Error(`Unknown stage id${unknownOnly.length > 1 ? "s" : ""} in --only: ${unknownOnly.join(", ")}`);
  }

  const unknownSkip = filters.skip.filter((stageId) => !stageIdSet.has(stageId));
  if (unknownSkip.length > 0) {
    throw new Error(`Unknown stage id${unknownSkip.length > 1 ? "s" : ""} in --skip: ${unknownSkip.join(", ")}`);
  }

  let filteredStages = stages;

  if (filters.only.length > 0) {
    const onlySet = new Set(filters.only);
    filteredStages = stages.filter((stage) => onlySet.has(stage.id));

    if (filteredStages.length === 0) {
      throw new Error("No stages matched the provided --only filters.");
    }
  }

  if (filters.skip.length > 0) {
    const skipSet = new Set(filters.skip);
    filteredStages = filteredStages.filter((stage) => !skipSet.has(stage.id));
  }

  if (filteredStages.length === 0) {
    throw new Error("All stages were filtered out. Nothing to run.");
  }

  return filteredStages;
}

async function ensureRunsDirectoryExists () {
  await mkdir(RUNS_DIRECTORY, {recursive: true});
}

function sanitizePipelineIdForFilename (pipelineId) {
  const fallback = pipelineId && pipelineId.length > 0 ? pipelineId : "pipeline";
  const normalized = fallback
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || "pipeline";
}

function buildRunRecordFilePath (startedAt, pipelineId) {
  const timestamp = new Date(startedAt).toISOString()
    .replace(/[:.]/gu, "-");
  const safePipelineId = sanitizePipelineIdForFilename(pipelineId);
  const filename = `${timestamp}_${safePipelineId}.json`;

  return path.join(RUNS_DIRECTORY, filename);
}

function extractFailureDetails (failure) {
  if (!(failure instanceof Error)) {
    return {
      message: String(failure)
    };
  }

  const stage = failure.stage;

  return {
    message: failure.message,
    stageId: stage?.id ?? null,
    stageName: stage?.name ?? null,
    stepNumber: failure.stepNumber ?? null,
    totalStages: failure.totalStages ?? null
  };
}

function mapStageResults (completedStages, failure) {
  const summaries = completedStages.map(({stage, durationMs}) => ({
    id: stage.id,
    name: stage.name ?? null,
    status: "succeeded",
    durationMs
  }));

  if (failure instanceof Error && failure.stage) {
    summaries.push({
      id: failure.stage.id,
      name: failure.stage.name ?? null,
      status: "failed",
      error: failure.message,
      stepNumber: failure.stepNumber ?? null,
      totalStages: failure.totalStages ?? null
    });
  } else if (failure) {
    summaries.push({
      id: null,
      name: null,
      status: "failed",
      error: failure instanceof Error ? failure.message : String(failure)
    });
  }

  return summaries;
}

async function writePipelineRunRecord ({
  pipelineId,
  graphPath,
  filters,
  plannedStages,
  completedStages,
  startedAt,
  finishedAt,
  status,
  failure
}) {
  const durationMs = finishedAt - startedAt;
  const record = {
    pipelineId,
    graphPath: path.relative(PROJECT_ROOT, graphPath),
    filters,
    status,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs,
    plannedStageIds: plannedStages.map((stage) => stage.id),
    stageResults: mapStageResults(completedStages, failure)
  };

  if (status === "failed" && failure) {
    record.failure = extractFailureDetails(failure);
  }

  try {
    await ensureRunsDirectoryExists();
    const outputPath = buildRunRecordFilePath(startedAt, pipelineId);
    await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return outputPath;
  } catch (error) {
    console.warn(`Unable to persist pipeline run metadata: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function runPipeline (pipelineId, {graphPath, filters} = {}) {
  const logger = createLogger();
  const graph = await loadStageGraph(graphPath);
  const {pipeline, stages} = buildExecutionPlan(graph, pipelineId);
  const validateArtifacts = createArtifactValidator();
  const normalizedFilters = normalizeStageFilters(filters);
  const filteredStages = applyStageFilters(stages, normalizedFilters);

  console.log(`Running pipeline "${pipeline.id}" using graph ${path.relative(PROJECT_ROOT, graphPath)}\n`);

  if (normalizedFilters.only.length > 0 || normalizedFilters.skip.length > 0) {
    console.log(`Filters applied — running ${filteredStages.length} of ${stages.length} stages.`);

    if (normalizedFilters.only.length > 0) {
      console.log(`   --only: ${normalizedFilters.only.join(", ")}`);
    }

    if (normalizedFilters.skip.length > 0) {
      console.log(`   --skip: ${normalizedFilters.skip.join(", ")}`);
    }

    console.log("");
  }

  const startedAt = Date.now();

  try {
    const completedStages = await runStagesSequentially(filteredStages, {
      cwd: PROJECT_ROOT,
      env: process.env,
      logger,
      validateArtifacts
    });

    const finishedAt = Date.now();
    const recordPath = await writePipelineRunRecord({
      pipelineId: pipeline.id,
      graphPath,
      filters: normalizedFilters,
      plannedStages: filteredStages,
      completedStages,
      startedAt,
      finishedAt,
      status: "success"
    });

    console.log(`\nPipeline "${pipeline.id}" completed successfully.`);

    if (recordPath) {
      console.log(`Run metadata saved to ${path.relative(PROJECT_ROOT, recordPath)}`);
    }
  } catch (error) {
    const finishedAt = Date.now();
    const completedStages = error instanceof Error && Array.isArray(error.completedStages)
      ? error.completedStages
      : [];

    const recordPath = await writePipelineRunRecord({
      pipelineId: pipeline.id,
      graphPath,
      filters: normalizedFilters,
      plannedStages: filteredStages,
      completedStages,
      startedAt,
      finishedAt,
      status: "failed",
      failure: error
    });

    if (recordPath) {
      console.log(`Run metadata saved to ${path.relative(PROJECT_ROOT, recordPath)}`);
    }

    throw error;
  }
}

export async function main (argv = process.argv) {
  const program = new Command();

  program
    .name("pipeline")
    .description("MagicMirror pipeline orchestrator");

  program
    .command("run [pipelineId]")
    .description("Execute the stages defined for the given pipeline")
    .option("-g, --graph <path>", "Path to the stage graph", DEFAULT_GRAPH_PATH)
    .option("--only <stageIds>", "Comma-separated list of stage ids to run exclusively", parseCommaSeparatedList, [])
    .option("--skip <stageIds>", "Comma-separated list of stage ids to skip", parseCommaSeparatedList, [])
    .action(async (pipelineId, options) => {
      const graphPath = path.resolve(options.graph);
      const selectedPipeline = pipelineId ?? "full-refresh";
      const filters = {
        only: options.only,
        skip: options.skip
      };

      try {
        await runPipeline(selectedPipeline, {graphPath, filters});
      } catch (error) {
        const message = error instanceof Error ? error.message : error;
        console.error(`\nPipeline execution failed: ${message}`);
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
