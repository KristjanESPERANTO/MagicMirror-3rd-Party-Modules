import { buildBenchmarkSummary, selectBenchmarkRecords } from "../benchmark.js";
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

test("selectBenchmarkRecords filters by pipeline/status/filters and applies limit", () => {
  const records = [
    createRunRecord({ durationMs: 1_100, runFile: "latest-success.json", startedAt: "2026-03-20T12:00:00.000Z" }),
    createRunRecord({
      durationMs: 1_200,
      filters: { only: ["collect-metadata"], skip: [] },
      runFile: "filtered.json",
      startedAt: "2026-03-20T11:00:00.000Z"
    }),
    createRunRecord({ durationMs: 1_300, pipelineId: "full-refresh", runFile: "other-pipeline.json" }),
    createRunRecord({ durationMs: 1_400, runFile: "failed.json", status: "failed" }),
    createRunRecord({ durationMs: 1_500, runFile: "older-success.json", startedAt: "2026-03-20T09:00:00.000Z" })
  ];

  const selected = selectBenchmarkRecords(records, {
    includeFailed: false,
    includeFiltered: false,
    limit: 2,
    pipelineId: "full-refresh-parallel"
  });

  assert.strictEqual(selected.length, 2);
  assert.strictEqual(selected[0].runFile, "latest-success.json");
  assert.strictEqual(selected[1].runFile, "older-success.json");
});

test("buildBenchmarkSummary computes total and per-stage duration stats", () => {
  const records = [
    createRunRecord({
      durationMs: 1_000,
      runFile: "run-1.json",
      stageResults: [
        { durationMs: 100, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { durationMs: 900, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T10:00:00.000Z"
    }),
    createRunRecord({
      durationMs: 2_000,
      runFile: "run-2.json",
      stageResults: [
        { durationMs: 200, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { durationMs: 1_800, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T11:00:00.000Z"
    }),
    createRunRecord({
      durationMs: 3_000,
      runFile: "run-3.json",
      stageResults: [
        { durationMs: 300, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { durationMs: 2_700, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T12:00:00.000Z"
    })
  ];

  const summary = buildBenchmarkSummary(records);

  assert.strictEqual(summary.runCount, 3);
  assert.strictEqual(summary.duration.count, 3);
  assert.strictEqual(summary.duration.minMs, 1_000);
  assert.strictEqual(summary.duration.averageMs, 2_000);
  assert.strictEqual(summary.duration.medianMs, 2_000);
  assert.strictEqual(summary.duration.p95Ms, 2_900);
  assert.strictEqual(summary.duration.maxMs, 3_000);
  assert.strictEqual(summary.window.oldestStartedAt, "2026-03-20T10:00:00.000Z");
  assert.strictEqual(summary.window.newestStartedAt, "2026-03-20T12:00:00.000Z");

  assert.strictEqual(summary.stageDurations.length, 2);

  const collectMetadataStats = summary.stageDurations.find(stage => stage.stageId === "collect-metadata");
  assert.ok(collectMetadataStats);
  assert.strictEqual(collectMetadataStats.averageMs, 200);
  assert.strictEqual(collectMetadataStats.p95Ms, 290);

  const parallelProcessingStats = summary.stageDurations.find(stage => stage.stageId === "parallel-processing");
  assert.ok(parallelProcessingStats);
  assert.strictEqual(parallelProcessingStats.averageMs, 1_800);
  assert.strictEqual(parallelProcessingStats.p95Ms, 2_610);
});
