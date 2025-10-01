# synthetic-deprecated-http-clients

## Purpose

Targets the HTTP client deprecation and recommendation rules for the comparison harness.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| text-deprecated-request | `lib/clients.js` | Requires the legacy `request` package. |
| text-deprecated-request-promise | `lib/clients.js` | Requires `request-promise`. |
| text-deprecated-native-request | `lib/clients.js` | Requires `native-request`. |
| text-recommend-axios | `lib/clients.js` | Imports `axios`. |
| text-recommend-node-fetch | `lib/clients.js` | References `node-fetch`. |
| text-recommend-require-fetch | `lib/clients.js` | Calls `require("fetch")`. |
| text-recommend-http-module | `lib/clients.js` | Requires `http`. |
| text-recommend-https-module | `lib/clients.js` | Requires `https`. |

## Upstream Source

Synthetic fixture with a single library file. No external dependencies need to be installed—this repository is never executed.

## Maintenance Notes

- If the recommendation rules expand (e.g., flagging specific axios versions), update the dependency literals accordingly.
- Keep the rule triggers in the same file so diffs stay tidy.
