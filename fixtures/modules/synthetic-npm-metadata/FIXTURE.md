# synthetic-npm-metadata

## Purpose

Covers the package.json-specific rules in the Phase 0 inventory by declaring discouraged dependencies and scripts.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| pkg-deprecated-electron-rebuild | `package.json` | Dependency includes `electron-rebuild`. |
| pkg-deprecated-eslint-config-airbnb | `package.json` | Dependency includes `eslint-config-airbnb`. |
| pkg-recommend-eslint-plugin-json | `package.json` | Dependency includes `eslint-plugin-json`. |
| pkg-deprecated-grunt | `package.json` | Dependency includes `grunt`. |
| pkg-outdated-husky-install | `package.json` | `husky install` appears in scripts. |
| pkg-recommend-needle | `package.json` | Dependency includes `needle`. |
| pkg-deprecated-rollup-banner | `package.json` | Dependency includes `rollup-plugin-banner`. |
| pkg-deprecated-stylelint-config-prettier | `package.json` | Dependency includes `stylelint-config-prettier`. |

## Upstream Source

Synthetic manifest created purely for regression testing.

## Maintenance Notes

- If new package.json rules are added, extend the dependency list accordingly.
- No node_modules directory is required—this fixture is never executed.
