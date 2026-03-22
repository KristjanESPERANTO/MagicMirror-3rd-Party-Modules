import type { ErrorObject, ValidateFunction } from "ajv";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(currentDir, "../../dist/schemas");
const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

const STAGE_SCHEMAS = {
  "modules.stage.1": "modules.stage.1.schema.json",
  "modules.stage.2": "modules.stage.2.schema.json",
  "modules.stage.3": "modules.stage.3.schema.json",
  "modules.stage.4": "modules.stage.4.schema.json",
  "modules.final": "modules.final.schema.json",
  "modules.min": "modules.min.schema.json",
  stats: "stats.schema.json"
};

type StageId = keyof typeof STAGE_SCHEMAS;

export class SchemaValidationError extends Error {
  errors?: ErrorObject[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledValidators = new Map<StageId, ValidateFunction>();

function getValidator(stageId: string): ValidateFunction {
  if (!(stageId in STAGE_SCHEMAS)) {
    throw new Error(`No schema registered for stage "${stageId}".`);
  }

  const normalizedStageId = stageId as StageId;

  if (!compiledValidators.has(normalizedStageId)) {
    const schemaPath = path.join(schemaDirectory, STAGE_SCHEMAS[normalizedStageId]);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const validate = ajv.compile(schema);
    compiledValidators.set(normalizedStageId, validate);
  }

  const validator = compiledValidators.get(normalizedStageId);
  if (!validator) {
    throw new Error(`Could not compile schema validator for stage "${stageId}".`);
  }

  return validator;
}

function formatErrors(errors: ErrorObject[]): string {
  return errors
    .map((error) => {
      const dataPath = error.instancePath || error.schemaPath;
      return `${dataPath}: ${error.message}`;
    })
    .join("\n");
}

export function validateStageData(stageId: string, data: unknown): true {
  const validate = getValidator(stageId);
  const valid = validate(data);

  if (!valid) {
    const message = formatErrors(validate.errors ?? []);
    const error = new SchemaValidationError(`Schema validation failed for ${stageId}:\n${message}`);
    error.errors = validate.errors ?? undefined;
    throw error;
  }

  return true;
}

export async function validateStageFile(stageId: string, filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  validateStageData(stageId, data);
  return data;
}

export async function cliValidateStage(stageId: string, filePath: string): Promise<number> {
  try {
    await validateStageFile(stageId, filePath);
    return 0;
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lines = [
      `Schema validation failed for ${stageId} at ${filePath}.`,
      message
    ];

    if (error instanceof SchemaValidationError && error.errors) {
      lines.push("--- details ---");
      lines.push(formatErrors(error.errors));
    }

    console.error(lines.join("\n"));
    return 1;
  }
}

export function assertStageOrExit(stageId: string, filePath: string): void {
  cliValidateStage(stageId, filePath).then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
