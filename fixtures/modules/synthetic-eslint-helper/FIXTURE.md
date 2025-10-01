# synthetic-eslint-helper

## Purpose

Validates the ESLint helper integration by guaranteeing lint errors under the shared test configuration.

## Expected Findings

| Rule / Heuristic | Trigger file | Notes |
| ---------------- | ------------ | ----- |
| `eslint_checks` helper | `src/bad.js` | Contains an unused variable flagged by the shared ESLint config. |
| Legacy ESLint config heuristic | `.eslintrc.json` | Legacy config filename triggers the “Replace eslintrc by new flat config” recommendation. |

## Upstream Source

Synthetic code sample authored specifically for regression testing.

## Maintenance Notes

- Keep `bad.js` minimal—only include lint failures you expect to track in parity tests.
- When the recommended ESLint config changes, rerun the legacy Python stage to refresh the expected output and adjust comments if needed.
