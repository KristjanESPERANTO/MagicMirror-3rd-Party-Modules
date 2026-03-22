// @ts-nocheck
import { formatDuration } from "./cli-helpers.ts";

function hasFilterValues(filters) {
  if (!filters || typeof filters !== "object") {
    return false;
  }

  const only = Array.isArray(filters.only) ? filters.only : [];
  const skip = Array.isArray(filters.skip) ? filters.skip : [];
  return only.length > 0 || skip.length > 0;
}

function percentile(values, percent) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percent;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const lowerValue = sorted[lowerIndex];
  const upperValue = sorted[upperIndex];
  const weight = position - lowerIndex;

  return lowerValue + (upperValue - lowerValue) * weight;
}

function computeDurationStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    averageMs: Math.round(total / sorted.length),
    count: sorted.length,
    maxMs: sorted[sorted.length - 1],
    medianMs: Math.round(percentile(sorted, 0.5)),
    minMs: sorted[0],
    p95Ms: Math.round(percentile(sorted, 0.95))
  };
}

function buildTimeWindow(records) {
  const startedAtValues = records
    .map(record => record.startedAt)
    .filter(value => typeof value === "string" && value.length > 0)
    .sort((left, right) => Date.parse(left) - Date.parse(right));

  if (startedAtValues.length === 0) {
    return {
      newestStartedAt: null,
      oldestStartedAt: null
    };
  }

  return {
    newestStartedAt: startedAtValues[startedAtValues.length - 1],
    oldestStartedAt: startedAtValues[0]
  };
}

export function selectBenchmarkRecords(records, {
  includeFailed = false,
  includeFiltered = false,
  limit = 20,
  pipelineId = "full-refresh-parallel"
} = {}) {
  const selected = [];

  for (const record of records) {
    const isObjectRecord = record && typeof record === "object";
    const isPipelineMatch = isObjectRecord && record.pipelineId === pipelineId;
    const isStatusIncluded = includeFailed || record.status === "success";
    const isFilterIncluded = includeFiltered || !hasFilterValues(record.filters);

    if (isPipelineMatch && isStatusIncluded && isFilterIncluded) {
      selected.push(record);

      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

export function buildBenchmarkSummary(records) {
  const durationSamples = [];
  const stageBuckets = new Map();

  for (const record of records) {
    if (typeof record.durationMs === "number") {
      durationSamples.push(record.durationMs);
    }

    const stageResults = Array.isArray(record.stageResults) ? record.stageResults : [];
    for (const stageResult of stageResults) {
      const isSucceededStageResult
        = stageResult && stageResult.status === "succeeded" && typeof stageResult.durationMs === "number";

      if (isSucceededStageResult) {
        const stageId = stageResult.id ?? "unknown";
        if (!stageBuckets.has(stageId)) {
          stageBuckets.set(stageId, {
            durations: [],
            name: stageResult.name ?? null
          });
        }

        stageBuckets.get(stageId).durations.push(stageResult.durationMs);
      }
    }
  }

  const stageSummaries = [...stageBuckets.entries()]
    .map(([stageId, bucket]) => {
      const stats = computeDurationStats(bucket.durations);
      return stats
        ? {
          ...stats,
          stageId,
          stageName: bucket.name
        }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.stageId.localeCompare(right.stageId));

  return {
    duration: computeDurationStats(durationSamples),
    runCount: records.length,
    runs: records.map(record => ({
      durationMs: record.durationMs,
      runFile: record.runFile ?? null,
      startedAt: record.startedAt ?? null,
      status: record.status
    })),
    stageDurations: stageSummaries,
    window: buildTimeWindow(records)
  };
}

function formatStatsLine(stats) {
  if (!stats) {
    return "no duration data";
  }

  return [
    `n=${stats.count}`,
    `min=${formatDuration(stats.minMs)}`,
    `avg=${formatDuration(stats.averageMs)}`,
    `median=${formatDuration(stats.medianMs)}`,
    `p95=${formatDuration(stats.p95Ms)}`,
    `max=${formatDuration(stats.maxMs)}`
  ].join(" | ");
}

export function printBenchmarkSummary(summary, {
  includeFailed = false,
  includeFiltered = false,
  pipelineId = "full-refresh-parallel"
} = {}) {
  console.log(`Benchmark summary for pipeline: ${pipelineId}`);
  console.log(`Sample count: ${summary.runCount}`);
  console.log(`Include failed runs: ${includeFailed ? "yes" : "no"}`);
  console.log(`Include filtered runs: ${includeFiltered ? "yes" : "no"}`);

  if (summary.window.oldestStartedAt && summary.window.newestStartedAt) {
    console.log(`Time window: ${summary.window.oldestStartedAt} -> ${summary.window.newestStartedAt}`);
  }

  console.log(`Total duration stats: ${formatStatsLine(summary.duration)}`);

  if (summary.stageDurations.length === 0) {
    return;
  }

  console.log("\nPer-stage duration stats:");
  for (const stageSummary of summary.stageDurations) {
    const stageLabel = stageSummary.stageName
      ? `${stageSummary.stageId} (${stageSummary.stageName})`
      : stageSummary.stageId;
    console.log(`  - ${stageLabel}: ${formatStatsLine(stageSummary)}`);
  }
}
