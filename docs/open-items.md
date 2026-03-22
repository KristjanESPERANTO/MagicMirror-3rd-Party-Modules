# Open Items

_Last updated: March 22, 2026_

This is the single source of truth for active, cross-doc follow-up work.

## Active

1. **Worker-cache hardening**
   - Expand observability for cache hit/miss/write/prune behavior during full runs.
   - Add edge-case coverage for cache key drift and stale-entry pruning.
   - Verify long-run stability over repeated full-refresh runs.

2. **Repeated-run benchmark baseline**
   - Capture before/after metrics for repeated full-refresh runs with cache enabled.
   - Record duration deltas and cache-hit ratios in a reproducible benchmark note.

3. **Published contract guardrails**
   - Keep `modules.json`, `modules.min.json`, `stats.json`, and `result.md` stable while cache hardening evolves.
   - Treat contract-affecting changes as explicit review items in PRs.

## Backlog (Optional)

1. **Deterministic output enhancements**
   - Evaluate RFC 8785 canonical JSON serialization for stronger reproducibility guarantees.
   - Evaluate timestamp normalization/stripping strategy where metadata timestamps reduce reproducibility value.

## Process

- Add new follow-up work here instead of creating per-document roadmap sections.
- When an item is complete, remove it here and reflect final behavior in the relevant reference docs.
