# baseline-mmm-admin-interface

## Purpose

Regression sample for a module that already triggers README heuristics and metadata warnings in the legacy pipeline.

## Expected Findings

| Rule / Heuristic | Trigger file | Notes |
| ---------------- | ------------ | ----- |
| README install section missing | `README.md` | No `## Install` heading present. |
| README update section missing | `README.md` | No `## Update` heading present. |
| Duplicate keywords | `package.json` | Keywords intentionally include duplicates. |
| No image | _n/a_ | There is no image file in the fixture. |

## Captured From

- Upstream repository: [`ItayXD/MMM-Admin-Interface`](https://github.com/ItayXD/MMM-Admin-Interface)
- Snapshot reference: Stage 5 dataset as of 2025-09-28 (`lastCommit`: 2018-07-08T01:07:24+03:00)
- Upstream commit SHA: `df92c75021d33341082f6557c20909b4a7488a85` (HEAD at update time for ItayXD/MMM-Admin-Interface)

## Notes

Only files required to reproduce the existing findings are kept.
