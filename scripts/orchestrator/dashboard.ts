// @ts-nocheck
import { formatBytesToMiB, formatDuration } from "./cli-helpers.ts";
import { buildBenchmarkSummary } from "./benchmark.ts";
import { buildProgressSummary } from "./progress.ts";

function hasFilterValues(filters) {
  if (!filters || typeof filters !== "object") {
    return false;
  }

  const only = Array.isArray(filters.only) ? filters.only : [];
  const skip = Array.isArray(filters.skip) ? filters.skip : [];
  return only.length > 0 || skip.length > 0;
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "unknown";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "unknown";
  }

  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

function formatResourceValue(value, unit) {
  if (typeof value !== "number") {
    return "unknown";
  }

  if (unit === "cpu") {
    return `${(value / 1000).toFixed(1)}ms`;
  }

  return formatBytesToMiB(value);
}

function buildDurationHotspots(stageDurations, limit = 3) {
  return stageDurations
    .filter(stage => typeof stage.p95Ms === "number")
    .sort((left, right) => right.p95Ms - left.p95Ms)
    .slice(0, limit)
    .map(stage => ({
      averageMs: stage.averageMs,
      p95Ms: stage.p95Ms,
      stageId: stage.stageId,
      stageName: stage.stageName
    }));
}

function buildReliabilityAlerts(stageProgress, limit = 3) {
  return stageProgress
    .filter(stage => stage && typeof stage === "object")
    .filter(stage => typeof stage.successRate === "number")
    .filter(stage => stage.failedCount > 0 || stage.successRate < 1)
    .sort((left, right) => {
      if (left.successRate !== right.successRate) {
        return left.successRate - right.successRate;
      }

      return right.failedCount - left.failedCount;
    })
    .slice(0, limit)
    .map(stage => ({
      failedCount: stage.failedCount,
      stageId: stage.stageId,
      stageName: stage.stageName,
      successRate: stage.successRate
    }));
}

function summarizeResourceSignals(resourceComparisons) {
  const summary = {
    improvementCount: 0,
    insufficientDataCount: 0,
    regressionCount: 0,
    stableCount: 0
  };

  for (const comparison of resourceComparisons ?? []) {
    if (comparison.signal === "regression") {
      summary.regressionCount += 1;
    }
    else if (comparison.signal === "improvement") {
      summary.improvementCount += 1;
    }
    else if (comparison.signal === "stable") {
      summary.stableCount += 1;
    }
    else {
      summary.insufficientDataCount += 1;
    }
  }

  return summary;
}

export function selectDashboardRecords(records, {
  includeFiltered = false,
  limit = 20,
  pipelineId = "full-refresh-parallel"
} = {}) {
  const selected = [];

  for (const record of records) {
    const isObjectRecord = record && typeof record === "object";
    const isPipelineMatch = isObjectRecord && record.pipelineId === pipelineId;
    const isFilterIncluded = includeFiltered || !hasFilterValues(record.filters);

    if (isPipelineMatch && isFilterIncluded) {
      selected.push(record);

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

export function buildDashboardSummary(records, {
  durationHotspotLimit = 3,
  reliabilityLimit = 3
} = {}) {
  const benchmarkSummary = buildBenchmarkSummary(records);
  const progressSummary = buildProgressSummary(records);

  return {
    benchmark: benchmarkSummary,
    durationHotspots: buildDurationHotspots(benchmarkSummary.stageDurations, durationHotspotLimit),
    progress: progressSummary,
    reliabilityAlerts: buildReliabilityAlerts(progressSummary.stageProgress, reliabilityLimit),
    resourceSignals: summarizeResourceSignals(progressSummary.resourceVsBaseline),
    runCount: records.length,
    window: benchmarkSummary.window
  };
}

export function printDashboardSummary(summary, {
  includeFiltered = false,
  pipelineId = "full-refresh-parallel"
} = {}) {
  console.log(`Dashboard summary for pipeline: ${pipelineId}`);
  console.log(`Sample count: ${summary.runCount}`);
  console.log(`Include filtered runs: ${includeFiltered ? "yes" : "no"}`);

  if (summary.window.oldestStartedAt && summary.window.newestStartedAt) {
    console.log(`Time window: ${summary.window.oldestStartedAt} -> ${summary.window.newestStartedAt}`);
  }

  const outcomes = summary.progress.statusCounts;
  console.log(
    `Run health: success=${outcomes.success} failed=${outcomes.failed} other=${outcomes.other} | success-rate ${formatPercent(summary.progress.successRate)}`
  );

  if (summary.progress.latestRun) {
    const latestDuration = summary.progress.latestRun.durationMs === null
      ? "unknown"
      : formatDuration(summary.progress.latestRun.durationMs);

    console.log(
      `Latest run: ${summary.progress.latestRun.startedAt ?? "unknown"} | ${summary.progress.latestRun.status} | ${latestDuration}`
    );
  }

  if (summary.progress.durationVsBaseline) {
    const durationBaseline = summary.progress.durationVsBaseline;
    const latestDuration = durationBaseline.latestValue === null
      ? "unknown"
      : formatDuration(Math.round(durationBaseline.latestValue));
    const baselineDuration = durationBaseline.baselineMedianValue === null
      ? "unknown"
      : formatDuration(Math.round(durationBaseline.baselineMedianValue));

    console.log(
      `Duration trend: latest ${latestDuration} | baseline ${baselineDuration} | delta ${formatSignedPercent(durationBaseline.deltaPercent)} (${durationBaseline.signal}, n=${durationBaseline.baselineSampleCount})`
    );
  }

  if (summary.benchmark.duration) {
    const duration = summary.benchmark.duration;
    console.log(
      `Duration envelope: avg ${formatDuration(duration.averageMs)} | median ${formatDuration(duration.medianMs)} | p95 ${formatDuration(duration.p95Ms)} | max ${formatDuration(duration.maxMs)}`
    );
  }

  if (summary.progress.telemetryCoverage) {
    const telemetry = summary.progress.telemetryCoverage;
    console.log(
      `Telemetry coverage: full ${telemetry.full.withResourceUsageCount}/${telemetry.full.runCount} (${formatPercent(telemetry.full.coverageRate)}) | filtered ${telemetry.filtered.withResourceUsageCount}/${telemetry.filtered.runCount} (${formatPercent(telemetry.filtered.coverageRate)}) | ${telemetry.consistency}`
    );
  }

  console.log(
    `Resource signals: regressions=${summary.resourceSignals.regressionCount} | improvements=${summary.resourceSignals.improvementCount} | stable=${summary.resourceSignals.stableCount} | insufficient=${summary.resourceSignals.insufficientDataCount}`
  );

  if (Array.isArray(summary.progress.resourceVsBaseline) && summary.progress.resourceVsBaseline.length > 0) {
    console.log("\nResource trends:");
    for (const metric of summary.progress.resourceVsBaseline) {
      console.log(
        `  - ${metric.label}: latest ${formatResourceValue(metric.latestValue, metric.unit)} | baseline ${formatResourceValue(metric.baselineMedianValue, metric.unit)} | delta ${formatSignedPercent(metric.deltaPercent)} (${metric.signal})`
      );
    }
  }

  if (summary.durationHotspots.length > 0) {
    console.log("\nTop stage duration hotspots:");
    for (const hotspot of summary.durationHotspots) {
      const label = hotspot.stageName ? `${hotspot.stageId} (${hotspot.stageName})` : hotspot.stageId;
      console.log(`  - ${label}: p95 ${formatDuration(hotspot.p95Ms)} | avg ${formatDuration(hotspot.averageMs)}`);
    }
  }

  if (summary.reliabilityAlerts.length > 0) {
    console.log("\nStage reliability alerts:");
    for (const alert of summary.reliabilityAlerts) {
      const label = alert.stageName ? `${alert.stageId} (${alert.stageName})` : alert.stageId;
      console.log(
        `  - ${label}: success ${formatPercent(alert.successRate)} | failed ${alert.failedCount}`
      );
    }
  }
}
