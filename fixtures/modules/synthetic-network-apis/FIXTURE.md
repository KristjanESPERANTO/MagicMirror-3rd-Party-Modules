# synthetic-network-apis

## Purpose

Validates CDN recommendation rules and the OpenWeather API deprecation warning.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| text-recommend-cdn-cdnjs | `docs/cdn-examples.md` | References `https://cdnjs.cloudflare.com`. |
| text-recommend-cdn-jsdelivr | `docs/cdn-examples.md` | References `https://cdn.jsdelivr.net`. |
| text-deprecated-openweathermap | `README.md` | Uses `api.openweathermap.org/data/2.5`. |

## Upstream Source

Synthetic fixture handcrafted to stay deterministic.

## Maintenance Notes

- If additional CDN host rules are added, update `docs/cdn-examples.md` to include their URLs.
- Keep the README short to avoid unnecessary noise in diff outputs.
