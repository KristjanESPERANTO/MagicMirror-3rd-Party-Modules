# baseline-mmm-actual

## Purpose

Captures the licence-related findings produced for `MMM-Actual` so we can verify parity during the TypeScript migration.

## Expected Findings

| Rule / Heuristic | Trigger file | Notes |
| ---------------- | ------------ | ----- |
| Invalid SPDX expression | `package.json` | Licence string uses `AGPL3`. |
| Licence mismatch | `package.json` vs `LICENSE.md` | Manifest declares `AGPL3` while LICENSE references `AGPL-3.0`. |
| No image found | _n/a_ | There is no screenshot or image asset in the fixture. |

## Captured From

- Upstream repository: [`trumpetx/MMM-Actual`](https://github.com/trumpetx/MMM-Actual)
- Snapshot reference: Stage 5 dataset as of 2025-09-28 (`lastCommit`: 2025-05-01T07:33:34-05:00)
- Upstream commit SHA: `2a561a9f2debe29f715aa701eb2ca64cfe5a2001` (HEAD at update time for trumpetx/MMM-Actual)

## Notes

This fixture only keeps metadata needed for the legacy findings. No functional module code is included.
