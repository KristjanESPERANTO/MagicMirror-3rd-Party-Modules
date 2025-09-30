# Pipeline Orchestrator CLI — Design Draft

_Last updated: 2025-09-29_

The goal of task **P1.2** is to introduce a lightweight Node.js command-line interface that reads the declarative stage graph, executes the pipeline end-to-end, and provides structured feedback to contributors. This document captures the proposed design so that implementation work can proceed in small, verifiable slices.

## Goals

- Provide a single entry point (e.g. `node --run pipeline -- pipeline run full-refresh`) that replaces the existing ad-hoc shell scripts.
- Interpret `pipeline/stage-graph.json` at runtime to determine stage ordering, inputs/outputs, and side-effects.
- Emit structured logs and progress indicators so maintainers can trace stage execution locally and in CI.
- Offer composable filters (`--only`, `--skip`, future `--from`/`--to`) that unlock partial runs without duplicating scripts (supports P1.4).
- Surface consistent pre/post hooks (e.g. schema validation, cleanup) and failure handling across all stages.
- Keep Python stages runnable by invoking the existing scripts until they are ported (ties into P2.x workstream).

## Non Goals

- Migrating Python scripts to TypeScript (covered by P2.2 & P2.3).
- Redesigning the stage graph format beyond the additions needed to execute it.
- Adding distributed scheduling or parallel stage execution; the initial version stays single-threaded, honoring declared order.

## Stakeholders

- **Maintainers**: use the CLI locally to validate changes and regenerate artifacts.
- **CI/CD**: run the CLI in GitHub Actions to enforce pipeline health.
- **Contributors**: receive consistent feedback when running partial checks.

## Context & Inputs

- Stage metadata lives in [`pipeline/stage-graph.json`](../../pipeline/stage-graph.json) and was finalized under P1.1.
- Schemas for stage artifacts are bundled in `dist/schemas/*.schema.json` (P1.3–P1.6) and should be enforced after each stage.
- The CLI will live under `scripts/` (e.g. `scripts/orchestrator/index.ts` compiled to JavaScript) with shared utilities documented in [`docs/architecture.md`](../architecture.md).

## Architecture Overview

1. **Command Surface** — Implemented using `commander` (existing dependency) with a root command `pipeline` exposing subcommands:
   - `pipeline list` — enumerate available pipelines/stages from the graph.
   - `pipeline describe <stage|pipeline>` — print detailed metadata for inspection.
   - `pipeline run <pipelineId>` — execute stages sequentially (default: `full-refresh`).
   - `pipeline run-stage <stageId>` — execute a single stage for debugging.
   - `pipeline doctor` — check external prerequisites (Node/Python versions, Git availability, required env vars).

2. **Execution Engine** — Core module that:
   - Loads and validates the stage graph against a JSON Schema (TBD minimal schema).
   - Resolves topological order of the requested pipeline.
   - Applies filters from flags (`--only=stageA,stageB`, `--skip=stageC`).

- Runs stages strictly sequentially (no parallel execution), prepares the environment, logs start/end, and invokes the configured command.
- Captures exit codes, stdout/stderr, and wraps failures with actionable messages (including suggested retries or cleanups).

3. **Stage Runner Abstraction** — Normalizes execution for different runtimes:
   - Node stages run via `node path/to/script.js`.

- Python stages run via `python3 path/to/script.py` using the system interpreter (no enforced virtualenv) with `PYTHONPATH` adjustments as needed.
- Future TS stages (from P2.x) reuse the same abstraction after compilation.

4. **State & Artifacts** — Maintains an execution ledger (JSON file under `.pipeline-runs/`) with start/end timestamps, stage statuses, durations, and failure metadata, enabling future resume functionality and local auditing.

5. **Hooks & Validation** — After each stage, optional hooks can:
   - Validate declared artifacts against schemas (using existing Ajv validator).

- Perform cleanup (e.g. restore `modules_temp` handling) or cache promotion; no additional artifact drift checks beyond schema validation are planned.

## CLI Options & Flags

- `--only <stageIds>` — comma-separated stage IDs to run (subset of resolved order).
- `--skip <stageIds>` — skip listed stage IDs while keeping the rest.
- `--since <runId>` — re-run stages modified since a previous run (future enhancement; tracked as P1.4 follow-up).
- `--log-level <level>` — `info` (default), `debug`, `warn`, `error`.
- `--dry-run` — show planned execution without running commands.
- `--env-file <path>` — load environment variables for the run (see `.env.example`).
- `--force` — ignore cached artifacts and force rerun even if unchanged.

Flag parsing uses Commander’s option system; validation ensures that mutually exclusive options (e.g. `--only` and `--skip` specifying the same stage) surface errors before execution.

## Structured Logging

- Emit human-readable console output with stage numbering and duration markers, e.g. `▶︎ [1/6] create-module-list … done in 12.4s`.
- Persist JSON lines to `.pipeline-runs/<timestamp>.log` containing `{ stageId, status, durationMs, artifacts }` for post-run analysis.
- Provide a `pipeline logs <runId>` helper to tail or pretty-print a past run.

## Error Handling & Retry

- On failure, stop further stages by default and surface:
  - Exit code.
  - Path to the stage log file.
  - Suggested remediation (e.g. rerun with `--only stageId`).
- Add `--continue-on-error` flag for exploratory batches (runs remaining stages but marks the run as degraded).
- Non-zero exit codes propagate to shell/CI.

## Integration with Existing Scripts

- Stage runner resolves script paths from the graph and executes them raw (no refactor needed initially).
- Shared helper for environment preparation (e.g. ensuring `modules_temp` rotation) will live under `scripts/lib/pipeline/`.
- Python environment detection: check `python3 --version` upfront; optional configuration to point at a virtualenv.

## Testing Strategy

- **Unit Tests** (node:test):
  - Graph parsing & validation (invalid graph detection, missing artifacts).
  - Stage selection filters (`--only`, `--skip`).
  - Command builder for Node/Python semantics.
- **Integration Tests**:
  - Use lightweight fixtures under `fixtures/pipeline/` with stub scripts returning known outputs.
  - Validate structured logs and state ledger content.
- **Contract Tests**:
  - Ensure stage outputs are validated against their schemas post-run (using stage-graph metadata).
- Add the CLI to CI (GitHub Actions) as a new job running `pipeline run full-refresh --dry-run` and `pipeline run full-refresh --only=create-module-list` to catch regressions early.

## Rollout Plan

1. **MVP (Milestone P1.2.a)** ✅ Implemented — `pipeline run <pipelineId>` executes stages sequentially with logging and failure handling.
2. **Schema Hooks (P1.2.b)** ✅ Implemented — artifacts are validated via `scripts/lib/schemaValidator.js` immediately after each stage runs.
3. **Partial Runs (P1.4)** ✅ — `pipeline run` now accepts `--only`/`--skip` filters and persists run metadata to `.pipeline-runs/<timestamp>_<pipeline>.json`.
4. **Developer Experience Enhancements** — Implement `pipeline list`, `describe`, `doctor`, and structured log viewer. Update docs and release notes.

## Documentation & Onboarding

- Update [`docs/architecture.md`](../architecture.md) with the orchestrator flow once MVP ships.
- Add a “Running the pipeline” section to [`docs/CONTRIBUTING.md`](../CONTRIBUTING.md) referencing the new CLI commands.
- Provide a quickstart snippet for CI integration in `docs/pipeline/shared-defs-scope.md` as a precedent for future pipeline docs.
- Secrets management remains out of scope for the CLI; rely on existing project guidance for token handling.
