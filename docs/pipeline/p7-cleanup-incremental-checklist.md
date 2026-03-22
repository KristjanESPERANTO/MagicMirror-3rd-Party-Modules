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
    - Compare harness workflow uses `checkModules:compare` in [.github/workflows/check-modules-compare.yaml](../../.github/workflows/check-modules-compare.yaml).
    - Follow-up: keep the unit/integration regression tests, but retire the comparison harness in C4 in favor of canonical fixture/golden validation.
  - CI hooks snapshot:
    - No workflow currently invokes legacy stage chain (`full-refresh` or `--only=get-modules|expand-module-list|check-modules`).
    - Git hook only runs lint-staged in [.husky/\_/pre-commit](../../.husky/_/pre-commit).
- [x] C2: Canonical pipeline switch
  - Completed on 2026-03-19.
  - `npm run all` now targets `full-refresh-parallel` in [package.json](../../package.json).
  - `pipeline run` without explicit pipeline id now defaults to `full-refresh-parallel` in [scripts/orchestrator/index.js](../../scripts/orchestrator/index.js).
  - Legacy stage-specific shortcuts (`collectMetadata`, `getModules`, `expandModuleList`, `checkModules`) were pinned to `full-refresh` as a temporary compatibility path in [package.json](../../package.json) and retired in C3.
  - Legacy `full-refresh` pipeline remains available as compatibility path in [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
- [x] C3: Legacy script retirement
  - Completed on 2026-03-19.
  - Removed obsolete npm wrappers from public command surface: `getModules`, `expandModuleList`, `checkModules`, `ownList` in [package.json](../../package.json).
  - Kept `collectMetadata` as a canonical stage helper and pointed it at `full-refresh-parallel` in [package.json](../../package.json).
  - Updated comparison harness default command to explicitly use `full-refresh --only=check-modules` so parity runs keep working without depending on canonical default in [scripts/check-modules/compare/index.js](../../scripts/check-modules/compare/index.js).
  - Marked `full-refresh` as legacy compatibility pipeline in [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
- [x] C4: Artifact contract cleanup
  - Completed on 2026-03-19.
  - Decided to retire the comparison harness and use canonical fixture/golden validation (`fixtures:generate`, `test:fixtures`, `golden:check`) as the supported regression path.
  - Removed `scripts/check-modules/compare/` (harness code), `checkModules:compare` from [package.json](../../package.json), and [.github/workflows/check-modules-compare.yaml](../../.github/workflows/check-modules-compare.yaml).
  - Removed the `full-refresh` compatibility pipeline and all legacy stage declarations (`get-modules`, `expand-module-list`, `check-modules`) from [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
  - Removed legacy-only artifact declarations (`modules-stage-3`, `modules-stage-4`, `skipped-modules`, `analysis-report`, `module-result-cache`) from [pipeline/stage-graph.json](../../pipeline/stage-graph.json).
  - Removed stage 3/4 entries from [scripts/golden-artifacts/index.js](../../scripts/golden-artifacts/index.js) and deleted orphaned golden reference files `fixtures/golden/modules.stage.3.json` and `fixtures/golden/modules.stage.4.json`.
  - Removed harness section from [docs/pipeline/check-modules-reference.md](check-modules-reference.md) and [docs/CONTRIBUTING.md](../CONTRIBUTING.md).
- [ ] C5: Docs and command surface cleanup
  - Update README/docs/npm script descriptions to match canonical flow.
  - Ensure contributor instructions do not point to retired stage sequence.
- [ ] C6: Validation pass
  - Run: `npm run lint`
  - Run: `npm run test:fixtures`
  - Run: `npm run golden:check`
  - Run: `npm run schemas:check`
  - Run one full `full-refresh-parallel` execution and archive summary logs.

## P7.6 Incremental Mode Integration

- [ ] I1: Cache key contract
  - Define worker-compatible cache key (module identity + repo freshness signal + analysis config).
  - Include a cache schema/version field for safe future migrations.
- [ ] I2: Read path integration
  - Load cache at orchestrator start and provide cache context to workers.
  - Preserve current behavior for cache miss and partial cache entries.
- [ ] I3: Write path integration
  - Aggregate worker cache updates in orchestrator and write once, deterministically.
  - Prevent write races from child processes.
- [ ] I4: Skip semantics and reporting
  - Standardize `status=skipped` and `skippedReason=cached` handling.
  - Ensure progress output and final summary report skipped/cached totals clearly.
- [ ] I5: Invalidation and pruning
  - Prune cache entries for removed modules.
  - Invalidate entries when key inputs change (checks config/schema version).
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

- [ ] P7.5 done: Legacy stage flow is removed or explicitly legacy-only, and all docs/scripts reference the canonical flow.
- [ ] P7.6 done: Incremental cache behavior is integrated into worker architecture with tests and measurable skip-rate benefit.
- [ ] Ready for P8: No open P7 blockers remain in roadmap or worker design decision list.
