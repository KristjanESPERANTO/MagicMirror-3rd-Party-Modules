# Pipeline Architecture

Visibility into the automation that builds and publishes the third-party module catalogue helps contributors reason about changes and spot failure points early. This document summarizes the current pipeline, the legacy state we migrated from, and the target architecture we are steering toward.

## Current State (January 2026)

The production pipeline is orchestrated via `node scripts/orchestrator/index.js run full-refresh` and progresses through five sequential stages. All stages are implemented in TypeScript/Node.js with unified tooling, JSON Schema contracts at every boundary, and intelligent caching throughout.

### Stage Overview

| Order | Stage ID             | Key Outputs                                                   |
| ----- | -------------------- | ------------------------------------------------------------- |
| 1+2   | `collect-metadata`   | `modules.stage.2.json`, `gitHubData.json`                     |
| 3     | `get-modules`        | `modules.stage.3.json`, `modules/`, `modules_temp/`           |
| 4     | `expand-module-list` | `modules.stage.4.json`, `website/images/`                     |
| 5     | `check-modules`      | `modules.json`, `modules.min.json`, `stats.json`, `result.md` |

### Current Workflow Diagram

```mermaid
flowchart TB
  orchestrator[[Orchestrator<br>Sequential execution]]

  subgraph Stage 1+2: Metadata Collection
    seed[("Module seed list")] --> collect{{Collect metadata}}
    collect --> cache[("gitHubData.json cache")]
    collect --> stage2["modules.stage.2.json"]
  end

  subgraph Stage 3: Get Modules
    stage2 --> fetch{{Fetch & validate repos}}
    fetch --> clones[("modules/<br>modules_temp/")]
    fetch --> stage3["modules.stage.3.json"]
  end

  subgraph Stage 4: Expand Module List
    stage3 --> enrich{{Enrich metadata}}
    enrich --> images[("website/images/")]
    enrich --> stage4["modules.stage.4.json"]
  end

  subgraph Stage 5: Check Modules
    stage4 --> analyze{{Deep analysis}}
    analyze --> outputs[("modules.json<br>modules.min.json<br>stats.json<br>result.md")]
  end

  orchestrator -.controls.-> collect
  orchestrator -.controls.-> fetch
  orchestrator -.controls.-> enrich
  orchestrator -.controls.-> analyze
```

### Key Features

- **Orchestrator CLI**: Declarative stage graph with `--only/--skip` support, retries, and structured logging
- **Schema Validation**: JSON schemas enforce contracts at every stage boundary (`dist/schemas/`)
- **Shared Utilities**: HTTP, Git, filesystem, and rate limiting in `scripts/shared/`
- **Comparison Harness**: Captures README/HTML alongside JSON for regression testing

### Incremental Pipeline Behavior

The pipeline implements intelligent caching and skip logic to avoid redundant work:

| Stage | Optimization   | Skip Condition                  | Typical Gain         |
| ----- | -------------- | ------------------------------- | -------------------- |
| 2     | Cache pruning  | Module removed from seed list   | Bounded cache size   |
| 2     | API cache TTL  | Response < 7 days old           | ~95% fewer API calls |
| 3     | Clone skipping | Local commit ≥ API `lastCommit` | ~90% clones skipped  |
| 5     | Analysis cache | Directory SHA unchanged         | ~85-95% cache hits   |

**Result**: Incremental runs complete in <5 minutes vs. 45-60 minutes for full runs.

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

## Target Architecture (3-Phase Streaming)

The target architecture reduces the pipeline from 5 sequential stages to **3 conceptual phases** with parallel execution and streaming:

### Target Workflow Diagram

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

### Comparison: Legacy vs. Current vs. Target

| Aspect             | Legacy (6 stages) | Current (5 stages)      | Target (3 phases)    |
| ------------------ | ----------------- | ----------------------- | -------------------- |
| Runtime            | Python + Node.js  | TypeScript/Node.js      | TypeScript           |
| Execution          | Sequential        | Sequential + caching    | Parallel + streaming |
| Incremental        | ❌ No             | ✅ Yes (~90% skip rate) | ✅ Yes + workers     |
| Memory             | Unbounded         | Batch-bounded           | Per-worker bounded   |
| Full run time      | ~45-60 min        | ~15-20 min              | ~10-15 min           |
| Incremental time   | N/A               | <5 min                  | <3 min               |
| Intermediate files | 6                 | 4                       | 1 + final            |

### Target Architecture Benefits

1. **Three-phase pipeline** consolidates current stages (1+2 → Phase 1, 3+4+5 → Phase 2, new → Phase 3)
2. **Parallel workers** process modules in batches concurrently
3. **Streaming** eliminates need to load all modules into memory
4. **Diff detection** in aggregation phase for change reporting

---

## Distribution Touchpoints

### Current Flow

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
  api --> remote
  api --> modinstall
  api --> config
  api --> moduleWebsite
  wiki --> mmpm
```

### Target Flow

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

The target replaces the wiki with a form-based frontend while downstream consumers continue using the unchanged API endpoint.

---

## Related Documentation

- [Pipeline Modernization Roadmap](pipeline-refactor-roadmap.md) — Task breakdown and priorities
- [Deterministic Outputs](deterministic-outputs.md) — Guarantees for reproducible builds
- [Check Modules Reference](pipeline/check-modules-reference.md) — Rule registry and fixtures
- [CONTRIBUTING.md](CONTRIBUTING.md) — Setup instructions and workflow tips
