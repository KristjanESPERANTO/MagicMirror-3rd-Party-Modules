import { formatDuration } from "./cli-helpers.js";

function hasFilterValues(filters) {
  if (!filters || typeof filters !== "object") {
    return false;
  }

  const only = Array.isArray(filters.only) ? filters.only : [];
  const skip = Array.isArray(filters.skip) ? filters.skip : [];
  return only.length > 0 || skip.length > 0;
}

function toRunSummary(record) {
  return {
    durationMs: typeof record.durationMs === "number" ? record.durationMs : null,
    runFile: record.runFile ?? null,
    startedAt: record.startedAt ?? null,
    status: record.status ?? "unknown"
  };
}

function buildWindow(records) {
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

function classifyTrend(deltaMs) {
  if (typeof deltaMs !== "number") {
    return null;
  }

  if (deltaMs < 0) {
    return "faster";
  }

  if (deltaMs > 0) {
    return "slower";
  }

  return "unchanged";
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "unknown";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatDelta(deltaMs) {
  if (typeof deltaMs !== "number") {
    return "unknown";
  }

  const sign = deltaMs > 0 ? "+" : "";
  return `${sign}${formatDuration(deltaMs)}`;
}

export function selectProgressRecords(records, {
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

export function buildProgressSummary(records) {
  const statusCounts = {
    failed: 0,
    other: 0,
    success: 0
  };
  const stageBuckets = new Map();

  for (const record of records) {
    if (record.status === "success") {
      statusCounts.success += 1;
    }
    else if (record.status === "failed") {
      statusCounts.failed += 1;
    }
    else {
      statusCounts.other += 1;
    }

    const stageResults = Array.isArray(record.stageResults) ? record.stageResults : [];
    for (const stageResult of stageResults) {
      const isValidStageResult = stageResult && typeof stageResult === "object";

      if (isValidStageResult) {
        const stageId = stageResult.id ?? "unknown";
        if (!stageBuckets.has(stageId)) {
          stageBuckets.set(stageId, {
            durationSamples: [],
            failedCount: 0,
            pendingCount: 0,
            skippedCount: 0,
            stageName: stageResult.name ?? null,
            succeededCount: 0
          });
        }

        const bucket = stageBuckets.get(stageId);
        if (stageResult.status === "succeeded") {
          bucket.succeededCount += 1;
          if (typeof stageResult.durationMs === "number") {
            bucket.durationSamples.push(stageResult.durationMs);
          }
        }
        else if (stageResult.status === "failed") {
          bucket.failedCount += 1;
        }
        else if (stageResult.status === "skipped") {
          bucket.skippedCount += 1;
        }
        else {
          bucket.pendingCount += 1;
        }
      }
    }
  }

  const stageProgress = [...stageBuckets.entries()]
    .map(([stageId, bucket]) => {
      const settledCount = bucket.succeededCount + bucket.failedCount;
      const averageDurationMs = bucket.durationSamples.length > 0
        ? Math.round(bucket.durationSamples.reduce((sum, value) => sum + value, 0) / bucket.durationSamples.length)
        : null;

      return {
        averageDurationMs,
        failedCount: bucket.failedCount,
        pendingCount: bucket.pendingCount,
        skippedCount: bucket.skippedCount,
        stageId,
        stageName: bucket.stageName,
        successRate: settledCount > 0 ? bucket.succeededCount / settledCount : null,
        succeededCount: bucket.succeededCount
      };
    })
    .sort((left, right) => left.stageId.localeCompare(right.stageId));

  const latestRun = records.length > 0 ? toRunSummary(records[0]) : null;
  const previousRun = records.length > 1 ? toRunSummary(records[1]) : null;

  const durationDeltaMs
    = latestRun && previousRun && typeof latestRun.durationMs === "number" && typeof previousRun.durationMs === "number"
      ? latestRun.durationMs - previousRun.durationMs
      : null;

  return {
    durationDeltaFromPreviousMs: durationDeltaMs,
    durationTrend: classifyTrend(durationDeltaMs),
    latestRun,
    previousRun,
    runCount: records.length,
    stageProgress,
    statusCounts,
    successRate: records.length > 0 ? statusCounts.success / records.length : null,
    window: buildWindow(records)
  };
}

export function printProgressSummary(summary, {
  includeFiltered = false,
  pipelineId = "full-refresh-parallel"
} = {}) {
  console.log(`Progress summary for pipeline: ${pipelineId}`);
  console.log(`Sample count: ${summary.runCount}`);
  console.log(`Include filtered runs: ${includeFiltered ? "yes" : "no"}`);

  if (summary.window.oldestStartedAt && summary.window.newestStartedAt) {
    console.log(`Time window: ${summary.window.oldestStartedAt} -> ${summary.window.newestStartedAt}`);
  }

  console.log(
    `Run outcomes: success=${summary.statusCounts.success} failed=${summary.statusCounts.failed} other=${summary.statusCounts.other}`
  );
  console.log(`Success rate: ${formatPercent(summary.successRate)}`);

  if (summary.latestRun) {
    const latestDuration = summary.latestRun.durationMs === null ? "unknown" : formatDuration(summary.latestRun.durationMs);
    console.log(
      `Latest run: ${summary.latestRun.startedAt ?? "unknown"} | ${summary.latestRun.status} | ${latestDuration}`
    );
  }

  if (summary.previousRun) {
    const trendLabel = summary.durationTrend ?? "unknown";
    console.log(`Delta vs previous run: ${formatDelta(summary.durationDeltaFromPreviousMs)} (${trendLabel})`);
  }

  if (summary.stageProgress.length === 0) {
    return;
  }

  console.log("\nPer-stage progress:");
  for (const stage of summary.stageProgress) {
    const stageLabel = stage.stageName ? `${stage.stageId} (${stage.stageName})` : stage.stageId;
    const averageDuration = stage.averageDurationMs === null ? "unknown" : formatDuration(stage.averageDurationMs);
    console.log(
      `  - ${stageLabel}: success=${formatPercent(stage.successRate)} | succeeded=${stage.succeededCount} | failed=${stage.failedCount} | skipped=${stage.skippedCount} | pending=${stage.pendingCount} | avg=${averageDuration}`
    );
  }
}
