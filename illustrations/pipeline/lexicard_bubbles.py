"""Draw comic cloud callouts onto Lexicard word illustrations.

The image model draws the scene; this script letters the callouts, so the words are always spelled right and can be
edited without a re-render. Each callout is a scalloped cloud with ink outline and a trail of shrinking puffs that
points at the part of the picture it explains.

Spec (YAML):
    image: outputs/02_spill_the_beans/seed_2.png
    out: outputs/lexicard/spill_the_beans.png
    bubbles:
      - text: "Oops! Told too soon"
        at: [190, 110]        # cloud centre, in image pixels
        to: [470, 240]        # what the trail points at
        width: 230            # optional wrap width for the text
        kind: speech          # optional: a smooth oval with a pointed tail, for words someone says out loud
    numbers: true             # optional (default true): numbered badges give the reading order (list order)

Usage:
    .venv-mlx/bin/python lexicard_bubbles.py scenes/lexicard/bubbles/*.yaml
"""

import math
import sys
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONT = ROOT / "fonts/Caveat[wght].ttf"
NUM_FONT = ROOT / "fonts/Inter[opsz,wght].ttf"
LIME = (198, 244, 50, 255)
INK = (11, 12, 10, 255)
PAPER = (255, 254, 250, 255)
SS = 2           # supersampling for smooth edges
STROKE = 4       # outline width, in output pixels
FONT_SIZE = 44
LINE_GAP = 0.92


def font(size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONT), size)
    try:
        f.set_variation_by_axes([700])
    except Exception:
        pass
    return f


def wrap(text: str, f, width: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if cur and f.getlength(trial) > width:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    return lines + [cur] if cur else lines


def cloud_circles(cx, cy, rx, ry, puff):
    """Circles spaced around an ellipse; their union with the ellipse is the cloud."""
    perim = math.pi * (3 * (rx + ry) - math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
    n = max(7, int(perim / (puff * 1.35)))
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n + 0.3
        r = puff * (0.85 + 0.3 * ((i * 7) % 5) / 4)  # slight size variation, deterministic
        out.append((cx + rx * math.cos(a), cy + ry * math.sin(a), r))
    return out


def draw_number(d, x, y, n: int) -> None:
    """Reading-order badge: an ink disc with a lime number, sitting on the bubble's upper-left rim."""
    s = SS
    r = 19 * s
    f = ImageFont.truetype(str(NUM_FONT), 24 * s)
    try:
        f.set_variation_by_axes([24, 800])
    except Exception:
        pass
    d.ellipse([x - r - 3 * s, y - r - 3 * s, x + r + 3 * s, y + r + 3 * s], fill=PAPER)
    d.ellipse([x - r, y - r, x + r, y + r], fill=INK)
    d.text((x, y), str(n), font=f, fill=LIME, anchor="mm")


def draw_bubble(img: Image.Image, b: dict, number: int | None = None, part: str = "all") -> None:
    """part: "trail" draws only the cloud trail, "body" everything else, "all" both."""
    s = SS
    f = font(int(b.get("size", FONT_SIZE)) * s)
    lines = wrap(b["text"], f, int(b.get("width", 220)) * s)
    lh = f.size * LINE_GAP
    tw = max(f.getlength(l) for l in lines)
    th = lh * len(lines)
    cx, cy = (v * s for v in b["at"])
    tx, ty = (v * s for v in b["to"])

    rx, ry = tw / 2 + 26 * s, th / 2 + 22 * s
    puff = min(rx, ry) * 0.42
    # Keep the whole cloud inside the frame.
    mx, my = rx + puff * 1.15 + STROKE * s + 4 * s, ry + puff * 1.15 + STROKE * s + 4 * s
    cx = min(max(cx, mx), img.width - mx)
    cy = min(max(cy, my), img.height - my)
    circles = cloud_circles(cx, cy, rx, ry, puff)

    # Trail of shrinking puffs from the cloud's edge toward the target.
    ang = math.atan2(ty - cy, tx - cx)
    ex, ey = cx + (rx + puff * 0.6) * math.cos(ang), cy + (ry + puff * 0.6) * math.sin(ang)
    dist = math.hypot(tx - ex, ty - ey)
    trail = []
    for k, frac in enumerate((0.22, 0.52, 0.8)):
        r = (15 - k * 4.5) * s
        if dist * frac > r * 2:
            trail.append((ex + (tx - ex) * frac, ey + (ty - ey) * frac, r))

    d = ImageDraw.Draw(img)
    w = STROKE * s
    if part == "trail":
        if b.get("kind") != "speech":
            for x, y, r in trail:
                d.ellipse([x - r - w, y - r - w, x + r + w, y + r + w], fill=INK)
                d.ellipse([x - r, y - r, x + r, y + r], fill=PAPER)
        return
    if b.get("kind") == "speech":
        draw_speech(d, cx, cy, rx * 1.08, ry * 1.12, tx, ty, w)
        y = cy - th / 2
        for line in lines:
            d.text((cx - f.getlength(line) / 2, y), line, font=f, fill=INK)
            y += lh
        if number:
            draw_number(d, cx - rx * 0.78, cy - ry * 0.9, number)
        return
    # Ink first (every shape grown by the stroke), then paper on top: the union gets one clean outline.
    for x, y, r in circles:
        d.ellipse([x - r - w, y - r - w, x + r + w, y + r + w], fill=INK)
    d.ellipse([cx - rx - w, cy - ry - w, cx + rx + w, cy + ry + w], fill=INK)
    for x, y, r in circles:
        d.ellipse([x - r, y - r, x + r, y + r], fill=PAPER)
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=PAPER)
    if part == "all":
        for x, y, r in trail:
            d.ellipse([x - r - w, y - r - w, x + r + w, y + r + w], fill=INK)
            d.ellipse([x - r, y - r, x + r, y + r], fill=PAPER)

    y = cy - th / 2
    for line in lines:
        d.text((cx - f.getlength(line) / 2, y), line, font=f, fill=INK)
        y += lh
    if number:
        draw_number(d, cx - rx * 0.82, cy - ry * 0.95, number)


def draw_speech(d, cx, cy, rx, ry, tx, ty, w) -> None:
    """Smooth oval with a pointed tail that stops just short of the speaker's mouth."""
    ang = math.atan2(ty - cy, tx - cx)
    base = [(cx + rx * 0.8 * math.cos(ang + k), cy + ry * 0.8 * math.sin(ang + k)) for k in (-0.28, 0.28)]
    tip = (tx - 14 * math.cos(ang) * 2, ty - 14 * math.sin(ang) * 2)
    # Always show a tail: if the target is close to the bubble, push the tip just outside the oval.
    edge = math.hypot(rx * math.cos(ang), ry * math.sin(ang))
    reach = math.hypot(tip[0] - cx, tip[1] - cy)
    reach = min(max(reach, edge + 40 * SS), edge + 90 * SS)  # a visible tail, but never a long spike
    tip = (cx + reach * math.cos(ang), cy + reach * math.sin(ang))
    tail = [base[0], tip, base[1]]
    d.ellipse([cx - rx - w, cy - ry - w, cx + rx + w, cy + ry + w], fill=INK)
    d.polygon(tail, fill=INK)
    d.line(tail + [tail[0]], fill=INK, width=2 * w, joint="curve")
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=PAPER)
    d.polygon(tail, fill=PAPER)


def render(spec_path: Path) -> Path:
    spec = yaml.safe_load(spec_path.read_text())
    base = Image.open(ROOT / spec["image"]).convert("RGBA")
    big = base.resize((base.width * SS, base.height * SS), Image.LANCZOS)
    numbered = spec.get("numbers", True) and len(spec["bubbles"]) > 1
    # Trails first, then bodies: a trail never cuts across another bubble's text.
    for b in spec["bubbles"]:
        draw_bubble(big, b, part="trail")
    for n, b in enumerate(spec["bubbles"], start=1):
        draw_bubble(big, b, n if numbered else None, part="body")
    out = ROOT / spec["out"]
    out.parent.mkdir(parents=True, exist_ok=True)
    big.resize(base.size, Image.LANCZOS).convert("RGB").save(out)
    return out


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(render(Path(p)))
