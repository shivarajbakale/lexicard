// One card's checks, shared by `npm run check:decks` and the content generator.
// Mirrors the schema in src/lib/types.ts.

export const KINDS = ['word', 'idiom', 'phrase'];
export const SETTINGS = ['work', 'social', 'writing'];
export const CONFIDENCE = ['recorded', 'likely', 'myth'];

const str = (v) => typeof v === 'string' && v.trim().length > 0;

/** Kebab-case slug of a term; card ids are always derived this way. */
export function slugify(term) {
  return term
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Returns a list of problems; empty means the card is valid. */
export function validateCard(c) {
  const errors = [];
  const at = (m) => errors.push(m);
  if (!c || typeof c !== 'object') return ['card is not an object'];
  for (const k of ['id', 'term', 'pos', 'register', 'meaning', 'nuance']) if (!str(c[k])) at(`${k} missing`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id ?? '')) at('id must be kebab-case');
  if (!KINDS.includes(c.kind)) at(`kind must be one of ${KINDS.join(', ')}`);
  if (c.kind === 'word' && (!str(c.phonetic) || !str(c.sayIt))) at('words need phonetic + sayIt');
  if (str(c.sayIt) && !/[A-Z]/.test(c.sayIt)) at('sayIt should mark the stressed syllable in CAPS');
  if (!Array.isArray(c.uses) || c.uses.length !== 3) at('needs exactly 3 uses');
  else
    c.uses.forEach((u, i) => {
      if (u?.setting !== SETTINGS[i]) at(`use ${i} setting should be ${SETTINGS[i]}`);
      for (const k of ['where', 'sentence', 'highlight', 'tip']) if (!str(u?.[k])) at(`use ${i} ${k} missing`);
      if (str(u?.sentence) && str(u?.highlight) && !u.sentence.includes(u.highlight)) at(`use ${i} highlight must appear exactly in its sentence`);
    });
  const o = c.origin;
  if (!o || !str(o.summary) || !CONFIDENCE.includes(o.confidence)) at(`origin needs summary + confidence (${CONFIDENCE.join('/')})`);
  else if (!Array.isArray(o.timeline) || o.timeline.length < 1 || o.timeline.some((t) => !str(t?.when) || !str(t?.text))) at('origin.timeline needs 1+ entries with when + text');
  return errors;
}
