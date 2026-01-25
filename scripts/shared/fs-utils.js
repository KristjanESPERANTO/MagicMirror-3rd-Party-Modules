import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringifyDeterministic } from "./deterministic-output.js";

export async function ensureDirectory(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

export async function readJson(filePath) {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents);
}

export async function writeJson(filePath, data, { pretty = 2, ensureDir = true } = {}) {
  if (ensureDir) {
    const dirPath = path.dirname(filePath);
    await ensureDirectory(dirPath);
  }

  // Use deterministic stringify to ensure sorted keys for reproducible diffs
  const serialized = `${stringifyDeterministic(data, pretty)}\n`;
  await writeFile(filePath, serialized, "utf8");
}

export function readText(filePath) {
  return readFile(filePath, "utf8");
}

export async function writeText(filePath, text, { ensureDir = true } = {}) {
  if (ensureDir) {
    const dirPath = path.dirname(filePath);
    await ensureDirectory(dirPath);
  }

  await writeFile(filePath, text, "utf8");
}
