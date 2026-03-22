#!/usr/bin/env node

/**
 * Validates module submission JSON files against the schema
 * Usage: node scripts/module-submission/validate.ts
 */

import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import process from "node:process";
import type { ErrorObject } from "ajv";

const currentDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Ajv = require("ajv") as typeof import("ajv").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

// Initialize AJV
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

// Load schema
const schemaPath = resolve(currentDir, "../../module-submissions/module-submission.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const validate = ajv.compile(schema);

// Get files to validate from environment variable
const changedFiles = process.env.CHANGED_FILES?.split(" ") || [];

interface ValidationFileResult {
  errors: Array<ErrorObject | string>;
  file: string;
  valid: boolean | null | undefined;
}

interface ValidationResults {
  errors: string[];
  files: ValidationFileResult[];
  valid: boolean;
}

const results: ValidationResults = {
  valid: true,
  errors: [],
  files: []
};

// Validate each file
for (const file of changedFiles) {
  if (!file.endsWith(".json")) {
    continue;
  }

  try {
    const filePath = resolve(process.cwd(), file);
    const data = JSON.parse(readFileSync(filePath, "utf8"));

    const isValid = validate(data);

    results.files.push({
      file,
      valid: isValid,
      errors: isValid ? [] : (validate.errors ?? [])
    });

    if (!isValid) {
      results.valid = false;
      results.errors.push(`${file}: ${validate.errors?.map((errorDetail: ErrorObject) => `${errorDetail.instancePath} ${errorDetail.message}`).join(", ")}`);
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.valid = false;
    results.errors.push(`${file}: ${message}`);
    results.files.push({
      file,
      valid: false,
      errors: [message]
    });
  }
}

// Ensure output directory exists
mkdirSync("validation-results", { recursive: true });

// Write results
writeFileSync("validation-results/schema.json", JSON.stringify(results, null, 2));

// Exit with appropriate code
if (!results.valid) {
  console.error("❌ Schema validation failed:");
  results.errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}

console.log("✅ All submission files passed schema validation");
process.exit(0);
