import path from "node:path";
import { validateStageFile } from "./schemaValidator.ts";

export interface ArtifactDefinition {
  relativePath: string;
  stageId: string;
}

interface ValidationOptions {
  failureMessage: string;
  projectRoot: string;
  successMessage: string;
  artifacts: ArtifactDefinition[];
}

export async function validateArtifactSet({
  artifacts,
  failureMessage,
  projectRoot,
  successMessage
}: ValidationOptions): Promise<boolean> {
  const failures: Array<{ artifact: ArtifactDefinition; error: unknown }> = [];

  for (const artifact of artifacts) {
    const absolutePath = path.join(projectRoot, artifact.relativePath);

    try {
      await validateStageFile(artifact.stageId, absolutePath);
      console.log(`✔ ${artifact.stageId} → ${path.relative(projectRoot, absolutePath)}`);
    }
    catch (error) {
      failures.push({ artifact, error });
      const message = error instanceof Error ? error.message : String(error);
      console.error(`✖ ${artifact.stageId} failed: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n${failureMessage}`);
    return false;
  }

  console.log(successMessage);
  return true;
}
