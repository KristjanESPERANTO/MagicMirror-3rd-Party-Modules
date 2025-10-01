# synthetic-deprecated-node-api

## Purpose

Covers the deprecated Node.js APIs and GitHub Actions recommendations listed in the rule inventory.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| text-deprecated-new-buffer | `lib/index.js` | Uses `new Buffer()` constructor. |
| text-deprecated-fs-F_OK | `lib/index.js` | Accesses `fs.F_OK`. |
| text-deprecated-fs-R_OK | `lib/index.js` | Accesses `fs.R_OK`. |
| text-deprecated-fs-W_OK | `lib/index.js` | Accesses `fs.W_OK`. |
| text-deprecated-fs-X_OK | `lib/index.js` | Accesses `fs.X_OK`. |
| text-deprecated-getYear | `lib/index.js` | Calls `new Date().getYear()`. |
| text-deprecated-node-version | `.github/workflows/ci.yml` | Specifies Node 16. |
| text-recommend-actions-checkout | `.github/workflows/ci.yml` | Uses `actions/checkout@v2`. |
| text-recommend-actions-setup-node | `.github/workflows/ci.yml` | Uses `actions/setup-node@v3`. |

## Upstream Source

Synthetic fixture (no upstream repository). Crafted to remain stable over time.

## Maintenance Notes

- Keep dependencies minimal—no npm install is required to evaluate these patterns.
- If future rules flag additional deprecated filesystem constants, extend `lib/index.js` accordingly.
