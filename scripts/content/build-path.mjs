// Builds src/data/path.json: the learning path of tracks → units → packs.
//
// Cards stay in their deck files; the path only lists card ids, so audio, pictures and root
// breakdowns never move. Each track starts with a starter unit of the hand-written decks, then one
// unit per content-pipeline theme, in the order the pipeline lists them (src/data/generated.ts).
// A theme's cards are split evenly into packs of at most PACK_MAX cards, so 123 cards become six
// packs of about 20 instead of 25/25/25/25/23.
//
//   node scripts/content/build-path.mjs          writes src/data/path.json
//   node scripts/content/build-path.mjs --check  fails if path.json is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const DECKS = join(ROOT, 'src/data/decks');
const OUT = join(ROOT, 'src/data/path.json');
const PACK_MAX = 21;

const TRACKS = [
  { id: 'words', kind: 'word', title: 'Words', blurb: 'Sharper words for normal days', starter: ['everyday-eloquence', 'workplace-clarity'] },
  { id: 'idioms', kind: 'idiom', title: 'Idioms', blurb: 'Break the ice, spill the beans…', starter: ['idioms-weekly', 'idioms-strange-origins'] },
  { id: 'phrases', kind: 'phrase', title: 'Phrases', blurb: 'On the same page, circle back…', starter: ['meeting-phrases', 'polite-pushback'] },
];

const readDeck = (path) => JSON.parse(readFileSync(path, 'utf8'));

// Generated decks in pipeline order, grouped by theme ("words-thinking-reasoning-2" → "words-thinking-reasoning").
const generatedOrder = [...readFileSync(join(ROOT, 'src/data/generated.ts'), 'utf8').matchAll(/from '\.\/decks\/generated\/([a-z0-9-]+)\.json'/g)].map((m) => m[1]);
const themes = new Map();
for (const file of generatedOrder) {
  const theme = file.replace(/-\d+$/, '');
  const deck = readDeck(join(DECKS, 'generated', `${file}.json`));
  if (!themes.has(theme)) themes.set(theme, { id: theme, kind: deck.kind, title: deck.name.replace(/ · \d+$/, ''), cards: [] });
  themes.get(theme).cards.push(...deck.cards.map((c) => c.id));
}

const terms = new Map();
const remember = (deck) => deck.cards.forEach((c) => terms.set(c.id, c.term));
for (const file of generatedOrder) remember(readDeck(join(DECKS, 'generated', `${file}.json`)));

/** Split `ids` into the fewest packs of at most PACK_MAX, as even as possible. */
function split(ids) {
  const n = Math.max(1, Math.ceil(ids.length / PACK_MAX));
  const out = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const size = Math.floor(ids.length / n) + (i < ids.length % n ? 1 : 0);
    out.push(ids.slice(at, at + size));
    at += size;
  }
  return out;
}

const sample = (ids) => ids.slice(0, 3).map((id) => terms.get(id)).join(' · ');

const path = {
  tracks: TRACKS.map((t) => {
    const starterDecks = t.starter.map((id) => readDeck(join(DECKS, `${id}.json`)));
    starterDecks.forEach(remember);
    const units = [
      {
        id: `${t.id}-starter`,
        title: 'Starter',
        packs: starterDecks.map((d) => ({ id: d.id, title: d.name, blurb: d.blurb, cardIds: d.cards.map((c) => c.id) })),
      },
    ];
    for (const theme of themes.values()) {
      if (theme.kind !== t.kind) continue;
      const parts = split(theme.cards);
      units.push({
        id: theme.id,
        title: theme.title,
        packs: parts.map((ids, i) => ({
          id: parts.length > 1 ? `${theme.id}-${i + 1}` : theme.id,
          title: parts.length > 1 ? `${theme.title} ${i + 1}` : theme.title,
          blurb: sample(ids),
          cardIds: ids,
        })),
      });
    }
    return { id: t.id, kind: t.kind, title: t.title, blurb: t.blurb, units };
  }),
};

const json = `${JSON.stringify(path, null, 1)}\n`;
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    // missing counts as out of date
  }
  if (current !== json) {
    console.error('✗ src/data/path.json is out of date. Run: node scripts/content/build-path.mjs');
    process.exit(1);
  }
  console.log('✓ path.json is up to date');
} else {
  writeFileSync(OUT, json);
  const packs = path.tracks.flatMap((t) => t.units.flatMap((u) => u.packs));
  const sizes = packs.map((p) => p.cardIds.length);
  console.log(`wrote ${packs.length} packs (${Math.min(...sizes)}–${Math.max(...sizes)} cards) in ${path.tracks.length} tracks`);
  for (const t of path.tracks) console.log(`  ${t.title}: ${t.units.length} units, ${t.units.reduce((n, u) => n + u.packs.length, 0)} packs`);
}
