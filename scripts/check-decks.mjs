// Validates every deck in src/data/decks against the schema in src/lib/types.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/data/decks';
const KINDS = ['word', 'idiom', 'phrase'];
const SETTINGS = ['work', 'social', 'writing'];
const CONF = ['recorded', 'likely', 'myth'];
const errors = [];
const ids = new Map();
let count = 0;

const str = (v) => typeof v === 'string' && v.trim().length > 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const where = (m) => errors.push(`${file}: ${m}`);
  let deck;
  try { deck = JSON.parse(readFileSync(join(DIR, file), 'utf8')); } catch (e) { where(`invalid JSON (${e.message})`); continue; }
  for (const k of ['id', 'name', 'blurb']) if (!str(deck[k])) where(`deck.${k} missing`);
  if (!KINDS.includes(deck.kind)) where(`deck.kind must be one of ${KINDS}`);
  if (!Array.isArray(deck.cards) || !deck.cards.length) { where('deck.cards empty'); continue; }
  for (const c of deck.cards) {
    count++;
    const at = (m) => where(`${c.id ?? '?'}: ${m}`);
    for (const k of ['id', 'term', 'pos', 'register', 'meaning', 'nuance']) if (!str(c[k])) at(`${k} missing`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id ?? '')) at('id must be kebab-case');
    if (ids.has(c.id)) at(`duplicate id (also in ${ids.get(c.id)})`); else ids.set(c.id, file);
    if (!KINDS.includes(c.kind)) at('bad kind');
    if (!Array.isArray(c.uses) || c.uses.length !== 3) at('needs exactly 3 uses');
    else c.uses.forEach((u, i) => {
      if (u.setting !== SETTINGS[i]) at(`use ${i} setting should be ${SETTINGS[i]}`);
      for (const k of ['where', 'sentence', 'highlight', 'tip']) if (!str(u[k])) at(`use ${i} ${k} missing`);
      if (str(u.sentence) && str(u.highlight) && !u.sentence.includes(u.highlight)) at(`use ${i} highlight not in sentence`);
    });
    const o = c.origin;
    if (!o || !str(o.summary) || !CONF.includes(o.confidence)) at('origin needs summary + confidence');
    else if (!Array.isArray(o.timeline) || o.timeline.length < 1 || o.timeline.some((t) => !str(t.when) || !str(t.text))) at('origin.timeline invalid');
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ ${count} cards in ${new Set(ids.values()).size} decks look good`);
