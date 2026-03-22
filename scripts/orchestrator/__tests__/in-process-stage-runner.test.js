import assert from "node:assert/strict";
import { createInProcessStageRunner } from "../in-process-stage-runner.ts";
import { runStagesSequentially } from "../stage-executor.ts";
import { test } from "node:test";

function createSilentStageLogger() {
  return {
    error: () => null,
    fail: () => null,
    info: () => null,
    start: () => null,
    succeed: () => null,
    warn: () => null
  };
}

test("runStagesSequentially passes modules in memory across collect, parallel, and aggregate stages", async () => {
  const modules = [
    {
      category: "Test",
      id: "owner/module-a",
      issues: [],
      maintainer: "Owner",
      name: "module-a",
      url: "https://github.com/owner/module-a"
    }
  ];
  let capturedModules = null;
  let capturedCollectOutputWriter = "unset";
  let capturedParallelOutputWriter = "unset";
  let capturedStage5Modules = null;

  const stageRunner = createInProcessStageRunner({
    projectRoot: "/virtual/project",
    stageRuntimes: {
      aggregateCatalogue: (options) => {
        capturedStage5Modules = options.stage5Modules;
        return Promise.resolve({
          outputPaths: {
            modulesJsonPath: "/virtual/project/website/data/modules.json",
            modulesMinPath: "/virtual/project/website/data/modules.min.json",
            statsPath: "/virtual/project/website/data/stats.json"
          },
          stage5ModulesCount: options.stage5Modules.length
        });
      },
      collectMetadata: (options) => {
        capturedCollectOutputWriter = options.outputWriter;
        return Promise.resolve({
          modules,
          outputPath: "/virtual/project/website/data/modules.stage.2.json"
        });
      },
      parallelProcessing: (options) => {
        capturedModules = options.modules;
        capturedParallelOutputWriter = options.outputWriter;
        return Promise.resolve({
          results: options.modules.map(module => ({ ...module, fromCache: false, status: "success" })),
          stage5Modules: options.modules,
          stage5Path: "/virtual/project/website/data/modules.stage.5.json"
        });
      }
    }
  });

  const stages = [
    {
      command: { args: ["scripts/collect-metadata/index.ts"], executable: "node" },
      id: "collect-metadata",
      name: "Collect Metadata"
    },
    {
      command: { args: ["scripts/parallel-processing.ts"], executable: "node" },
      id: "parallel-processing",
      name: "Parallel module processing"
    },
    {
      command: { args: ["scripts/aggregate-catalogue.ts"], executable: "node" },
      id: "aggregate-catalogue",
      name: "Aggregate catalogue outputs"
    }
  ];

  const completedStages = await runStagesSequentially(stages, {
    cwd: "/virtual/project",
    env: { LOG_FORMAT: "text" },
    logger: createSilentStageLogger(),
    stageRunner,
    validateArtifacts: () => null
  });

  assert.deepStrictEqual(capturedModules, modules);
  assert.strictEqual(capturedCollectOutputWriter, null);
  assert.strictEqual(capturedParallelOutputWriter, null);
  assert.deepStrictEqual(capturedStage5Modules, modules);
  assert.strictEqual(completedStages.length, 3);
  assert.strictEqual(completedStages[0].stage.id, "collect-metadata");
  assert.strictEqual(completedStages[1].stage.id, "parallel-processing");
  assert.strictEqual(completedStages[2].stage.id, "aggregate-catalogue");
  assert.deepStrictEqual(stageRunner.getBufferedArtifactIds(), []);
});

test("runStagesSequentially clears buffered artifacts after filtered collect+parallel runs", async () => {
  const modules = [
    {
      category: "Test",
      id: "owner/module-a",
      issues: [],
      maintainer: "Owner",
      name: "module-a",
      url: "https://github.com/owner/module-a"
    }
  ];

  let capturedCollectOutputWriter = "unset";
  let capturedParallelOutputWriter = "unset";

  const stageRunner = createInProcessStageRunner({
    projectRoot: "/virtual/project",
    stageRuntimes: {
      collectMetadata: (options) => {
        capturedCollectOutputWriter = options.outputWriter;
        return Promise.resolve({
          modules,
          outputPath: "/virtual/project/website/data/modules.stage.2.json"
        });
      },
      parallelProcessing: (options) => {
        capturedParallelOutputWriter = options.outputWriter;
        return Promise.resolve({
          results: options.modules.map(module => ({ ...module, fromCache: false, status: "success" })),
          stage5Modules: options.modules,
          stage5Path: "/virtual/project/website/data/modules.stage.5.json"
        });
      }
    }
  });

  const stages = [
    {
      command: { args: ["scripts/collect-metadata/index.ts"], executable: "node" },
      id: "collect-metadata",
      name: "Collect Metadata"
    },
    {
      command: { args: ["scripts/parallel-processing.ts"], executable: "node" },
      id: "parallel-processing",
      name: "Parallel module processing"
    }
  ];

  const completedStages = await runStagesSequentially(stages, {
    cwd: "/virtual/project",
    env: { LOG_FORMAT: "text" },
    logger: createSilentStageLogger(),
    stageRunner,
    validateArtifacts: () => null
  });

  assert.strictEqual(completedStages.length, 2);
  assert.strictEqual(capturedCollectOutputWriter, null);
  assert.strictEqual(capturedParallelOutputWriter, null);
  assert.deepStrictEqual(stageRunner.getBufferedArtifactIds(), []);
});
