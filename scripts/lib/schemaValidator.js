import Ajv from "ajv";
import addFormats from "ajv-formats";
import {fileURLToPath} from "node:url";
import path from "node:path";
import process from "node:process";
import {readFile} from "node:fs/promises";
import {readFileSync} from "node:fs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(currentDir, "../../dist/schemas");

const STAGE_SCHEMAS = {
  "modules.stage.1": "modules.stage.1.schema.json",
  "modules.stage.2": "modules.stage.2.schema.json",
  "modules.stage.3": "modules.stage.3.schema.json",
  "modules.stage.4": "modules.stage.4.schema.json",
  "modules.stage.5": "modules.stage.5.schema.json",
  "modules.final": "modules.final.schema.json",
  "modules.min": "modules.min.schema.json",
  stats: "stats.schema.json"
};

const ajv = new Ajv({allErrors: true, strict: false});
addFormats(ajv);

const compiledValidators = new Map();

function getValidator (stageId) {
  if (!STAGE_SCHEMAS[stageId]) {
    throw new Error(`No schema registered for stage "${stageId}".`);
  }

  if (!compiledValidators.has(stageId)) {
    const schemaPath = path.join(schemaDirectory, STAGE_SCHEMAS[stageId]);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const validate = ajv.compile(schema);
    compiledValidators.set(stageId, validate);
  }

  return compiledValidators.get(stageId);
}

function formatErrors (errors) {
  return errors
    .map((error) => {
      const dataPath = error.instancePath || error.schemaPath;
      return `${dataPath}: ${error.message}`;
    })
    .join("\n");
}

export function validateStageData (stageId, data) {
  const validate = getValidator(stageId);
  const valid = validate(data);

  if (!valid) {
    const message = formatErrors(validate.errors ?? []);
    const error = new Error(`Schema validation failed for ${stageId}:\n${message}`);
    error.errors = validate.errors;
    throw error;
  }

  return true;
}

export async function validateStageFile (stageId, filePath) {
  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw);
  validateStageData(stageId, data);
  return data;
}

export async function cliValidateStage (stageId, filePath) {
  try {
    await validateStageFile(stageId, filePath);
    return 0;
  } catch (error) {
    const lines = [
      `Schema validation failed for ${stageId} at ${filePath}.`,
      error.message
    ];

    if (error.errors) {
      lines.push("--- details ---");
      lines.push(formatErrors(error.errors));
    }

    console.error(lines.join("\n"));
    return 1;
  }
}

export function assertStageOrExit (stageId, filePath) {
  cliValidateStage(stageId, filePath).then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
