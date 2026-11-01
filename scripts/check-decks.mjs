// Validates every deck in src/data/decks against the schema in src/lib/types.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { validateCard, KINDS } from './lib/validate-card.mjs';

const DIRS = ['src/data/decks', 'src/data/decks/generated'];
const errors = [];
const ids = new Map();
let count = 0;
let deckCount = 0;

const str = (v) => typeof v === 'string' && v.trim().length > 0;
const list = (dir) => {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
  } catch {
    return [];
  }
};

for (const path of DIRS.flatMap(list)) {
  const file = path.replace('src/data/decks/', '');
  const where = (m) => errors.push(`${file}: ${m}`);
  let deck;
  try { deck = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { where(`invalid JSON (${e.message})`); continue; }
  deckCount++;
  for (const k of ['id', 'name', 'blurb']) if (!str(deck[k])) where(`deck.${k} missing`);
  if (!KINDS.includes(deck.kind)) where(`deck.kind must be one of ${KINDS}`);
  if (!Array.isArray(deck.cards) || !deck.cards.length) { where('deck.cards empty'); continue; }
  for (const c of deck.cards) {
    count++;
    if (ids.has(c.id)) where(`${c.id}: duplicate id (also in ${ids.get(c.id)})`); else ids.set(c.id, file);
    for (const e of validateCard(c)) where(`${c.id ?? '?'}: ${e}`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ${errors.slice(0, 200).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${count} cards in ${deckCount} decks look good`);
