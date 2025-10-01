# synthetic-github-actions

## Purpose

Dedicated coverage for GitHub Actions upgrade recommendations, separated from the deprecated Node APIs fixture to allow more granular testing.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| text-recommend-actions-checkout | `.github/workflows/docs.yml` | Uses `actions/checkout@v2`. |
| text-recommend-actions-setup-node | `.github/workflows/docs.yml` | Uses `actions/setup-node@v3`. |

## Upstream Source

Synthetic repository with a single workflow file.

## Maintenance Notes

- If the recommended action versions change, update the workflow to lag behind intentionally.
- No package dependencies required.
