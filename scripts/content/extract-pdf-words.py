"""Pull the headwords (and only the headwords) out of a vocabulary-book PDF you own.

Nothing else from the book is kept: no definitions, sample sentences or exercises.
Every card's content is written fresh by scripts/content/generate.mjs.

Run it without installing anything globally:

    uv run --with pypdf scripts/content/extract-pdf-words.py path/to/book.pdf

Writes content/source/pdf-headwords.json ({ words: [...], idioms: [...], method, ... })
and prints a summary so you can sanity-check the list before generating cards.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

from pypdf import PdfReader

OUT = Path("content/source")

# A headword: lower-case letters, optionally hyphenated, or a short multi-word idiom ("a far cry from").
HEAD = r"[a-z][a-z'\-]*(?: [a-z][a-z'\-]*){0,5}"
# Index lines: "abhor, 112" / "abhor 112, 340" / "a far cry from 213"
INDEX_LINE = re.compile(rf"^({HEAD})[,.\s]+(\d{{1,3}}(?:\s*[,–-]\s*\d{{1,3}})*)\s*$")
# "Words to learn this week" style lists, comma separated.
LIST_HEADER = re.compile(r"words?\s+to\s+learn", re.I)
STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "page", "index", "week", "day", "lesson", "review", "answers"}


def pages_text(pdf: Path) -> list[str]:
    reader = PdfReader(str(pdf))
    # Some exports use tabs between words; treat them as spaces.
    return [(p.extract_text() or "").replace("\t", " ") for p in reader.pages]


def from_matching(pages: list[str]) -> list[str]:
    """Lesson matching exercises: a number line ("6."), the headword, then a blank to fill in ("_____")."""
    found: list[str] = []
    # One continuous stream of lines, so an entry split across a page break still matches.
    lines = [l.strip() for text in pages for l in text.splitlines() if l.strip()]
    for i in range(1, len(lines) - 1):
        w = lines[i].lower()
        if re.fullmatch(r"\d{1,3}\.", lines[i - 1]) and re.fullmatch(r"_{3,}", lines[i + 1]) and re.fullmatch(HEAD, w) and w not in STOP:
            # Single words, or short idioms; longer phrases here are exercise answers, not headwords.
            if " " not in w or len(w.split()) <= 4 and not w.startswith("the "):
                found.append(w)
    return found


def from_index(pages: list[str]) -> list[str]:
    """Most vocabulary books end with an alphabetical index: headword followed by page numbers."""
    found: list[str] = []
    # Search the back third of the book, where the index lives.
    for text in pages[int(len(pages) * 0.66):]:
        for raw in text.splitlines():
            line = raw.strip()
            m = INDEX_LINE.match(line)
            if m and m.group(1) not in STOP:
                found.append(m.group(1))
    return found


def from_lists(pages: list[str]) -> list[str]:
    """Fallback: comma-separated lists that follow a 'Words to learn' heading."""
    found: list[str] = []
    for text in pages:
        lines = text.splitlines()
        for i, line in enumerate(lines):
            if not LIST_HEADER.search(line):
                continue
            chunk = " ".join(lines[i : i + 6])
            chunk = LIST_HEADER.split(chunk, maxsplit=1)[-1]
            for part in re.split(r"[,;•·\n]", chunk):
                w = part.strip().strip(":.").lower()
                if re.fullmatch(HEAD, w) and w not in STOP:
                    found.append(w)
    return found


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: uv run --with pypdf scripts/content/extract-pdf-words.py path/to/book.pdf")
    pdf = Path(sys.argv[1]).expanduser()
    pages = pages_text(pdf)
    total_chars = sum(len(t) for t in pages)
    if total_chars < 1000:
        sys.exit(f"{pdf.name}: only {total_chars} characters of text. It may be a scanned PDF; it needs OCR first.")

    # Use the first method that finds a plausible vocabulary list.
    method, words = "index", []
    for name, fn in (("index", from_index), ("matching exercises", from_matching), ("word lists", from_lists)):
        method, words = name, fn(pages)
        if len(set(words)) >= 300:
            break

    counts = Counter(words)
    unique = sorted(counts)
    singles = [w for w in unique if " " not in w and len(w) >= 3]
    multi = [w for w in unique if " " in w]

    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / "pdf-headwords.json"
    out.write_text(json.dumps({"source": pdf.name, "method": method, "words": singles, "idioms": multi}, indent=2))

    print(f"{pdf.name}: {len(pages)} pages, method: {method}")
    print(f"  {len(singles)} single words, {len(multi)} multi-word entries -> {out}")
    print(f"  first words: {', '.join(singles[:15])}")
    print(f"  last words:  {', '.join(singles[-10:])}")
    if multi:
        print(f"  idioms:      {', '.join(multi[:10])}")


if __name__ == "__main__":
    main()
