# Contributor Guide

Welcome! This document bundles the day-to-day tasks contributors perform when working on the MagicMirror² module catalogue. Use it as the single stop for local setup, pipeline execution, and schema validation.

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

## Release validation (Phase 4 rollout)

As of September 2025, schema validation is part of the release gate. After you regenerate the website data, run:

```bash
node --run release:validate
```

The command checks every stage snapshot (`modules.stage.1.json` … `modules.stage.5.json`) plus the published artifacts (`modules.json`, `modules.min.json`, `stats.json`). If any contract breaks, the command exits with a non-zero status and prints a list of offenders.

### When validation fails

1. Regenerate the curated fixtures to ensure the schemas match the current expectations:
   ```bash
   node --run fixtures:generate
   node --run test:fixtures
   ```
2. Re-run the affected pipeline stages (or `node --run all`) to rebuild the real datasets.
3. Execute `node --run release:validate` again. Keep iterating until the exit code is zero.

Document regressions or schema updates in [`docs/pipeline-refactor-roadmap.md`](pipeline-refactor-roadmap.md). For tricky cases, open an Issue so downstream consumers are aware of the contract change.

## Helpful references

- [`docs/architecture.md`](architecture.md) – current vs. target pipeline topology.
- [`docs/pipeline-refactor-roadmap.md`](pipeline-refactor-roadmap.md) – long-term modernization plan.
- [`fixtures/README.md`](../fixtures/README.md) – curated dataset and validation troubleshooting.
- [`docs/release-notes/2025-09-schema-validation.md`](release-notes/2025-09-schema-validation.md) – the Phase 4 rollout announcement.
