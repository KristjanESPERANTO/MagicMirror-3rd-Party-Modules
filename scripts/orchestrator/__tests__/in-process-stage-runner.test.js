import assert from "node:assert/strict";
import { createInProcessStageRunner } from "../in-process-stage-runner.js";
import { runStagesSequentially } from "../stage-executor.js";
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

test("runStagesSequentially passes modules-stage-2 in memory from collect-metadata to parallel-processing", async () => {
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

  const stageRunner = createInProcessStageRunner({
    projectRoot: "/virtual/project",
    stageRuntimes: {
      collectMetadata: () => Promise.resolve({
        modules,
        outputPath: "/virtual/project/website/data/modules.stage.2.json"
      }),
      parallelProcessing: (options) => {
        capturedModules = options.modules;
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
      command: { args: ["scripts/collect-metadata/index.js"], executable: "node" },
      id: "collect-metadata",
      name: "Collect Metadata"
    },
    {
      command: { args: ["scripts/parallel-processing.js"], executable: "node" },
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

  assert.deepStrictEqual(capturedModules, modules);
  assert.strictEqual(completedStages.length, 2);
  assert.strictEqual(completedStages[0].stage.id, "collect-metadata");
  assert.strictEqual(completedStages[1].stage.id, "parallel-processing");
});
