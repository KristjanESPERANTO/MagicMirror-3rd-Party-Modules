# Pipeline fixture dataset

This directory contains a curated subset of modules that we will use to exercise the JSON schemas for every pipeline stage. The data is intentionally tiny (seven modules) but chosen to cover a mix of scenarios:

- Happy-path module with tags and an image (`MMM-01ZM`).
- Module missing keywords and screenshots (`MMM-AC-aseag`).
- Module with a single tag and rich screenshot metadata (`MMM-AccuWeatherForecastDeluxe`).
- Module whose license metadata triggers multiple warnings (`MMM-Actual`).
- Module lacking a `package.json` and image (`MMM-AddressBook`).
- Outdated module with quirky keyword formatting (`MMM-Admin-Interface`).
- Weather module with a clean profile (`MMM-AirQuality`).

## Files

- `modules.seed.json` – snapshot of the wiki-derived module list (stage 1 input).
- `modules.metadata.json` – supplemental details pulled from later pipeline stages; the fixture generator uses this to emulate enrichment.
- `data/` – committed outputs for every stage (`modules.stage.1.json` … `modules.stage.5.json`, plus final `modules.json`).

## Regenerating the fixtures

Run the generator whenever you update the seed list, tweak metadata, or adjust schema-relevant fields:

```bash
npm run fixtures:generate
```

The command rewrites everything under `fixtures/data/`. Keep these files version-controlled so schema tests stay reproducible.

After regenerating, validate the fixtures:

```bash
npm run test:fixtures
```

This command is also part of `npm run lint`, so CI will fail if the fixtures drift from the registered schemas.

## When to refresh

- A stage schema gains or removes fields.
- You change `modules.seed.json` (added/removed sample modules or descriptions).
- You update `modules.metadata.json` with new mocked stars, tags, or warnings.
- The real pipeline introduces new derived fields you want reflected in the fixtures.
