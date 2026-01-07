# Worker Pool Architecture Design (P7.1)

This document describes the worker pool architecture for merging stages 3+4+5 into parallel analysis workers.

## Goals

1. **Parallel execution**: Process modules concurrently across N workers
2. **Incremental support**: Skip unchanged modules based on git SHA
3. **Fault isolation**: Worker failures don't crash the entire pipeline
4. **Resource bounds**: Memory and CPU limits per worker
5. **Observable**: Progress tracking and per-module logging

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────┐
│                        Orchestrator                              │
│  - Reads modules.stage.2.json (enriched metadata)               │
│  - Distributes batches to workers                               │
│  - Collects results and aggregates                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Worker 1   │  │  Worker 2   │  │  Worker N   │
│  Batch 1-50 │  │ Batch 51-100│  │ Batch ...   │
└─────────────┘  └─────────────┘  └─────────────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   Aggregator        │
              │   - Merge results   │
              │   - Validate schema │
              │   - Write outputs   │
              └─────────────────────┘
```

---

## Worker Interface

### Input: ModuleBatch

Each worker receives a batch of modules to process:

```typescript
interface ModuleBatch {
  batchId: number;
  modules: ModuleInput[];
  config: WorkerConfig;
}

interface ModuleInput {
  // From Stage 2 output
  name: string;
  maintainer: string;
  url: string;
  branch?: string;
  description?: string;

  // API metadata (from collect-metadata)
  stars?: number;
  lastCommit?: string;
  license?: string;
  isArchived?: boolean;
  hasGithubIssues?: boolean;

  // Cache key for incremental
  cacheKey?: string;
}

interface WorkerConfig {
  projectRoot: string;
  modulesDir: string;
  imagesDir: string;

  // Incremental mode
  cacheEnabled: boolean;
  cachePath?: string;

  // Check configuration
  checkGroups: {
    fast: boolean;
    deep: boolean;
    eslint: boolean;
    ncu: boolean;
  };

  // Resource limits
  timeoutMs: number;
  maxMemoryMb?: number;
}
```

### Output: ModuleResult

Each worker returns results for its batch:

```typescript
interface BatchResult {
  batchId: number;
  processedAt: string;
  durationMs: number;
  results: ModuleResult[];
  errors: BatchError[];
}

interface ModuleResult {
  // Identity
  name: string;
  maintainer: string;

  // Processing status
  status: "success" | "skipped" | "failed";
  skippedReason?: "cached" | "clone-failed" | "timeout";

  // Clone stage (Stage 3)
  cloned: boolean;
  cloneDir?: string;

  // Enrich stage (Stage 4)
  packageJson?: PackageJsonInfo;
  image?: string;

  // Analysis stage (Stage 5)
  issues: string[];
  recommendations: string[];
  lastCommit?: string;
  defaultSortWeight?: number;

  // Cache
  cacheKey?: string;
  fromCache: boolean;

  // Metrics
  processingTimeMs: number;
}

interface BatchError {
  moduleId: string;
  phase: "clone" | "enrich" | "analyze";
  error: string;
  stack?: string;
}
```

---

## Worker Implementation

### Single Worker Flow

Each worker processes its batch sequentially:

```text
for each module in batch:
  1. Check cache → if hit and SHA unchanged, return cached result
  2. Clone/update repository (shallow clone)
  3. Enrich metadata (package.json, find screenshot)
  4. Run analysis checks (fast checks, deep checks, ESLint, ncu)
  5. Store result in cache
  6. Return result
```

### Worker Process Model

**Option A: Child Processes (recommended)**

- Use Node.js `child_process.fork()` for each worker
- Communication via IPC messages
- Natural isolation: crash in one worker doesn't affect others
- Can set memory limits via `--max-old-space-size`

**Option B: Worker Threads**

- Use `worker_threads` module
- Shared memory possible but more complex
- Slightly lower overhead than processes
- Crashes can affect parent (need try-catch)

**Recommendation**: Start with Option A (child processes) for better isolation.

### Worker Lifecycle

```typescript
// Worker main entry point
async function workerMain() {
  // 1. Receive batch from parent
  const batch = await receiveMessage<ModuleBatch>();

  // 2. Load cache if enabled
  const cache = batch.config.cacheEnabled
    ? await loadCache(batch.config.cachePath)
    : null;

  // 3. Process modules
  const results: ModuleResult[] = [];
  for (const module of batch.modules) {
    try {
      const result = await processModule(module, batch.config, cache);
      results.push(result);

      // Report progress
      sendMessage({ type: "progress", moduleId: moduleId(module) });
    } catch (error) {
      results.push(createFailedResult(module, error));
    }
  }

  // 4. Save cache updates
  if (cache) {
    await saveCache(cache);
  }

  // 5. Return batch result
  sendMessage({
    type: "complete",
    result: { batchId: batch.batchId, results }
  });
}
```

---

## Batch Distribution Strategy

### Batch Size Selection

| Factor         | Small batches (10-20) | Large batches (50-100) |
| -------------- | --------------------- | ---------------------- |
| Overhead       | Higher (more IPC)     | Lower                  |
| Load balancing | Better                | Worse                  |
| Failure scope  | Smaller               | Larger                 |
| Memory         | Lower per worker      | Higher per worker      |

**Recommendation**: Default batch size of 50 modules, configurable via CLI.

### Distribution Algorithm

```typescript
function distributeBatches(
  modules: ModuleInput[],
  workerCount: number,
  batchSize: number
): ModuleBatch[] {
  const batches: ModuleBatch[] = [];

  for (let i = 0; i < modules.length; i += batchSize) {
    batches.push({
      batchId: batches.length,
      modules: modules.slice(i, i + batchSize),
      config: workerConfig
    });
  }

  return batches;
}

// Workers pull batches from queue (work stealing)
async function runWorkerPool(batches: ModuleBatch[], workerCount: number) {
  const queue = [...batches];
  const workers = new Map<number, Worker>();
  const results: BatchResult[] = [];

  // Start initial workers
  for (let i = 0; i < Math.min(workerCount, queue.length); i++) {
    const batch = queue.shift()!;
    workers.set(batch.batchId, spawnWorker(batch));
  }

  // Process results and assign new batches
  while (workers.size > 0 || queue.length > 0) {
    const result = await waitForAnyWorker(workers);
    results.push(result);

    if (queue.length > 0) {
      const nextBatch = queue.shift()!;
      workers.set(nextBatch.batchId, spawnWorker(nextBatch));
    }
  }

  return results;
}
```

### Worker Count Selection

Default: `Math.max(1, os.cpus().length - 1)` (leave one CPU for orchestrator)

Configurable via:

- CLI: `--workers=4`
- Environment: `PIPELINE_WORKER_COUNT=4`

---

## Resource Limits and Failure Handling

### Per-Worker Limits

```typescript
interface ResourceLimits {
  // Time limit per module (default: 60s)
  moduleTimeoutMs: number;

  // Time limit per batch (default: 30min)
  batchTimeoutMs: number;

  // Memory limit (default: 512MB)
  maxMemoryMb: number;

  // Max retries for transient failures
  maxRetries: number;
}
```

### Failure Categories

| Category         | Example                     | Action                         |
| ---------------- | --------------------------- | ------------------------------ |
| **Transient**    | Network timeout, rate limit | Retry with backoff             |
| **Module-level** | Clone failed, parse error   | Skip module, log error         |
| **Worker-level** | OOM, crash                  | Restart worker, re-queue batch |
| **Fatal**        | Config error, missing dirs  | Abort pipeline                 |

### Failure Handling Flow

```typescript
async function processWithRetry(
  module: ModuleInput,
  config: WorkerConfig
): Promise<ModuleResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await processModule(module, config);
    } catch (error) {
      lastError = error;

      if (isTransientError(error)) {
        await delay(exponentialBackoff(attempt));
        continue;
      }

      // Non-transient error: don't retry
      break;
    }
  }

  return createFailedResult(module, lastError);
}

function isTransientError(error: Error): boolean {
  return (
    error.message.includes("ETIMEDOUT") ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("rate limit") ||
    error.message.includes("503")
  );
}
```

### Worker Health Monitoring

```typescript
interface WorkerHealth {
  workerId: number;
  status: "running" | "idle" | "crashed";
  currentBatchId?: number;
  modulesProcessed: number;
  lastHeartbeat: Date;
  memoryUsageMb: number;
}

// Orchestrator monitors workers
async function monitorWorkers(workers: Map<number, Worker>) {
  const interval = setInterval(() => {
    for (const [id, worker] of workers) {
      const health = worker.getHealth();

      // Check for stuck workers
      const stuckMs = Date.now() - health.lastHeartbeat.getTime();
      if (stuckMs > WORKER_TIMEOUT_MS) {
        logger.warn(`Worker ${id} appears stuck, killing...`);
        worker.kill();
        // Re-queue batch
      }

      // Check memory usage
      if (health.memoryUsageMb > MAX_MEMORY_MB) {
        logger.warn(`Worker ${id} exceeded memory limit`);
        // Allow to finish current module, then restart
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}
```

---

## Progress Tracking

### Progress Events

```typescript
type ProgressEvent =
  | { type: "batch-started"; batchId: number; moduleCount: number }
  | { type: "module-started"; batchId: number; moduleId: string }
  | {
      type: "module-completed";
      batchId: number;
      moduleId: string;
      status: string;
    }
  | { type: "batch-completed"; batchId: number; durationMs: number }
  | { type: "worker-error"; workerId: number; error: string };
```

### CLI Progress Display

```text
Processing modules... [=======>          ] 342/869 (39%)

Workers: 4 active | Batches: 7/18 complete | ETA: 8min

Recent:
  ✓ MMM-Weather (1.2s)
  ✓ MMM-Calendar (0.8s)
  ⏳ MMM-News (processing...)
  ⏳ MMM-Crypto (processing...)
```

---

## Configuration

### CLI Options

```bash
npm run pipeline -- run full-refresh \
  --workers=4 \
  --batch-size=50 \
  --module-timeout=60000 \
  --no-cache \
  --check-groups=fast,deep
```

### Environment Variables

```bash
PIPELINE_WORKER_COUNT=4
PIPELINE_BATCH_SIZE=50
PIPELINE_MODULE_TIMEOUT_MS=60000
PIPELINE_CACHE_ENABLED=true
```

### Configuration File

```json
{
  "workers": {
    "count": 4,
    "batchSize": 50,
    "limits": {
      "moduleTimeoutMs": 60000,
      "batchTimeoutMs": 1800000,
      "maxMemoryMb": 512,
      "maxRetries": 3
    }
  },
  "cache": {
    "enabled": true,
    "path": "website/data/moduleCache.json"
  },
  "checkGroups": {
    "fast": true,
    "deep": true,
    "eslint": false,
    "ncu": false
  }
}
```

---

## Migration Path

### Phase 1: Single-Worker Prototype (P7.2)

- Merge Stage 3+4+5 logic into one `processModule()` function
- Test with single worker on small batch
- Validate output matches current pipeline

### Phase 2: Worker Pool (P7.3)

- Add child process spawning
- Implement batch distribution
- Add progress tracking

### Phase 3: Incremental Mode (P7.4)

- Integrate existing module cache
- Skip unchanged modules

### Phase 4: Cleanup (P7.5-P7.6)

- Add per-module logging
- Remove separate stage scripts
- Update orchestrator to use workers

---

## Open Questions

1. **Cache location**: Single shared cache file or per-worker cache files?
   - Recommendation: Single shared cache, locked during writes

2. **Git operations**: Shared `modules/` directory or per-worker clone dirs?
   - Recommendation: Shared `modules/` with file locking per module

3. **Image processing**: Run in worker or separate phase?
   - Recommendation: In worker (already part of Stage 4)

4. **ESLint/ncu**: Include in worker or optional post-processing?
   - Recommendation: Optional in worker, controlled by config
