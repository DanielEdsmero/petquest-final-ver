"""
Deterministic sprite-frame processing for the walking baby pets.

Input  (drop the supplied sheets here, transparent PNG, 4 × 2 grid):
    assets/sprites/sheets/dragon.png   ← petquest_baby_dragon_sprite_sheet.png
    assets/sprites/sheets/cat.png      ← petquest_baby_cat_sprite_sheet.png
    assets/sprites/sheets/wolf.png     ← petquest_baby_fox_sprite_sheet.png
                                          (the fox sheet stands in for the Spirit Wolf —
                                           PetQuest has no fox companion)

Output:
    assets/sprites/<pet>/f1_idle.png … f8_interact.png   128 × 128, RGBA

Frame order (row-major on the sheet):
    1 idle front · 2 idle blink · 3 walk left A · 4 walk left B
    5 walk right A · 6 walk right B · 7 happy · 8 interact

Method: the sheet is divided into eight equal cells; each cell is cropped to
its opaque bounding box (the supplied sheets are NOT pixel-aligned to the
grid), scaled so the tallest frame of the set fills 88 % of the canvas, then
pasted horizontally centred and BOTTOM-ALIGNED so the feet sit on the same
baseline in every frame — that is what keeps the walk from bobbing or
floating when frames swap. Nearest-neighbour throughout, so pixels stay crisp.

Sheets that are dark-on-black (JPEG-style, no alpha) are keyed: near-black
pixels become transparent before cropping.

When a sheet is missing, the frames are DERIVED from the existing baby
portrait (assets/pets/<asset>_lv1_baby.png) — mirrored for the left walk,
a 3 px bob for the B frames, a 4 % squash for the blink, a small lift for
happy and a tilt for interact — so the app works, and the real sheet replaces
them by re-running this script. `tests/sprite.test.ts` reports which sets are
derived.

Run:  python scripts/slice-sprite-sheets.py
"""
from __future__ import annotations

import json
import os

from PIL import Image, ImageOps

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
SHEETS = os.path.join(ROOT, "assets", "sprites", "sheets")
OUT = os.path.join(ROOT, "assets", "sprites")
FRAME = 128
FILL = 0.88
COLS, ROWS = 4, 2

FRAME_NAMES = ["f1_idle", "f2_blink", "f3_walk_left_a", "f4_walk_left_b", "f5_walk_right_a", "f6_walk_right_b", "f7_happy", "f8_interact"]
PETS = {"dragon": "arcane_dragon", "cat": "mystic_cat", "wolf": "spirit_wolf"}


def key_black(im: Image.Image, threshold: int = 24) -> Image.Image:
    """Make near-black pixels transparent (for sheets exported on a black ground)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and r < threshold and g < threshold and b < threshold:
                px[x, y] = (0, 0, 0, 0)
    return im


def has_alpha_edge(im: Image.Image) -> bool:
    """True if the corners are already transparent (a proper RGBA export)."""
    im = im.convert("RGBA")
    w, h = im.size
    return all(im.getpixel(p)[3] == 0 for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])


def cells(sheet: Image.Image) -> list[Image.Image]:
    w, h = sheet.size
    cw, ch = w // COLS, h // ROWS
    out = []
    for r in range(ROWS):
        for c in range(COLS):
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            bbox = cell.getbbox()
            out.append(cell.crop(bbox) if bbox else cell)
    return out


def fit_bottom(cut: Image.Image, scale: float) -> Image.Image:
    """Scale by `scale`, centre horizontally, align to the bottom of a FRAME canvas."""
    w, h = cut.size
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = cut.resize((nw, nh), Image.NEAREST)
    canvas = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    canvas.paste(small, ((FRAME - nw) // 2, FRAME - nh - 4), small)
    return canvas


def from_sheet(path: str) -> list[Image.Image]:
    sheet = Image.open(path)
    sheet = sheet.convert("RGBA") if has_alpha_edge(sheet) else key_black(sheet)
    cuts = cells(sheet)
    tallest = max(c.size[1] for c in cuts)
    scale = (FRAME * FILL) / tallest
    return [fit_bottom(c, scale) for c in cuts]


def derived(asset: str) -> list[Image.Image]:
    base = Image.open(os.path.join(ROOT, "assets", "pets", f"{asset}_lv1_baby.png")).convert("RGBA")
    base = base.crop(base.getbbox())
    scale = (FRAME * FILL) / base.size[1]

    def frame(img: Image.Image, lift: int = 0) -> Image.Image:
        f = fit_bottom(img, scale)
        if lift:
            f = ImageOps.expand(f, border=0)
            shifted = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
            shifted.paste(f, (0, -lift), f)
            return shifted
        return f

    w, h = base.size
    blink = base.resize((w, max(1, round(h * 0.96))), Image.NEAREST)
    left = ImageOps.mirror(base)
    happy = base.resize((round(w * 1.04), round(h * 1.04)), Image.NEAREST)
    interact = base.rotate(-8, resample=Image.NEAREST, expand=True)
    return [
        frame(base),
        frame(blink),
        frame(left),
        frame(left, lift=3),
        frame(base),
        frame(base, lift=3),
        frame(happy, lift=4),
        frame(interact),
    ]


def main() -> None:
    manifest: dict[str, dict] = {}
    for pet, asset in PETS.items():
        sheet = os.path.join(SHEETS, f"{pet}.png")
        source = "sheet" if os.path.exists(sheet) else "derived"
        frames = from_sheet(sheet) if source == "sheet" else derived(asset)
        assert len(frames) == 8
        out_dir = os.path.join(OUT, pet)
        os.makedirs(out_dir, exist_ok=True)
        for name, f in zip(FRAME_NAMES, frames):
            assert f.size == (FRAME, FRAME)
            f.save(os.path.join(out_dir, f"{name}.png"), optimize=True)
        manifest[pet] = {"source": source, "frame": FRAME, "frames": FRAME_NAMES}
        print(f"{pet}: 8 frames ({source})")
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
