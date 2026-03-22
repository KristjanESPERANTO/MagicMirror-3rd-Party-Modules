import { formatBytesToMiB, formatDuration } from "./cli-helpers.js";

const DEFAULT_REGRESSION_THRESHOLD = 0.1;

const RESOURCE_METRICS = [
  { id: "cpuTotalMicros", label: "CPU total", path: ["cpu", "totalMicros"], regressionThreshold: 0.15, unit: "cpu" },
  {
    id: "rssPeakBytes",
    label: "RSS peak",
    path: ["memory", "rss", "peakBytes"],
    regressionThreshold: DEFAULT_REGRESSION_THRESHOLD,
    unit: "bytes"
  },
  {
    id: "heapUsedPeakBytes",
    label: "Heap peak",
    path: ["memory", "heapUsed", "peakBytes"],
    regressionThreshold: DEFAULT_REGRESSION_THRESHOLD,
    unit: "bytes"
  }
];

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

function toFiniteNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return value;
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

function classifyRegression(deltaRatio, threshold = DEFAULT_REGRESSION_THRESHOLD) {
  if (typeof deltaRatio !== "number") {
    return "insufficient-data";
  }

  if (deltaRatio >= threshold) {
    return "regression";
  }

  if (deltaRatio <= -threshold) {
    return "improvement";
  }

  return "stable";
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

function formatDelta(deltaMs) {
  if (typeof deltaMs !== "number") {
    return "unknown";
  }

  const sign = deltaMs > 0 ? "+" : "";
  return `${sign}${formatDuration(deltaMs)}`;
}

function readNumberAtPath(value, pathSegments) {
  let current = value;

  for (const segment of pathSegments) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }

    current = current[segment];
  }

  return toFiniteNumber(current);
}

function buildBaselineComparison(latestValue, baselineValues, regressionThreshold = DEFAULT_REGRESSION_THRESHOLD) {
  const normalizedLatestValue = toFiniteNumber(latestValue);
  const normalizedBaselineValues = baselineValues
    .map(value => toFiniteNumber(value))
    .filter(value => value !== null);
  const baselineMedian = percentile(normalizedBaselineValues, 0.5);

  if (normalizedLatestValue === null || baselineMedian === null) {
    return {
      baselineMedianValue: baselineMedian,
      baselineSampleCount: normalizedBaselineValues.length,
      deltaPercent: null,
      deltaValue: null,
      latestValue: normalizedLatestValue,
      signal: "insufficient-data"
    };
  }

  const deltaValue = normalizedLatestValue - baselineMedian;
  const deltaPercent = baselineMedian === 0 ? null : deltaValue / baselineMedian;

  return {
    baselineMedianValue: baselineMedian,
    baselineSampleCount: normalizedBaselineValues.length,
    deltaPercent,
    deltaValue,
    latestValue: normalizedLatestValue,
    signal: classifyRegression(deltaPercent, regressionThreshold)
  };
}

function hasResourceUsage(resourceUsage) {
  if (!resourceUsage || typeof resourceUsage !== "object") {
    return false;
  }

  const cpuTotalMicros = readNumberAtPath(resourceUsage, ["cpu", "totalMicros"]);
  const rssPeakBytes = readNumberAtPath(resourceUsage, ["memory", "rss", "peakBytes"]);
  const heapUsedPeakBytes = readNumberAtPath(resourceUsage, ["memory", "heapUsed", "peakBytes"]);

  return cpuTotalMicros !== null && rssPeakBytes !== null && heapUsedPeakBytes !== null;
}

function getExecutionType(record) {
  return hasFilterValues(record?.filters) ? "filtered" : "full";
}

function createTelemetryBucket() {
  return {
    coverageRate: null,
    missingResourceUsageCount: 0,
    runCount: 0,
    withResourceUsageCount: 0
  };
}

function finalizeTelemetryBucket(bucket) {
  if (bucket.runCount > 0) {
    bucket.coverageRate = bucket.withResourceUsageCount / bucket.runCount;
  }

  return bucket;
}

function buildTelemetryCoverage(records) {
  const buckets = {
    filtered: createTelemetryBucket(),
    full: createTelemetryBucket()
  };

  for (const record of records) {
    const executionType = getExecutionType(record);
    const bucket = buckets[executionType];
    bucket.runCount += 1;

    if (hasResourceUsage(record.resourceUsage)) {
      bucket.withResourceUsageCount += 1;
    }
    else {
      bucket.missingResourceUsageCount += 1;
    }
  }

  const full = finalizeTelemetryBucket(buckets.full);
  const filtered = finalizeTelemetryBucket(buckets.filtered);

  let consistency = "insufficient-data";
  if (full.runCount > 0 && filtered.runCount > 0) {
    consistency = full.missingResourceUsageCount === 0 && filtered.missingResourceUsageCount === 0
      ? "consistent"
      : "mismatch";
  }

  return {
    consistency,
    filtered,
    full
  };
}

function buildResourceRegression(records) {
  const latestRecord = records[0] ?? null;

  return RESOURCE_METRICS.map((metric) => {
    const latestValue = latestRecord ? readNumberAtPath(latestRecord.resourceUsage, metric.path) : null;
    const baselineValues = records
      .slice(1)
      .map(record => readNumberAtPath(record.resourceUsage, metric.path))
      .filter(value => value !== null);
    const comparison = buildBaselineComparison(latestValue, baselineValues, metric.regressionThreshold);

    return {
      ...comparison,
      id: metric.id,
      label: metric.label,
      unit: metric.unit
    };
  });
}

function formatMetricValue(value, unit) {
  if (typeof value !== "number") {
    return "unknown";
  }

  if (unit === "cpu") {
    return `${(value / 1000).toFixed(1)}ms`;
  }

  return formatBytesToMiB(value);
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
  const durationBaselineComparison = buildBaselineComparison(
    latestRun?.durationMs,
    records.slice(1).map(record => record.durationMs)
  );
  const telemetryCoverage = buildTelemetryCoverage(records);

  const durationDeltaMs
    = latestRun && previousRun && typeof latestRun.durationMs === "number" && typeof previousRun.durationMs === "number"
      ? latestRun.durationMs - previousRun.durationMs
      : null;

  return {
    durationDeltaFromPreviousMs: durationDeltaMs,
    durationTrend: classifyTrend(durationDeltaMs),
    durationVsBaseline: durationBaselineComparison,
    latestRun,
    previousRun,
    resourceVsBaseline: buildResourceRegression(records),
    runCount: records.length,
    stageProgress,
    statusCounts,
    successRate: records.length > 0 ? statusCounts.success / records.length : null,
    telemetryCoverage,
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

  if (summary.durationVsBaseline) {
    const baseline = summary.durationVsBaseline;
    const latestDuration = baseline.latestValue === null ? "unknown" : formatDuration(Math.round(baseline.latestValue));
    const baselineDuration = baseline.baselineMedianValue === null
      ? "unknown"
      : formatDuration(Math.round(baseline.baselineMedianValue));

    console.log(
      `Duration vs baseline median: latest ${latestDuration} | baseline ${baselineDuration} | delta ${formatSignedPercent(baseline.deltaPercent)} (${baseline.signal}, n=${baseline.baselineSampleCount})`
    );
  }

  if (Array.isArray(summary.resourceVsBaseline) && summary.resourceVsBaseline.length > 0) {
    console.log("\nResource baseline checks:");

    for (const metric of summary.resourceVsBaseline) {
      console.log(
        `  - ${metric.label}: latest ${formatMetricValue(metric.latestValue, metric.unit)} | baseline ${formatMetricValue(metric.baselineMedianValue, metric.unit)} | delta ${formatSignedPercent(metric.deltaPercent)} (${metric.signal}, n=${metric.baselineSampleCount})`
      );
    }
  }

  if (summary.telemetryCoverage && typeof summary.telemetryCoverage === "object") {
    const telemetry = summary.telemetryCoverage;

    console.log("\nTelemetry coverage:");
    console.log(
      `  Full runs: ${telemetry.full.withResourceUsageCount}/${telemetry.full.runCount} (${formatPercent(telemetry.full.coverageRate)})`
    );
    console.log(
      `  Filtered runs: ${telemetry.filtered.withResourceUsageCount}/${telemetry.filtered.runCount} (${formatPercent(telemetry.filtered.coverageRate)})`
    );
    console.log(`  Consistency: ${telemetry.consistency}`);
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
