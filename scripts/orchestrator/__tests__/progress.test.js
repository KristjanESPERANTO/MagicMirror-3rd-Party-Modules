import { buildProgressSummary, selectProgressRecords } from "../progress.js";
import { strict as assert } from "node:assert";
import { test } from "node:test";

function createRunRecord(overrides = {}) {
  return {
    durationMs: 1_000,
    filters: { only: [], skip: [] },
    pipelineId: "full-refresh-parallel",
    runFile: "run.json",
    stageResults: [],
    startedAt: "2026-03-20T10:00:00.000Z",
    status: "success",
    ...overrides
  };
}

test("selectProgressRecords filters by pipeline and optional filtered runs", () => {
  const records = [
    createRunRecord({ runFile: "latest-success.json", startedAt: "2026-03-20T12:00:00.000Z" }),
    createRunRecord({
      filters: { only: ["collect-metadata"], skip: [] },
      runFile: "filtered.json",
      startedAt: "2026-03-20T11:00:00.000Z"
    }),
    createRunRecord({ pipelineId: "full-refresh", runFile: "other-pipeline.json" }),
    createRunRecord({ runFile: "older-success.json", startedAt: "2026-03-20T09:00:00.000Z" })
  ];

  const withoutFiltered = selectProgressRecords(records, {
    includeFiltered: false,
    limit: 10,
    pipelineId: "full-refresh-parallel"
  });

  assert.strictEqual(withoutFiltered.length, 2);
  assert.strictEqual(withoutFiltered[0].runFile, "latest-success.json");
  assert.strictEqual(withoutFiltered[1].runFile, "older-success.json");

  const withFiltered = selectProgressRecords(records, {
    includeFiltered: true,
    limit: 10,
    pipelineId: "full-refresh-parallel"
  });

  assert.strictEqual(withFiltered.length, 3);
});

test("buildProgressSummary calculates success rates, trends, and stage progress", () => {
  const records = [
    createRunRecord({
      durationMs: 1_000,
      runFile: "run-1.json",
      stageResults: [
        { durationMs: 100, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { durationMs: 900, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T12:00:00.000Z",
      status: "success"
    }),
    createRunRecord({
      durationMs: 1_500,
      runFile: "run-2.json",
      stageResults: [
        { durationMs: 120, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { id: "parallel-processing", name: "Parallel", status: "failed" }
      ],
      startedAt: "2026-03-20T11:00:00.000Z",
      status: "failed"
    }),
    createRunRecord({
      durationMs: 2_000,
      runFile: "run-3.json",
      stageResults: [
        { id: "collect-metadata", name: "Collect Metadata", status: "skipped" },
        { durationMs: 1_900, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T10:00:00.000Z",
      status: "success"
    })
  ];

  const summary = buildProgressSummary(records);

  assert.strictEqual(summary.runCount, 3);
  assert.deepStrictEqual(summary.statusCounts, {
    failed: 1,
    other: 0,
    success: 2
  });
  assert.strictEqual(summary.successRate, 2 / 3);
  assert.strictEqual(summary.latestRun.runFile, "run-1.json");
  assert.strictEqual(summary.previousRun.runFile, "run-2.json");
  assert.strictEqual(summary.durationDeltaFromPreviousMs, -500);
  assert.strictEqual(summary.durationTrend, "faster");
  assert.strictEqual(summary.window.oldestStartedAt, "2026-03-20T10:00:00.000Z");
  assert.strictEqual(summary.window.newestStartedAt, "2026-03-20T12:00:00.000Z");

  const collectStage = summary.stageProgress.find(stage => stage.stageId === "collect-metadata");
  assert.ok(collectStage);
  assert.strictEqual(collectStage.succeededCount, 2);
  assert.strictEqual(collectStage.failedCount, 0);
  assert.strictEqual(collectStage.skippedCount, 1);
  assert.strictEqual(collectStage.averageDurationMs, 110);
  assert.strictEqual(collectStage.successRate, 1);

  const parallelStage = summary.stageProgress.find(stage => stage.stageId === "parallel-processing");
  assert.ok(parallelStage);
  assert.strictEqual(parallelStage.succeededCount, 2);
  assert.strictEqual(parallelStage.failedCount, 1);
  assert.strictEqual(parallelStage.averageDurationMs, 1_400);
  assert.strictEqual(parallelStage.successRate, 2 / 3);
});
