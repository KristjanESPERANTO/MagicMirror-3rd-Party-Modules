import { formatDuration } from "./cli-helpers.ts";
import type { PipelineRunRecord, PipelineRunStageResult } from "./cli-helpers.ts";

interface DurationStats {
  averageMs: number;
  count: number;
  maxMs: number;
  medianMs: number;
  minMs: number;
  p95Ms: number;
}

interface TimeWindow {
  newestStartedAt: string | null;
  oldestStartedAt: string | null;
}

interface BenchmarkRunEntry {
  durationMs: number;
  runFile: string | null;
  startedAt: string | null;
  status: string;
}

export interface StageDurationStats extends DurationStats {
  stageId: string;
  stageName: string | null;
}

export interface BenchmarkSummary {
  duration: DurationStats | null;
  runCount: number;
  runs: BenchmarkRunEntry[];
  stageDurations: StageDurationStats[];
  window: TimeWindow;
}

interface SelectBenchmarkRecordsOptions {
  includeFailed?: boolean;
  includeFiltered?: boolean;
  limit?: number;
  pipelineId?: string;
}

interface PrintBenchmarkSummaryOptions {
  includeFailed?: boolean;
  includeFiltered?: boolean;
  pipelineId?: string;
}

function hasFilterValues(filters: unknown): boolean {
  if (!filters || typeof filters !== "object") {
    return false;
  }

  const obj = filters as Record<string, unknown>;
  const only = Array.isArray(obj.only) ? obj.only : [];
  const skip = Array.isArray(obj.skip) ? obj.skip : [];
  return only.length > 0 || skip.length > 0;
}

function percentile(values: number[], percent: number): number | null {
  if (values.length === 0) {
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

function computeDurationStats(values: number[]): DurationStats | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    averageMs: Math.round(total / sorted.length),
    count: sorted.length,
    maxMs: sorted[sorted.length - 1],
    medianMs: Math.round(percentile(sorted, 0.5)!),
    minMs: sorted[0],
    p95Ms: Math.round(percentile(sorted, 0.95)!)
  };
}

function buildTimeWindow(records: PipelineRunRecord[]): TimeWindow {
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

export function selectBenchmarkRecords(records: PipelineRunRecord[], {
  includeFailed = false,
  includeFiltered = false,
  limit = 20,
  pipelineId = "full-refresh-parallel"
}: SelectBenchmarkRecordsOptions = {}): PipelineRunRecord[] {
  const selected: PipelineRunRecord[] = [];

  for (const record of records) {
    const isPipelineMatch = record.pipelineId === pipelineId;
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

export function buildBenchmarkSummary(records: PipelineRunRecord[]): BenchmarkSummary {
  const durationSamples: number[] = [];
  const stageBuckets = new Map<string, { durations: number[]; name: string | null }>();

  for (const record of records) {
    if (typeof record.durationMs === "number") {
      durationSamples.push(record.durationMs);
    }

    const stageResults: PipelineRunStageResult[] = record.stageResults ?? [];
    for (const stageResult of stageResults) {
      if (stageResult.status === "succeeded" && typeof stageResult.durationMs === "number") {
        const stageId = stageResult.id ?? "unknown";
        if (!stageBuckets.has(stageId)) {
          stageBuckets.set(stageId, {
            durations: [],
            name: stageResult.name ?? null
          });
        }

        stageBuckets.get(stageId)!.durations.push(stageResult.durationMs);
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
    .filter((item): item is StageDurationStats => item !== null)
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

function formatStatsLine(stats: DurationStats | null): string {
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

export function printBenchmarkSummary(summary: BenchmarkSummary, {
  includeFailed = false,
  includeFiltered = false,
  pipelineId = "full-refresh-parallel"
}: PrintBenchmarkSummaryOptions = {}): void {
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
