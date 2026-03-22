#!/usr/bin/env node

/**
 * Validation script that checks if any modules were skipped during pipeline execution.
 * This is meant to be run as a separate CI step after the main pipeline completes.
 *
 * Exit codes:
 * - 0: No modules were skipped (success)
 * - 1: Modules were skipped (failure - requires attention)
 * - 2: Invalid input or script error
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { readFileSync } from "node:fs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const PROJECT_ROOT = path.resolve(currentDir, "..");

const SKIPPED_MODULES_PATH = path.join(
  PROJECT_ROOT,
  "website/data/skipped_modules.json"
);

type SkipCategory = "NOT_FOUND" | "AUTHENTICATION" | "NETWORK" | "INFRASTRUCTURE" | "UNKNOWN";

interface SkippedModuleMetadata {
  category?: SkipCategory;
  error?: string;
}

interface SkippedModuleEntry {
  error?: string;
  metadata?: SkippedModuleMetadata;
  name?: string;
  reason?: string;
  url?: string;
}

interface CategoryDescriptor {
  emoji: string;
  key: SkipCategory;
  label: string;
}

function main() {
  let skippedModules: SkippedModuleEntry[];

  try {
    const content = readFileSync(SKIPPED_MODULES_PATH, "utf8");
    skippedModules = JSON.parse(content);
  }
  catch (error) {
    console.error("❌ Failed to read skipped_modules.json");
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(2);
  }

  if (!Array.isArray(skippedModules)) {
    console.error("❌ Invalid skipped_modules.json format: expected array");
    process.exit(2);
  }

  if (skippedModules.length === 0) {
    console.log("✅ No modules were skipped - all repositories are accessible!");
    process.exit(0);
  }

  // Count by category
  const categoryCount = skippedModules.reduce<Record<string, number>>((acc, mod) => {
    const category = mod.metadata?.category || "UNKNOWN";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  // Print summary
  console.log("");
  console.log("=".repeat(60));
  console.log("❌ VALIDATION FAILED: Modules were skipped");
  console.log("=".repeat(60));
  console.log(`Total skipped: ${skippedModules.length}`);
  console.log("");

  // Breakdown by category
  const categories: CategoryDescriptor[] = [
    { key: "NOT_FOUND", label: "Repository not found (deleted/renamed)", emoji: "🔍" },
    { key: "AUTHENTICATION", label: "Access denied (private)", emoji: "🔒" },
    { key: "NETWORK", label: "Network errors", emoji: "🌐" },
    { key: "INFRASTRUCTURE", label: "Infrastructure errors", emoji: "🏗️" },
    { key: "UNKNOWN", label: "Unknown errors", emoji: "❓" }
  ];

  for (const { key, label, emoji } of categories) {
    const count = categoryCount[key] || 0;
    if (count > 0) {
      console.log(`${emoji} ${key}: ${count} module(s) - ${label}`);
    }
  }

  console.log("");
  console.log("Skipped modules:");
  console.log("-".repeat(60));

  // List all skipped modules
  for (const mod of skippedModules) {
    const category = mod.metadata?.category || "UNKNOWN";
    const categoryEmoji = categories.find(cat => cat.key === category)?.emoji || "❓";
    const name = mod.name ?? "Unknown module";
    const url = mod.url ?? "Unknown URL";
    console.log(`${categoryEmoji} ${name} (${url})`);
    // Support both old format (error) and new format (reason)
    const reason = mod.reason || mod.error || "Unknown";
    console.log(`   Reason: ${reason}`);
    if (mod.metadata?.error) {
      console.log(`   Error: ${mod.metadata.error.split("\n")[0]}`);
    }
    console.log("");
  }

  console.log("=".repeat(60));
  console.log("Action required:");
  console.log("1. Review the skipped modules list above");
  console.log("2. Check if repositories were deleted, renamed, or made private");
  console.log("3. Update the wiki to remove invalid entries or fix URLs");
  console.log(`4. Check ${SKIPPED_MODULES_PATH} for full details`);
  console.log("=".repeat(60));
  console.log("");

  process.exit(1);
}

main();
