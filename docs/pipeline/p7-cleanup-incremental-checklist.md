# P7.5/P7.6 Execution Checklist

This checklist turns roadmap items P7.5 and P7.6 into concrete implementation slices.

Related docs:

- [Pipeline roadmap](../pipeline-refactor-roadmap.md)
- [Worker pool design](worker-pool-design.md)

## P7.5 Cleanup Old Stage Scripts

- [x] C1: Inventory and dependency map
  - Completed on 2026-03-19.
  - npm scripts still exposing legacy flow:
    - `all`, `getModules`, `expandModuleList`, `checkModules`, `ownList` in [package.json](../../package.json).
    - Legacy stage numbering/descriptions in `ntl.descriptions` in [package.json](../../package.json).
    - Status: canonical script usage completed in C2; retire old aliases in C3.
  - Stage graph still contains both legacy and parallel paths:
    - Legacy pipeline `full-refresh` plus stages `get-modules`, `expand-module-list`, `check-modules` in [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
    - Parallel pipeline `full-refresh-parallel` and stage `parallel-processing` in [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
    - Status: `full-refresh-parallel` set as canonical in C2; remove/legacy-gate old stage chain in C3.
  - Docs with legacy/default references identified:
    - Contributor stage table and examples in [docs/CONTRIBUTING.md](../CONTRIBUTING.md).
    - Sequential five-stage architecture narrative in [docs/architecture.md](../architecture.md).
    - CLI default examples around `full-refresh` in [docs/pipeline/orchestrator-cli-reference.md](orchestrator-cli-reference.md).
    - Full-refresh command example in [docs/pipeline/worker-pool-design.md](worker-pool-design.md).
    - Fixture regeneration guidance using `node --run all` in [fixtures/README.md](../../fixtures/README.md).
    - Stage-5 reference content in [docs/pipeline/check-modules-reference.md](check-modules-reference.md).
    - Follow-up: normalize docs/commands in C5 to reflect the new canonical default.
  - Tests and harness references:
    - Check-group config unit test points to `scripts/check-modules` in [scripts/check-modules/**tests**/check-group-config.test.js](../../scripts/check-modules/__tests__/check-group-config.test.js).
    - A comparison-harness workflow existed at the start of C1 and was retired in C4.
    - Follow-up: keep the unit/integration regression tests, but retire the comparison harness in C4 in favor of canonical fixture/golden validation.
  - CI hooks snapshot:
    - No workflow currently invokes legacy stage chain (`full-refresh` or `--only=get-modules|expand-module-list|check-modules`).
    - Git hook only runs lint-staged in [.husky/\_/pre-commit](../../.husky/_/pre-commit).
- [x] C2: Canonical pipeline switch
  - Completed on 2026-03-19.
  - `npm run all` now targets `full-refresh-parallel` in [package.json](../../package.json).
  - `pipeline run` without explicit pipeline id now defaults to `full-refresh-parallel` in [scripts/orchestrator/index.js](../../scripts/orchestrator/index.js).
  - Legacy stage-specific shortcuts (`collectMetadata`, `getModules`, `expandModuleList`, `checkModules`) were pinned to `full-refresh` as a temporary compatibility path in [package.json](../../package.json) and retired in C3.
  - Legacy `full-refresh` remained available as a temporary compatibility path at that point and was removed in C4.
- [x] C3: Legacy script retirement
  - Completed on 2026-03-19.
  - Removed obsolete npm wrappers from public command surface: `getModules`, `expandModuleList`, `checkModules`, `ownList` in [package.json](../../package.json).
  - Kept `collectMetadata` as a canonical stage helper and pointed it at `full-refresh-parallel` in [package.json](../../package.json).
  - Temporarily pinned the comparison harness to `full-refresh --only=check-modules` so parity runs kept working until the harness was retired in C4.
  - Marked `full-refresh` as a legacy compatibility pipeline before removing it in C4.
- [x] C4: Artifact contract cleanup
  - Completed on 2026-03-19.
  - Decided to retire the comparison harness and use canonical fixture/golden validation (`fixtures:generate`, `test:fixtures`, `golden:check`) as the supported regression path.
  - Removed the comparison-harness code, the `checkModules:compare` npm script from [package.json](../../package.json), and the dedicated compare workflow.
  - Removed the `full-refresh` compatibility pipeline and all legacy stage declarations (`get-modules`, `expand-module-list`, `check-modules`) from [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
  - Removed legacy-only artifact declarations (`modules-stage-3`, `modules-stage-4`, `skipped-modules`, `analysis-report`, `module-result-cache`) from [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
  - Removed stage 3/4 entries from [scripts/golden-artifacts/index.js](../../scripts/golden-artifacts/index.js) and deleted orphaned golden reference files `fixtures/golden/modules.stage.3.json` and `fixtures/golden/modules.stage.4.json`.
  - Removed harness section from [docs/pipeline/check-modules-reference.md](check-modules-reference.md) and [docs/CONTRIBUTING.md](../CONTRIBUTING.md).
- [x] C5: Docs and command surface cleanup
  - Completed on 2026-03-19.
  - Updated [docs/CONTRIBUTING.md](../CONTRIBUTING.md), [docs/architecture.md](../architecture.md), [docs/pipeline/orchestrator-cli-reference.md](orchestrator-cli-reference.md), and [docs/pipeline/worker-pool-design.md](worker-pool-design.md) to describe the canonical `full-refresh-parallel` flow.
  - Removed obsolete harness guidance from [docs/pipeline/check-modules-reference.md](check-modules-reference.md) and clarified legacy-only context in [docs/git-error-handling.md](../git-error-handling.md).
  - Aligned [scripts/validate_release_artifacts.js](../../scripts/validate_release_artifacts.js) with the supported artifact contract (`modules.stage.2.json`, `modules.stage.5.json`, and final outputs).
- [x] C6: Validation pass
  - Completed on 2026-03-19.
  - Ran `npm run lint` successfully with 0 errors and 4 pre-existing warnings.
  - Ran `npm run test:fixtures` successfully.
  - Ran `npm run golden:check` successfully.
  - Ran `npm run schemas:check` successfully.
  - Ran `WIKI_FILE=website/test/3rd-Party-Modules.md node --run all` successfully against the canonical `full-refresh-parallel` pipeline.
  - Archived run metadata in `.pipeline-runs/2026-03-19T13-16-31-327Z_full-refresh-parallel.json`.

## P7.6 Incremental Mode Integration

- [x] I1: Cache key contract
  - Completed on 2026-03-19.
  - Added a shared worker-cache contract in [scripts/shared/module-analysis-cache.js](../../scripts/shared/module-analysis-cache.js) covering module identity, repo freshness signal, normalized analysis config, and schema version.
  - Wired the parallel worker path to compute and carry `cacheKey` in module results, without enabling read/write behavior before I2/I3.
  - Hardened [scripts/shared/persistent-cache.js](../../scripts/shared/persistent-cache.js) so schema-version mismatches reset stale entries instead of silently reusing incompatible cache data.
- [x] I2: Read path integration
  - Completed on 2026-03-19.
  - Added `partitionModulesByCache()` helper in [scripts/parallel-processing.js](../../scripts/parallel-processing.js): loads the module analysis cache once at orchestrator start via `createModuleAnalysisCache`, and for each module computes its cache key and checks for a valid entry.
  - Modules with a cache hit bypass the worker pool entirely and are returned immediately with `fromCache: true`; only cache-miss modules are dispatched to workers.
  - Extracted `writePipelineOutputs()` to keep `main()` within lint line/statement limits.
  - Cache misses preserve all existing behavior; no behavior change when the cache file is absent.
- [x] I3: Write path integration
  - Completed on 2026-03-19.
  - Added `writeSuccessfulResultsToCache()` helper in [scripts/parallel-processing.js](../../scripts/parallel-processing.js): filters worker results for status=success, extracts analysis data (excluding meta-fields), and writes each to the cache with its cacheKey.
  - Integrated into orchestrator flow: after `pool.processModules()` returns, successful results are written to cache and flushed before output writing. No race conditions: all cache writes happen in parent process (single-threaded).
  - Caching only happens when `catalogueRevision` is available (cache keys are invalid otherwise).
  - Second-run module hits (from I2) still bypass the pool; now successful results from both first-run misses and second-run refreshes populate the cache for future runs.
- [x] I4: Skip semantics and reporting
  - Completed on 2026-03-19.
  - Cache-hit modules from I2 now marked as `status=skipped` and `skippedReason=cached` in [scripts/parallel-processing.js](../../scripts/parallel-processing.js) `partitionModulesByCache()`.
  - Final summary in `main()` already counts `success`, `failed`, and `skipped` separately; skipped modules now include cached hits.
  - Progress output correctly labels cached modules with `⊙` symbol and "(cached)" note per result.
  - Semantics are now consistent: skipped results appear in the same data structures as processed results; skipped totals reflect actual cache-bypass behavior.
- [x] I5: Invalidation and pruning
  - Completed on 2026-03-19.
  - Added `pruneStaleCacheEntries()` in [scripts/parallel-processing.js](../../scripts/parallel-processing.js), which computes the expected key set for the current run and removes cache entries not in that set.
  - This covers both removed modules (orphan entries) and key-input changes (module revision, check-group config, catalogue revision) because changed inputs produce different expected keys.
  - Cache persistence is centralized: after pruning and write-path updates, orchestrator flushes once when there are mutations (`Cache: X pruned, Y written`).
  - Schema-version invalidation remains enforced by [scripts/shared/persistent-cache.js](../../scripts/shared/persistent-cache.js) via version mismatch reset from I1.
- [ ] I6: Test coverage
  - Add unit tests for cache hit/miss/invalidation paths.
  - Add integration test showing improved second-run skip rate.
- [ ] I7: Runtime controls
  - Support toggles for cache enable/disable in parallel mode (`--no-cache` and/or env var).
  - Document default behavior for full vs incremental runs.
- [ ] I8: Evidence and acceptance
  - Record before/after performance and cache-hit metrics.
  - Confirm output parity for representative module subsets.

## Definition of Done

- [x] P7.5 done: Legacy stage flow is removed or explicitly legacy-only, and all docs/scripts reference the canonical flow.
- [ ] P7.6 done: Incremental cache behavior is integrated into worker architecture with tests and measurable skip-rate benefit.
- [ ] Ready for P8: No open P7 blockers remain in roadmap or worker design decision list.
