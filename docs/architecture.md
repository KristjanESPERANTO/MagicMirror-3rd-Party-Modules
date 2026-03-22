# Pipeline Architecture

Visibility into the automation that builds and publishes the third-party module catalogue helps contributors reason about changes and spot failure points early. This document summarizes the current canonical pipeline, the legacy state we migrated from, and the parts of the broader architecture that are still future-facing.

## Current State (March 2026)

The supported production pipeline is orchestrated via `node scripts/orchestrator/index.js run full-refresh-parallel` (also exposed as `node --run all`). The orchestrator now drives two registered stages across three conceptual phases: metadata collection, parallel module processing, and publication. The remaining architectural gap tracked under P7.6 is reintegrating worker-aware incremental cache writes.

### Stage Overview

| Order | Stage ID              | Key Outputs                                                                                                              |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1+2   | `collect-metadata`    | `modules.stage.2.json`, `gitHubData.json`                                                                                |
| 3+4+5 | `parallel-processing` | `modules.stage.5.json`, `modules/`, `modules_temp/`, `website/images/`, `modules.json`, `modules.min.json`, `stats.json` |

### Current Workflow Diagram

```mermaid
flowchart TB
  orchestrator[[Orchestrator<br>2-stage execution]]

  subgraph Phase 1: Metadata Collection
    seed[("Module seed list")] --> collect{{Collect metadata}}
    collect --> cache[("gitHubData.json cache")]
    collect --> stage2["modules.stage.2.json"]
  end

  subgraph Phase 2: Parallel Module Processing
    stage2 --> parallel{{Parallel processing}}
    parallel --> clones[("modules/<br>modules_temp/")]
    parallel --> images[("website/images/")]
    parallel --> stage5["modules.stage.5.json"]
    parallel --> outputs[("modules.json<br>modules.min.json<br>stats.json")]
  end

  orchestrator -.controls.-> collect
  orchestrator -.controls.-> parallel
```

### Key Features

- **Orchestrator CLI**: Declarative stage graph with `--only/--skip` support, retries, and structured logging
- **Worker Pool Stage**: `parallel-processing` encapsulates clone, enrich, image, and analysis work behind a single supported stage
- **Schema Validation**: JSON schemas enforce contracts at the supported boundaries (`modules.stage.2.json`, `modules.stage.5.json`, final outputs)
- **Shared Utilities**: HTTP, Git, filesystem, and rate limiting in `scripts/shared/`

### Incremental Pipeline Behavior

The pipeline implements intelligent caching and skip logic to avoid redundant work:

| Scope             | Optimization    | Current Behavior                                                      | Why It Helps                                                           |
| ----------------- | --------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Metadata          | API cache TTL   | Reuses recent host API responses during `collect-metadata`            | Reduces external API traffic                                           |
| Module processing | Clone reuse     | Recycles `modules_temp/` when repositories can be refreshed in place  | Avoids unnecessary full re-clones                                      |
| Module processing | Worker batching | Processes modules in bounded child-process batches                    | Keeps memory bounded and throughput predictable                        |
| Analysis cache    | Pending         | Worker-compatible `moduleCache.json` reintegration is tracked in P7.6 | Restores second-run skip behavior without reviving the old stage chain |

---

## Legacy Workflow Snapshot (pre-September 2025)

```mermaid
flowchart TB
  subgraph Stage 1: Create Module List
    wiki[("MagicMirror wiki table")] --> createLegacy{{Create module list<br>Node.js}}
    createLegacy --> stage1Legacy["modules.stage.1.json"]
  end

  subgraph Stage 2: Update Repository Data
    stage1Legacy --> updateLegacy{{Update repository data<br>Node.js}}
    updateLegacy --> cacheLegacy[("gitHubData.json cache")]
    updateLegacy --> stage2Legacy["modules.stage.2.json"]
  end

  subgraph Stage 3: Get Modules
    stage2Legacy --> getLegacy{{Fetch repos<br>Python}}
    getLegacy --> clonesLegacy[("modules/<br>modules_temp/")]
    getLegacy --> stage3Legacy["modules.stage.3.json"]
  end

  subgraph Stage 4: Expand Module List
    stage3Legacy --> expandLegacy{{Enrich metadata<br>Node.js}}
    expandLegacy --> imagesLegacy[("website/images/")]
    expandLegacy --> stage4Legacy["modules.stage.4.json"]
  end

  subgraph Stage 5: Check Modules JS
    stage4Legacy --> checkjsLegacy{{Static checks<br>Node.js}}
    checkjsLegacy --> stage5Legacy["modules.stage.5.json"]
  end

  subgraph Stage 6: Check Modules
    stage5Legacy --> checkLegacy{{Deep analysis<br>Python}}
    checkLegacy --> outputsLegacy[("modules.json<br>modules.min.json<br>stats.json<br>result.md")]
  end

  note1[["Mixed runtime: Python + Node.js"]]
  note2[["No orchestrator: manual script execution"]]
  note3[["6 sequential stages"]]
```

This legacy diagram captures the pre-orchestrator, mixed-runtime pipeline. Key issues that motivated the modernization:

- Mixed Python + Node.js runtime made maintenance difficult
- No orchestrator: manual script execution
- No incremental updates: full run required every time
- OOM risk with 1300+ modules loaded into memory
- 6 sequential stages with 6 intermediate JSON files

---

## Canonical 3-Phase Model

The current canonical pipeline already follows this three-phase shape; the remaining roadmap work in P7.6 is about completing worker-aware incremental caching and measuring repeated-run improvements.

### Canonical Workflow Diagram

```mermaid
flowchart TB
  orchestrator[[Orchestrator<br>Parallel execution engine]]

  subgraph Phase 1: Metadata Collection
    seed[("Module seed list")] --> collect{{Collect metadata}}
    collect --> cache1[("Metadata cache<br>GitHub API, npm registry")]
    collect --> metadata["Enriched metadata"]
  end

  subgraph Phase 2: Analysis - Parallel Streams
    metadata --> stream{{Stream processor}}
    stream --> |Batch 1| analyze1{{Clone + Analyze}}
    stream --> |Batch 2| analyze2{{Clone + Analyze}}
    stream --> |Batch N| analyze3{{Clone + Analyze}}
    analyze1 --> results1[("Results")]
    analyze2 --> results1
    analyze3 --> results1
  end

  subgraph Phase 3: Publishing
    results1 --> aggregate{{Aggregate + Validate}}
    aggregate --> publish{{Generate outputs}}
    publish --> artifacts[("modules.json<br>stats.json<br>website/")]
  end

  orchestrator -.controls.-> collect
  orchestrator -.controls.-> stream
  orchestrator -.controls.-> aggregate

  cache1 -.incremental updates.-> collect
  results1 -.diff detection.-> aggregate
```

### Comparison: Legacy vs. Canonical Flow

| Aspect             | Legacy (6 stages)         | Canonical flow (Mar 2026)                                     |
| ------------------ | ------------------------- | ------------------------------------------------------------- |
| Runtime            | Python + Node.js          | Node.js with TypeScript-based deep checks                     |
| Execution          | Sequential manual scripts | Orchestrated 2-stage pipeline with worker pool                |
| Incremental        | ❌ No                     | Partial: metadata cache + clone reuse                         |
| Memory             | Unbounded                 | Batch-/worker-bounded                                         |
| Intermediate files | 6                         | `modules.stage.2.json`, `modules.stage.5.json`, final outputs |

### Remaining Gaps

1. Reintegrate worker-compatible `moduleCache.json` handling under P7.6.
2. Record before/after repeated-run performance metrics once cache writes are back in place.
3. Keep the published contract (`modules.json`, `modules.min.json`, `stats.json`) stable while worker caching evolves.

The remaining intermediate files (`modules.stage.2.json`, `modules.stage.5.json`) are still intentional schema boundaries. The roadmap direction is to reduce or remove such boundary files once streaming/aggregation can replace them cleanly, not to rename them for cosmetic reasons.

---

## Distribution Touchpoints

This section is about how module data enters the system and reaches downstream consumers. Unlike the canonical pipeline above, part of this flow is still conceptual.

### Current Intake Flow

```mermaid
flowchart LR
  wiki[(module wiki list<br><i>- unreliable -</i>)]
  pipeline{{automation pipeline}}
  api[(API<br>modules.json)]
  remote[MMM-Remote-Control]
  modinstall[MMM-ModInstall]
  config[MMM-Config]
  mmpm[mmpm]
  moduleWebsite[website<br>modules.magicmirror.builders]

  wiki --> pipeline --> api
  api --> mmpm
  api --> remote
  api --> modinstall
  api --> config
  api --> moduleWebsite
```

### Potential Future Intake Flow

```mermaid
flowchart LR
  ui[(Form-based front end<br>for adding, editing, and<br>deleting modules<br><i>- not yet conceptualized -</i>)]
  pipeline{{automation pipeline}}
  api[(API<br>modules.json)]
  remote[MMM-Remote-Control]
  modinstall[MMM-ModInstall]
  config[MMM-Config]
  mmpm[mmpm]
  moduleWebsite[website<br>modules.magicmirror.builders]

  ui --> pipeline --> api
  api --> remote
  api --> modinstall
  api --> config
  api --> mmpm
  api --> moduleWebsite
```

If this direction is pursued, the wiki would be replaced with a form-based frontend while downstream consumers continue using the unchanged API endpoint.

---

## Related Documentation

- [Pipeline Modernization Roadmap](pipeline-refactor-roadmap.md) — Task breakdown and priorities
- [Deterministic Outputs](deterministic-outputs.md) — Guarantees for reproducible builds
- [Check Modules Reference](pipeline/check-modules-reference.md) — Rule registry and fixtures
- [CONTRIBUTING.md](CONTRIBUTING.md) — Setup instructions and workflow tips
