#!/usr/bin/env node

/**
 * Checks for duplicate module submissions
 * Usage: node scripts/module-submission/check-duplicates.ts
 */

import { join, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

interface SubmissionEntry {
  name: string;
  url: string;
}

interface RegistryData {
  modules?: SubmissionEntry[];
}

interface DuplicateRecord {
  existingName: string;
  existingUrl: string;
  field: "name" | "url";
  name: string;
}

interface DuplicateCheckResults {
  duplicates: DuplicateRecord[];
}

// Get files to check from environment variable
const changedFiles = process.env.CHANGED_FILES?.split(" ") || [];

const results: DuplicateCheckResults = {
  duplicates: []
};

// Load existing approved modules
const approvedDir = resolve(process.cwd(), "module-submissions/approved");
const existingModules = new Map<string, SubmissionEntry>();

try {
  const registryPath = join(approvedDir, "modules-registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as RegistryData;

  for (const module of registry.modules || []) {
    existingModules.set(module.url.toLowerCase(), module);
    existingModules.set(module.name.toLowerCase(), module);
  }
}
catch {
  // Registry doesn't exist yet - this is fine for initial setup
  console.log("ℹ️  No existing registry found - assuming this is a new setup");
}

// Check each new submission
for (const file of changedFiles) {
  if (!file.endsWith(".json")) {
    continue;
  }

  try {
    const filePath = resolve(process.cwd(), file);
    const submission = JSON.parse(readFileSync(filePath, "utf8")) as SubmissionEntry;

    // Check for URL duplicate
    const urlDuplicate = existingModules.get(submission.url.toLowerCase());
    if (urlDuplicate) {
      results.duplicates.push({
        name: submission.name,
        field: "url",
        existingUrl: urlDuplicate.url,
        existingName: urlDuplicate.name
      });
    }

    // Check for name duplicate
    const nameDuplicate = existingModules.get(submission.name.toLowerCase());
    if (nameDuplicate && nameDuplicate.url.toLowerCase() !== submission.url.toLowerCase()) {
      results.duplicates.push({
        name: submission.name,
        field: "name",
        existingUrl: nameDuplicate.url,
        existingName: nameDuplicate.name
      });
    }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error checking ${file}:`, message);
  }
}

// Write results
writeFileSync("validation-results/duplicates.json", JSON.stringify(results, null, 2));

// Report
if (results.duplicates.length > 0) {
  console.log("⚠️  Potential duplicates found:");
  results.duplicates.forEach((dup) => {
    console.log(`  - ${dup.name} (${dup.field}): matches existing ${dup.existingName}`);
  });
}
else {
  console.log("✅ No duplicates found");
}

process.exit(0);
