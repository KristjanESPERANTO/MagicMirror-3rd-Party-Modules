# Contributing Guide

Welcome! This document bundles the day-to-day tasks contributors perform when working on the MagicMirror² module list. Use it as the single stop for local setup, pipeline execution, and schema validation.

## Local setup

```bash
npm install
python3 -m venv .venv && source .venv/bin/activate  # optional but recommended for Python scripts
```

The Node and Python scripts live side by side today. The roadmap tracks our plan to consolidate runtimes, but for now please ensure both toolchains are available.

## Running the pipeline

You can run each stage individually or rely on the helper commands registered in `package.json`:

| Command                           | Purpose                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `node --run createModuleList`     | Stage 1 – derive the baseline list from the wiki.                               |
| `node --run updateRepositoryData` | Stage 2 – enrich the list with repository metadata (stars, topics, etc.).       |
| `node --run getModules`           | Stage 3 – clone the repos locally for deeper inspection.                        |
| `node --run expandModuleList`     | Stage 4 – parse `package.json`, pick screenshots, and compute derived metadata. |
| `node --run checkModulesJs`       | Stage 5a – JavaScript checks against the cloned repositories.                   |
| `node --run checkModules`         | Stage 5b – Python checks to surface README and packaging issues.                |
| `node --run all`                  | Convenience wrapper that executes the full chain in order.                      |

Heavy stages (`getModules`, `checkModules`) download hundreds of repositories and can take more than 10 minutes. When iterating on faster tasks (Stage 1–2, Stage 4), feel free to skip the expensive steps.

### Orchestrator CLI for partial runs

The new orchestrator CLI bundles the stage graph, structured logging, and DX helpers like `list`, `describe`, `logs`, and `doctor`. It lets you target subsets of stages (`--only=checks`) or inspect pipeline status without running everything. Check the [orchestrator CLI reference](pipeline/orchestrator-cli-reference.md) for usage examples, command options, and troubleshooting tips.

### Stage details

#### Stage 1 – `create_module_list.js`

Reads the official wiki list of third-party modules and converts it into the Stage 1 JSON snapshot. This is the authoritative source for module names, categories, and Git URLs.

#### Stage 2 – `updateRepositoryApiData.js`

Fetches metadata (stars, topics, default branch, etc.) from the hosting service (GitHub/GitLab). The output augments the Stage 1 snapshot with repository insights that downstream stages reuse.

#### Stage 3 – `get-modules.ts`

Clones every repository locally. Expect long runtimes (>10 minutes) and significant disk usage (>2 GB) when running the full catalogue.

#### Stage 4 – `expand_module_list_with_repo_data.js`

Scans each cloned repository to extract data from `package.json`, collect screenshots, and compute derived metadata. Images only appear in the website if the module declares a compatible license.

#### Stage 5a – `check_modules_js.js`

Runs JavaScript-based checks (naming conventions, minified files, etc.) against the cloned repositories to surface quick wins for maintainers.

#### Stage 5b – `check-modules/index.ts`

Runs the deep repository analysis in TypeScript, mirroring the legacy Python behavior while sharing utilities with the rest of the pipeline. It parses README files, inspects packaging hygiene, shells out to ESLint/`npm-check-updates`, and produces the markdown summary alongside `modules.json`, `modules.min.json`, and `stats.json`.

> Legacy fallback: the historical Python implementation (`scripts/check_modules.py`) remains available for parity comparisons. Invoke it via `pipeline run --only=check-modules --checks=legacy` when you need to diff outputs against the TypeScript stage.

#### `validate_release_artifacts.js`

Validates every stage snapshot and the published catalogue (`modules.json`, `modules.min.json`, `stats.json`) against the JSON Schemas. The command is wired into release packaging and must pass before publishing.

### Testing specific modules

Use the opt-in workflow when you only need to verify a subset of modules:

1. Create an `ownModuleList.json` based on [`ownModuleList_sample.json`](../ownModuleList_sample.json); only the `url` field is required, but you may also specify a `branch`.
2. Run `node --run ownList` to execute the tailored pipeline.
3. Inspect the output in [`website/result.html`](../website/result.html) just like the full run.

## Release validation (Phase 4 rollout)

As of September 2025, schema validation is part of the release gate. After you regenerate the website data, run:

```bash
node --run release:validate
```

The command checks every stage snapshot (`modules.stage.1.json` … `modules.stage.5.json`) plus the published artifacts (`modules.json`, `modules.min.json`, `stats.json`). If any contract breaks, the command exits with a non-zero status and prints a list of offenders.

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

Document regressions or schema updates in [`docs/pipeline-refactor-roadmap.md`](pipeline-refactor-roadmap.md). For tricky cases, open an Issue so downstream consumers are aware of the contract change.

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

1. Install [Node.js](https://nodejs.org). Python is optional unless you plan to run the legacy comparison harness.
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

## Helpful references

- [`docs/pipeline-refactor-roadmap.md`](pipeline-refactor-roadmap.md) – modernization milestones and upcoming tasks.
- [`docs/architecture.md`](architecture.md) – current vs. target pipeline topology.
- [`docs/pipeline/orchestrator-cli-reference.md`](pipeline/orchestrator-cli-reference.md) – command reference for partial runs, diagnostics, and logs.
- [`fixtures/README.md`](../fixtures/README.md) – curated dataset and validation troubleshooting.
- [`docs/pipeline/shared-defs-scope.md`](pipeline/shared-defs-scope.md) – plan for consolidating shared JSON Schema `$defs` (task P1.6).
