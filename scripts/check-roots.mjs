// Validates src/data/breakdowns.json and src/data/roots.json against the decks.
// Types live in src/lib/types.ts (Breakdown, Part, Root).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const DIRS = ['src/data/decks', 'src/data/decks/generated'];
const cards = new Map();
for (const dir of DIRS) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    for (const c of read(join(dir, f)).cards) cards.set(c.id, c);
  }
}

const roots = read('src/data/roots.json');
const breakdowns = read('src/data/breakdowns.json');
const errors = [];
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const ROLES = ['prefix', 'root', 'suffix'];
const CONFIDENCE = ['recorded', 'likely', 'myth'];

const rootsById = new Map();
for (const r of roots) {
  const where = (m) => errors.push(`roots.json ${r.id ?? '?'}: ${m}`);
  if (!str(r.id)) where('id missing');
  if (rootsById.has(r.id)) where('duplicate id');
  rootsById.set(r.id, r);
  for (const k of ['meaning', 'language', 'etymon']) if (!str(r[k])) where(`${k} missing`);
  if (!Array.isArray(r.forms) || !r.forms.length || !r.forms.every(str)) where('forms must be a non-empty list');
  if (!Array.isArray(r.elsewhere)) where('elsewhere must be a list');
}

const users = new Map(); // rootId -> card ids
for (const [id, b] of Object.entries(breakdowns)) {
  const where = (m) => errors.push(`breakdowns.json ${id}: ${m}`);
  const card = cards.get(id);
  if (!card) { where('no card with this id'); continue; }
  if (card.kind !== 'word') where(`card is a ${card.kind}; breakdowns are for words only`);
  if (!Array.isArray(b.parts) || b.parts.length < 2) { where('needs at least 2 parts'); continue; }
  const joined = b.parts.map((p) => p.text).join('');
  if (joined.toLowerCase() !== card.term.toLowerCase()) where(`parts spell "${joined}", term is "${card.term}"`);
  if (!b.parts.some((p) => p.role === 'root')) where('no part has role "root"');
  for (const p of b.parts) {
    if (!str(p.text) || !str(p.gloss)) where('every part needs text and gloss');
    if (!ROLES.includes(p.role)) where(`"${p.text}": role must be one of ${ROLES}`);
    if (p.rootId === undefined) continue;
    const r = rootsById.get(p.rootId);
    if (!r) { where(`"${p.text}": unknown rootId "${p.rootId}"`); continue; }
    if (!r.forms.includes(p.text.toLowerCase())) where(`"${p.text}" is not one of ${p.rootId}'s forms (${r.forms})`);
    users.set(p.rootId, [...(users.get(p.rootId) ?? []), id]);
  }
  if (!str(b.literal)) where('literal missing');
  if (!CONFIDENCE.includes(b.confidence)) where(`confidence must be one of ${CONFIDENCE}`);
  if (!/^https:\/\//.test(b.source ?? '')) where('source must be an https URL');
}

for (const r of roots) {
  for (const l of r.lookalikes ?? []) {
    if ((users.get(r.id) ?? []).includes(l.term.toLowerCase())) errors.push(`roots.json ${r.id}: lookalike "${l.term}" uses this root`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} root problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
const families = [...users.entries()].filter(([, ids]) => new Set(ids).size >= 2).length;
console.log(`✓ ${Object.keys(breakdowns).length} breakdowns, ${roots.length} roots (${families} with 2+ cards) look good`);
