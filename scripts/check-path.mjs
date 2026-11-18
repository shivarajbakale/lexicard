// Validates src/data/path.json: every card is in exactly one pack, every id exists, packs are a sane size.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIN = 8;
const MAX = 21;
const errors = [];

const deckIds = new Map();
for (const dir of ['src/data/decks', 'src/data/decks/generated']) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const c of JSON.parse(readFileSync(join(dir, f), 'utf8')).cards) deckIds.set(c.id, c.kind);
  }
}

const path = JSON.parse(readFileSync('src/data/path.json', 'utf8'));
const seen = new Map();
const packIds = new Set();
let packs = 0;
for (const t of path.tracks) {
  for (const u of t.units) {
    if (!u.packs.length) errors.push(`${u.id}: unit has no packs`);
    for (const p of u.packs) {
      packs++;
      if (packIds.has(p.id)) errors.push(`${p.id}: duplicate pack id`);
      packIds.add(p.id);
      if (p.cardIds.length < MIN || p.cardIds.length > MAX) errors.push(`${p.id}: ${p.cardIds.length} cards (want ${MIN}–${MAX})`);
      for (const id of p.cardIds) {
        if (!deckIds.has(id)) errors.push(`${p.id}: unknown card ${id}`);
        else if (deckIds.get(id) !== t.kind) errors.push(`${p.id}: ${id} is a ${deckIds.get(id)}, not a ${t.kind}`);
        if (seen.has(id)) errors.push(`${id}: in ${seen.get(id)} and ${p.id}`);
        seen.set(id, p.id);
      }
    }
  }
}
for (const id of deckIds.keys()) if (!seen.has(id)) errors.push(`${id}: not in any pack`);

if (errors.length) {
  console.error(`✗ ${errors.length} path problem(s):\n  ${errors.slice(0, 100).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${seen.size} cards in ${packs} packs, each in exactly one`);
