// Content pipeline: turn word / idiom / phrase lists into validated Lexicard cards with MiniMax.
//
// Set your key first (never commit it):
//   export MINIMAX_API_KEY=...            # required for rank / cards
//   export MINIMAX_MODEL=MiniMax-M2.7-highspeed   # optional, this is the default
//   export MINIMAX_BASE_URL=https://api.minimax.io/v1   # optional
//
// One command does everything, start to finish, and can be rerun to resume after a failure:
//   npm run content -- --pdf ~/Downloads/book.pdf [--words 1000] [--idioms 500] [--phrases 500]
//
// Or step by step (each one resumes where it stopped; results are cached under content/):
//   node scripts/content/generate.mjs pick-words            # headwords from content/source/pdf-headwords.json
//   node scripts/content/generate.mjs top-up --words 1000   # model suggests more words if the book gave fewer
//   node scripts/content/generate.mjs rank --kind idiom --top 500
//   node scripts/content/generate.mjs rank --kind phrase --top 500
//   node scripts/content/generate.mjs cards --kind word  [--limit 20] [--concurrency 8] [--dry-run]
//   node scripts/content/generate.mjs cards --kind idiom
//   node scripts/content/generate.mjs cards --kind phrase
//   node scripts/content/generate.mjs decks                 # writes src/data/decks/generated/* + src/data/generated.ts
//   npm run check:decks
//
// Every definition, example and origin note is written fresh by the model. Only headwords come from the
// source lists. Origins are asked to be honest about confidence, but they are model output: spot-check them.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { slugify, validateCard } from '../lib/validate-card.mjs';

const BASE = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1';
const MODEL = process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7-highspeed';
const KEY = process.env.MINIMAX_API_KEY;

const SRC = 'content/source';
const CACHE = 'content/cache';
const DECKS_DIR = 'src/data/decks';
const GEN_DIR = 'src/data/decks/generated';
const DECK_SIZE = 25;

const TOPICS = {
  word: [
    'Thinking & reasoning',
    'Character & behaviour',
    'Feelings & attitudes',
    'Speech & persuasion',
    'Work & ambition',
    'Power & conflict',
    'Change & time',
    'Size, amount & degree',
    'Praise & criticism',
    'Society & people',
    'Truth & deception',
    'Body, health & nature',
  ],
  idiom: ['At work', 'Conflict & disagreement', 'Money & effort', 'Feelings', 'Success & failure', 'Time & pace', 'Talking & honesty', 'Relationships', 'Risk & luck', 'Everyday life'],
  phrase: ['Meetings & teamwork', 'Agreeing & disagreeing', 'Asking & offering', 'Reacting', 'Small talk', 'Writing & email', 'Feelings', 'Everyday life'],
};

// ---------- args ----------
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = rest[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};

// ---------- io ----------
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJson = (p, v) => {
  mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** Ids already used by hand-written decks, so generated content never duplicates them. */
function existingIds() {
  const ids = new Set();
  for (const f of readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'))) {
    for (const c of readJson(join(DECKS_DIR, f), { cards: [] }).cards) ids.add(c.id);
  }
  return ids;
}

/** One hand-written card of each kind, used as the style example in prompts. */
function exampleCard(kind) {
  for (const f of readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'))) {
    const deck = readJson(join(DECKS_DIR, f));
    if (deck.kind === kind) {
      const { id, ...card } = deck.cards[0];
      return card;
    }
  }
  return null;
}

// ---------- model ----------
function requireKey() {
  if (!KEY) {
    console.error('Set MINIMAX_API_KEY first: export MINIMAX_API_KEY=...');
    process.exit(1);
  }
}

/** Chat completion returning parsed JSON. Retries rate limits and server errors with backoff. */
async function askJson(system, user, { maxTokens = 6000 } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.4,
          max_completion_tokens: maxTokens,
          reasoning_split: true, // keep the model's thinking out of `content`
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      await sleep(2000 * (attempt + 1));
      if (attempt === 5) throw e;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(Math.min(60_000, 2000 * 2 ** attempt));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`MiniMax HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const text = String(body.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error(`no JSON in response: ${text.slice(0, 200)}`);
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error('MiniMax: too many retries');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` over `items` with at most `n` in flight. */
async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

// ---------- pick-words ----------
function pickWords(limit = Number(flag('limit', 1000))) {
  const src = readJson(join(SRC, 'pdf-headwords.json'));
  if (!src) {
    console.error('No content/source/pdf-headwords.json. Run:\n  uv run --with pypdf scripts/content/extract-pdf-words.py path/to/book.pdf');
    process.exit(1);
  }
  const taken = existingIds();
  const words = src.words.filter((w) => !taken.has(slugify(w))).slice(0, limit);
  writeJson(join(SRC, 'picked-words.json'), { source: src.source, terms: words });
  // Multi-word entries from the book join the idiom candidates.
  if (src.idioms?.length) writeJson(join(SRC, 'book-idioms.json'), { source: src.source, terms: src.idioms });
  console.log(`${words.length} words picked -> ${SRC}/picked-words.json` + (src.idioms?.length ? `; ${src.idioms.length} book idioms kept for ranking` : ''));
}

// ---------- top up ----------
/** If the book gave fewer words than wanted, ask the model for more at the same level (never repeats). */
async function topUpWords(target) {
  const file = join(SRC, 'picked-words.json');
  const picked = readJson(file);
  if (!picked || picked.terms.length >= target) return;
  requireKey();
  const have = new Set([...picked.terms, ...existingIds()].map((t) => slugify(t)));
  const extra = [];
  for (let round = 0; round < 6 && picked.terms.length + extra.length < target; round++) {
    const need = target - picked.terms.length - extra.length;
    const sample = picked.terms.filter((_, i) => i % Math.max(1, Math.floor(picked.terms.length / 60)) === 0).slice(0, 60);
    const out = await askJson(
      'You curate vocabulary for adults preparing for exams like the SAT and GRE who also want to sound sharper at work. Reply with JSON only.',
      `Here is a sample of words already in the list: ${JSON.stringify(sample)}.\nSuggest ${Math.min(need + 20, 150)} more single English words at the same level: useful in real life, not obscure, not already in the list, no proper nouns. Reply as {"words": ["..."]}.`,
      { maxTokens: 4000 },
    );
    for (const w of out.words ?? []) {
      const clean = String(w).trim().toLowerCase();
      if (/^[a-z][a-z-]+$/.test(clean) && !have.has(slugify(clean))) {
        have.add(slugify(clean));
        extra.push(clean);
      }
    }
  }
  const added = extra.slice(0, target - picked.terms.length);
  picked.terms = [...picked.terms, ...added];
  picked.topUp = added.length;
  writeJson(file, picked);
  console.log(`  topped up with ${added.length} model-suggested words -> ${picked.terms.length} total`);
}

// ---------- rank ----------
const RANK_SYSTEM = `You curate content for a vocabulary app for adult professionals who want to sound sharper at work and in everyday life.
Score each English expression from 0 to 10 for how worth teaching it is:
10 = a figurative expression almost every adult hears at work or socially every week ("on the same page", "cut corners");
7-9 = very common and clearly useful; 4-6 = known and usable but less frequent; 1-3 = rare, dated, regional or niche.
Score 0 when it is vulgar, crude, sexual or offensive (even mildly, like "raise hell" or "bust one's butt"), slang-only,
a proper noun, or not really an idiom or set phrase (its meaning is just the sum of its words, like "master plan").
Reply with JSON only: {"scores": {"<expression exactly as given>": <0-10>, ...}} covering every item.`;

async function rank(kind = flag('kind'), top = Number(flag('top', 500))) {
  requireKey();
  if (kind !== 'idiom' && kind !== 'phrase') throw new Error('--kind idiom|phrase');
  const lists = [readJson(join(SRC, `wiktionary-${kind}s.json`), { terms: [] }).terms];
  if (kind === 'idiom') lists.unshift(readJson(join(SRC, 'book-idioms.json'), { terms: [] }).terms);
  const taken = existingIds();
  const terms = [...new Set(lists.flat())].filter((t) => !taken.has(slugify(t)));
  if (!terms.length) throw new Error(`no ${kind} candidates; run scripts/content/fetch-idioms.mjs first`);

  const cacheFile = join(CACHE, `rank10-${kind}.json`);
  const scores = readJson(cacheFile, {});
  const todo = terms.filter((t) => !(t in scores));
  const batches = [];
  for (let i = 0; i < todo.length; i += 150) batches.push(todo.slice(i, i + 150));
  console.log(`${terms.length} ${kind} candidates, ${todo.length} still to score in ${batches.length} batches`);
  let done = 0;
  await pool(batches, Number(flag('concurrency', 6)), async (batch) => {
    try {
      const out = await askJson(RANK_SYSTEM, JSON.stringify(batch), { maxTokens: 8000 });
      for (const t of batch) scores[t] = Number(out.scores?.[t] ?? 0);
      writeJson(cacheFile, scores);
    } catch (e) {
      console.warn(`  batch failed (${e.message.slice(0, 120)}); rerun to retry`);
    }
    process.stdout.write(`\r  scored ${++done}/${batches.length} batches`);
  });
  process.stdout.write('\n');
  // Highest score first; ties go to the shorter, punchier expression.
  const picked = terms.filter((t) => scores[t] >= 5).sort((a, b) => scores[b] - scores[a] || a.length - b.length).slice(0, top);
  writeJson(join(SRC, `picked-${kind}s.json`), { source: 'Wiktionary category titles (CC BY-SA 4.0), ranked by MiniMax', terms: picked });
  console.log(`${picked.length} ${kind}s picked (highest scores first) -> ${SRC}/picked-${kind}s.json`);
}

// ---------- cards ----------
function cardSystem(kind) {
  const ex = exampleCard(kind);
  return `You write cards for Lexicard, a vocabulary app that teaches words, idioms and phrases to adults who want to use them confidently at work, socially and in writing.

Write ONE card as JSON, matching this TypeScript shape exactly (omit optional fields that don't apply):
{
  "term": string,              // the ${kind} as it is normally written
  "pos": string,               // "adjective", "verb", "noun", "idiom", "phrase"...
  "phonetic"?: string,         // IPA between slashes, words only
  "sayIt"?: string,            // sound-it-out respelling (words only), see the rules below
  "hint"?: string,             // idioms/phrases only: a short front-of-card teaser, e.g. "nothing to do with cooking"
  "register": string,          // e.g. "Common at work", "Everyday", "Formal", "Casual"
  "meaning": string,           // one clear sentence
  "nuance": string,            // 1-2 sentences: how it feels and when it fits
  "literal"?: string,          // idioms only: the literal picture
  "uses": [                    // EXACTLY 3, in this order: work, social, writing
    { "setting": "work"|"social"|"writing", "where": "Short scene · situation", "sentence": string, "highlight": string, "tip": string }
  ],
  "origin": { "summary": string, "confidence": "recorded"|"likely"|"myth", "timeline": [{ "when": string, "text": string }] },
  "forms"?: [{ "term": string, "label": string }],   // related words in other parts of speech, e.g. "abhorrence" (noun); never plain -s/-ed/-ing endings
  "similar"?: string[],
  "opposite"?: string,
  "pitfall"?: string,
  "topic": one of ${JSON.stringify(TOPICS[kind])}
}

Rules:
- Write everything yourself in plain modern English. Never reproduce wording from dictionaries, textbooks or test-prep books.
- "highlight" must be copied character-for-character from its "sentence" (the term as it appears there, with the same capitalisation).
- Example sentences sound like real people: specific, natural, under 30 words. No names of real public figures.
- Origins: be honest. "recorded" only when the etymology is well documented in standard dictionaries; "myth" when the popular story is known to be false (say so and give the real one if known); otherwise "likely". Never invent dates, names or citations: when unsure, use a century or period ("1500s", "Old French", "Earlier") for "when". 2-4 timeline steps, oldest first.
- Keep "where" short, like "Team stand-up · scoping a release".
- "sayIt" (words only): hyphenated syllables that an English reader would say correctly at first sight, using
  everyday spellings for sounds (OO as in food, OH, AY, EE, UH, ZH), with the stressed syllable in CAPS.
  Good: "ab-JOOR" (abjure), "uh-BOHD" (abode), "KAN-did" (candid), "ub-HOR-uhnt" (abhorrent). Every syllable must be
  pronounceable on its own; never start one with an impossible cluster like "bj". "phonetic" is standard IPA in slashes.
- "topic" must be copied exactly from the list.
- Reply with the JSON object only.

Style example (a finished ${kind} card):
${JSON.stringify(ex, null, 2)}`;
}

/** Map the model's topic onto the fixed list, forgiving case, "and" vs "&", and British/US spelling. */
function matchTopic(kind, topic) {
  const norm = (t) => String(t ?? '').toLowerCase().replace(/\band\b/g, '&').replace(/behavior/g, 'behaviour').replace(/[^a-z&]+/g, '');
  const want = norm(topic);
  const exact = TOPICS[kind].find((t) => norm(t) === want);
  if (exact) return exact;
  // Otherwise the topic that shares the most words with what the model said.
  const words = new Set(String(topic ?? '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
  let best = TOPICS[kind][TOPICS[kind].length - 1];
  let score = 0;
  for (const t of TOPICS[kind]) {
    const s = t.toLowerCase().split(/[^a-z]+/).filter((w) => words.has(w)).length;
    if (s > score) [best, score] = [t, s];
  }
  return best;
}

/** Small, safe repairs before validation: exact-case highlights and setting order. */
function repair(card) {
  for (const u of card.uses ?? []) {
    if (typeof u.sentence === 'string' && typeof u.highlight === 'string' && !u.sentence.includes(u.highlight)) {
      const i = u.sentence.toLowerCase().indexOf(u.highlight.toLowerCase());
      if (i >= 0) u.highlight = u.sentence.slice(i, i + u.highlight.length);
    }
  }
  if (Array.isArray(card.uses) && card.uses.length === 3) {
    const order = ['work', 'social', 'writing'];
    card.uses.sort((a, b) => order.indexOf(a.setting) - order.indexOf(b.setting));
  }
  return card;
}

const ALLOWED = ['term', 'pos', 'phonetic', 'sayIt', 'hint', 'register', 'meaning', 'nuance', 'literal', 'uses', 'origin', 'forms', 'similar', 'opposite', 'pitfall', 'topic'];

async function makeCard(kind, term, system) {
  let feedback = '';
  let last = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await askJson(system, `Write the card for the ${kind}: "${term}".${feedback}`);
    const card = { id: slugify(term), kind };
    for (const k of ALLOWED) if (raw[k] !== undefined) card[k] = raw[k];
    if (kind !== 'word') {
      delete card.phonetic;
      delete card.sayIt;
    }
    card.topic = matchTopic(kind, card.topic);
    repair(card);
    last = validateCard(card);
    if (typeof raw.topic !== 'string' || !raw.topic.trim()) last.push(`topic missing: pick one of ${TOPICS[kind].join(' / ')}`);
    if (!last.length) return card;
    feedback = `\n\nYour previous attempt had these problems; fix all of them:\n- ${last.join('\n- ')}`;
  }
  throw new Error(last.join('; '));
}

async function cards(kind = flag('kind'), limitArg = flag('limit')) {
  if (!['word', 'idiom', 'phrase'].includes(kind)) throw new Error('--kind word|idiom|phrase');
  const picked = readJson(join(SRC, `picked-${kind}s.json`));
  if (!picked) throw new Error(`no ${SRC}/picked-${kind}s.json; run ${kind === 'word' ? 'pick-words' : `rank --kind ${kind}`} first`);
  const system = cardSystem(kind);
  if (flag('dry-run')) {
    console.log(`--- system prompt (${MODEL}) ---\n${system}\n--- first user message ---\nWrite the card for the ${kind}: "${picked.terms[0]}".`);
    return;
  }
  requireKey();
  const dir = join(CACHE, kind);
  mkdirSync(dir, { recursive: true });
  const limit = Number(limitArg ?? picked.terms.length);
  const todo = picked.terms.slice(0, limit).filter((t) => !existsSync(join(dir, `${slugify(t)}.json`)));
  const failedFile = join(CACHE, `failed-${kind}.json`);
  const failed = {};
  let ok = 0;
  let n = 0;
  console.log(`${kind}: ${todo.length} cards to write with ${MODEL}`);
  await pool(todo, Number(flag('concurrency', 8)), async (term) => {
    try {
      const card = await makeCard(kind, term, system);
      writeJson(join(dir, `${card.id}.json`), card);
      ok++;
    } catch (e) {
      failed[term] = e.message.slice(0, 300);
    }
    process.stdout.write(`\r  ${++n}/${todo.length} done, ${ok} ok, ${Object.keys(failed).length} failed`);
  });
  process.stdout.write('\n');
  writeJson(failedFile, failed);
  if (Object.keys(failed).length) console.log(`  failures saved to ${failedFile}; rerun the same command to retry them`);
}

// ---------- decks ----------
function decks() {
  const taken = existingIds();
  rmSync(GEN_DIR, { recursive: true, force: true });
  mkdirSync(GEN_DIR, { recursive: true });
  const files = [];
  for (const kind of ['word', 'idiom', 'phrase']) {
    const dir = join(CACHE, kind);
    if (!existsSync(dir)) continue;
    const all = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson(join(dir, f)))
      .filter((c) => !taken.has(c.id) && !validateCard(c).length);
    for (const topic of TOPICS[kind]) {
      const group = all.filter((c) => c.topic === topic).sort((a, b) => a.term.localeCompare(b.term));
      for (let i = 0; i < group.length; i += DECK_SIZE) {
        const part = Math.floor(i / DECK_SIZE) + 1;
        const many = group.length > DECK_SIZE;
        const cardsIn = group.slice(i, i + DECK_SIZE).map(({ topic: _t, ...c }) => c);
        const id = `${kind}s-${slugify(topic)}${many ? `-${part}` : ''}`;
        const deck = {
          id,
          kind,
          name: `${topic}${many ? ` · ${part}` : ''}`,
          blurb: `${cardsIn.length} ${kind}s about ${topic.toLowerCase()}`,
          cards: cardsIn,
        };
        writeJson(join(GEN_DIR, `${id}.json`), deck);
        files.push(id);
      }
    }
  }
  const imports = files.map((id, i) => `import d${i} from './decks/generated/${id}.json';`).join('\n');
  writeFileSync(
    'src/data/generated.ts',
    `// Generated by scripts/content/generate.mjs (decks). Do not edit by hand.\nimport type { Deck } from '../lib/types';\n${imports}\n\nexport const generatedDecks: Deck[] = [${files.map((_, i) => `d${i}`).join(', ')}] as Deck[];\n`,
  );
  console.log(`${files.length} generated decks -> ${GEN_DIR}, src/data/generated.ts`);
}

// ---------- all ----------
function run(label, command, args) {
  console.log(`\n== ${label}`);
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status ?? r.error?.message})`);
}

/** The whole job in one go. Safe to rerun: every step skips work that is already cached. */
async function all() {
  requireKey();
  const pdf = flag('pdf');
  const words = Number(flag('words', 1000));
  const idioms = Number(flag('idioms', 500));
  const phrases = Number(flag('phrases', 500));
  console.log(`Model ${MODEL}. Target: ${words} words, ${idioms} idioms, ${phrases} phrases.`);
  if (!existsSync(join(SRC, 'pdf-headwords.json'))) {
    if (typeof pdf !== 'string') throw new Error('first run needs --pdf path/to/book.pdf');
    run('Reading headwords from the PDF', 'uv', ['run', '--with', 'pypdf', 'scripts/content/extract-pdf-words.py', pdf]);
  }
  if (!existsSync(join(SRC, 'wiktionary-idioms.json')) || !existsSync(join(SRC, 'wiktionary-phrases.json'))) {
    run('Fetching idiom and phrase lists from Wiktionary', 'node', ['scripts/content/fetch-idioms.mjs']);
  }
  console.log('\n== Picking words');
  pickWords(words);
  await topUpWords(words);
  console.log('\n== Ranking idioms');
  await rank('idiom', idioms);
  console.log('\n== Ranking phrases');
  await rank('phrase', phrases);
  for (const kind of ['word', 'idiom', 'phrase']) {
    console.log(`\n== Writing ${kind} cards`);
    await cards(kind);
  }
  console.log('\n== Building decks');
  decks();
  run('Checking every card', 'node', ['scripts/check-decks.mjs']);
  console.log('\nDone. Next: npm run web to look at the new decks, then node scripts/generate-audio.mjs for audio.');
}

// ---------- main ----------
const COMMANDS = { 'pick-words': () => pickWords(), 'top-up': () => topUpWords(Number(flag('words', 1000))), rank: () => rank(), cards: () => cards(), decks, all };
if (!COMMANDS[cmd]) {
  console.log('usage: node scripts/content/generate.mjs <all|pick-words|top-up|rank|cards|decks> [--pdf book.pdf] [--kind word|idiom|phrase] [--top N] [--limit N] [--concurrency N] [--dry-run]');
  process.exit(cmd ? 1 : 0);
}
await COMMANDS[cmd]();
