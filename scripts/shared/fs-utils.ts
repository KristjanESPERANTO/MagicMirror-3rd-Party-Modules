import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringifyDeterministic } from "./deterministic-output.ts";

interface WriteJsonOptions {
  ensureDir?: boolean;
  pretty?: number;
}

interface WriteTextOptions {
  ensureDir?: boolean;
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  }
  catch {
    return false;
  }
}

export async function readJson<TData = unknown>(filePath: string): Promise<TData> {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as TData;
}

export async function writeJson(
  filePath: string,
  data: unknown,
  { pretty = 2, ensureDir = true }: WriteJsonOptions = {}
): Promise<void> {
  if (ensureDir) {
    const dirPath = path.dirname(filePath);
    await ensureDirectory(dirPath);
  }

  // Use deterministic stringify to ensure sorted keys for reproducible diffs
  const serialized = `${stringifyDeterministic(data, pretty)}\n`;
  await writeFile(filePath, serialized, "utf8");
}

export function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function writeText(
  filePath: string,
  text: string,
  { ensureDir = true }: WriteTextOptions = {}
): Promise<void> {
  if (ensureDir) {
    const dirPath = path.dirname(filePath);
    await ensureDirectory(dirPath);
  }

  await writeFile(filePath, text, "utf8");
}
