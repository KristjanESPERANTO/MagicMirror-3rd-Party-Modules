# synthetic-deprecation-helper

## Purpose

Exercises the `npm-deprecated-check` integration by declaring dependencies known to be deprecated on the npm registry.

## Expected Findings

| Rule / Heuristic | Trigger file | Notes |
| ---------------- | ------------ | ----- |
| `dependency-deprecation-helper` | `package.json` | Contains `request` and `request-promise`, which npm marks as deprecated. |

## Upstream Source

Synthetic manifest with only metadata required for the helper.

## Maintenance Notes

- The harness should run with network access or a stubbed `npm-deprecated-check` response that returns the recorded output for these dependencies.
- Update the dependency list if the deprecated package catalog changes.
