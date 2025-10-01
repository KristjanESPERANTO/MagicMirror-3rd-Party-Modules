# synthetic-jquery-local

## Purpose

Triggers the local jQuery detection and outdated version warning.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| detect-jquery-local-copy | `public/js/jquery.min.js` | Local minified jQuery copy is checked in. |

Additional behaviour: because the minified file lacks any `jQuery v3.7` marker, the stage should also flag the copy as outdated.

## Upstream Source

Synthetic minified snippet (not a full jQuery distribution).

## Maintenance Notes

- Keep the file size small—only enough content to trigger the pattern.
- Update the comments if the recommended jQuery version changes.
