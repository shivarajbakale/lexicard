// Validates src/data/explanations.json: every key is a real card, every note is plain prose of a sensible length.
// Missing notes are allowed (the app falls back to "how it feels"); the count is reported.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ids = new Set();
for (const dir of ['src/data/decks', 'src/data/decks/generated']) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    for (const c of JSON.parse(readFileSync(join(dir, f), 'utf8')).cards) ids.add(c.id);
  }
}

const notes = JSON.parse(readFileSync('src/data/explanations.json', 'utf8'));
const errors = [];
for (const [id, text] of Object.entries(notes)) {
  if (!ids.has(id)) errors.push(`${id}: not a card`);
  if (typeof text !== 'string' || !text.trim()) {
    errors.push(`${id}: empty`);
    continue;
  }
  const n = text.trim().split(/\s+/).length;
  if (n < 10 || n > 80) errors.push(`${id}: ${n} words`);
  if (/\n/.test(text)) errors.push(`${id}: has line breaks`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} explanation problem(s):\n  ${errors.slice(0, 50).join('\n  ')}`);
  process.exit(1);
}
const have = Object.keys(notes).length;
console.log(`✓ ${have} explanations look good${have < ids.size ? ` (${ids.size - have} cards still use "how it feels")` : ''}`);
