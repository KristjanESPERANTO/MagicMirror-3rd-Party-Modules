# Pipeline Modernization Roadmap

This document captures the long-term improvements we want to implement in the module processing pipeline. It converts the recent analysis into actionable workstreams so that we can tackle them step by step.

## Guiding Objectives

- **Reduce maintenance friction** by consolidating runtimes, centralizing utilities, and improving observability.
- **Keep the pipeline resilient** through schema validation, caching, and clearer failure handling.
- **Improve contributor experience** with better documentation, configurability, and faster feedback loops.
- **Preserve current functionality** while iterating in small, testable increments.

## Workstreams

### 1. Pipeline Architecture & Orchestration

| Task | Description                                                                                                                                                                      | Dependencies | Effort |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P1.1 | Describe the full stage graph (inputs/outputs, side-effects) in a machine-readable config ([stage graph](pipeline/stage-graph.json)) ✅ Completed Sep 2025                       | none         | S      |
| P1.2 | Introduce a lightweight orchestrator (Node CLI) that reads the config, supports partial runs, and ships DX commands (`list`, `describe`, `logs`, `doctor`) ✅ Completed Sep 2025 | P1.1         | M      |
| P1.3 | Add JSON-schema validation for every stage boundary (modules.stage.\* files) ([schemas](pipeline/schemas)) ✅ Completed Sep 2025                                                 | P1.1         | M      |
| P1.4 | Provide a skip/only mechanism for partial runs (e.g. `--only=checks`) ✅ Completed Sep 2025                                                                                      | P1.2         | S      |
| P1.5 | Final artifact schemas & validation — rollout completed and documented (see contributor guide & release notes) ✅ Completed Sep 2025                                             | P1.3         | M      |
| P1.6 | Consolidate shared schema definitions (shared `$defs` / generator) to keep stage contracts in sync ✅ Completed Sep 2025                                                         | P1.3         | S      |
| P1.7 | Introduce orchestrator-wide progress rendering for every stage _(low priority; build on the Stage 5 indicator via shared progress utility + stage lifecycle events)_             | P1.2         | M      |

### 2. Runtime & Codebase Consolidation

| Task | Description                                                                                                                                                                                                                                                              | Dependencies | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| P2.1 | Extract shared utilities (HTTP, Git, FS, logging, rate-limiter) into a reusable Node/TS module ✅ Completed Sep 2025                                                                                                                                                     | none         | M      |
| P2.2 | Port `get_modules.py` to TypeScript, reusing the shared utilities ✅ Completed Sep 2025 (Python fallback removed)                                                                                                                                                        | P2.1         | L      |
| P2.3 | Port `check_modules.py` logic incrementally (start with fast checks, then optional heavy tasks) ✅ Completed Oct 2025 (TS stage now fully TypeScript; Python fallback removed)                                                                                           | P2.1         | XL     |
| P2.4 | Extend ESLint config to cover TypeScript files (via `typescript-eslint` v8+) and add unit tests for shared utilities ✅ Completed Oct 2025                                                                                                                               | P2.1         | M      |
| P2.5 | Centralize `package.json` ingestion so data is parsed once and shared across stages ✅ Completed Oct 2025                                                                                                                                                                | P2.1         | M      |
| P2.6 | Remove legacy `check_modules_js.js` (Stage 5) after verifying all checks are fully implemented in TypeScript stage (Stage 6). This also allows simplifying or removing the comparison harness since there will be only one implementation to test. ✅ Completed Nov 2025 | P2.3, P4.11  | S      |

### 3. Robustness & Performance Safety Nets

| Task   | Description                                                                                                                                                                                                                                                                                                       | Dependencies | Effort |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P3.1   | Add persistent caches for API responses and HEAD validations with expiration metadata ✅ Completed Oct 2025                                                                                                                                                                                                       | none         | M      |
| P3.1.5 | Implement smart incremental checking: skip modules when (A) module has no new commits since last check AND (B) this repository has no new commits since last check; reuse cached results from modules.magicmirror.builders for unchanged modules to dramatically reduce check stage runtime ✅ Completed Nov 2025 | P3.1         | M      |
| P3.2   | Introduce a central rate limiter + retry strategy for GitHub/GitLab requests ✅ Completed Dec 2025                                                                                                                                                                                                                | P3.1         | M      |
| P3.3   | Capture structured logs (JSON) and aggregate per-stage timing metrics ✅ Completed Dec 2025                                                                                                                                                                                                                       | P1.2         | M      |
| P3.4   | Ensure deterministic outputs (sorted keys, hash-based image names) and document the guarantees ([deterministic outputs](deterministic-outputs.md)) ✅ Completed Nov 2025                                                                                                                                          | P1.2         | S      |
| P3.5   | Harden repository clone flow to gracefully skip missing/renamed repos and keep the pipeline green ([#41](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/41))                                                                                                                              | none         | M      |
| P3.6   | Replace hard-coded star fallbacks with authenticated API lookups for non-GitHub hosts ([#5](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/5)) ✅ Completed Dec 2025                                                                                                                      | P3.1         | M      |
| P3.7   | Add batch processing to `get-modules` and `check-modules`: process modules in configurable chunks to bound memory usage ✅ Completed Nov 2025                                                                                                                                                                     | P2.2, P2.3   | M      |
| P3.8   | Implement module-level result caching: store analysis results per module keyed by git SHA to enable efficient incremental updates ✅ Completed Nov 2025 (same as P3.1.5)                                                                                                                                          | P3.1         | M      |

### 4. Checks & Developer Experience

| Task  | Description                                                                                                                                                                                                                                              | Dependencies | Effort |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P4.1  | Split checks into a registry with metadata (category, severity, auto-fixable) ✅ Completed Oct 2025                                                                                                                                                      | P2.3         | M      |
| P4.2  | Add configuration file to toggle check groups (`fast`, `deep`, optional ESLint/ncu`) ✅ Completed Oct 2025                                                                                                                                               | P4.1         | S      |
| P4.3  | Create sample dataset + regression tests for check outputs (golden files), reusing the curated fixtures where possible ✅ Completed Oct 2025                                                                                                             | P4.1         | M      |
| P4.4  | Provide CLI progress UI and Markdown summary per run ✅ Completed Oct 2025                                                                                                                                                                               | P1.2         | S      |
| P4.5  | Add rule detecting modules that import third-party dependencies without declaring them ([#78](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/78)) ✅ Completed Oct 2025                                                          | P4.1         | M      |
| P4.6  | Check README install/update sections for copyable fenced command blocks ([#54](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/54)) ✅ Completed Oct 2025                                                                         | P4.1         | S      |
| P4.7  | ~~Recommend `npm ci --omit=dev` when modules expose devDependencies in instructions ([#53](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/53))~~ _(Misplaced: not a pipeline task, belongs in module guidelines/best practices)_ | P4.1         | S      |
| P4.8  | ~~Flag modules with multi-year inactivity that are not marked `outdated` and nudge maintainers to review status~~ _(Misplaced: manual curation task, not pipeline automation)_                                                                           | P4.1         | M      |
| P4.9  | ~~Inspect Dependabot configs for schedule scope (quarterly cadence, production-only) and suggest adjustments~~ _(Misplaced: module developer guidance, not pipeline task)_                                                                               | P4.1         | M      |
| P4.10 | Evaluate migrating the `ntl` task menu into a `pipeline` subcommand (interactive launcher built on the orchestrator CLI) _(low priority)_                                                                                                                | P1.2         | S      |
| P4.11 | Extend the rule registry to cover every pipeline check stage (legacy JS script + future additions) ✅ Completed Oct 2025                                                                                                                                 | P4.1         | L      |
| P4.R1 | Audit every rule in the registry for relevance and clarity                                                                                                                                                                                               | P4.11        | S      |
| P4.R2 | Audit every recommendation in the registry for relevance and consistency                                                                                                                                                                                 | P4.11        | S      |

### 5. Documentation & Collaboration

| Task | Description                                                                                                                                                                    | Dependencies         | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------ |
| P5.1 | Publish an architecture diagram (current + target) in `docs/` ([architecture.md](architecture.md)) ✅ Completed Sep 2025                                                       | P1.1                 | S      |
| P5.2 | Expand contributor guide with setup instructions, pipeline tips, and troubleshooting ✅ Completed Dec 2025                                                                     | P5.1                 | M      |
| P5.3 | Convert roadmap tasks into GitHub issues and track via project board                                                                                                           | after roadmap review | S      |
| P5.4 | Schedule periodic checkpoint (e.g. monthly) to review progress & adjust priorities                                                                                             | P5.3                 | S      |
| P5.5 | Coordinate migration of selected `guides/` content into the official docs repository ([#59](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/59))        | P5.2                 | M      |
| P5.6 | Establish change protocol with wiki-dependent consumers (e.g., MMPM) before altering layout ([#40](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/40)) | P5.1                 | S      |

### Related Backlog Items

These topics sit adjacent to the pipeline work but should stay visible while prioritizing future sprints:

- Progressive loading / chunked delivery of the public `modules.json` to keep client payload manageable ([#8](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/8)).

## Execution Strategy

These are the guiding habits we should keep front-of-mind while the modernization work continues:

1. **Keep the shared context fresh**: Maintain the updated architecture diagrams so ongoing work on the orchestrator and TypeScript stages stays aligned.
2. **Lean on the shared utilities**: Continue building new functionality on the consolidated HTTP/Git/FS/rate-limiter toolkit established in P2.1 to avoid regressions.
3. **Keep parity guardrails active**: The [check modules reference](pipeline/check-modules-reference.md) consolidates the fixtures, rule inventory, and harness follow-ups—review it periodically while we iterate on new checks.
4. **Add tests alongside migrations** to prevent regressions and make future refactors safer.

### Recurring documentation tasks

Routine reminders for keeping the written guidance in sync with the code:

- Update `docs/architecture.md` whenever stage runtimes or shared utilities shift (for example, when Node scripts move to TypeScript or shared helpers gain new capabilities).
- Align updates in `docs/CONTRIBUTING.md` with each orchestrator milestone so local workflows stay in sync.

#### P6.x: Metadata Collection (merge stages 1+2)

| Task | Description                                                                                                                                      | Dependencies | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| P6.1 | Create unified metadata collector that combines module list creation + GitHub/npm data fetching in a single streaming pass ✅ Completed Dec 2025 | P2.1         | L      |
| P6.2 | Implement intelligent metadata caching with TTL-based invalidation                                                                               | P3.1, P6.1   | M      |
| P6.3 | Add parallel metadata fetching (configurable concurrency for API requests)                                                                       | P6.1         | M      |
| P6.4 | Remove separate stage 1 & 2 scripts once unified collector is stable                                                                             | P6.1–P6.3    | S      |

#### P7.x: Parallel Analysis Workers (merge stages 3+4+5)

| Task | Description                                                                                             | Dependencies | Effort |
| ---- | ------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P7.1 | Design worker pool architecture: batch distributor + N independent analysis workers                     | P6.1         | M      |
| P7.2 | Implement single-worker analysis: clone → read package.json → screenshots → checks (all in one process) | P2.2, P2.3   | L      |
| P7.3 | Add worker pool orchestration with configurable parallelism and graceful failure handling               | P7.1, P7.2   | M      |
| P7.4 | Integrate incremental mode: workers skip modules with unchanged git SHA (use P3.8 cache)                | P3.8, P7.2   | M      |
| P7.5 | Add per-module isolation and logging for easier debugging                                               | P7.2         | S      |
| P7.6 | Remove separate stage 3/4/5 scripts once parallel workers are stable                                    | P7.1–P7.5    | S      |

#### P8.x: Streaming & Aggregation

| Task | Description                                                                                        | Dependencies | Effort |
| ---- | -------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P8.1 | Implement streaming orchestrator: Phase 1 feeds Phase 2 incrementally (no full intermediate files) | P6.1, P7.1   | L      |
| P8.2 | Create aggregation phase: collect worker results, validate schemas, generate final outputs         | P7.3         | M      |
| P8.3 | Add diff detection and change reporting to aggregation phase                                       | P8.2         | M      |
| P8.4 | Optimize memory usage: bounded buffers, backpressure handling between phases                       | P8.1         | M      |
| P8.5 | Remove intermediate `modules.stage.*.json` files (keep only enriched metadata + final outputs)     | P8.1, P8.2   | S      |

#### P9.x: Performance & Observability

| Task | Description                                                                            | Dependencies | Effort |
| ---- | -------------------------------------------------------------------------------------- | ------------ | ------ |
| P9.1 | Add comprehensive benchmarking: compare 5-stage vs 3-phase performance on full dataset | P8.2         | S      |
| P9.2 | Implement real-time progress tracking across all workers                               | P7.3         | M      |
| P9.3 | Add resource monitoring: track memory/CPU usage per phase and worker                   | P7.3         | S      |
| P9.4 | Create performance dashboard: visualize pipeline metrics over time                     | P9.1–P9.3    | M      |

### Expected Benefits of 3-Phase Architecture

Once fully implemented, the streaming architecture should deliver:

- **Performance**: ~15-20 min full runs (down from 45-60 min), <5 min incremental updates
- **Reliability**: Bounded memory usage eliminates OOM crashes
- **Debuggability**: Per-module isolation makes failures easier to trace
- **Scalability**: Add more workers to process larger module counts
- **Simplicity**: 3 phases instead of 5 stages, fewer intermediate files

## Future Considerations

Items to revisit once the immediate roadmap is complete:

- **Evaluate comparison harness utility**: Now that there's only one TypeScript implementation, assess whether the comparison harness (`scripts/check-modules/compare/`) still provides value for regression testing or should be simplified/removed in favor of simpler golden file tests.
- **Consider event-driven architecture**: Replace file-based stage communication with event streams for better composability.
- **Explore containerization**: Run analysis workers in isolated containers for better security and reproducibility.

## Next Concrete Steps

### Milestone 1: Incremental & Parallel Foundations (Current Focus)

The core performance optimizations (P3.1.5, P3.7) are complete. Several P4.x tasks were reclassified as module developer guidance rather than pipeline infrastructure work.

**Recommended next steps** to improve robustness and prepare for the streaming architecture migration:

#### Phase 1: Quick Wins (Low Effort, High Impact)

1. **P3.4** — Ensure deterministic outputs (sorted keys, deterministic image names). Makes diffs cleaner and debugging easier. ✅ Completed Nov 2025
2. **P3.5** — Gracefully skip missing/renamed repos ([#41](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/41)). Prevents pipeline crashes, reduces manual intervention. ✅ Completed Nov 2025

#### Phase 2: Robustness & Observability (Medium Effort)

3. **P3.2** — Introduce central rate limiter + retry strategy. Prevents API bans, handles transient failures gracefully. ✅ Completed Dec 2025
4. **P3.6** — Replace hard-coded star fallbacks with authenticated API lookups for GitLab/Bitbucket/Codeberg ([#5](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/5)). Improves data quality across platforms. ✅ Completed Dec 2025
5. **P3.3** — Capture structured logs (JSON) and per-stage timing metrics. Better observability for performance debugging. ✅ Completed Dec 2025

#### Phase 3: Documentation & Onboarding

6. **P5.2** — Expand contributor guide with setup instructions, pipeline tips, and troubleshooting. Lowers barrier to entry for new contributors. ✅ Completed Dec 2025

#### Phase 4: Begin Streaming Architecture

7. **P6.1** — Create unified metadata collector (merge stages 1+2). First major step toward 3-phase architecture. ✅ Completed Dec 2025

#### Phase 5: Cleanup & Maintenance (Post-Migration)

8. **P4.R1 & P4.R2** — Audit rule registry and recommendations for relevance and consistency. Quality check after migration is complete.

### Milestone 2: Toward 3-Phase Streaming Architecture (Future)

**Goal**: Transform the current 5-stage sequential pipeline into a 3-phase streaming architecture with parallel execution (see [architecture.md](architecture.md) Target State).

---

Feel free to adjust priorities, rename tasks, or add new items. This roadmap is meant to stay alive—update it as soon as we learn something new during implementation.
