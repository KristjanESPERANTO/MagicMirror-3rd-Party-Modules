# Shared `$defs` consolidation – scope

This note captures the scope for Task P1.6 ("Consolidate shared schema definitions"), based on the schemas that shipped with the Phase 4 validation rollout.

## Current schema inventory

| Artifact                      | Top-level shape                          | Module props (beyond the core 8)                                                                                                                                          |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules.stage.1.schema.json` | Object with `lastUpdate` and `modules[]` | `outdated`                                                                                                                                                                |
| `modules.stage.2.schema.json` | Array of modules                         | `outdated`, `stars`, `license`, `hasGithubIssues`, `isArchived`                                                                                                           |
| `modules.stage.3.schema.json` | Object with `modules[]`                  | `outdated`, `stars`, `license`, `hasGithubIssues`, `isArchived`                                                                                                           |
| `modules.stage.4.schema.json` | Object with `modules[]`                  | `outdated`, `stars`, `license`, `hasGithubIssues`, `isArchived`, `tags`, `image`, `packageJson`                                                                           |
| `modules.stage.5.schema.json` | Object with `modules[]`                  | `outdated`, `stars`, `license`, `hasGithubIssues`, `isArchived`, `tags`, `image`, `packageJson`                                                                           |
| `modules.final.schema.json`   | Object with `modules[]`                  | `outdated`, `stars`, `license`, `hasGithubIssues`, `isArchived`, `tags`, `image`, `keywords`, `defaultSortWeight`, `lastCommit` (and `issues` flips from array → boolean) |
| `modules.min.schema.json`     | Object with `modules[]`                  | Delegates to `modules.final.schema.json` via `$ref`                                                                                                                       |
| `stats.schema.json`           | Object with counters                     | unrelated, no shared module defs                                                                                                                                          |

Every stage schema repeats the same "core module" contract:

```text
name, category, url, id, maintainer, maintainerURL, description, issues
```

Optional decorations accumulate as stages progress.

## Proposed shared definitions

Create reusable `$defs` that each stage schema can assemble:

1. **`module.core.json`** – required core properties (the 8 fields above) plus the shared `outdated` optional string. Used everywhere.
2. **`module.repo-metadata.json`** – `stars`, `license`, `hasGithubIssues`, `isArchived`. Used from Stage 2 onward.
3. **`module.media.json`** – `tags` array and `image` string. Used Stage 4+, final.
4. **`module.package-json.json`** – shared manifest snapshot (`status`, `summary`, `warnings`). Used Stage 4+ where package metadata is bundled.
5. **`module.sorting.json`** – `defaultSortWeight`, `lastCommit`, `keywords`. Only final artifacts.
6. **`module.issues-array.json`** and **`module.issues-boolean.json`** – small snippets so Stage 1–5 reference the array variant while final schemas reference the boolean version without duplicating the other properties.
7. **`collection.wrapper.json`** – reusable top-level definitions for `modules[]` arrays, allowing Stage 2 (array) vs Stage 1/3/4/5/final (object with array) to share the item schema.

These definitions can live under `pipeline/schemas/partials/`. Stage schemas import them with local `$ref`s (`"$ref": "./partials/module.core.json"`) and use `allOf` to compose stage-specific variants. A script can bundle them into the current single-file schemas for distribution (see below).

## Build & publishing approach

1. Introduce `pipeline/schemas/build.js` that uses `json-schema-ref-parser` to bundle the partials/source schemas into distributable files under `dist/schemas/`.
2. Add `npm` scripts:
   - `schemas:build` – run the bundler and overwrite `dist/schemas/*.schema.json`.
   - `schemas:check` – verify that bundling is idempotent (run build and ensure no diff).
3. Update CI (once available) to run `schemas:check` so manual edits to bundled files are caught.
4. Document the workflow in `docs/CONTRIBUTING.md` (schema section) so contributors edit partials and regenerate.

## Acceptance criteria for P1.6

- ✅ Each stage schema sources its shared properties via `$ref`/`allOf`; no duplicate property blocks.
- ✅ Shared partials cover at least the five groupings above; extending the set only requires editing the partials.
- ✅ `modules.min.schema.json` keeps referencing the bundled final schema (no behavior change for consumers).
- ✅ `node --run release:validate` continues to pass against regenerated artifacts.

## Implementation (from September 2025)

- **Partials stay internal:** Only used for maintenance, not published.
- **Bundles in `/dist/schemas`:** All tools use bundled schemas from there; partials remain in the repo but are not published.
- **Simple workflow:** Build script creates bundles; orchestrator and tools use only the bundles.
