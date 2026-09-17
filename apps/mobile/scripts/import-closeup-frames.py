"""
Import the supplied View Pet close-up frames.

Input — the two folders as delivered (override with PETQUEST_CLOSEUP_ANIM /
PETQUEST_CLOSEUP_REACT if they move):

    ~/Downloads/PetQuest_Closeup_Baby_Animation_Frames/petquest_closeup_frames_clean/
        <asset>/baby_<asset>_{idle,breathe,blink,idle_return}.png
    ~/Downloads/PetQuest_Closeup_Baby_Reaction_Frames/petquest_closeup_reaction_frames/
        <asset>/baby_<asset>_{happy,hungry,needs_cleaning,care_reaction}.png

Output:
    assets/closeup/<pet>/{idle,breathe,blink,idle_return,happy,hungry,
                          needs_cleaning,care_reaction}.png

Method — registration first, size second:

The supplied frames are ALREADY pre-registered: every one is 512 x 512 with
the subject occupying the same vertical band (y 20..500). That registration is
the whole reason the close-up can cut between frames without the pet shifting,
so this script must not disturb it:

  * frames are NEVER cropped individually — one SHARED box, the union of all
    eight visible boxes for that companion, is applied to all of them;
  * there is NO resampling by default, so no interpolation and no softening;
  * only the RGB channels are quantised (the 8-bit alpha is kept), which is
    what keeps the soft outline clean.

It then asserts the obvious failure modes: same output size for all eight
frames, the subject's top and bottom on the same line in each, and a
transparent border (so nothing renders as a dark rectangle).

Run:  python scripts/import-closeup-frames.py
"""
from __future__ import annotations

import json
import os
import shutil

from PIL import Image

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "assets", "closeup")

HOME = os.path.expanduser("~")
ANIM = os.environ.get(
    "PETQUEST_CLOSEUP_ANIM",
    os.path.join(HOME, "Downloads", "PetQuest_Closeup_Baby_Animation_Frames", "petquest_closeup_frames_clean"),
)
REACT = os.environ.get(
    "PETQUEST_CLOSEUP_REACT",
    os.path.join(HOME, "Downloads", "PetQuest_Closeup_Baby_Reaction_Frames", "petquest_closeup_reaction_frames"),
)

# pet id -> the asset-name prefix the supplied files use
PETS = {"dragon": "arcane_dragon", "cat": "mystic_cat", "wolf": "spirit_wolf"}

# output name -> which folder it comes from
FRAMES = {
    "idle": ANIM,
    "breathe": ANIM,
    "blink": ANIM,
    "idle_return": ANIM,
    "happy": REACT,
    "hungry": REACT,
    "needs_cleaning": REACT,
    "care_reaction": REACT,
}

COLOURS = 128
PAD = 6  # transparent margin kept around the union box


def visible_bbox(im: Image.Image, threshold: int = 16):
    """Bounding box of what is actually visible (alpha only, thresholded)."""
    alpha = im.convert("RGBA").split()[3].point(lambda a: 255 if a >= threshold else 0)
    return alpha.getbbox()


def union(boxes):
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def quantise(img: Image.Image, colours: int) -> Image.Image:
    """Quantise RGB only; the alpha channel is carried over untouched."""
    alpha = img.split()[3]
    q = img.convert("RGB").quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = q.convert("RGBA")
    out.putalpha(alpha)
    return out


def source_path(pet_asset: str, frame: str) -> str:
    return os.path.join(FRAMES[frame], pet_asset, f"baby_{pet_asset}_{frame}.png")


def main() -> None:
    missing = [
        source_path(asset, frame)
        for asset in PETS.values()
        for frame in FRAMES
        if not os.path.exists(source_path(asset, frame))
    ]
    if missing:
        raise SystemExit(
            "Missing source frames:\n  " + "\n  ".join(missing) + "\n\nSet PETQUEST_CLOSEUP_ANIM / PETQUEST_CLOSEUP_REACT if the folders moved."
        )

    manifest: dict[str, dict] = {}
    for pet, asset in PETS.items():
        loaded = {frame: Image.open(source_path(asset, frame)).convert("RGBA") for frame in FRAMES}

        sizes = {im.size for im in loaded.values()}
        assert len(sizes) == 1, f"{pet}: the supplied frames are not all the same canvas: {sizes}"

        boxes = {frame: visible_bbox(im) for frame, im in loaded.items()}
        assert all(boxes.values()), f"{pet}: a frame is fully transparent"

        # The subject must already sit on the same vertical band in every frame;
        # if it does not, the art needs re-registering and cropping cannot fix it.
        tops = {b[1] for b in boxes.values()}
        bottoms = {b[3] for b in boxes.values()}
        assert max(tops) - min(tops) <= 2, f"{pet}: tops differ by {max(tops) - min(tops)}px — frames are not registered"
        assert max(bottoms) - min(bottoms) <= 2, f"{pet}: baselines differ by {max(bottoms) - min(bottoms)}px — the pet would jump"

        canvas_w, canvas_h = sizes.pop()
        x0, y0, x1, y1 = union(list(boxes.values()))
        box = (max(0, x0 - PAD), max(0, y0 - PAD), min(canvas_w, x1 + PAD), min(canvas_h, y1 + PAD))

        out_dir = os.path.join(OUT, pet)
        shutil.rmtree(out_dir, ignore_errors=True)
        os.makedirs(out_dir, exist_ok=True)

        written: dict[str, int] = {}
        out_sizes = set()
        for frame, im in loaded.items():
            # One shared box for every frame: the registration survives.
            cut = im.crop(box)
            cut = quantise(cut, COLOURS)
            path = os.path.join(out_dir, f"{frame}.png")
            cut.save(path, optimize=True)
            written[frame] = os.path.getsize(path)
            out_sizes.add(cut.size)

            check = Image.open(path).convert("RGBA")
            assert check.getpixel((0, 0))[3] == 0, f"{pet}/{frame}: no transparent border"
            vb = visible_bbox(check)
            assert vb is not None

        assert len(out_sizes) == 1, f"{pet}: output frames differ in size: {out_sizes}"
        w, h = out_sizes.pop()

        # Re-measure the written frames: the baseline must still be shared.
        written_boxes = [visible_bbox(Image.open(os.path.join(out_dir, f"{f}.png"))) for f in FRAMES]
        spread = max(b[3] for b in written_boxes) - min(b[3] for b in written_boxes)
        assert spread <= 2, f"{pet}: written baselines differ by {spread}px"

        manifest[pet] = {
            "source": "supplied_closeup_frames",
            "asset": asset,
            "width": w,
            "height": h,
            "colours": COLOURS,
            "resampled": False,
            "baseline": max(b[3] for b in written_boxes),
            "frames": list(FRAMES),
            "kb": {f: round(n / 1024) for f, n in written.items()},
        }
        total = sum(written.values()) // 1024
        print(f"{pet:7} {len(written)} frames  {w}x{h}  {total} KB  (baseline {manifest[pet]['baseline']})")

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


if __name__ == "__main__":
    main()
