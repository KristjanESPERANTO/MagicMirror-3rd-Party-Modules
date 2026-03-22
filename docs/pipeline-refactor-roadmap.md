# Pipeline Modernization Roadmap

This document tracks progress toward the target 3-phase streaming architecture. Completed work is summarized briefly; open tasks have detailed descriptions.

## Guiding Objectives

- **Reduce maintenance friction** by consolidating runtimes and centralizing utilities
- **Keep the pipeline resilient** through schema validation, caching, and clearer failure handling
- **Improve contributor experience** with better documentation and faster feedback loops
- **Preserve current functionality** while iterating in small, testable increments

---

## Completed Work (Summary)

### Milestone 1: Foundations (Sep–Dec 2025) ✅

All foundational work is complete. The pipeline now runs on a unified TypeScript codebase with:

| Area              | Key Achievements                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| **Orchestration** | Declarative stage graph, `--only/--skip` CLI, JSON schema validation at all boundaries    |
| **Runtime**       | Python removed; all stages in TypeScript/Node.js; shared utilities in `scripts/shared/`   |
| **Performance**   | Persistent caches, rate limiting, batch processing, incremental checking (90%+ skip rate) |
| **Quality**       | Rule registry with 50+ checks, ESLint coverage, deterministic outputs, comparison harness |
| **Documentation** | Architecture diagrams, contributor guide, troubleshooting, check modules reference        |

<details>
<summary>Detailed task list (click to expand)</summary>

#### P1.x: Pipeline Architecture & Orchestration

- P1.1–P1.7: Stage graph, orchestrator CLI, schema validation, partial runs ✅

#### P2.x: Runtime & Codebase Consolidation

- P2.1–P2.6: Shared utilities, TypeScript migration (get-modules, check-modules), ESLint config ✅

#### P3.x: Robustness & Performance Safety Nets

- P3.1–P3.8: Persistent caches, rate limiter, structured logging, deterministic outputs, batch processing, incremental checking ✅

#### P4.x: Checks & Developer Experience

- P4.1–P4.6, P4.11, P4.R1–P4.R2: Rule registry, check configuration, golden files, CLI progress, dependency detection, README checks ✅

#### P5.x: Documentation & Collaboration

- P5.1–P5.2: Architecture diagrams, contributor guide ✅

#### P6.x: Metadata Collection Optimization

- P6.1–P6.4: Unified collector, metadata caching, parallel fetching, stage consolidation ✅
- P6.2.1–P6.2.4: Clone skipping, API lastCommit, cache pruning, incremental documentation ✅

</details>

---

## Open Work: 3-Phase Streaming Architecture

### Current Status

The incremental pipeline foundations are complete. The next major milestone transforms the 5-stage sequential pipeline into a 3-phase streaming architecture with parallel workers.

### P7.x: Parallel Analysis Workers

Merge stages 3+4+5 into parallel worker processes. See [worker-pool-design.md](pipeline/worker-pool-design.md) for detailed architecture and migration plan.

| Task | Status                              |
| ---- | ----------------------------------- |
| P7.1 | ✅ Design complete                  |
| P7.2 | ✅ Single-worker prototype          |
| P7.3 | ✅ Worker pool orchestration        |
| P7.4 | ✅ Per-module logging               |
| P7.5 | ✅ Cleanup complete                 |
| P7.6 | ✅ Incremental integration complete |

**Update (Mar 2026):** P7.5 and P7.6 are complete. The canonical path is `full-refresh-parallel`; legacy stage wrappers and compatibility pipeline definitions are retired; incremental cache behavior is integrated into `scripts/parallel-processing.js` with read/write/prune/skip semantics, runtime controls (`--no-cache`, `PIPELINE_CACHE_DISABLED=1`), test coverage, and measured warm-cache skip-rate benefit.

**P7.4 Implementation (Feb 2026):**

- Created module-specific logger utility (`module-logger.js`)
- Per-module log files organized by run timestamp: `logs/{runId}/modules/{moduleId}.log`
- Detailed logging across all processing phases (clone, enrich, analyze)
- Automatic buffer flushing on errors and completion
- Integrated with existing worker pool architecture

**P7.3 Implementation (Jan 2026):**

- Worker process wrapper with IPC communication
- Batch distribution and work-stealing queue
- Worker pool orchestrator with health monitoring
- Progress tracking and error recovery
- Integration via `full-refresh-parallel` pipeline
- Successfully tested with 2-4 workers, achieving ~2-3x speedup

### P8.x: Streaming & Aggregation

Enable streaming between phases and create aggregation layer. The worker architecture is now stable enough to refine this milestone against the canonical `full-refresh-parallel` flow.

The goal of this milestone is to reduce or eliminate the remaining intermediate stage-boundary files by replacing file-based handoffs with streaming/aggregation where it is safe to do so. It is not a separate effort to rename `modules.stage.*.json` files while they remain supported contract boundaries.

| Task | Status                    |
| ---- | ------------------------- |
| P8.1 | ✅ Streaming orchestrator |
| P8.2 | ✅ Aggregation phase      |
| P8.3 | ✅ Diff detection         |
| P8.4 | ✅ Memory optimization    |
| P8.5 | ✅ Optional boundaries    |

### P9.x: Performance & Observability

Measure and visualize pipeline performance.

| Task | Status                   |
| ---- | ------------------------ |
| P9.1 | ✅ Benchmarking          |
| P9.2 | ✅ Progress tracking     |
| P9.3 | ✅ Resource monitoring   |
| P9.4 | ✅ Performance dashboard |

---

## Next Concrete Steps

See [worker-pool-design.md](pipeline/worker-pool-design.md) for architecture details.

**Current focus: Post-P9 validation** — Stabilize and adopt performance tooling

- Verify dashboard output readability against real run-history volume in local and CI contexts
- Keep benchmark/progress/dashboard metric definitions aligned as new run metadata fields are added
- Use dashboard output in release-check flows and contributor triage guidance

---

## Expected Benefits

Once the 3-phase architecture is complete:

| Metric             | Current (5-stage) | Target (3-phase)   |
| ------------------ | ----------------- | ------------------ |
| Full run           | ~15-20 min        | ~10-15 min         |
| Incremental run    | <5 min            | <3 min             |
| Memory usage       | Batch-bounded     | Per-worker bounded |
| Intermediate files | 4                 | 1 + final outputs  |
| Parallelism        | Sequential        | N workers          |

---

## Future Considerations

Items to revisit after the streaming architecture is complete:

- **TypeScript migration**: Convert remaining `.js` files to `.ts` with proper type checking (~56 files in `scripts/`). Remove `@ts-nocheck` from existing `.ts` files. Add `tsc --noEmit` to CI pipeline. ([#140](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/pull/140))
- **Event-driven architecture**: Replace file-based stage communication with event streams
- **Containerization**: Run workers in isolated containers for security/reproducibility
- **Progressive API delivery**: Chunked delivery of `modules.json` for large datasets ([#8](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/8))

---

## Related Issues

- [#5](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/5) — GitLab/Bitbucket star fallbacks ✅
- [#8](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/8) — Progressive API loading (future)
- [#40](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/40) — Wiki consumer coordination
- [#41](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/41) — Graceful repo skip handling ✅
