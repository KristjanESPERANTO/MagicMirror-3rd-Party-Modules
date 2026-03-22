import { buildDashboardSummary, selectDashboardRecords } from "../dashboard.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

function createResourceUsage({
  cpuTotalMicros = 4_000,
  heapPeakBytes = 400,
  rssPeakBytes = 800
} = {}) {
  const cpuSystemMicros = Math.round(cpuTotalMicros * 0.4);
  const cpuUserMicros = cpuTotalMicros - cpuSystemMicros;

  return {
    cpu: {
      systemMicros: cpuSystemMicros,
      totalMicros: cpuTotalMicros,
      userMicros: cpuUserMicros
    },
    memory: {
      heapUsed: {
        averageBytes: Math.round(heapPeakBytes * 0.8),
        lastBytes: Math.round(heapPeakBytes * 0.9),
        peakBytes: heapPeakBytes
      },
      rss: {
        averageBytes: Math.round(rssPeakBytes * 0.8),
        lastBytes: Math.round(rssPeakBytes * 0.9),
        peakBytes: rssPeakBytes
      }
    },
    monitoringDurationMs: 1_000,
    sampleCount: 3,
    sampleIntervalMs: 500
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

test("selectDashboardRecords filters by pipeline and optional filtered runs", () => {
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

  const withoutFiltered = selectDashboardRecords(records, {
    includeFiltered: false,
    limit: 10,
    pipelineId: "full-refresh-parallel"
  });

  assert.strictEqual(withoutFiltered.length, 2);
  assert.strictEqual(withoutFiltered[0].runFile, "latest-success.json");
  assert.strictEqual(withoutFiltered[1].runFile, "older-success.json");

  const withFiltered = selectDashboardRecords(records, {
    includeFiltered: true,
    limit: 10,
    pipelineId: "full-refresh-parallel"
  });

  assert.strictEqual(withFiltered.length, 3);
});

test("buildDashboardSummary combines benchmark and progress indicators", () => {
  const records = [
    createRunRecord({
      durationMs: 1_100,
      resourceUsage: createResourceUsage({ cpuTotalMicros: 5_000, heapPeakBytes: 500, rssPeakBytes: 900 }),
      runFile: "run-1.json",
      stageResults: [
        { durationMs: 220, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { durationMs: 780, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T12:00:00.000Z",
      status: "success"
    }),
    createRunRecord({
      durationMs: 1_900,
      resourceUsage: createResourceUsage({ cpuTotalMicros: 2_900, heapPeakBytes: 410, rssPeakBytes: 680 }),
      runFile: "run-2.json",
      stageResults: [
        { durationMs: 120, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { id: "parallel-processing", name: "Parallel", status: "failed" }
      ],
      startedAt: "2026-03-20T11:00:00.000Z",
      status: "failed"
    }),
    createRunRecord({
      durationMs: 1_600,
      resourceUsage: createResourceUsage({ cpuTotalMicros: 2_700, heapPeakBytes: 390, rssPeakBytes: 640 }),
      runFile: "run-3.json",
      stageResults: [
        { durationMs: 140, id: "collect-metadata", name: "Collect Metadata", status: "succeeded" },
        { durationMs: 1_340, id: "parallel-processing", name: "Parallel", status: "succeeded" }
      ],
      startedAt: "2026-03-20T10:00:00.000Z",
      status: "success"
    })
  ];

  const summary = buildDashboardSummary(records);

  assert.strictEqual(summary.runCount, 3);
  assert.strictEqual(summary.progress.durationVsBaseline.signal, "improvement");
  assert.strictEqual(summary.resourceSignals.regressionCount, 3);

  assert.ok(summary.durationHotspots.length > 0);
  assert.strictEqual(summary.durationHotspots[0].stageId, "parallel-processing");

  assert.ok(summary.reliabilityAlerts.length > 0);
  assert.strictEqual(summary.reliabilityAlerts[0].stageId, "parallel-processing");
  assert.strictEqual(summary.reliabilityAlerts[0].failedCount, 1);

  assert.strictEqual(summary.progress.telemetryCoverage.consistency, "insufficient-data");
});
