# synthetic-typo-branding

## Purpose

Exercise the MagicMirror branding typo rules and outdated organization references captured in the Phase 0 rule inventory.

## Expected Findings

| Rule ID | Trigger file | Notes |
| ------- | ------------ | ----- |
| text-typo-magic-mirror | `README.md` | Uses the spaced "Magic Mirror" form. |
| text-typo-magicmirror2 | `README.md` | Uses `MagicMirror2` in the overview section. |
| text-typo-magicmirror-brackets | `README.md` | Uses `[MagicMirror]` instead of `[MagicMirror²]`. |
| text-typo-html-sub2 | `docs/history.md` | Contains `<sub>2</sub>` to represent the squared symbol. |
| text-outdated-michmich | `README.md` | Links to `MichMich/MagicMirror`. |

## Upstream Source

Synthetic fixture (no upstream repository). All content authored for deterministic regression coverage.

## Maintenance Notes

- If additional branding-related rules are added, update the README/doc snippets to trigger them.
- Keep the module metadata (`package.json`) minimal—no external dependencies are required here.
