# synthetic-readme-heuristics

## Purpose

Exercises the README heuristics and the node_modules directory detection.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| detect-missing-update-section | `README.md` | README omits an update section. |
| detect-missing-install-section | `README.md` | README omits an install section. |
| detect-node_modules-dir | `node_modules/` | Directory committed with a placeholder package. |

## Upstream Source

Synthetic repository authored for deterministic coverage.

## Maintenance Notes

- Keep the README sparse to avoid triggering other unrelated rules.
- The `node_modules` directory only contains a placeholder file; no dependencies need to be installed.
