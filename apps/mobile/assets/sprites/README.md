# Walking baby sprites

Eight 128 × 128 RGBA frames per companion, feet on a common baseline, used by
`src/components/PetSprite.tsx` inside the home scenes. Produced by
`scripts/slice-sprite-sheets.py`; `manifest.json` records whether each set was
sliced from a supplied sheet or **derived** from the baby portrait.

## Source

`sheets/{dragon,cat,wolf}.png` are the supplied sprite sheets
(`petquest_baby_dragon_sprite_sheet.png`, `…_cat_…`, `…_fox_…` — the fox
sheet stands in for the Spirit Wolf; PetQuest has no fox companion). All
three frame sets are sliced from them (`manifest.json`: `"source": "sheet"`).
To re-slice after replacing a sheet, run `python scripts/slice-sprite-sheets.py`.
The sheets are a 4 × 2 grid in this order: idle · blink · walk left A · walk
left B · walk right A · walk right B · happy · interact.
