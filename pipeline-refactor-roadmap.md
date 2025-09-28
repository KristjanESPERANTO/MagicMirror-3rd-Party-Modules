# Pipeline Modernization Roadmap

This document captures the long-term improvements we want to implement in the module processing pipeline. It converts the recent analysis into actionable workstreams so that we can tackle them step by step.

## Guiding Objectives

- **Reduce maintenance friction** by consolidating runtimes, centralizing utilities, and improving observability.
- **Keep the pipeline resilient** through schema validation, caching, and clearer failure handling.
- **Improve contributor experience** with better documentation, configurability, and faster feedback loops.
- **Preserve current functionality** while iterating in small, testable increments.

## Workstreams

### 1. Pipeline Architecture & Orchestration

| Task | Description                                                                                                                                                | Dependencies | Effort |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P1.1 | Describe the full stage graph (inputs/outputs, side-effects) in a machine-readable config ([stage graph](pipeline/stage-graph.json)) ✅ Completed Sep 2025 | none         | S      |
| P1.2 | Introduce a lightweight orchestrator (Node CLI) that reads the config and runs stages with structured logging                                              | P1.1         | M      |
| P1.3 | Add JSON-schema validation for every stage boundary (modules.stage.\* files)                                                                               | P1.1         | M      |
| P1.4 | Provide a skip/only mechanism for partial runs (e.g. `--only=checks`)                                                                                      | P1.2         | S      |

### 2. Runtime & Codebase Consolidation

| Task | Description                                                                                     | Dependencies | Effort |
| ---- | ----------------------------------------------------------------------------------------------- | ------------ | ------ |
| P2.1 | Extract shared utilities (HTTP, Git, FS, logging, rate-limiter) into a reusable Node/TS module  | none         | M      |
| P2.2 | Port `get_modules.py` to TypeScript, reusing the shared utilities                               | P2.1         | L      |
| P2.3 | Port `check_modules.py` logic incrementally (start with fast checks, then optional heavy tasks) | P2.1         | XL     |
| P2.4 | Enable TypeScript build tooling (tsconfig, lint) and cover new modules with tests               | P2.1         | M      |
| P2.5 | Centralize `package.json` ingestion so data is parsed once and shared across stages             | P2.1         | M      |

### 3. Robustness & Performance Safety Nets

| Task | Description                                                                                                                                                                          | Dependencies | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| P3.1 | Add persistent caches for API responses and HEAD validations with expiration metadata                                                                                                | none         | M      |
| P3.2 | Introduce a central rate limiter + retry strategy for GitHub/GitLab requests                                                                                                         | P3.1         | M      |
| P3.3 | Capture structured logs (JSON) and aggregate per-stage timing metrics                                                                                                                | P1.2         | M      |
| P3.4 | Ensure deterministic outputs (sorted keys, hash-based image names) and document the guarantees                                                                                       | P1.2         | S      |
| P3.5 | Harden repository clone flow to gracefully skip missing/renamed repos and keep the pipeline green ([#41](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/41)) | none         | M      |
| P3.6 | Replace hard-coded star fallbacks with authenticated API lookups for non-GitHub hosts ([#5](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/5))               | P3.1         | M      |

### 4. Checks & Developer Experience

| Task | Description                                                                                                                                                                     | Dependencies | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------ |
| P4.1 | Split checks into a registry with metadata (category, severity, auto-fixable)                                                                                                   | P2.3         | M      |
| P4.2 | Add configuration file to toggle check groups (`fast`, `deep`, optional ESLint/ncu)                                                                                             | P4.1         | S      |
| P4.3 | Create sample dataset + regression tests for check outputs (golden files)                                                                                                       | P4.1         | M      |
| P4.4 | Provide CLI progress UI and Markdown summary per run                                                                                                                            | P1.2         | S      |
| P4.5 | Add rule detecting modules that rely on MagicMirror core dependencies without declaring them ([#78](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/78)) | P4.1         | M      |
| P4.6 | Check README install/update sections for copyable fenced command blocks ([#54](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/54))                      | P4.1         | S      |
| P4.7 | Recommend `npm install --omit=dev` when modules expose devDependencies in instructions ([#53](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/53))       | P4.1         | S      |
| P4.8 | Flag modules with multi-year inactivity that are not marked `outdated` and nudge maintainers to review status                                                                   | P4.1         | M      |
| P4.9 | Inspect Dependabot configs for schedule scope (monthly cadence, production-only) and suggest adjustments                                                                        | P4.1         | M      |

### 5. Documentation & Collaboration

| Task | Description                                                                                                                                                                    | Dependencies         | Effort |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------ |
| P5.1 | Publish an architecture diagram (current + target) in `docs/`                                                                                                                  | P1.1                 | S      |
| P5.2 | Expand contributor guide with setup, pipeline tips, troubleshooting                                                                                                            | P5.1                 | M      |
| P5.3 | Convert roadmap tasks into GitHub issues and track via project board                                                                                                           | after roadmap review | S      |
| P5.4 | Schedule periodic checkpoint (e.g. monthly) to review progress & adjust priorities                                                                                             | P5.3                 | S      |
| P5.5 | Coordinate migration of selected `guides/` content into the official docs repository ([#59](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/59))        | P5.2                 | M      |
| P5.6 | Establish change protocol with wiki-dependent consumers (e.g., MMPM) before altering layout ([#40](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/40)) | P5.1                 | S      |

### Related Backlog Items

These topics sit adjacent to the pipeline work but should stay visible while prioritizing future sprints:

- Progressive loading / chunked delivery of the public `modules.json` to keep client payload manageable ([#8](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/8)).

## Execution Strategy

1. **Foundation first**: Complete P1.3 and P5.1 to ensure we fully understand the existing pipeline and keep stage contracts safe while refactoring.
2. **Consolidate utilities** (P2.1) before migrating Python scripts so we can share code and avoid duplicated logic.
3. **Migrate in slices**: Move `get_modules` first (lower risk) and keep Python fallbacks until the TS version is proven stable. Follow with `check_modules` in feature flags (`--checks=legacy|ts`).
4. **Add tests alongside migrations** to prevent regressions and make future refactors safer.
5. **Keep communication tight** via roadmap review meetings or async updates in GitHub Discussions.

## Next Concrete Steps

1. Create issues for P1.3 and P5.1 and assign initial owners.
2. Prepare a small sample dataset to validate the staging files while we work on schema validation.

Feel free to adjust priorities, rename tasks, or add new items. This roadmap is meant to stay alive—update it as soon as we learn something new during implementation.
