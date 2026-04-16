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
      collectMetadata: () => Promise.resolve({ modules }),
      parallelProcessing: (options) => {
        capturedModules = options.modules;
        capturedParallelOutputWriter = options.outputWriter;
        return Promise.resolve({
          results: options.modules.map(module => ({ ...module, fromCache: false, status: "success" })),
          stage5Modules: options.modules
        });
      },
      writeSkippedModules: () => Promise.resolve()
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

  let capturedParallelOutputWriter = "unset";

  const stageRunner = createInProcessStageRunner({
    projectRoot: "/virtual/project",
    stageRuntimes: {
      collectMetadata: () => Promise.resolve({ modules }),
      parallelProcessing: (options) => {
        capturedParallelOutputWriter = options.outputWriter;
        return Promise.resolve({
          results: options.modules.map(module => ({ ...module, fromCache: false, status: "success" })),
          stage5Modules: options.modules
        });
      },
      writeSkippedModules: () => Promise.resolve()
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
  assert.strictEqual(capturedParallelOutputWriter, null);
  assert.deepStrictEqual(stageRunner.getBufferedArtifactIds(), []);
});

test("runStagesSequentially passes aggregate stats in memory to result markdown stage", async () => {
  const modules = [
    {
      category: "Test",
      id: "owner/module-a",
      issues: ["demo issue"],
      maintainer: "Owner",
      name: "module-a",
      url: "https://github.com/owner/module-a"
    }
  ];

  const stats = {
    issueCounter: 1,
    lastUpdate: "2026-03-22T12:00:00.000Z",
    maintainer: { Owner: 1 },
    moduleCounter: 1,
    modulesWithIssuesCounter: 1,
    repositoryHoster: { github: 1 }
  };

  let capturedMarkdownOptions = null;

  const stageRunner = createInProcessStageRunner({
    projectRoot: "/virtual/project",
    stageRuntimes: {
      aggregateCatalogue: () => Promise.resolve({
        outputPaths: {
          modulesJsonPath: "/virtual/project/website/data/modules.json",
          modulesMinPath: "/virtual/project/website/data/modules.min.json",
          statsPath: "/virtual/project/website/data/stats.json"
        },
        stage5ModulesCount: 1,
        stats,
        wroteOutputs: true
      }),
      collectMetadata: () => Promise.resolve({ modules }),
      generateResultMarkdown: (options) => {
        capturedMarkdownOptions = options;
        return Promise.resolve({
          issueCount: 1,
          outputPath: "/virtual/project/website/result.md"
        });
      },
      parallelProcessing: () => Promise.resolve({
        results: modules.map(module => ({ ...module, fromCache: false, status: "success" })),
        stage5Modules: modules
      }),
      writeSkippedModules: () => Promise.resolve()
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
    },
    {
      command: { args: ["scripts/generate-result-markdown.ts"], executable: "node" },
      id: "generate-result-markdown",
      name: "Generate result markdown"
    }
  ];

  const completedStages = await runStagesSequentially(stages, {
    cwd: "/virtual/project",
    env: { LOG_FORMAT: "text" },
    logger: createSilentStageLogger(),
    stageRunner,
    validateArtifacts: () => null
  });

  assert.strictEqual(completedStages.length, 4);
  assert.deepStrictEqual(capturedMarkdownOptions, {
    projectRoot: "/virtual/project",
    stage5Modules: modules,
    stats
  });
  assert.deepStrictEqual(stageRunner.getBufferedArtifactIds(), []);
});
