import assert from "node:assert/strict";
import { runAggregateCatalogue } from "../../aggregate-catalogue.js";
import { test } from "node:test";

function createSilentLogger() {
  return {
    error: () => null,
    info: () => null,
    warn: () => null
  };
}

test("runAggregateCatalogue consumes in-memory stage-5 modules and delegates published output writing", async () => {
  const stage5Modules = [
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
  let capturedProjectRoot = null;

  const outputPaths = {
    modulesJsonPath: "/virtual/project/website/data/modules.json",
    modulesMinPath: "/virtual/project/website/data/modules.min.json",
    statsPath: "/virtual/project/website/data/stats.json"
  };

  const result = await runAggregateCatalogue({
    outputWriter: (modules, projectRoot) => {
      capturedModules = modules;
      capturedProjectRoot = projectRoot;
      return Promise.resolve(outputPaths);
    },
    projectRoot: "/virtual/project",
    runLogger: createSilentLogger(),
    stage5Modules
  });

  assert.deepStrictEqual(capturedModules, stage5Modules);
  assert.strictEqual(capturedProjectRoot, "/virtual/project");
  assert.deepStrictEqual(result.outputPaths, outputPaths);
  assert.strictEqual(result.wroteOutputs, true);
  assert.strictEqual(result.changeSummary, null);
  assert.strictEqual(result.stage5ModulesCount, stage5Modules.length);
});
