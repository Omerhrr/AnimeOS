#!/usr/bin/env python3
"""Measure the exact dome/robe/sky RGBs on the saved probe frames and
drop zoomed crops for the eye."""
import os
from PIL import Image

OUT = "/home/z/my-project/inspect/probe132"

def measure(png, regions):
    im = Image.open(png).convert("RGB")
    w, h = im.size
    print(f"== {os.path.basename(png)} ({w}x{h}) ==")
    for name, (x0, y0, x1, y1) in regions.items():
        box = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
        px = list(box.getdata())
        n = len(px)
        avg = tuple(round(sum(p[i] for p in px) / n) for i in range(3))
        # brightest decile mean (the lit band's read)
        srt = sorted(px, key=lambda p: sum(p))
        top = srt[int(n * 0.9):]
        bmean = tuple(round(sum(p[i] for p in top) / len(top)) for i in range(3))
        print(f"  {name}: avg {avg} | lit-decile {bmean} | n={n}")
        z = box.resize((box.width * 4, box.height * 4), Image.NEAREST)
        z.save(os.path.join(OUT, f"zoom-{os.path.basename(png)[:-4]}-{name}.png"))

measure(os.path.join(OUT, "S002-medium-lin.png"), {
    "hair": (0.42, 0.20, 0.58, 0.34),
    "robe": (0.46, 0.55, 0.56, 0.75),
    "sky": (0.05, 0.05, 0.25, 0.25),
})
measure(os.path.join(OUT, "S003-closeup-lin.png"), {
    "dome": (0.35, 0.08, 0.65, 0.30),
    "strand": (0.16, 0.30, 0.30, 0.62),
    "face": (0.42, 0.42, 0.58, 0.60),
    "skyfall": (0.02, 0.02, 0.20, 0.30),
})
print("zooms saved")
