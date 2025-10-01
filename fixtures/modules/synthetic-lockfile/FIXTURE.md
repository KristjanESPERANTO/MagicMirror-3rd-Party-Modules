# synthetic-lockfile

## Purpose

Ensures the lockfile version checks fire for both version 1 and version 2 npm lockfiles.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| lock-deprecated-v1 | `lockfiles/v1/package-lock.json` | Contains `"lockfileVersion": 1`. |
| lock-deprecated-v2 | `lockfiles/v2/package-lock.json` | Contains `"lockfileVersion": 2`. |

## Upstream Source

Synthetic fixture with minimal lockfile snapshots.

## Maintenance Notes

- If npm introduces additional lockfile versions we warn about, add another directory mirroring the new version.
