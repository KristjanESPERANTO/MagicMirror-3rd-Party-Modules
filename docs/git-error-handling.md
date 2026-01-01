# Git Error Handling & Resilience

This document describes how the pipeline handles git repository failures gracefully to keep the pipeline green even when individual repositories are unavailable.

## Problem

Before this implementation, the pipeline would crash completely if:

- 5 consecutive repositories failed to clone
- Repositories were deleted, renamed, or made private
- Network issues occurred during cloning

This was problematic because:

- **Vandalism or deletions** on external repositories would break our builds
- **Temporary network issues** would prevent the entire pipeline from completing
- **Private repositories** mixed in the wiki list would halt processing

See [Issue #41](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/41) for the original problem report.

## Solution

The pipeline now categorizes git errors and handles them differently based on their nature:

### Error Categories

| Category         | Description                                  | Examples                                                  | Pipeline Behavior                |
| ---------------- | -------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| `NOT_FOUND`      | Repository not found, deleted, or renamed    | `fatal: repository not found`, exit code 128              | Skip module, continue processing |
| `AUTHENTICATION` | Private repository or authentication failure | `fatal: authentication failed`, `permission denied`       | Skip module, continue processing |
| `NETWORK`        | Network connectivity issues                  | `timeout`, `connection refused`, `could not resolve host` | Count toward circuit breaker     |
| `INFRASTRUCTURE` | Platform issues beyond our control           | `rate limit exceeded`, `503 server error`                 | Count toward circuit breaker     |
| `UNKNOWN`        | Unrecognized errors                          | Any other git error                                       | Skip module, continue processing |

### Circuit Breaker

The pipeline employs an intelligent circuit breaker that:

- **Tracks only infrastructure errors** (NETWORK, INFRASTRUCTURE)
- **Ignores expected failures** (NOT_FOUND, AUTHENTICATION)
- **Aborts after 5 consecutive infrastructure errors** to prevent damage during systematic outages

This means:

- ✅ The pipeline completes successfully even if 100 repositories are deleted
- ✅ Single network timeouts are logged but don't halt processing
- ❌ 5 consecutive network failures trigger an abort (likely indicates a real outage)

## Implementation

### Git Error Categorization

The `categorizeGitError()` function in `scripts/shared/git.js` analyzes git stderr output to determine error categories:

```js
function categorizeGitError(stderr, exitCode) {
  const stderrLower = (stderr || "").toLowerCase();

  // Repository not found (404, deleted, renamed)
  if (
    stderrLower.includes("repository not found") ||
    stderrLower.includes("not found") ||
    stderrLower.includes("could not read from remote repository") ||
    stderrLower.includes("does not exist") ||
    exitCode === 128
  ) {
    return GitErrorCategory.NOT_FOUND;
  }

  // ... similar patterns for other categories
}
```

### Enhanced GitError Class

Every `GitError` now includes a `category` property:

```js
export class GitError extends Error {
  constructor(
    message,
    {
      args,
      cwd,
      exitCode,
      stderr,
      stdout,
      signal,
      cause,
      category = GitErrorCategory.UNKNOWN
    } = {}
  ) {
    super(message);
    this.name = "GitError";
    this.category = category; // NEW: error category for intelligent handling
    // ... other properties
  }
}
```

### Smart Error Handling in get-modules.ts

The module cloning stage (`scripts/get-modules.ts`) uses error categories to decide how to proceed:

```ts
try {
  await refreshRepository({ module: moduleCopy, tempPath, finalPath });
  consecutiveErrors = 0; // Reset on success
} catch (error) {
  const errorCategory = error?.category || GitErrorCategory.UNKNOWN;
  const isInfrastructureError =
    errorCategory === GitErrorCategory.NETWORK ||
    errorCategory === GitErrorCategory.INFRASTRUCTURE;

  if (isInfrastructureError) {
    consecutiveErrors += 1; // Only count infrastructure errors
    logger.error(`Infrastructure error: ${module.name}`);
  } else {
    logger.warn(`Skipping module: ${module.name} - ${errorCategory}`);
  }

  // Add to skipped modules with specific reason
  skippedModules.push(
    createSkippedEntry(module, skipReason, "clone_failure", {
      error: message,
      category: errorCategory
    })
  );

  // Abort only if we hit 5 consecutive infrastructure errors
  if (consecutiveErrors >= 5) {
    throw new Error("Too many consecutive infrastructure errors. Aborting.");
  }
}
```

## Skipped Module Reporting

Modules that fail to clone are added to `skipped_modules.json` with detailed information:

```json
{
  "name": "MMM-Deleted",
  "url": "https://github.com/user/deleted-repo.git",
  "reason": "Repository not found - it may have been deleted, renamed, or made private",
  "skipType": "clone_failure",
  "metadata": {
    "error": "fatal: repository 'https://github.com/user/deleted-repo.git/' not found",
    "category": "NOT_FOUND"
  }
}
```

This provides transparency about why modules were skipped and helps identify:

- Repositories that need URL updates
- Private repositories that should be removed from the wiki
- Vandalism or accidental deletions

### Pipeline Summary

At the end of Stage 3 (get-modules), a clear summary is displayed:

```text
============================================================
Stage 3 (get-modules) Summary
============================================================
✅ Modules cloned successfully: 450
⚠️  Modules skipped: 5
   ├─ NOT_FOUND: 3 (Repository not found (deleted/renamed))
   ├─ AUTHENTICATION: 2 (Access denied (private))

⚠️  WARNING: Skipped modules won't appear in the final module list.
   Check website/data/skipped_modules.json for details.
   Consider reviewing and updating the wiki if repositories were deleted.
📊 Total processed: 455/460
============================================================
```

### CI Validation

A separate GitHub Action (`validate-skipped-modules.yaml`) runs after the main pipeline completes:

- **Success** (exit 0): No modules were skipped - all repositories accessible
- **Failure** (exit 1): Modules were skipped - manual review required

This separation ensures:

- The main pipeline remains robust and completes successfully
- Teams are immediately notified when repositories become unavailable
- CI provides actionable reports for manual intervention

Run validation manually:

```bash
node scripts/validate-skipped-modules.js
```

## Error Messages

The pipeline provides context-specific error messages:

- **NOT_FOUND**: `Repository not found - it may have been deleted, renamed, or made private`
- **AUTHENTICATION**: `Repository access denied - it may be private or require authentication`
- **NETWORK**: `Network error - timeout or connection failure`
- **INFRASTRUCTURE**: `Infrastructure error - rate limit or server error`
- **UNKNOWN**: `Repository clone failed - URL might be invalid or repository might be private/deleted`

## Testing

Comprehensive unit tests in `scripts/shared/__tests__/git-error-handling.test.js` verify:

- Error categorization from various stderr patterns
- GitError instances include correct category metadata
- All 5 error categories are exposed and correctly defined

Run tests:

```bash
node --test scripts/shared/__tests__/git-error-handling.test.js
```

## Benefits

### Resilience

- Pipeline completes successfully even when external repositories are deleted
- Vandalism or accidental wiki edits don't break the build
- Temporary network issues are tolerated

### Observability

- Clear categorization of failure reasons
- Skipped modules tracked with full context
- Infrastructure issues trigger immediate abort to prevent wasted time

### Maintainability

- Explicit error categories make debugging easier
- Tests ensure error patterns are correctly recognized
- Skip reasons guide manual intervention when needed

## Future Enhancements

Potential improvements for consideration:

- **Auto-retry for transient errors**: Retry NETWORK errors with exponential backoff
- **Wiki validation**: Pre-flight check to verify all URLs before cloning
- **Notification integration**: Alert maintainers when repositories are deleted
- **Historical tracking**: Track which modules are frequently unavailable

## Related

- [Issue #41: Build should not fail if repos don't exist](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues/41)
- [Architecture Documentation](architecture.md)
- [Pipeline Roadmap](pipeline-refactor-roadmap.md)
