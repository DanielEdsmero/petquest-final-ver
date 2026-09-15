# Pet homes

One pixel-art environment per companion, shown behind the pet on Home and on
the Pet tab. Mapping lives in `src/data/petHomeModel.ts`; the `require`s in
`src/data/petHomes.ts`.

| File | Home | Companion |
|---|---|---|
| `sunlit_meadow.png` | Sunlit Meadow — cottage porch, garden, water trough | `wolf` (Spirit Wolf) |
| `moonlit_cottage.png` | Moonlit Cottage — bedroom, fireplace, books, purple night | `cat` (Mystic Cat) |
| `ember_cavern.png` | Ember Cavern — lava glow, teal crystals, horned nest, hoard | `dragon` (Arcane Dragon) |
| `crystal_cavern.png` | Crystal Cavern — aqua pools, crystals, washing basin, shelf | fallback (unknown / no companion) |

## These files are placeholders

The real environments are the four concept paintings supplied with the brief.
They could not be extracted from the chat into the repository, so
`scripts/make-home-placeholders.py` draws a simple scene in each home's
palette at the same file names. **To use the real art, overwrite these four
files** — same names, and please:

- resize to **960 × 720** (4:3 — the hero crops the top and bottom a little on
  narrow phones, so keep the important props in the middle 80 %);
- export as PNG-8 (or a well-compressed PNG-24); aim for **≤ 150 KB** each —
  the sprites are ~40 KB, a 2 MB background would dominate the bundle;
- keep the centre-bottom area (where the pet stands) uncluttered;
- no text and no UI baked in.

Nothing in the code needs to change. `tests/petHome.test.ts` checks that all
four files exist, are PNG, are 4:3, and stay under the size budget.
