# Pipeline Architecture

Visibility into the automation that builds and publishes the third-party module catalogue helps contributors reason about changes and spot failure points early. This document summarizes the current pipeline, highlights the target architecture we are steering toward, and links each element back to the modernization roadmap.

## Current state (October 2025)

The production pipeline is orchestrated via `node scripts/orchestrator/index.js run full-refresh` (or the shorthand npm scripts) and progresses through six sequential stages. All stages are now implemented in TypeScript/Node.js and reuse the shared utility layer introduced in P2.1. Each stage produces a well-defined artifact that ships with a JSON Schema contract enforced at the boundary.

### Stage overview

| Order | Stage ID                 | Runtime    | Key outputs                                                                                                  |
| ----- | ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 1     | `create-module-list`     | Node.js    | `website/data/modules.stage.1.json`                                                                          |
| 2     | `update-repository-data` | Node.js    | `website/data/modules.stage.2.json`, `website/data/gitHubData.json`                                          |
| 3     | `get-modules`            | TypeScript | `website/data/modules.stage.3.json`, `modules/`, `modules_temp/`                                             |
| 4     | `expand-module-list`     | Node.js    | `website/data/modules.stage.4.json`, `website/images/`                                                       |
| 5     | `check-modules-js`       | Node.js    | `website/data/modules.stage.5.json`                                                                          |
| 6     | `check-modules`          | TypeScript | `website/data/modules.json`, `website/data/modules.min.json`, `website/data/stats.json`, `website/result.md` |

### Current workflow diagram

```mermaid
flowchart LR
  orchestrator[["Node orchestrator CLI (stage-graph.json)"]]
  orchestrator --> create{{"Create module list<br>Node.js"}}
  orchestrator --> update{{"Update repository metadata<br>Node.js"}}
  orchestrator --> fetch{{"Fetch module repos<br>TypeScript"}}
  orchestrator --> enrich{{"Enrich with package metadata<br>Node.js"}}
  orchestrator --> checkjs{{"Static checks<br>Node.js"}}
  orchestrator --> checkts{{"Deep analysis<br>TypeScript"}}

  create --> stage1["modules.stage.1.json"]
  stage1 --> update
  update -- "modules.stage.2.json" --> fetch
  update <-.-> cache[("gitHubData.json")]
  fetch -- "modules.stage.3.json" --> enrich
  fetch --> clones[("modules/, modules_temp/")]
  enrich -- "modules.stage.4.json" --> checkjs
  enrich --> images[("website/images/")]
  checkjs -- "modules.stage.5.json" --> checkts
  checkts --> outputs[("modules.json, modules.min.json, stats.json, result.md")]
```

### Observations

- Stage contracts are codified via the bundled schemas stored under `dist/schemas/` (sources live in `pipeline/schemas/src/`).
- Cross-cutting utilities (HTTP, Git, filesystem, rate limiting) now live in `scripts/shared/` and are reused by every TypeScript stage, including the deep-analysis step.
- The orchestrator CLI runs the declarative stage graph and supports `--only/--skip`, retries, and shared logging.
- The comparison harness (`scripts/check-modules/compare/`) captures README/HTML alongside JSON outputs and applies warning thresholds before highlighting differences between the legacy and TypeScript runs.

### Legacy workflow snapshot (pre-September 2025)

```mermaid
flowchart LR
  wiki[("MagicMirror wiki table")] --> createLegacy{{"Create module list<br>Node.js"}}
  createLegacy --> stage1Legacy["modules.stage.1.json"]
  stage1Legacy --> updateLegacy{{"Update repository metadata<br>Node.js"}}
  updateLegacy -- "modules.stage.2.json" --> getLegacy{{"Fetch module repos<br>Python"}}
  updateLegacy <-.-> cacheLegacy[("gitHubData.json")]
  getLegacy -- "modules.stage.3.json" --> expandLegacy{{"Enrich with package metadata<br>Node.js"}}
  getLegacy --> clonesLegacy[("modules/, modules_temp/")]
  expandLegacy -- "modules.stage.4.json" --> checkjsLegacy{{"Static checks<br>Node.js"}}
  expandLegacy --> imagesLegacy[("website/images/")]
  checkjsLegacy -- "modules.stage.5.json" --> checkLegacy{{"Deep analysis<br>Python"}}
  checkLegacy --> outputsLegacy[("modules.json, modules.min.json, stats.json, result.md")]
```

This legacy diagram captures the pre-orchestrator, mixed-runtime pipeline that relied on direct node and Python scripts. Retaining it here provides a historical comparison as we continue to modernize the remaining stages.

## Target state

The roadmap contemplates a TypeScript-first pipeline driven by a declarative stage graph. The near-term target introduces a dedicated orchestrator (task **P1.2**) that reads `pipeline/stage-graph.json`, executes stages with structured logging, and exposes `--only`/`--skip` flags. Usage details live in the [orchestrator CLI reference](pipeline/orchestrator-cli-reference.md). Subsequent work ports Python stages to TypeScript (tasks **P2.2** and **P2.3**) and centralizes shared utilities (**P2.1**).

### Target workflow diagram

```mermaid
flowchart LR
  orchestrator[[Node orchestrator CLI<br>reads stage-graph.json]]
  orchestrator --> createTS{{Create module list<br>TypeScript}}
  orchestrator --> repoDataTS{{Update repository data<br>TypeScript}}
  orchestrator --> fetchTS{{Fetch module repos<br>TypeScript w/ Git helper}}
  orchestrator --> enrichTS{{Enrich manifests<br>TypeScript}}
  orchestrator --> checksJS{{Rule registry<br>TypeScript}}
  orchestrator --> publishTS{{Publish & report<br>TypeScript}}
  subgraph Shared services
    http[(HTTP client)]
    git[(Git wrapper)]
    fs[(FS + cache)]
    schema[(Schema validator)]
    pkg[(Package metadata cache)]
  end
  createTS --> repoDataTS --> fetchTS --> enrichTS --> checksJS --> publishTS
  fetchTS -.uses.-> git
  repoDataTS -.uses.-> http
  publishTS -.uses.-> schema
  enrichTS -.uses.-> fs
  publishTS -.produces.-> public[(modules.json,<br>stats.json,<br>website/)]
```

### Advantages we unlock

- **Unified runtime**: A single TypeScript codebase simplifies dependency management and testing (tasks **P2.1–P2.4**).
- **Explicit orchestration**: The CLI understands dependencies, making parallelism, retries, and partial runs possible (task **P1.2**).
- **Reusable schema definitions**: Shared `$defs` keep stage contracts and final outputs aligned (task **P1.6**).
- **Faster iteration**: With shared services and fixtures, regression tests can run on curated datasets (task **P4.3**).

## How this document stays fresh

- Update the diagrams whenever the stage graph (`pipeline/stage-graph.json`) or comparison harness outputs change.
- Fold in structured logging timelines, diff gating, and other resiliency milestones (tasks **P3.3** and beyond) as they land.
- Cross-link to companion docs (`pipeline/check-modules-reference.md`, `pipeline-refactor-roadmap.md`) whenever new guardrails or fixtures ship, so contributors can trace updates end to end.
