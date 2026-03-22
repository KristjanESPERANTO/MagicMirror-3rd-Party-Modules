import { buildProgressSummary, selectProgressRecords } from "../progress.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

function createResourceUsage(overrides = {}) {
  return {
    cpu: {
      systemMicros: 2_000,
      totalMicros: 4_000,
      userMicros: 2_000
    },
    memory: {
      heapUsed: {
        averageBytes: 256,
        lastBytes: 260,
        peakBytes: 300
      },
      rss: {
        averageBytes: 400,
        lastBytes: 420,
        peakBytes: 500
      }
    },
    monitoringDurationMs: 1_000,
    sampleCount: 3,
    sampleIntervalMs: 500,
    ...overrides
  };
}

function createRunRecord(overrides = {}) {
  return {
    durationMs: 1_000,
    filters: { only: [], skip: [] },
    pipelineId: "full-refresh-parallel",
    resourceUsage: createResourceUsage(),
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
      resourceUsage: createResourceUsage({
        cpu: { systemMicros: 1_500, totalMicros: 3_000, userMicros: 1_500 },
        memory: {
          heapUsed: { averageBytes: 500, lastBytes: 530, peakBytes: 600 },
          rss: { averageBytes: 1_000, lastBytes: 1_100, peakBytes: 1_200 }
        }
      }),
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
      resourceUsage: createResourceUsage({
        cpu: { systemMicros: 1_000, totalMicros: 2_000, userMicros: 1_000 },
        memory: {
          heapUsed: { averageBytes: 420, lastBytes: 440, peakBytes: 450 },
          rss: { averageBytes: 860, lastBytes: 900, peakBytes: 1_000 }
        }
      }),
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
      resourceUsage: createResourceUsage({
        cpu: { systemMicros: 1_200, totalMicros: 2_200, userMicros: 1_000 },
        memory: {
          heapUsed: { averageBytes: 350, lastBytes: 380, peakBytes: 400 },
          rss: { averageBytes: 760, lastBytes: 790, peakBytes: 1_100 }
        }
      }),
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
  assert.strictEqual(summary.durationVsBaseline.signal, "improvement");
  assert.strictEqual(summary.durationVsBaseline.baselineMedianValue, 1_750);
  assert.strictEqual(summary.durationVsBaseline.baselineSampleCount, 2);
  assert.strictEqual(summary.window.oldestStartedAt, "2026-03-20T10:00:00.000Z");
  assert.strictEqual(summary.window.newestStartedAt, "2026-03-20T12:00:00.000Z");
  assert.strictEqual(summary.telemetryCoverage.full.withResourceUsageCount, 3);
  assert.strictEqual(summary.telemetryCoverage.consistency, "insufficient-data");

  const cpuMetric = summary.resourceVsBaseline.find(metric => metric.id === "cpuTotalMicros");
  assert.ok(cpuMetric);
  assert.strictEqual(cpuMetric.signal, "regression");

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

test("buildProgressSummary reports telemetry mismatches between full and filtered runs", () => {
  const records = [
    createRunRecord({
      filters: { only: [], skip: [] },
      resourceUsage: createResourceUsage(),
      runFile: "full-latest.json",
      startedAt: "2026-03-20T12:00:00.000Z"
    }),
    createRunRecord({
      filters: { only: [], skip: [] },
      resourceUsage: createResourceUsage(),
      runFile: "full-older.json",
      startedAt: "2026-03-20T11:00:00.000Z"
    }),
    createRunRecord({
      filters: { only: ["collect-metadata"], skip: [] },
      resourceUsage: createResourceUsage(),
      runFile: "filtered-with-resource.json",
      startedAt: "2026-03-20T10:00:00.000Z"
    }),
    createRunRecord({
      filters: { only: ["parallel-processing"], skip: [] },
      resourceUsage: null,
      runFile: "filtered-without-resource.json",
      startedAt: "2026-03-20T09:00:00.000Z"
    })
  ];

  const summary = buildProgressSummary(records);

  assert.strictEqual(summary.telemetryCoverage.full.runCount, 2);
  assert.strictEqual(summary.telemetryCoverage.full.withResourceUsageCount, 2);
  assert.strictEqual(summary.telemetryCoverage.filtered.runCount, 2);
  assert.strictEqual(summary.telemetryCoverage.filtered.withResourceUsageCount, 1);
  assert.strictEqual(summary.telemetryCoverage.filtered.missingResourceUsageCount, 1);
  assert.strictEqual(summary.telemetryCoverage.consistency, "mismatch");
});
