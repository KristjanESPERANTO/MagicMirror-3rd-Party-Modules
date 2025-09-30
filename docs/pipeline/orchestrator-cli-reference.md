# Pipeline Orchestrator CLI — Reference

_Last updated: 2025-09-30_

Task **P1.2** delivered a lightweight Node.js command-line interface that reads the declarative stage graph, executes the pipeline end-to-end, and provides structured feedback to contributors. This document now serves as the reference for the shipped implementation.

## Key capabilities

- Provide a single entry point (e.g. `node --run pipeline -- pipeline run full-refresh`) that replaces the existing ad-hoc shell scripts.
- Interpret `pipeline/stage-graph.json` at runtime to determine stage ordering, inputs/outputs, and side-effects.
- Emit structured logs and progress indicators so maintainers can trace stage execution locally and in CI.
- Offer composable filters (`--only`, `--skip`, future `--from`/`--to`) that unlock partial runs without duplicating scripts (supports P1.4).
- Surface consistent pre/post hooks (e.g. schema validation, cleanup) and failure handling across all stages.
- Keep Python stages runnable by invoking the existing scripts until they are ported (ties into P2.x workstream).

## Stakeholders

- **Maintainers**: use the CLI locally to validate changes and regenerate artifacts.
- **CI/CD**: run the CLI in GitHub Actions to enforce pipeline health.
- **Contributors**: receive consistent feedback when running partial checks.

## Context & Inputs

- Stage metadata lives in [`pipeline/stage-graph.json`](../../pipeline/stage-graph.json) and was finalized under P1.1.
- Schemas for stage artifacts are bundled in `dist/schemas/*.schema.json` (P1.3–P1.6) and are enforced after each stage.
- The CLI lives under `scripts/orchestrator/` (primary entrypoint `index.js`, helper modules `cli-helpers.js` and `cli-commands.js`) with shared utilities documented in [`docs/architecture.md`](../architecture.md).

## Architecture Overview

1. **Command Surface** — Implemented with `commander`, exposing the `pipeline` root command and subcommands:
   - `pipeline list` — enumerate available pipelines/stages from the graph.
   - `pipeline describe <stage|pipeline>` — print detailed metadata for inspection.
   - `pipeline run <pipelineId>` — execute stages sequentially (default: `full-refresh`).
   - `pipeline logs [runId|--latest]` — inspect structured run metadata saved to `.pipeline-runs/`.
   - `pipeline doctor` — check external prerequisites (Node/Python versions, Git availability, required env vars).

2. **Execution Engine** — Core runtime that:
   - Loads the stage graph via `loadStageGraph` and resolves an execution plan with `buildExecutionPlan`.
   - Applies stage filters derived from `--only`/`--skip` and validates referenced stage IDs.
   - Runs stages strictly sequentially (no parallel execution), prepares the environment, logs start/end, and invokes the configured command.
   - Captures exit codes, stdout/stderr, and wraps failures with actionable messages before persisting result metadata.

3. **Stage Runner Abstraction** — Normalizes execution for different runtimes:
   - Node stages run via `node <script>`.
   - Python stages run via `python3 <script.py>` using the system interpreter (no enforced virtualenv) with `PYTHONPATH` adjustments as needed.
   - Future TS stages (from P2.x) can reuse the same abstraction once compiled.

4. **State & Artifacts** — Maintains an execution ledger (`.pipeline-runs/<timestamp>_<pipeline>.json`) with start/end timestamps, stage statuses, durations, filters, and failure metadata, enabling future resume functionality and local auditing.

5. **Hooks & Validation** — After each stage, hooks:
   - Validate declared artifacts against schemas using `validateStageFile` (Ajv-based).
   - Leave room for future cleanup/cache hooks (e.g. restoring `modules_temp`) without additional artifact drift checks beyond schema validation.

## CLI Options & Flags

### Currently available

- `pipeline run --only <stageIds>` — run only the specified stages (comma-separated) after dependency resolution.
- `pipeline run --skip <stageIds>` — omit the given stage IDs while keeping the rest of the plan.
- `pipeline list --pipelines` — limit listings to pipeline summaries.
- `pipeline list --stages` — limit listings to stage summaries.
- `pipeline logs --latest` — inspect the most recent persisted run record.

Commander validates the mutually exclusive options (`--only`/`--skip`) so that unknown stage IDs or conflicting filters surface errors before execution.

### Future enhancements

The original exploration surfaced a few ideas that remain on the backlog:

- `--log-level <level>` — switch between verbose and quiet output.
- `--dry-run` — show the planned execution without invoking any stages.
- `--force` — ignore any future caching optimizations and run every stage.

## Structured Logging

- Emit human-readable console output with stage numbering and duration markers, e.g. `▶︎ [1/6] create-module-list … done in 12.4s`.
- Persist a structured JSON summary to `.pipeline-runs/<timestamp>_<pipeline>.json` capturing stage outcomes, durations, applied filters, and failure metadata.
- Provide `pipeline logs [runId|--latest]` to inspect a stored run summary without digging into the filesystem.

## Error Handling & Retry

- On failure, stop further stages by default and surface:
  - Exit code.
  - Path to the stage log file.
  - Suggested remediation (e.g. rerun with `--only stageId`).
- Future enhancement: consider a `--continue-on-error` flag for exploratory batches (would run remaining stages but mark the run as degraded).
- Non-zero exit codes propagate to shell/CI.

## Integration with Existing Scripts

- Stage runner resolves script paths from the graph and executes them raw (no refactor needed initially).
- Shared helper for environment preparation (e.g. ensuring `modules_temp` rotation) remains a follow-up task and can live under `scripts/lib/pipeline/` when extracted.
- Python environment detection: check `python3 --version` upfront; optional configuration to point at a virtualenv.
