"""
Procedural pixel-art placeholders for the four pet homes.

The real environments are the concept paintings supplied with the brief
(Sunlit Meadow, Moonlit Cottage, Ember Cavern, Crystal Cavern). Those PNGs
could not be pulled out of the chat transcript into the repo, so this script
draws a deliberately simple scene in each home's palette at the SAME file names
and dimensions the app expects. Drop the real art over these files (see
assets/homes/README.md) and nothing in the code changes.

Run:  python scripts/make-home-placeholders.py
Out:  assets/homes/{sunlit_meadow,moonlit_cottage,ember_cavern,crystal_cavern}.png
      960 × 720, PNG-8, drawn at 240 × 180 and scaled 4× nearest-neighbour so
      it reads as pixel art.
"""
from __future__ import annotations

import os
import random

from PIL import Image, ImageDraw

W, H = 240, 180
SCALE = 4
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "homes")


def band(d: ImageDraw.ImageDraw, y0: int, y1: int, colours: list[str]) -> None:
    """Horizontal bands, dithered at each boundary so gradients read as pixel art."""
    n = len(colours)
    step = (y1 - y0) / n
    for i, c in enumerate(colours):
        top = int(y0 + i * step)
        bottom = int(y0 + (i + 1) * step)
        d.rectangle([0, top, W, bottom], fill=c)
        if i + 1 < n:
            nxt = colours[i + 1]
            for x in range(0, W, 2):
                if (x // 2 + bottom) % 2 == 0:
                    d.point((x, bottom - 1), fill=nxt)
                    d.point((x + 1, bottom), fill=c)


def sprinkle(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], colour: str, n: int, rng: random.Random, size: int = 1) -> None:
    x0, y0, x1, y1 = box
    for _ in range(n):
        x, y = rng.randint(x0, x1), rng.randint(y0, y1)
        d.rectangle([x, y, x + size - 1, y + size - 1], fill=colour)


def crystal(d: ImageDraw.ImageDraw, x: int, y: int, h: int, light: str, dark: str) -> None:
    w = max(3, h // 3)
    d.polygon([(x, y), (x - w, y + h), (x + w, y + h)], fill=light)
    d.polygon([(x, y), (x, y + h), (x + w, y + h)], fill=dark)


def clearing(d: ImageDraw.ImageDraw, cx: int, cy: int, rx: int, ry: int, colour: str, edge: str) -> None:
    """The soft disc where the pet stands — every home has one, in the same place."""
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=edge)
    d.ellipse([cx - rx + 2, cy - ry + 1, cx + rx - 2, cy + ry - 1], fill=colour)


def sunlit_meadow(rng: random.Random) -> Image.Image:
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    band(d, 0, 70, ["#9fd3f2", "#b7e0f5", "#d6eefb"])
    # hills
    d.ellipse([-40, 40, 120, 110], fill="#8fc46a")
    d.ellipse([90, 45, 300, 120], fill="#a4d377")
    band(d, 78, H, ["#b9dd7c", "#a9d36c", "#9cc861"])
    # cottage
    d.rectangle([22, 34, 84, 80], fill="#f2dfb2")
    d.polygon([(16, 36), (53, 12), (90, 36)], fill="#c9694f")
    d.rectangle([48, 56, 60, 80], fill="#6c7fa8")
    d.rectangle([28, 44, 40, 56], fill="#8fc7ea")
    d.rectangle([66, 44, 78, 56], fill="#8fc7ea")
    d.rectangle([12, 80, 96, 86], fill="#c99a5b")
    # fence
    for x in range(110, 232, 10):
        d.rectangle([x, 62, x + 2, 76], fill="#c99a5b")
    d.rectangle([110, 66, 232, 68], fill="#d8ad6a")
    # trough + basket
    d.rectangle([180, 92, 214, 104], fill="#b07d4c")
    d.rectangle([184, 94, 210, 100], fill="#5fb3e6")
    d.rectangle([26, 118, 48, 132], fill="#e3b46e")
    d.rectangle([28, 120, 46, 126], fill="#f5dfa8")
    # flowers
    sprinkle(d, (0, 88, W, H - 4), "#fff6c9", 60, rng)
    sprinkle(d, (0, 88, W, H - 4), "#f7b7c9", 25, rng)
    sprinkle(d, (0, 88, W, H - 4), "#7fb356", 80, rng, size=2)
    clearing(d, 120, 132, 58, 22, "#cfe58f", "#b8d47a")
    return im


def moonlit_cottage(rng: random.Random) -> Image.Image:
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    band(d, 0, H, ["#4a4174", "#57508a", "#6a6199"])
    # back wall + floor
    d.rectangle([14, 18, 226, 100], fill="#8f86bb")
    d.polygon([(0, 180), (14, 100), (226, 100), (240, 180)], fill="#a3865e")
    for y in range(104, 180, 8):
        d.line([(0, y), (W, y)], fill="#93784f")
    # window with moon
    d.rectangle([96, 26, 144, 70], fill="#2c2b5c")
    d.ellipse([112, 34, 128, 50], fill="#f6efc4")
    d.rectangle([119, 26, 121, 70], fill="#cfc6f0")
    d.rectangle([96, 47, 144, 49], fill="#cfc6f0")
    d.rectangle([90, 22, 96, 74], fill="#ece6ff")
    d.rectangle([144, 22, 150, 74], fill="#ece6ff")
    # bookshelf
    d.rectangle([26, 34, 64, 96], fill="#6b4a33")
    for y in (44, 60, 76):
        d.rectangle([28, y, 62, y + 2], fill="#8a6446")
        x = 30
        while x < 60:
            d.rectangle([x, y - 9, x + 3, y - 1], fill=rng.choice(["#8d7fd1", "#cbbdf5", "#5b5390"]))
            x += 5
    # fireplace
    d.rectangle([166, 44, 214, 96], fill="#d9d2ea")
    d.rectangle([178, 62, 202, 92], fill="#3a2a2a")
    d.polygon([(182, 92), (190, 70), (198, 92)], fill="#f2a33a")
    d.polygon([(186, 92), (190, 78), (194, 92)], fill="#fde27a")
    # rug + bed
    clearing(d, 120, 130, 60, 22, "#e5dcf2", "#c9bde6")
    d.ellipse([92, 96, 148, 116], fill="#9b8fd0")
    d.ellipse([100, 99, 140, 112], fill="#f5efe0")
    # lanterns
    for x in (40, 200):
        d.rectangle([x, 140, x + 6, 150], fill="#f2c96b")
        sprinkle(d, (x - 6, 134, x + 12, 156), "#fde9a8", 6, rng)
    sprinkle(d, (0, 0, W, 16), "#efe9ff", 20, rng)
    return im


def ember_cavern(rng: random.Random) -> Image.Image:
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    band(d, 0, H, ["#2b2230", "#3a2c35", "#4a3a3c"])
    # lava glow at the back
    d.ellipse([60, 10, 180, 60], fill="#7a3a24")
    d.ellipse([80, 22, 160, 54], fill="#d4682a")
    d.ellipse([100, 30, 140, 48], fill="#f4a343")
    # stalactites
    for x in range(8, W, 22):
        d.polygon([(x, 0), (x + 6, 0), (x + 3, 14 + (x % 3) * 6)], fill="#241b27")
    # stone floor
    d.polygon([(0, 180), (18, 78), (222, 78), (240, 180)], fill="#6b5d5a")
    for _ in range(90):
        x, y = rng.randint(4, W - 8), rng.randint(84, H - 6)
        d.rectangle([x, y, x + rng.randint(4, 10), y + rng.randint(2, 5)], fill=rng.choice(["#75676a", "#5f5255"]))
    clearing(d, 120, 132, 58, 22, "#8a7a74", "#6f625f")
    # nest
    d.ellipse([160, 52, 226, 96], fill="#8a5a2c")
    d.ellipse([170, 58, 216, 88], fill="#f1e4c8")
    d.rectangle([182, 70, 216, 86], fill="#d9782d")
    # pool
    d.ellipse([16, 60, 74, 90], fill="#4a5f6a")
    d.ellipse([22, 64, 68, 86], fill="#3fbdd6")
    # crystals + coins
    for x, y, h in ((10, 96, 22), (30, 120, 16), (222, 100, 20), (206, 130, 14), (60, 40, 18), (196, 30, 16)):
        crystal(d, x, y, h, "#8fe8e0", "#3fbfb4")
    for x, y, h in ((4, 40, 20), (230, 60, 18)):
        crystal(d, x, y, h, "#ffbf5c", "#e0842b")
    sprinkle(d, (20, 96, 220, 172), "#f2c14e", 30, rng, size=2)
    return im


def crystal_cavern(rng: random.Random) -> Image.Image:
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    band(d, 0, H, ["#3d3f7a", "#4a4f95", "#5b63ad"])
    # ice arch at the back
    d.polygon([(70, 70), (100, 8), (140, 8), (170, 70)], fill="#a9d8f7")
    d.polygon([(84, 70), (108, 20), (132, 20), (156, 70)], fill="#dbf1ff")
    for x in range(6, W, 20):
        d.polygon([(x, 0), (x + 8, 0), (x + 4, 18 + (x % 4) * 5)], fill="#2f3166")
    # stone platform + pool
    d.polygon([(0, 180), (30, 84), (210, 84), (240, 180)], fill="#8ec8ee")
    d.ellipse([10, 96, 230, 176], fill="#e9dfd2")
    clearing(d, 120, 132, 58, 22, "#f3ebe0", "#d9cbb8")
    d.ellipse([0, 130, 70, 180], fill="#6fc4ef")
    d.ellipse([170, 140, 250, 190], fill="#6fc4ef")
    # bed + basin + shelf
    d.ellipse([28, 48, 86, 84], fill="#b9aeb0")
    d.ellipse([36, 54, 78, 78], fill="#f8f2ea")
    d.rectangle([160, 60, 210, 90], fill="#ddd1c7")
    d.ellipse([166, 56, 204, 70], fill="#8fd6f5")
    d.rectangle([214, 66, 236, 110], fill="#8a6446")
    for y in (74, 86, 98):
        d.rectangle([216, y, 234, y + 1], fill="#c4956a")
        sprinkle(d, (217, y - 6, 233, y - 2), rng.choice(["#ffd6e5", "#9fe0f5", "#ffe89a"]), 4, rng)
    # crystals + bubbles
    for x, y, h in ((14, 60, 26), (32, 92, 16), (228, 40, 22), (200, 100, 16), (60, 24, 20), (176, 24, 18)):
        crystal(d, x, y, h, "#eaf6ff", "#9ec9f0")
    for x, y, h in ((6, 110, 14), (232, 120, 14)):
        crystal(d, x, y, h, "#f2d4ff", "#c79ef0")
    for _ in range(14):
        x, y = rng.randint(0, W), rng.randint(90, H)
        d.ellipse([x, y, x + 3, y + 3], outline="#eaf6ff")
    return im


SCENES = {
    "sunlit_meadow": sunlit_meadow,
    "moonlit_cottage": moonlit_cottage,
    "ember_cavern": ember_cavern,
    "crystal_cavern": crystal_cavern,
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, fn in SCENES.items():
        im = fn(random.Random(name))
        big = im.resize((W * SCALE, H * SCALE), Image.NEAREST).quantize(colors=96, method=Image.Quantize.MEDIANCUT)
        path = os.path.join(OUT, f"{name}.png")
        big.save(path, optimize=True)
        print(f"{name}.png  {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
