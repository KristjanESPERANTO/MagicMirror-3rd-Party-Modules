import process from "node:process";

export interface ResourceMetricSummary {
  averageBytes: number | null;
  lastBytes: number | null;
  peakBytes: number | null;
}

export interface ProcessResourceUsage {
  cpu: {
    systemMicros: number;
    totalMicros: number;
    userMicros: number;
  };
  memory: {
    heapUsed: ResourceMetricSummary;
    rss: ResourceMetricSummary;
  };
  monitoringDurationMs: number;
  sampleCount: number;
  sampleIntervalMs: number;
}

interface MemorySample {
  heapUsedBytes: number;
  rssBytes: number;
}

interface CreateResourceMonitorOptions {
  clearIntervalFn?: (timerId: ReturnType<typeof setInterval>) => void;
  getCpuUsage?: (previousValue?: NodeJS.CpuUsage) => NodeJS.CpuUsage;
  getMemoryUsage?: () => NodeJS.MemoryUsage;
  now?: () => number;
  sampleIntervalMs?: number;
  setIntervalFn?: (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
}

export interface ResourceMonitor {
  start(): void;
  stop(): ProcessResourceUsage | null;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function peak(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

function last(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values[values.length - 1];
}

function summarizeMetric(values: number[]): ResourceMetricSummary {
  return {
    averageBytes: average(values),
    lastBytes: last(values),
    peakBytes: peak(values)
  };
}

export function createResourceMonitor({
  clearIntervalFn = clearInterval,
  getCpuUsage = (previousValue?: NodeJS.CpuUsage) => process.cpuUsage(previousValue),
  getMemoryUsage = () => process.memoryUsage(),
  now = () => Date.now(),
  sampleIntervalMs = 500,
  setIntervalFn = setInterval
}: CreateResourceMonitorOptions = {}): ResourceMonitor {
  const samples: MemorySample[] = [];
  let cachedSummary: ProcessResourceUsage | null = null;
  let cpuStart: NodeJS.CpuUsage | null = null;
  let started = false;
  let startedAtMs: number | null = null;
  let timerId: ReturnType<typeof setInterval> | null = null;

  const recordSample = (): void => {
    const usage = getMemoryUsage();
    samples.push({
      heapUsedBytes: typeof usage.heapUsed === "number" ? usage.heapUsed : 0,
      rssBytes: typeof usage.rss === "number" ? usage.rss : 0
    });
  };

  return {
    start(): void {
      if (started) {
        return;
      }

      started = true;
      startedAtMs = now();
      cpuStart = getCpuUsage();
      recordSample();
      timerId = setIntervalFn(recordSample, sampleIntervalMs);
    },

    stop(): ProcessResourceUsage | null {
      if (cachedSummary) {
        return cachedSummary;
      }

      if (!started) {
        return null;
      }

      if (timerId !== null) {
        clearIntervalFn(timerId);
      }

      recordSample();

  const currentTime = now();
  const elapsedMs = Math.max(0, currentTime - (startedAtMs ?? currentTime));
  const cpuUsage = getCpuUsage(cpuStart ?? undefined);
      const rssValues = samples.map(sample => sample.rssBytes);
      const heapValues = samples.map(sample => sample.heapUsedBytes);

      cachedSummary = {
        cpu: {
          systemMicros: cpuUsage.system,
          totalMicros: cpuUsage.user + cpuUsage.system,
          userMicros: cpuUsage.user
        },
        memory: {
          heapUsed: summarizeMetric(heapValues),
          rss: summarizeMetric(rssValues)
        },
        monitoringDurationMs: elapsedMs,
        sampleCount: samples.length,
        sampleIntervalMs
      };

      return cachedSummary;
    }
  };
}
