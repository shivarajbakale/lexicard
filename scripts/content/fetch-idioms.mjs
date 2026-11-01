// Fetch the titles of English idioms and phrases from Wiktionary's category lists.
//
//   node scripts/content/fetch-idioms.mjs
//
// Only the entry titles are kept (e.g. "break the ice"); no definitions or other page text.
// Wiktionary is CC BY-SA 4.0, so the source is recorded in each output file anyway.
// Writes content/source/wiktionary-idioms.json and content/source/wiktionary-phrases.json.

import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://en.wiktionary.org/w/api.php';
const UA = 'lexicard-content-script/1.0 (https://github.com/shivarajbakale/lexicard)';
const SOURCES = [
  { kind: 'idiom', category: 'Category:English idioms', out: 'content/source/wiktionary-idioms.json' },
  { kind: 'phrase', category: 'Category:English phrases', out: 'content/source/wiktionary-phrases.json' },
];

/** Everyday multi-word entries only: 2 to 7 words, plain letters, no proper nouns or symbols. */
function keep(title) {
  if (!/^[a-zA-Z' ,!?-]+$/.test(title)) return false;
  const words = title.split(/\s+/);
  if (words.length < 2 || words.length > 7) return false;
  // Capitals mean a proper noun or a title, except the pronoun "I" and a capitalised first word.
  if (words.slice(1).some((w) => /[A-Z]/.test(w) && w !== 'I')) return false;
  return true;
}

async function titles(category) {
  const out = [];
  let cont = {};
  for (;;) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: category,
      cmnamespace: '0',
      cmlimit: '500',
      format: 'json',
      ...cont,
    });
    const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${category}: HTTP ${res.status}`);
    const data = await res.json();
    for (const m of data.query.categorymembers) out.push(m.title);
    if (!data.continue) break;
    cont = data.continue;
    await new Promise((r) => setTimeout(r, 250)); // be polite to the API
  }
  return out;
}

mkdirSync('content/source', { recursive: true });
for (const s of SOURCES) {
  const all = await titles(s.category);
  const kept = [...new Set(all.filter(keep).map((t) => t.trim()))].sort((a, b) => a.localeCompare(b));
  writeFileSync(
    s.out,
    JSON.stringify(
      {
        source: `Wiktionary, ${s.category} (https://en.wiktionary.org/wiki/${s.category.replace(/ /g, '_')})`,
        license: 'CC BY-SA 4.0 (titles only are used)',
        fetchedAt: new Date().toISOString(),
        kind: s.kind,
        terms: kept,
      },
      null,
      2,
    ),
  );
  console.log(`${s.category}: ${all.length} entries, ${kept.length} kept -> ${s.out}`);
}
