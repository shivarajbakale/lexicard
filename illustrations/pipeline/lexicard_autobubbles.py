"""Place Lexicard callouts automatically, then letter them with lexicard_bubbles.py.

Finds empty off-white space in a render and puts each bubble there, so nothing covers the drawing:
  - explanation clouds point at the bright lime object (the accent always marks the thing that carries the meaning);
  - spoken lines ("S: ...") become speech bubbles that point at the nearest head (the top of a figure);
  - an optional anchor after the prefix picks the target: "@left", "@right", "@middle" (that figure's head) or "@lime",
    e.g. "S: @left You back up!" or "@lime The secret gift"; "@x,y" aims at a pixel when detection gets it wrong;
    "@p1"/"@p2" aim at panel 1/2 of a two-panel image (see lexicard_batch.py);
  - a leading "!" marks the must-keep bubble (the one that states the meaning): it is placed first and is shrunk
    rather than dropped when space is tight.
Writes the placement to scenes/lexicard/bubbles/<id>.yaml so any bubble can be nudged by hand afterwards.

Usage:
    .venv-mlx/bin/python lexicard_autobubbles.py <id> <seed> "<bubble> | <bubble> | S: <spoken>"
    .venv-mlx/bin/python lexicard_autobubbles.py --plan <id>=<seed> [<id>=<seed> ...]   (bubbles from the plan TSV)
"""

import sys
from pathlib import Path

import numpy as np
import yaml
from PIL import Image, ImageFilter

import lexicard_bubbles as lb

ROOT = Path(__file__).resolve().parent
PLAN = Path.home() / "Projects/lexicard/content/illustration-plan.tsv"
GRID = 4  # analysis works on a quarter-size image
PANEL_ANCHORS = {"p1": (258, 300), "p2": (766, 300)}  # top of each panel in a two-panel image (lexicard_batch.py)


def masks(img: Image.Image):
    small = img.convert("RGB").resize((img.width // GRID, img.height // GRID))
    a = np.asarray(small).astype(int)
    corners = np.concatenate([a[:6, :6].reshape(-1, 3), a[:6, -6:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    fg = (np.abs(a - bg).sum(axis=2) > 40)
    fg_img = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
    fg = np.asarray(fg_img) > 0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lime = (g > 150) & (g - b > 70) & (r > 90) & (g > r)
    return fg, lime


def heads(fg: np.ndarray) -> list[tuple[int, int]]:
    """Tops of head-sized blobs: local minima of the first foreground row per column, kept only where the blob is
    head-wide a little below its top (this drops thin posts, poles and lamp stands)."""
    h, w = fg.shape
    top = np.where(fg.any(axis=0), fg.argmax(axis=0), h)
    cands = sorted(range(4, w - 4), key=lambda x: top[x])
    out = []
    for x in cands:
        t = top[x]
        if t >= h * 0.62 or any(abs(x - o[0]) < 30 for o in out):
            continue
        row = fg[min(h - 1, t + 10)]
        l = r = x
        while l > 0 and row[l - 1]:
            l -= 1
        while r < w - 1 and row[r + 1]:
            r += 1
        if 12 <= r - l <= 60:
            out.append((x, int(t)))
    out.sort()
    return [(x * GRID, y * GRID + 4) for x, y in out]  # a little below the very top: aim at the head, not the hair


def size(text: str, width: int, spoken: bool, font_size: int = lb.FONT_SIZE):
    f = lb.font(font_size)
    lines = lb.wrap(text, f, width)
    tw = max(f.getlength(l) for l in lines)
    th = f.size * lb.LINE_GAP * len(lines)
    rx, ry = tw / 2 + 26, th / 2 + 22
    if spoken:
        return rx * 1.08 + 10, ry * 1.12 + 10
    puff = min(rx, ry) * 0.42
    return rx + puff * 1.15 + 8, ry + puff * 1.15 + 8


def place_in_order(img: Image.Image, texts: list[str], keep_first: bool) -> list[dict]:
    fg, lime = masks(img)
    H, W = fg.shape
    taken = np.zeros_like(fg)
    ys, xs = np.nonzero(lime)
    lime_pt = (int(xs.mean()) * GRID, int(ys.mean()) * GRID) if len(xs) > 30 else None
    hs = heads(fg)
    if hs:  # real heads sit near the top of the figures; lower 'tops' are furniture and posts
        hs = [h for h in hs if h[1] <= min(y for _, y in hs) + 130]
    out = []
    # Bubbles tied to a person go first, so they get the space nearest that person.
    keep = {i for i, t in enumerate(texts) if t.lstrip().startswith("!")}
    texts = [t.lstrip()[1:].strip() if i in keep else t for i, t in enumerate(texts)]
    order = sorted(range(len(texts)), key=lambda i: 0 if i in keep else 1) if keep_first else list(range(len(texts)))
    for n, raw in ((i, texts[i]) for i in order):
        spoken = raw.startswith("S:")
        text = raw[2:].strip() if spoken else raw.strip()
        anchor = None
        if text.startswith("@"):
            anchor, text = text[1:].split(" ", 1)
        fixed = None
        if anchor in ("p1", "p2"):
            fixed = PANEL_ANCHORS[anchor]
        elif anchor and "," in anchor:
            fixed = tuple(int(v) for v in anchor.split(","))
        elif anchor == "lime" and lime_pt:
            fixed = lime_pt
        elif anchor in ("left", "right", "middle") and hs:
            fixed = {"left": min(hs), "right": max(hs),
                     "middle": min(hs, key=lambda h: abs(h[0] - W * GRID / 2))}[anchor]
        sizes = (lb.FONT_SIZE, 38) if n in keep else (lb.FONT_SIZE, 36)  # never below 38 for the key bubble: it must stay readable
        limit = 0.2 if n in keep else 0.06
        for font_size in sizes:  # shrink if there is no clear space at full size
            width = 150 if len(text) <= 14 else 200 if len(text) <= 30 else 300
            width = int(width * font_size / lb.FONT_SIZE)
            ex, ey = size(text, width, spoken, font_size)
            best = None
            for cy in range(int(ey) + 4, img.height - int(ey) - 4, 12):
                for cx in range(int(ex) + 4, img.width - int(ex) - 4, 12):
                    x0, x1 = (cx - ex) / GRID, (cx + ex) / GRID
                    y0, y1 = (cy - ey) / GRID, (cy + ey) / GRID
                    yy, xx = np.ogrid[int(y0):int(y1), int(x0):int(x1)]
                    ell = ((xx - cx / GRID) / (ex / GRID)) ** 2 + ((yy - cy / GRID) / (ey / GRID)) ** 2 <= 1
                    region_fg = fg[int(y0):int(y1), int(x0):int(x1)][ell].mean()
                    region_taken = taken[int(y0):int(y1), int(x0):int(x1)][ell].mean()
                    if region_taken > 0:
                        continue
                    if fixed:
                        tgt = fixed
                    elif spoken or (n % 2 == 1 and hs):
                        tgt = min(hs, key=lambda h: (h[0] - cx) ** 2 + (h[1] - cy) ** 2) if hs else (W * GRID // 2, H * GRID // 2)
                    else:
                        tgt = lime_pt or (W * GRID // 2, H * GRID // 2)
                    dist = ((tgt[0] - cx) ** 2 + (tgt[1] - cy) ** 2) ** 0.5
                    # Nudge reading order left to right: bubble n of k prefers the n-th slice of the width.
                    pref = (n + 0.5) / len(texts) * img.width
                    # Speech bubbles must sit by their speaker: the tail is short, so a far bubble seems to point at someone else.
                    far = 3.0 if spoken else 1.0
                    score = region_fg * 4000 + max(dist - 160, 0) * far + max(160 - dist, 0) * 3 + abs(cx - pref) * 0.7
                    if best is None or score < best[0]:
                        best = (score, cx, cy, tgt, region_fg)

            if best is not None and best[4] <= 0.06:
                break
        if best is None or (best[4] > limit and out):
            continue  # no clear space left: fewer bubbles beat covering the drawing
        _, cx, cy, tgt, _ = best
        yy, xx = np.ogrid[:H, :W]
        taken |= ((xx - cx / GRID) / (ex / GRID + 4)) ** 2 + ((yy - cy / GRID) / (ey / GRID + 4)) ** 2 <= 1
        b = {"text": text, "at": [int(cx), int(cy)], "to": [int(tgt[0]), int(tgt[1])], "width": width}
        if font_size != lb.FONT_SIZE:
            b["size"] = font_size
        if spoken:
            b["kind"] = "speech"
        out.append((n, b))
    placed = {n for n, _ in out}
    if keep - placed:
        return None  # the must-keep bubble did not fit
    return [b for _, b in sorted(out, key=lambda t: t[0])]  # back to reading order, which sets the numbers


def place(img: Image.Image, texts: list[str]) -> list[dict]:
    """Place bubbles in reading order (so 1, 2, 3 flow left to right); if that squeezes out the must-keep bubble,
    place the must-keep bubble first instead."""
    return place_in_order(img, texts, keep_first=False) or place_in_order(img, texts, keep_first=True)


def run(cid: str, seed: int, bubbles: str, image: str | None = None) -> Path:
    image = image or f"outputs/{cid}/seed_{seed}.png"
    texts = [t.strip() for t in bubbles.split("|") if t.strip()]
    spec = {"image": image, "out": f"outputs/lexicard/{cid}.png",
            "bubbles": place(Image.open(ROOT / image), texts)}
    path = ROOT / f"scenes/lexicard/bubbles/{cid}.yaml"
    path.write_text(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
    return lb.render(path)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--plan":
        plan = {l.split("\t")[0]: l.rstrip("\n").split("\t") for l in PLAN.read_text().splitlines()}
        for item in args[1:]:
            cid, seed = item.split("=")
            print(run(cid, int(seed), plan[cid][5]))
    else:
        print(run(args[0], int(args[1]), args[2]))
