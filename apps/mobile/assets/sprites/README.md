# Walking baby sprites

Eight 128 × 128 RGBA frames per companion, feet on a common baseline, used by
`src/components/PetSprite.tsx` inside the home scenes. Produced by
`scripts/slice-sprite-sheets.py`; `manifest.json` records whether each set was
sliced from a supplied sheet or **derived** from the baby portrait.

## Drop the real sheets here

The three sprite sheets supplied with the brief could not be extracted from
the chat into the repository, so every set is currently *derived* (portrait,
mirrored for the left walk, small bob/lift for the B/happy frames). To use the
real art, save the sheets as:

| Save as | Supplied file | Companion |
|---|---|---|
| `sheets/dragon.png` | `petquest_baby_dragon_sprite_sheet.png` | `dragon` |
| `sheets/cat.png` | `petquest_baby_cat_sprite_sheet.png` | `cat` |
| `sheets/wolf.png` | `petquest_baby_fox_sprite_sheet.png` | `wolf` (the fox sheet stands in for the Spirit Wolf — PetQuest has no fox) |

then run `python scripts/slice-sprite-sheets.py`. The sheets are a 4 × 2 grid
in this order: idle · blink · walk left A · walk left B · walk right A · walk
right B · happy · interact. Transparent PNG is best; a sheet on a flat black
ground is keyed automatically. Nothing in the code changes.
