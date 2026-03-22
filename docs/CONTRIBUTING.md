# Contributing Guide

Welcome! This document bundles the day-to-day tasks contributors perform when working on the MagicMirror² module list. Use it as the single stop for local setup, pipeline execution, and schema validation.

## Local setup

### Prerequisites

- **Node.js**: Current Node.js version (LTS or later) is required.
- **Git**: Ensure Git is installed and available in your path.

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules.git
cd MagicMirror-3rd-Party-Modules
npm install
```

## Running the pipeline

Use the canonical helper scripts from `package.json` or call the orchestrator directly:

| Scope                     | Command                                                                                                       | Purpose                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Metadata only             | `node --run collectMetadata`                                                                                  | Fetch the upstream wiki list and enrich it with repository metadata into `modules.stage.2.json`. |
| Full canonical run        | `node --run all`                                                                                              | Execute `full-refresh-parallel` end-to-end.                                                      |
| Inspect the pipeline      | `node --run pipeline -- list` / `describe` / `logs`                                                           | Inspect the registered stages, pipelines, and recent run records.                                |
| Re-run processing+publish | `node scripts/orchestrator/index.ts run full-refresh-parallel --only=parallel-processing,aggregate-catalogue` | Re-run worker analysis and publication against an existing Stage 2 input.                        |

The `parallel-processing` stage is the expensive part of the run: it clones repositories, extracts metadata and screenshots, and performs the deeper checks that produce `modules.stage.5.json`. The follow-up `aggregate-catalogue` stage turns that Stage 5 snapshot into `modules.json`, `modules.min.json`, and `stats.json`.

### Orchestrator CLI for partial runs

The orchestrator CLI (`node --run pipeline` or `node scripts/orchestrator/index.ts`) bundles the stage graph, structured logging, and DX helpers like `list`, `describe`, `logs`, and `doctor`. Use it to:

- Execute the full pipeline with `node scripts/orchestrator/index.ts run full-refresh-parallel`.
- Target supported stages with `node scripts/orchestrator/index.ts run full-refresh-parallel --only=collect-metadata`, `--only=parallel-processing`, or `--only=aggregate-catalogue`.
- Inspect the available stages with `list`/`describe` or review artifacts via `logs`.
- Output machine-readable logs with `--json-logs` for integration with other tools.

Check the [orchestrator CLI reference](pipeline/orchestrator-cli-reference.md) for detailed usage examples, command options, and troubleshooting tips.

### Pipeline Tips

- **Refresh metadata only**: Use `node scripts/orchestrator/index.ts run full-refresh-parallel --only=collect-metadata` when you only need a fresh `modules.stage.2.json`.
- **Focus on one stage**: Use `--only=<stage-id>` to run a single stage in isolation. For example, `node scripts/orchestrator/index.ts run full-refresh-parallel --only=collect-metadata`.
- **Debug a small source list**: Set `WIKI_FILE=path/to/3rd-Party-Modules.md` and run `node --run all` to use a local wiki-formatted module list instead of the upstream page.
- **Check logs**: If a run fails, use `node scripts/orchestrator/index.ts logs` to list recent runs, and `node scripts/orchestrator/index.ts logs <run-file>` to view details.

### Stage details

#### Stage 1+2 – `collect-metadata/index.js`

Reads the official wiki list of third-party modules and fetches metadata (stars, topics, default branch, etc.) from the hosting service (GitHub/GitLab). The output is the enriched Stage 2 snapshot that downstream stages reuse.

#### Stage 3+4+5 – `parallel-processing.js`

Combines repository cloning, `package.json` enrichment, screenshot extraction, and deep analysis inside the worker pool. The stage emits `modules.stage.5.json` for the supported intermediate contract.

#### Stage 6 – `aggregate-catalogue.js`

Consumes `modules.stage.5.json` and writes the published catalogue outputs (`modules.json`, `modules.min.json`, `stats.json`).

#### `validate_release_artifacts.js`

Validates every stage snapshot and the published catalogue (`modules.json`, `modules.min.json`, `stats.json`) against the JSON Schemas. The command is wired into release packaging and must pass before publishing.

### Testing specific modules

For focused manual runs, point the pipeline at a small local wiki snapshot instead of the full upstream page:

1. Copy [`website/test/3rd-Party-Modules.md`](../website/test/3rd-Party-Modules.md) or prepare your own markdown file in the same table format as the upstream MagicMirror wiki page.
2. Run `WIKI_FILE=path/to/3rd-Party-Modules.md node --run all`.
3. Inspect the generated files under [`website/data/`](../website/data/) just like a full run.

For regression testing, prefer the curated fixtures (`node --run fixtures:generate`, `node --run test:fixtures`, `node --run golden:check`) over ad-hoc subsets.

## Release validation (Phase 4 rollout)

As of September 2025, schema validation is part of the release gate. After you regenerate the website data, run:

```bash
node --run release:validate
```

The command checks the supported stage snapshots (`modules.stage.2.json`, `modules.stage.5.json`) plus the published artifacts (`modules.json`, `modules.min.json`, `stats.json`). If any contract breaks, the command exits with a non-zero status and prints a list of offenders.

> ℹ️ **CI gate:** The same validation now runs automatically in GitHub Actions (`release-validation.yml`) on every push and pull request targeting `main`. Keep the command in your local workflow to catch schema regressions before CI fails.

### validate_release_artifacts.js

This script powers the validation command above. Keep it in your release checklist—CI will block merges once the GitHub Action lands, and the CLI already fails the automated packaging run if validation breaks.

### When validation fails

1. Regenerate the curated fixtures to ensure the schemas match the current expectations:
   ```bash
   node --run fixtures:generate
   node --run test:fixtures
   ```
2. Re-run the affected pipeline stages (or `node --run all`) to rebuild the real datasets.
3. Execute `node --run release:validate` again. Keep iterating until the exit code is zero.

Document regressions or schema updates in [`docs/architecture.md`](architecture.md) and [`docs/pipeline/orchestrator-cli-reference.md`](pipeline/orchestrator-cli-reference.md). For tricky cases, open an Issue so downstream consumers are aware of the contract change.

## Maintaining schemas

Schema sources live under `pipeline/schemas/src/` (with reusable fragments in `pipeline/schemas/partials/`). After editing them, regenerate the bundled artifacts that power validation:

```bash
npm run schemas:build
```

To verify that no additional changes are pending, run:

```bash
npm run schemas:check
```

The bundled files live in `dist/schemas/`. They ship with the repository so `node --run release:validate` can run without extra setup.

## Prerequisites & installation

1. Install [Node.js](https://nodejs.org).
2. Clone the repository:
   ```bash
   git clone https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules
   cd MagicMirror-3rd-Party-Modules
   npm install
   ```
3. Optional: Launch the task menu with `npm start` or run `node --run all` to execute every stage sequentially (note: takes >10 minutes and >2 GB disk when cloning the full catalogue).

## Running the container locally

To preview the published website bundle without running the full pipeline, use the prebuilt container image:

```bash
docker run --rm -p 8080:8080 ghcr.io/magicmirrororg/magicmirror-3rd-party-modules:main
```

Then open <http://localhost:8080> in a browser.

## Testing

Run all tests with:

```bash
npm test
```

### Unit tests

The shared utilities in `scripts/shared/` have unit tests using Node.js's built-in test runner. Run them with:

```bash
npm run test:unit
```

These tests verify core functionality like logging, rate limiting, and HTTP client behavior. When adding new utilities or modifying existing ones, update the tests in `scripts/shared/__tests__/`.

### Linting and formatting

The project enforces code quality through ESLint and Prettier:

```bash
npm run lint        # Check all files
npm run lint:fix    # Auto-fix issues
```

TypeScript files are now included in ESLint checks via `typescript-eslint` v8+. The configuration is in `eslint.config.js` using the modern flat config format.

### Spelling

Spelling is checked with `cspell`:

```bash
npm run test:spelling
```

### Golden artifacts (regression testing)

Golden artifacts are reference outputs stored in `fixtures/golden/` that serve as snapshots for regression testing. They ensure pipeline changes don't accidentally alter outputs.

**Workflow when modifying pipeline code:**

1. **Run tests**: `npm run golden:check`
   - ✅ **Pass**: Your changes didn't affect outputs
   - ❌ **Fail**: Outputs changed - review required

2. **Review changes**: `git diff fixtures/golden/`
   - Are these changes expected and intentional?
   - Do they match your code changes?

3. **Update golden files** (only if changes are intentional): `npm run golden:update`
   - Updates reference outputs to match new behavior
   - Creates new baseline for future tests

4. **Commit**: Include golden files in your commit
   - Documents expected behavior change
   - Future tests compare against your new baseline

**When to update golden artifacts:**

- Stage schemas change (added/removed fields)
- Error handling improvements (e.g., new error categories)
- Sorting or formatting changes (e.g., deterministic outputs)
- Bug fixes that alter output structure
- New pipeline features that affect final artifacts

**What they test:**

- Pipeline produces consistent outputs for the same inputs
- No accidental regressions in data structure or content
- Contract changes are explicit and reviewable in PRs

## Helpful references

- [`docs/architecture.md`](architecture.md) – current vs. target pipeline topology.
- [`docs/pipeline/orchestrator-cli-reference.md`](pipeline/orchestrator-cli-reference.md) – command reference for partial runs, diagnostics, and logs.
- [`fixtures/README.md`](../fixtures/README.md) – curated dataset and validation troubleshooting.
- [`docs/pipeline/shared-defs-scope.md`](pipeline/shared-defs-scope.md) – plan for consolidating shared JSON Schema `$defs` (task P1.6).

### Troubleshooting

#### Common Issues

**Linting Errors**

The project enforces strict linting rules. If your build fails due to linting:

1.  Run `npm run lint:fix` to automatically fix formatting and simple errors.
2.  Manually resolve any remaining issues reported by the linter.

**Schema Validation Failures**

If `node --run release:validate` fails:

1.  Check the error message to identify which file violates the schema.
2.  If you modified the schema, regenerate fixtures: `node --run fixtures:generate`.
3.  If you modified code that generates data, ensure the output matches the schema definitions in `pipeline/schemas/`.

**Rate Limiting**

The pipeline makes many requests to GitHub/GitLab. If you hit rate limits:

- Ensure you have a valid `GITHUB_TOKEN` in your environment (though the pipeline tries to work without one, a token significantly increases limits).
- The built-in rate limiter handles backoff automatically, but extreme usage might still trigger temporary bans. Wait a few minutes and try again.
