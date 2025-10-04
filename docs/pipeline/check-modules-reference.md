# Check Modules Reference

_Last updated: October 3, 2025_

This page consolidates the material that previously lived in the P2.3 rollout documents. It should stay up to date as we evolve Stage 5 (`scripts/check-modules/index.ts`), the comparison harness, and the curated fixture set.

## Status snapshot

- ✅ TypeScript implementation is the default Stage 5 runner.
- ✅ Comparison harness (`npm run checkModules:compare`) can execute multiple commands, capture artifacts, and (when two runs complete) produce diffs for analysis.
- 🔄 Follow-ups tracked here: extend harness diff coverage (README/HTML artifacts) and define warning/failure thresholds ahead of diff gating in CI.

## Check group configuration

The Stage 5 runner reads `scripts/check-modules/check-groups.config.json` to decide which groups execute. All toggles ship enabled; set individual entries to `false` to skip that category. Personal overrides belong in `check-groups.config.local.json` (same directory) so local tweaks stay out of version control.

| Toggle                            | Default | Controls                                                                                                                                          |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups.fast`                     | `true`  | Registry-backed text and `package.json`/`package-lock.json` pattern scanning.                                                                     |
| `groups.deep`                     | `true`  | Repository heuristics (README/license/dependabot checks) plus dependency helpers. Disabling this also suppresses the optional integrations below. |
| `integrations.npmCheckUpdates`    | `true`  | Runs `npm-check-updates` when the helper budget allows.                                                                                           |
| `integrations.npmDeprecatedCheck` | `true`  | Executes `npm-deprecated-check` to surface deprecated dependencies.                                                                               |
| `integrations.eslint`             | `true`  | Invokes the curated ESLint configuration on each module clone.                                                                                    |

> The runner logs whenever overrides are applied so CI output records which groups were disabled.

## Rule inventory

These are the rule IDs currently implemented by the TypeScript checker. Keep this table synchronized with the rule registry schema when adding or modifying checks.

> Schema reference: see [`check-modules-rule-registry.schema.json`](check-modules-rule-registry.schema.json) for the JSON layout the stage expects.

### Text scanning rules

| Rule ID                           | Pattern                                     | Category       | Notes                        |
| --------------------------------- | ------------------------------------------- | -------------- | ---------------------------- |
| text-deprecated-new-buffer        | `new Buffer(`                               | Deprecated     | Replace with `Buffer.from`.  |
| text-deprecated-fs-F_OK           | `fs.F_OK`                                   | Deprecated     | Use `fs.constants.F_OK`.     |
| text-deprecated-fs-R_OK           | `fs.R_OK`                                   | Deprecated     | Use `fs.constants.R_OK`.     |
| text-deprecated-fs-W_OK           | `fs.W_OK`                                   | Deprecated     | Use `fs.constants.W_OK`.     |
| text-deprecated-fs-X_OK           | `fs.X_OK`                                   | Deprecated     | Use `fs.constants.X_OK`.     |
| text-typo-magic-mirror            | `Magic Mirror`                              | Typo           | Should be `MagicMirror²`.    |
| text-typo-magicmirror2            | `MagicMirror2`                              | Typo           | Should be `MagicMirror²`.    |
| text-typo-magicmirror-brackets    | `[MagicMirror]`                             | Typo           | Should be `[MagicMirror²]`.  |
| text-typo-html-sub2               | `<sub>2</sub>`                              | Typo           | Replace with `²`.            |
| text-deprecated-request           | `require("request")` (and variants)         | Deprecated     | Replace with built-in fetch. |
| text-deprecated-request-promise   | `require("request-promise")` (and variants) | Deprecated     | Replace with fetch.          |
| text-deprecated-native-request    | `require("native-request")`                 | Deprecated     | Replace with fetch.          |
| text-recommend-http-module        | `require("http")`/`require('http')`         | Recommendation | Use `node:http`.             |
| text-recommend-https-module       | `require("https")`/`require('https')`       | Recommendation | Use `node:https`.            |
| text-recommend-node-fetch         | `'node-fetch'`/`"node-fetch"`               | Recommendation | Use built-in fetch.          |
| text-recommend-require-fetch      | `require("fetch")`/`require('fetch')`       | Recommendation | Use built-in fetch.          |
| text-recommend-axios              | `axios`                                     | Recommendation | Suggest fetch.               |
| text-deprecated-omxplayer         | `omxplayer`                                 | Deprecated     | Suggest `mplayer` or `vlc`.  |
| text-recommend-xmlhttprequest     | `XMLHttpRequest`                            | Recommendation | Suggest fetch.               |
| text-recommend-actions-checkout   | `uses: actions/checkout@v2`/`@v3`/`@v4`     | Recommendation | Upgrade to v5.               |
| text-recommend-actions-setup-node | `uses: actions/setup-node@v3`               | Recommendation | Upgrade to v4.               |
| text-deprecated-node-version      | `node-version: 14/16/18` (variants)         | Deprecated     | Upgrade to current LTS.      |
| text-recommend-npm-run            | `npm run`                                   | Recommendation | Prefer `node --run`.         |
| text-recommend-jshint             | `jshint`                                    | Recommendation | Suggest ESLint.              |
| text-deprecated-getYear           | `getYear()`                                 | Deprecated     | Use `getFullYear()`.         |
| text-outdated-michmich            | `MichMich/MagicMirror`                      | Outdated       | Update org name.             |
| text-outdated-husky               | `/_/husky.sh`                               | Outdated       | Husky v9 change.             |
| text-deprecated-openweathermap    | `api.openweathermap.org/data/2.5`           | Deprecated     | Upgrade to API 3.0.          |
| text-recommend-cdn-cdnjs          | `https://cdnjs.cloudflare.com`              | Recommendation | Prefer local npm package.    |
| text-recommend-cdn-jsdelivr       | `https://cdn.jsdelivr.net`                  | Recommendation | Prefer local npm package.    |
| text-recommend-eslint-dot         | `eslint .` / `eslint --fix .`               | Recommendation | Drop trailing dot.           |
| text-recommend-git-checkout       | `git checkout`                              | Recommendation | Switch to `git switch`.      |

### `package.json` rules

| Rule ID                                  | Pattern                                      | Category       | Notes                             |
| ---------------------------------------- | -------------------------------------------- | -------------- | --------------------------------- |
| pkg-deprecated-electron-rebuild          | `"electron-rebuild"`                         | Deprecated     | Use `@electron/rebuild`.          |
| pkg-deprecated-eslint-config-airbnb      | `eslint-config-airbnb`                       | Deprecated     | Seek modern configuration.        |
| pkg-recommend-eslint-plugin-json         | `"eslint-plugin-json"`/`eslint-plugin-jsonc` | Recommendation | Suggest `@eslint/json`.           |
| pkg-deprecated-grunt                     | `"grunt"`                                    | Deprecated     | Tool largely unmaintained.        |
| pkg-outdated-husky-install               | `husky install`                              | Outdated       | Husky v9 no longer needs it.      |
| pkg-recommend-needle                     | `"needle"`                                   | Recommendation | Suggest fetch.                    |
| pkg-deprecated-rollup-banner             | `rollup-plugin-banner`                       | Deprecated     | Replace with built-in banner.     |
| pkg-deprecated-stylelint-config-prettier | `stylelint-config-prettier`                  | Deprecated     | Remove in newer Stylelint setups. |

### `package-lock.json` rules

| Rule ID            | Pattern                | Category   | Notes                    |
| ------------------ | ---------------------- | ---------- | ------------------------ |
| lock-deprecated-v1 | `"lockfileVersion": 1` | Deprecated | Encourage upgrade to v3. |
| lock-deprecated-v2 | `"lockfileVersion": 2` | Deprecated | Encourage upgrade to v3. |

### Legacy stage rules

| Rule ID                 | Category       | Stage              | Notes                                              |
| ----------------------- | -------------- | ------------------ | -------------------------------------------------- |
| legacy-main-js-mismatch | Recommendation | `check-modules-js` | Repository name / main JS filename mismatch guard. |

### File system heuristics & helpers

- `detect-node_modules-dir`: flags first-level `node_modules` directories under module root.
- `detect-jquery-local-copy`: warns when a local `jquery.js` copy is bundled.
- `detect-missing-update-section`: ensures README files include `## Update`.
- `detect-missing-install-section`: ensures README files include `## Install`.
- `dependency-deprecation-helper`: runs `npm-deprecated-check` and aggregates results.
- `eslint-helper`: executes ESLint with the curated configuration to produce findings.

## Fixture coverage

The curated fixture repositories live in `fixtures/modules/`. Keep this table in sync when you add or update fixtures so we maintain coverage for every rule.

### Fixture catalog

| Fixture slug                        | Type            | Primary coverage                          | Rule IDs                                                                                                                                                                                                                                                               | Status | Notes                                                                              |
| ----------------------------------- | --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `baseline-mmm-01zm`                 | Real (snapshot) | Smoke test, zero findings                 | _None_                                                                                                                                                                                                                                                                 | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-01zm` (`1bfc72e`).            |
| `baseline-mmm-airquality`           | Real (snapshot) | Regression guard (weather module)         | _None_                                                                                                                                                                                                                                                                 | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-airquality` (`2641834`).      |
| `baseline-mmm-admin-interface`      | Real (snapshot) | README heuristics                         | `detect-missing-install-section`, `detect-missing-update-section`, duplicate keywords                                                                                                                                                                                  | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-admin-interface` (`df92c75`). |
| `baseline-mmm-actual`               | Real (snapshot) | License mismatches + npm metadata         | License mismatch, invalid SPDX license                                                                                                                                                                                                                                 | Ready  | Snapshot stored under `fixtures/modules/baseline-mmm-actual` (`2a561a9`).          |
| `synthetic-deprecated-node-api`     | Synthetic       | Legacy Node API usage                     | `text-deprecated-new-buffer`, `text-deprecated-fs-*`, `text-deprecated-getYear`, `text-deprecated-node-version`, `text-recommend-actions-checkout`, `text-recommend-actions-setup-node`                                                                                | Ready  | Located under `fixtures/modules/synthetic-deprecated-node-api`.                    |
| `synthetic-deprecated-http-clients` | Synthetic       | Request/axios deprecations                | `text-deprecated-request*`, `text-recommend-axios`, `text-recommend-node-fetch`, `text-recommend-require-fetch`, `text-recommend-http-module`, `text-recommend-https-module`                                                                                           | Ready  | Located under `fixtures/modules/synthetic-deprecated-http-clients`.                |
| `synthetic-network-apis`            | Synthetic       | CDN/OpenWeather recommendations           | `text-recommend-cdn-*`, `text-deprecated-openweathermap`                                                                                                                                                                                                               | Ready  | Located under `fixtures/modules/synthetic-network-apis`.                           |
| `synthetic-typo-branding`           | Synthetic       | MagicMirror typos                         | `text-typo-*`, `text-outdated-michmich`                                                                                                                                                                                                                                | Ready  | Located under `fixtures/modules/synthetic-typo-branding`.                          |
| `synthetic-github-actions`          | Synthetic       | Actions upgrade recommendations           | `text-recommend-actions-checkout`, `text-recommend-actions-setup-node`                                                                                                                                                                                                 | Ready  | Located under `fixtures/modules/synthetic-github-actions`.                         |
| `synthetic-npm-metadata`            | Synthetic       | Deprecated npm packages                   | `pkg-deprecated-electron-rebuild`, `pkg-deprecated-eslint-config-airbnb`, `pkg-recommend-eslint-plugin-json`, `pkg-deprecated-grunt`, `pkg-outdated-husky-install`, `pkg-recommend-needle`, `pkg-deprecated-rollup-banner`, `pkg-deprecated-stylelint-config-prettier` | Ready  | Located under `fixtures/modules/synthetic-npm-metadata`.                           |
| `synthetic-lockfile`                | Synthetic       | Legacy lockfile versions                  | `lock-deprecated-v1`, `lock-deprecated-v2`                                                                                                                                                                                                                             | Ready  | Located under `fixtures/modules/synthetic-lockfile`.                               |
| `synthetic-readme-heuristics`       | Synthetic       | README structure + node_modules detection | `detect-missing-install-section`, `detect-missing-update-section`, `detect-node_modules-dir`                                                                                                                                                                           | Ready  | Located under `fixtures/modules/synthetic-readme-heuristics`.                      |
| `synthetic-jquery-local`            | Synthetic       | Local jQuery copy                         | `detect-jquery-local-copy`                                                                                                                                                                                                                                             | Ready  | Located under `fixtures/modules/synthetic-jquery-local`.                           |
| `synthetic-eslint-helper`           | Synthetic       | ESLint integration                        | `eslint-helper`                                                                                                                                                                                                                                                        | Ready  | Located under `fixtures/modules/synthetic-eslint-helper`.                          |
| `synthetic-deprecation-helper`      | Synthetic       | npm deprecated packages via helper        | `dependency-deprecation-helper`                                                                                                                                                                                                                                        | Ready  | Located under `fixtures/modules/synthetic-deprecation-helper`.                     |

### Coverage matrix

| Category                       | Fixtures                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Text scanning – Deprecated     | `synthetic-deprecated-node-api`, `synthetic-deprecated-http-clients`, `synthetic-network-apis` |
| Text scanning – Recommendation | `synthetic-deprecated-http-clients`, `synthetic-network-apis`, `synthetic-github-actions`      |
| Text scanning – Typo/Outdated  | `synthetic-typo-branding`, `synthetic-deprecated-node-api`                                     |
| `package.json` checks          | `synthetic-npm-metadata`, `synthetic-deprecation-helper`                                       |
| `package-lock` checks          | `synthetic-lockfile`                                                                           |
| File-system heuristics         | `baseline-mmm-admin-interface`, `synthetic-readme-heuristics`, `synthetic-jquery-local`        |
| External helpers               | `synthetic-eslint-helper`, `synthetic-deprecation-helper`, `baseline-mmm-actual`               |
| Baseline controls              | `baseline-mmm-01zm`, `baseline-mmm-airquality`                                                 |

**Maintenance checklist**

- Keep each fixture’s `FIXTURE.md` updated with triggered rule IDs and upstream commit references.
- When adding a fixture, update the table above and regenerate `fixtures/data/` via `npm run fixtures:generate`.
- Trim binaries and large assets before committing fixture snapshots.

## Comparison harness

The comparison harness lives under `scripts/check-modules/compare/` and is exercised via `npm run checkModules:compare`.

### Goals

- Execute one or two configured commands against the curated dataset.
- Normalize and diff Stage 5 outputs, surfacing rule-level differences and aggregate stats when two runs are available.
- Emit machine-readable (`diff.json`) and Markdown (`diff.md`) reports for CI artifacts.

### Flow

1. Prepare a temporary workspace with the curated fixtures.
2. Run the first configured command (labelled `legacy` by default) and capture Stage 5 outputs.
3. Run the second command (`ts` by default) if provided.
4. Normalize artifacts (sorted keys, trimmed timestamps).
5. Run diff logic to produce JSON + Markdown summaries when two runs succeed.
6. Exit non-zero when differences are detected or an execution step fails.

### Implementation notes

- CLI entry point: `node scripts/check-modules/compare/index.js`.
- Supports overrides via `--fixtures`, `--legacy`, `--ts`, and `--output` flags (the `--legacy` command defaults to `skip`).
- Uses shared logging utilities; artifacts are collated under the run directory with a `plan.json` descriptor.
- Snapshot-based tests guard the harness itself.

### Recent updates & open follow-ups

- ✅ README/HTML artifact comparisons now surface alongside the JSON diffs (Oct 2025).
- ✅ Warning thresholds downgrade small stat deltas to non-blocking warnings (Oct 2025).
- Consider partial rule subsets to speed up ad-hoc debugging runs.
- Explore storing golden artifacts now that the Python fallback has been retired.

## Housekeeping

- Update this page whenever you add or modify Stage 5 rules, fixtures, or harness capabilities.
- `docs/pipeline-refactor-roadmap.md` links here for the ongoing maintenance narrative—keep the roadmap entry aligned with the follow-ups listed above.
