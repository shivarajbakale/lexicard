# Card illustrations: sources

Everything needed to redo or re-letter a single card picture. The pictures themselves are in `assets/illustrations/` and indexed by `src/data/illustrations.ts`.

- `plans/illustration-batch1.tsv` … `batch11.tsv`: one row per card (id, layout, scene, bubbles, note). `plans/illustration-plan.tsv` is the first-pass labelling of every card (vivid / situational / skip).
- `all-batches.tsv`: all batch plans concatenated; the input to `export`.
- `illustration-aliases.tsv`: duplicate cards that reuse another card's picture.
- `seeds.tsv`: cards whose picture uses a render seed other than 1.
- `manual-bubbles.tsv`: cards whose bubble positions were placed by hand; don't re-letter these automatically.
- `bubbles/<id>.yaml`: the final bubble layout of every picture (text, position, speaker point).
- `pipeline/`: the batch, lettering and auto-placement scripts plus the `lexicard_ink` style. They run inside the local FLUX image-model project (`studio.py render`), and need the Caveat and Inter fonts from Google Fonts in its `fonts/` folder.

Redo one card: fix its row in the plan, render its scene at seeds 1 and 2, `letter --seed N --only <id>`, then `export all-batches.tsv <this repo>`.

The working copies live in `content/` (git-ignored); this folder is the backup.
