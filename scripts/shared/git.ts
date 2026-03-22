import { constants, promises as fsPromises } from "node:fs";
import { dirname } from "node:path";
import { ensureDirectory } from "./fs-utils.ts";
import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitOutput {
  stdout: string;
  stderr: string;
}

export interface GitOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  maxBuffer?: number;
  signal?: AbortSignal;
  input?: string;
}

export interface GitErrorOptions {
  args?: string[];
  cwd?: string;
  exitCode?: number | null;
  stderr?: string | null;
  stdout?: string | null;
  signal?: string | null;
  cause?: unknown;
  category?: string;
}

export interface CloneRepositoryOptions {
  branch?: string;
  depth?: number;
  singleBranch?: boolean;
  extraArgs?: string[];
}

export interface FetchRepositoryOptions {
  cwd?: string;
  remote?: string;
  refspecs?: string[];
  depth?: number;
  prune?: boolean;
}

export interface CheckoutRefOptions {
  cwd?: string;
  ref?: string;
  create?: boolean;
  force?: boolean;
}

export interface GetCommitOptions {
  cwd?: string;
  ref?: string;
}

export interface ListRemoteRefsOptions {
  remoteUrl?: string;
  heads?: boolean;
  tags?: boolean;
  pattern?: string;
}

export interface RemoteRef {
  hash: string;
  ref: string;
}

export interface EnsureRepositoryOptions {
  repositoryUrl?: string;
  directoryPath?: string;
  branch?: string | null;
  depth?: number;
}

export interface EnsureRepositoryResult {
  cloned: boolean;
  updated: boolean;
  commit: string;
}
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

/**
 * Error categories for git operations
 * @readonly
 * @enum {string}
 */
export const GitErrorCategory = {
  NOT_FOUND: "NOT_FOUND", // Repository not found (404) or deleted
  AUTHENTICATION: "AUTHENTICATION", // Authentication failure or private repository
  NETWORK: "NETWORK", // Network errors (timeout, connection refused)
  INFRASTRUCTURE: "INFRASTRUCTURE", // Infrastructure issues (rate limit, server errors)
  UNKNOWN: "UNKNOWN" // Unknown or uncategorized errors
};

export class GitError extends Error {
  args: string[] | undefined;
  cwd: string | undefined;
  exitCode: number | null;
  stderr: string | null;
  stdout: string | null;
  signal: string | null;
  override cause: unknown;
  category: string;

  constructor(message: string, { args, cwd, exitCode, stderr, stdout, signal, cause, category = GitErrorCategory.UNKNOWN }: GitErrorOptions = {}) {
    super(message);
    this.name = "GitError";
    this.args = args;
    this.cwd = cwd;
    this.exitCode = exitCode ?? null;
    this.stderr = stderr ?? null;
    this.stdout = stdout ?? null;
    this.signal = signal ?? null;
    this.cause = cause ?? null;
    this.category = category;
  }
}

function normalizeArgs(args: unknown[]): string[] {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("git command requires a non-empty array of arguments");
  }

  return args.map(entry => String(entry));
}

function baseOptions(options: GitOptions = {}): ReturnType<typeof baseOptions_impl> {
  return baseOptions_impl(options);
}

function baseOptions_impl(options: GitOptions) {
  const {
    cwd,
    env = process.env,
    timeout = DEFAULT_TIMEOUT_MS,
    maxBuffer = DEFAULT_MAX_BUFFER,
    signal,
    input
  } = options;

  return {
    cwd,
    env,
    timeout,
    maxBuffer,
    encoding: "utf8" as const,
    signal,
    input
  };
}

/**
 * Categorize git errors based on stderr output and exit code
 */
function categorizeGitError(stderr: string | null | undefined, exitCode: number | null | undefined): string {
  const stderrLower = (stderr || "").toLowerCase();

  // Repository not found (404, deleted, renamed)
  if (
    stderrLower.includes("repository not found")
    || stderrLower.includes("not found")
    || stderrLower.includes("could not read from remote repository")
    || stderrLower.includes("does not exist")
    || exitCode === 128
  ) {
    return GitErrorCategory.NOT_FOUND;
  }

  // Authentication failures (403, private repo)
  if (
    stderrLower.includes("authentication failed")
    || stderrLower.includes("permission denied")
    || stderrLower.includes("forbidden")
    || stderrLower.includes("could not read username")
  ) {
    return GitErrorCategory.AUTHENTICATION;
  }

  // Network errors (timeout, connection refused)
  if (
    stderrLower.includes("timeout")
    || stderrLower.includes("timed out")
    || stderrLower.includes("connection refused")
    || stderrLower.includes("could not resolve host")
    || stderrLower.includes("network is unreachable")
  ) {
    return GitErrorCategory.NETWORK;
  }

  // Infrastructure issues (rate limit, server errors)
  if (
    stderrLower.includes("rate limit")
    || stderrLower.includes("too many requests")
    || stderrLower.includes("server error")
    || stderrLower.includes("503")
    || stderrLower.includes("502")
  ) {
    return GitErrorCategory.INFRASTRUCTURE;
  }

  return GitErrorCategory.UNKNOWN;
}

interface ExecError extends Error {
  code?: number | string;
  stderr?: string;
  stdout?: string;
  signal?: string;
}

function formatErrorMessage(args: string[], error: ExecError): string {
  const command = ["git", ...args].join(" ");
  const stderr = error?.stderr ? `\n${error.stderr.trim()}` : "";
  const suffix = error?.code ? ` (exit code ${error.code})` : "";
  const signalInfo = error?.signal ? ` (signal ${error.signal})` : "";

  return `git command failed${suffix}${signalInfo}: ${command}${stderr}`;
}

export async function git(args: unknown[], options: GitOptions = {}): Promise<GitOutput> {
  const normalizedArgs = normalizeArgs(args);
  const execOptions = baseOptions(options);

  try {
    const result = await execFileAsync("git", normalizedArgs, execOptions);
    return {
      stdout: (result.stdout as string).trimEnd(),
      stderr: (result.stderr as string).trimEnd()
    };
  }
  catch (error) {
    if (error instanceof Error) {
      const execErr = error as ExecError;
      const message = formatErrorMessage(normalizedArgs, execErr);
      const category = categorizeGitError(execErr.stderr ?? null, execErr.code ? Number(execErr.code) : null);
      throw new GitError(message, {
        args: normalizedArgs,
        cwd: execOptions.cwd,
        exitCode: execErr.code ? Number(execErr.code) : null,
        signal: execErr.signal ?? null,
        stderr: execErr.stderr ?? null,
        stdout: execErr.stdout ?? null,
        cause: error,
        category
      });
    }

    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsPromises.access(targetPath, constants.F_OK);
    return true;
  }
  catch {
    return false;
  }
}

export async function isGitRepository(directoryPath: string): Promise<boolean> {
  try {
    const { stdout } = await git(["rev-parse", "--is-inside-work-tree"], { cwd: directoryPath });
    return stdout.trim() === "true";
  }
  catch {
    return false;
  }
}

export async function cloneRepository(repositoryUrl: string, destinationPath: string, {
  branch,
  depth = 0,
  singleBranch = Boolean(branch),
  extraArgs = []
}: CloneRepositoryOptions = {}): Promise<string> {
  await ensureDirectory(dirname(destinationPath));

  if (await pathExists(destinationPath)) {
    throw new Error(`Destination path already exists: ${destinationPath}`);
  }

  const args = ["clone", repositoryUrl, destinationPath, "--no-tags"];

  if (branch) {
    args.push("--branch", branch);
  }

  if (singleBranch) {
    args.push("--single-branch");
  }

  if (depth > 0) {
    args.push("--depth", String(depth));
  }

  if (Array.isArray(extraArgs) && extraArgs.length > 0) {
    args.push(...extraArgs.map(value => String(value)));
  }

  await git(args);
  return destinationPath;
}

export async function fetchRepository({ cwd, remote = "origin", refspecs = [], depth = 0, prune = true }: FetchRepositoryOptions = {}): Promise<void> {
  const args = ["fetch", remote];

  if (depth > 0) {
    args.push("--depth", String(depth));
  }

  if (prune) {
    args.push("--prune");
  }

  if (Array.isArray(refspecs) && refspecs.length > 0) {
    args.push(...refspecs);
  }

  await git(args, { cwd });
}

export async function checkoutRef({ cwd, ref, create = false, force = false }: CheckoutRefOptions = {}): Promise<void> {
  if (!ref) {
    throw new Error("checkoutRef requires a ref argument");
  }

  const args = ["checkout"];

  if (create) {
    args.push("-B");
  }

  if (force) {
    args.push("--force");
  }

  args.push(ref);

  await git(args, { cwd });
}

export async function getCurrentCommit({ cwd, ref = "HEAD" }: GetCommitOptions = {}): Promise<string> {
  const { stdout } = await git(["rev-parse", ref], { cwd });
  return stdout.trim();
}

export async function getCommitDate({ cwd, ref = "HEAD" }: GetCommitOptions = {}): Promise<string> {
  const { stdout } = await git(["log", "-1", "--format=%aI", ref], { cwd });
  return stdout.trim();
}

export async function listRemoteRefs({ remoteUrl, heads = true, tags = false, pattern }: ListRemoteRefsOptions = {}): Promise<RemoteRef[]> {
  const args = ["ls-remote", remoteUrl];

  if (heads) {
    args.push("--heads");
  }

  if (tags) {
    args.push("--tags");
  }

  if (pattern) {
    args.push(pattern);
  }

  const { stdout } = await git(args);
  const lines = stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [hash, ref] = line.split(/\s+/u) as [string, string];
    return { hash, ref };
  });
}

export async function ensureRepository({ repositoryUrl, directoryPath, branch: branchArg, depth = 0 }: EnsureRepositoryOptions = {}): Promise<EnsureRepositoryResult> {
  const branch = branchArg ?? "origin/HEAD";
  const exists = await pathExists(directoryPath ?? "");

  if (!exists) {
    await cloneRepository(repositoryUrl ?? "", directoryPath ?? "", { depth });
    return {
      cloned: true,
      updated: false,
      commit: await getCurrentCommit({ cwd: directoryPath })
    };
  }

  if (!await isGitRepository(directoryPath ?? "")) {
    throw new Error(`Existing path is not a git repository: ${directoryPath}`);
  }

  await fetchRepository({ cwd: directoryPath, depth });
  await checkoutRef({ cwd: directoryPath ?? "", ref: branch, force: true });
  const commit = await getCurrentCommit({ cwd: directoryPath });

  return {
    cloned: false,
    updated: true,
    commit
  };
}
