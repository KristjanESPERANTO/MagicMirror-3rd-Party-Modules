#!/usr/bin/env node

/**
 * Validates module submission JSON files against the schema
 * Usage: node scripts/module-submission/validate.js
 */

import {dirname, resolve} from "node:path";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import {fileURLToPath} from "node:url";
import process from "node:process";

// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize AJV
const ajv = new Ajv({allErrors: true, strict: true});
addFormats(ajv);

// Load schema
const schemaPath = resolve(__dirname, "../../module-submissions/module-submission.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const validate = ajv.compile(schema);

// Get files to validate from environment variable
const changedFiles = process.env.CHANGED_FILES?.split(" ") || [];

const results = {
  valid: true,
  errors: [],
  files: []
};

// Validate each file
for (const file of changedFiles) {
  if (!file.endsWith(".json")) {
    // eslint-disable-next-line no-continue
    continue;
  }

  try {
    const filePath = resolve(process.cwd(), file);
    const data = JSON.parse(readFileSync(filePath, "utf8"));

    const isValid = validate(data);

    results.files.push({
      file,
      valid: isValid,
      errors: isValid ? [] : validate.errors
    });

    if (!isValid) {
      results.valid = false;
      results.errors.push(`${file}: ${validate.errors?.map((errorDetail) => `${errorDetail.instancePath} ${errorDetail.message}`).join(", ")}`);
    }
  } catch (error) {
    results.valid = false;
    results.errors.push(`${file}: ${error.message}`);
    results.files.push({
      file,
      valid: false,
      errors: [error.message]
    });
  }
}

// Ensure output directory exists
mkdirSync("validation-results", {recursive: true});

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
