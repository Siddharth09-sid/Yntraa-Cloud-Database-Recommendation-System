#!/usr/bin/env python3
"""Turn a source logo image into the two one-colour files the site uses.

  python3 tools/make-logos.py <key> <source image> [dark|light]

dark  = dark artwork on a white background (default)
light = white artwork on a black background
Writes assets/db-logos/<key>.png (navy) and <key>-light.png (white). Needs Pillow + numpy.
"""
import os, sys
from PIL import Image
import numpy as np

SIZE = 160
INK = (16, 25, 54)

def make(key, path, mode="dark", haze=28):
    L = np.array(Image.open(path).convert("RGB").convert("L")).astype(float)
    a = L if mode == "light" else 255 - L
    a[a < haze] = 0
    a = np.clip(a / np.percentile(a[a > 0], 97), 0, 1)
    ys, xs = np.where(a > 0.08)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape
    side = int(max(h, w) * 1.10)
    canvas = np.zeros((side, side))
    oy, ox = (side - h) // 2, (side - w) // 2
    canvas[oy:oy + h, ox:ox + w] = a
    alpha = Image.fromarray((canvas * 255).astype("uint8")).resize((SIZE, SIZE), Image.LANCZOS)
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "db-logos")
    for suffix, rgb in (("", INK), ("-light", (255, 255, 255))):
        out = Image.new("RGBA", (SIZE, SIZE), rgb + (0,))
        out.putalpha(alpha)
        out.save(os.path.join(out_dir, key + suffix + ".png"), optimize=True)
    print("wrote", key + ".png and", key + "-light.png")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    make(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "dark")
