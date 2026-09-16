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

## Source

These are the four concept paintings supplied with the brief, resized from
2176 × 1632 to **960 × 720** (Lanczos) and saved as PNG-8 (256 colours,
Floyd–Steinberg) — 300–420 KB each. Only the selected companion's home is
ever decoded. `tests/petHome.test.ts` checks that all four exist, are PNG,
are 4:3, and stay under 450 KB.

`scripts/make-home-placeholders.py` is kept for a fallback: it draws a simple
scene per home at the same names if the paintings are ever removed.
