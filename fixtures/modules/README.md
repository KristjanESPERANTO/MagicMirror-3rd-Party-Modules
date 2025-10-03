# Check Modules Fixture Repositories

This directory will host the curated repositories used by the P2.3 comparison harness. Each fixture is stored as a miniature Git repository (with history squashed into a single commit) so that the harness can clone or copy them without reaching out to GitHub.

## Layout

```text
fixtures/
  modules/
    baseline-<name>/
    synthetic-<scenario>/
    ...
```

- `baseline-*` snapshots mirror real third-party modules that we already rely on in other fixtures. They provide parity checks for "no findings" scenarios and guard against regressions when scanning stable repositories.
- `synthetic-*` repositories are purpose-built to exercise individual rules or heuristics that have no reliable real-world coverage.

Current baselines:

- `baseline-mmm-01zm`
- `baseline-mmm-airquality`
- `baseline-mmm-admin-interface`
- `baseline-mmm-actual`

Each fixture directory contains:

- A `.git` metadata directory (when the fixture started from an actual clone).
- The module source code and metadata (`package.json`, Markdown files, workflows, etc.).
- A `FIXTURE.md` file describing the intent of the repository, the rules it should trigger, and pointers back to the rule registry IDs.

## Authoring guidelines

1. Keep fixture repositories as small as possible—strip binaries, large screenshots, and unrelated documentation.
2. Prefer synthetic fixtures when the real module is unstable or likely to change upstream.
3. When mirroring a real module, record the upstream commit SHA in `FIXTURE.md` and remove unnecessary git history by running `git checkout --orphan fixture && git commit -am "fixture"`.
4. Ensure every rule listed in the registry has at least one fixture (baseline or synthetic) that will trigger it. Record a short explanation in `FIXTURE.md` so future updates know the expected findings.
5. When adding a new fixture, update `docs/pipeline/check-modules-reference.md` with the coverage matrix and, if needed, regenerate the curated dataset under `fixtures/data/`.

## Next steps

- Extend the harness CLI (`npm run checkModules:compare`) to produce JSON/Markdown diffs and failure thresholds on top of the captured logs/artifacts.
- Ensure contributors rerun `node scripts/fixtures/updateBaselineShas.js` whenever we refresh the curated dataset so recorded commits stay accurate.
