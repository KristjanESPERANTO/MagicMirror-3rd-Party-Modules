#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { validateStageFile } from "./lib/schemaValidator.ts";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type ReleaseStageId = "modules.stage.2" | "modules.stage.5" | "modules.final" | "modules.min" | "stats";

interface ReleaseArtifactDefinition {
  optional?: boolean;
  relativePath: string;
  stageId: ReleaseStageId;
}

const RELEASE_ARTIFACTS: ReleaseArtifactDefinition[] = [
  // Note: modules.stage.1.json no longer exists - Stage 1+2 were unified into collect-metadata
  { stageId: "modules.stage.2", relativePath: "website/data/modules.stage.2.json" },
  { stageId: "modules.stage.5", relativePath: "website/data/modules.stage.5.json", optional: true },
  { stageId: "modules.final", relativePath: "website/data/modules.json" },
  { stageId: "modules.min", relativePath: "website/data/modules.min.json" },
  { stageId: "stats", relativePath: "website/data/stats.json" }
];

function resolvePath(relativePath: string): string {
  return path.join(PROJECT_ROOT, relativePath);
}

async function validateArtifact({ stageId, relativePath }: ReleaseArtifactDefinition): Promise<string> {
  const absolutePath = resolvePath(relativePath);
  await validateStageFile(stageId, absolutePath);
  return absolutePath;
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function main() {
  const failures: Array<{ artifact: ReleaseArtifactDefinition; error: unknown }> = [];

  for (const artifact of RELEASE_ARTIFACTS) {
    try {
      const absolutePath = await validateArtifact(artifact);
      console.log(`✔ ${artifact.stageId} → ${path.relative(PROJECT_ROOT, absolutePath)}`);
    }
    catch (error) {
      if (artifact.optional && isMissingFileError(error)) {
        console.warn(`⚠ ${artifact.stageId} skipped: ${artifact.relativePath} is missing (optional artifact)`);
        continue;
      }

      failures.push({ artifact, error });
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✖ ${artifact.stageId} failed: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nRelease artifact validation failed. Inspect the errors above and address the offending files before publishing a new package.");
    process.exit(1);
  }

  console.log("All release artifacts validated successfully.");
}

main();
