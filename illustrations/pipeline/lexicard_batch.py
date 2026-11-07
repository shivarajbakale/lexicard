"""Batch pipeline for Lexicard card illustrations: plan TSV -> scene files -> renders -> numbered callouts -> sheets.

Plan TSV (no header), one card per line:
    id <TAB> layout <TAB> scene <TAB> bubbles <TAB> note
    layout   single | cutaway | two-panel
    scene    one sentence; for two-panel "P1: ... || P2: ..."
    bubbles  "|"-separated, reading order; "!" must-keep, "S:" spoken, then @left/@right/@middle/@lime/@p1/@p2/@x,y

Commands (run one at a time; rendering is heavy):
    .venv-mlx/bin/python lexicard_batch.py prepare <plan.tsv> <batch-name> [--seeds 1 2]
    .venv-mlx/bin/python studio.py render scenes/lexicard/<batch-name>
    .venv-mlx/bin/python lexicard_batch.py letter <plan.tsv> [--seed N] [--only id1,id2]
    .venv-mlx/bin/python lexicard_batch.py sheets <plan.tsv> <out-prefix> [--per 8]
    .venv-mlx/bin/python lexicard_batch.py export <plan.tsv> <lexicard-repo> [--quality 80]

Two-panel cards render each panel as its own square scene (<id>__p1, <id>__p2) and are composed side by side in the
lower part of a 1024x768 frame, with the empty band above kept for the bubbles.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import lexicard_autobubbles as ab

ROOT = Path(__file__).resolve().parent
HEADROOM = "The figures stand in the lower two thirds of the frame with wide empty off-white space above them"
CUTAWAY_SKY = "Leave wide empty off-white space at the top of the frame"
PANEL_TAIL = "One simple centered scene, full figures, plain off-white background"
INK = (11, 12, 10)


def read_plan(path: str) -> list[dict]:
    rows = []
    for line in Path(path).read_text().splitlines():
        if not line.strip():
            continue
        p = line.split("\t")
        rows.append({"id": p[0], "layout": p[1].strip(), "scene": p[2].strip(), "bubbles": p[3].strip(),
                     "note": p[4].strip() if len(p) > 4 else ""})
    return rows


def scene_yaml(desc: str, size, seeds, comment: str) -> str:
    return (f"# {comment}\nstyle: lexicard_ink\nsize: {list(size)}\ndescription: >-\n  {desc}\n"
            f"seeds: {list(seeds)}\nsteps: 8\n")


def prepare(args) -> None:
    out = ROOT / "scenes/lexicard" / args.batch
    out.mkdir(parents=True, exist_ok=True)
    for r in read_plan(args.plan):
        if r["layout"] == "two-panel":
            parts = [s.split(":", 1)[1].strip() for s in r["scene"].split("||")]
            for k, part in enumerate(parts[:2], start=1):
                desc = f"{part.rstrip('.')}. {PANEL_TAIL}"
                (out / f"{r['id']}__p{k}.yaml").write_text(
                    scene_yaml(desc, (768, 768), args.seeds, f"{r['id']} panel {k} (two-panel)"))
        else:
            tail = CUTAWAY_SKY if r["layout"] == "cutaway" else HEADROOM
            desc = f"{r['scene'].rstrip('.')}. {tail}"
            (out / f"{r['id']}.yaml").write_text(scene_yaml(desc, (1024, 768), args.seeds, f"{r['id']} ({r['layout']})"))
    print(f"wrote scenes to {out}")


def compose_panels(cid: str, seed: int) -> str:
    """Two square renders side by side in the lower part of a 1024x768 frame, ink-framed, bubble space above."""
    p1 = Image.open(ROOT / f"outputs/{cid}__p1/seed_{seed}.png").convert("RGB")
    p2 = Image.open(ROOT / f"outputs/{cid}__p2/seed_{seed}.png").convert("RGB")
    bg = tuple(int(v) for v in np.median(np.asarray(p1)[:8, :8].reshape(-1, 3), axis=0))
    canvas = Image.new("RGB", (1024, 768), bg)
    d = ImageDraw.Draw(canvas)
    size, top = 496, 252
    for x, panel in ((10, p1), (518, p2)):
        canvas.paste(panel.resize((size, size), Image.LANCZOS), (x, top))
        d.rectangle([x, top, x + size - 1, top + size - 1], outline=INK, width=5)
    rel = f"outputs/{cid}/panels_seed_{seed}.png"
    (ROOT / rel).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(ROOT / rel)
    return rel


def letter(args) -> None:
    only = set(args.only.split(",")) if args.only else None
    for r in read_plan(args.plan):
        if only and r["id"] not in only:
            continue
        try:
            image = compose_panels(r["id"], args.seed) if r["layout"] == "two-panel" else None
            print(ab.run(r["id"], args.seed, r["bubbles"], image=image))
        except FileNotFoundError as e:
            print(f"skip {r['id']}: {e}")


def sheets(args) -> None:
    ids = [r["id"] for r in read_plan(args.plan) if (ROOT / f"outputs/lexicard/{r['id']}.png").exists()]
    w, h = 512, 384
    for s in range(0, len(ids), args.per):
        chunk = ids[s:s + args.per]
        rows = -(-len(chunk) // 2)
        sheet = Image.new("RGB", (2 * w + 10, rows * (h + 10)), "white")
        for i, cid in enumerate(chunk):
            sheet.paste(Image.open(ROOT / f"outputs/lexicard/{cid}.png").resize((w, h)), ((i % 2) * (w + 10), (i // 2) * (h + 10)))
        path = Path(f"{args.prefix}_{s // args.per + 1:02d}.jpg")
        sheet.save(path, quality=80)
        print(path, " ".join(chunk))


def export(args) -> None:
    """Copy lettered cards into the Lexicard app as WebP and regenerate its illustration index."""
    app = Path(args.app)
    out = app / "assets/illustrations"
    out.mkdir(parents=True, exist_ok=True)
    ids = sorted(p.stem for p in (ROOT / "outputs/lexicard").glob("*.png")
                 if p.stem in {r["id"] for r in read_plan(args.plan)})
    total = 0
    for cid in ids:
        dst = out / f"{cid}.webp"
        Image.open(ROOT / f"outputs/lexicard/{cid}.png").convert("RGB").save(dst, "WEBP", quality=args.quality, method=6)
        total += dst.stat().st_size
    known = sorted(p.stem for p in out.glob("*.webp"))
    lines = ["// Generated by image-model/lexicard_batch.py export — do not edit by hand.",
             "/** card id -> bundled illustration (1024x768, numbered callouts drawn in) */",
             "export const illustrations: Record<string, number> = {"]
    entries = {cid: cid for cid in known}
    # Cards that are the same expression under another id (e.g. "stars-align" / "stars-are-aligned") share one picture.
    alias_file = app / "content/illustration-aliases.tsv"
    if alias_file.exists():
        for line in alias_file.read_text().splitlines():
            if line.strip():
                alias, source = line.split("\t")[:2]
                if source in entries and alias not in entries:
                    entries[alias] = source
    lines += [f"  '{cid}': require('../../assets/illustrations/{src}.webp')," for cid, src in sorted(entries.items())]
    lines += ["};", ""]
    (app / "src/data/illustrations.ts").write_text("\n".join(lines))
    print(f"exported {len(ids)} ({total / max(len(ids), 1) / 1024:.0f} KB avg); index has {len(entries)} "
          f"({len(entries) - len(known)} sharing another card's picture)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("prepare"); a.add_argument("plan"); a.add_argument("batch"); a.add_argument("--seeds", type=int, nargs="+", default=[1])
    a = sub.add_parser("letter"); a.add_argument("plan"); a.add_argument("--seed", type=int, default=1); a.add_argument("--only")
    a = sub.add_parser("sheets"); a.add_argument("plan"); a.add_argument("prefix"); a.add_argument("--per", type=int, default=8)
    a = sub.add_parser("export"); a.add_argument("plan"); a.add_argument("app"); a.add_argument("--quality", type=int, default=80)
    args = ap.parse_args()
    {"prepare": prepare, "letter": letter, "sheets": sheets, "export": export}[args.cmd](args)
