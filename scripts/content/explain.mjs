// Writes a short plain-English explanation for every card into src/data/explanations.json (keyed by card id).
// It's what the card back and card page show under "Explained": two or three simple sentences on what the term is
// really about, when people use it, and one useful extra. Kept apart from the deck files so regenerating decks never loses it.
//
// Key: set MINIMAX_API_KEY, or put `MINIMAX_API_KEY=...` in .env.local at the project root (gitignored).
//   node scripts/content/explain.mjs                  # every card without an explanation; resumes where it stopped
//   node scripts/content/explain.mjs --limit 20       # just the next 20, to check quality first
//   node scripts/content/explain.mjs --ids candid,feasible --force   # redo these
//   node scripts/content/explain.mjs --dry-run        # print the first prompt, call nothing
//
// Options: --batch N (cards per request, default 10), --concurrency N (requests in flight, default 6).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'src/data/explanations.json');

// ---------- key ----------
function loadKey() {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  const env = join(ROOT, '.env.local');
  if (!existsSync(env)) return undefined;
  const line = readFileSync(env, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith('MINIMAX_API_KEY='));
  return line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
}

const BASE = process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1';
const MODEL = process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7-highspeed';
const KEY = loadKey();

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const LIMIT = Number(flag('limit', Infinity));
const BATCH = Number(flag('batch', 10));
const CONCURRENCY = Number(flag('concurrency', 6));
const FORCE = !!flag('force', false);
const DRY = !!flag('dry-run', false);
const ONLY = typeof flag('ids', '') === 'string' && flag('ids', '') ? new Set(String(flag('ids')).split(',')) : null;

// ---------- cards ----------
const cards = [];
for (const dir of ['src/data/decks', 'src/data/decks/generated']) {
  for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.json')).sort()) {
    cards.push(...JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8')).cards);
  }
}
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const todo = cards.filter((c) => (ONLY ? ONLY.has(c.id) : true) && (FORCE || !done[c.id])).slice(0, LIMIT);

// ---------- prompt ----------
const SYSTEM = `You write the "Explained" note on vocabulary flashcards for English learners.
For each term you get its meaning, how it feels and, for idioms, the literal picture. Explain it the way you would
to a friend, in simple words:
- 2 or 3 short sentences, 30 to 50 words in total.
- Simple, common words only (A2-B1 level). Short sentences. No jargon, no fancy words.
- Say what it is really about in plain terms, when and why people use it, and one useful extra: a word it is often
  confused with, a common word it goes with, or (for idioms) how the literal picture leads to the meaning.
- Start with the idea itself. Never start with "This means", "This word" or "This phrase"; vary how you begin.
- Don't copy the meaning or the feel line; say it in your own simpler way.
- No example sentences, no quotation marks around the term, no lists, no emoji.
- Never describe a picture, cartoon or illustration.
Reply with JSON only: {"items":[{"id":"<id>","explanation":"<text>"}]}, one item per input, same ids.`;

const userPrompt = (batch) =>
  JSON.stringify(
    batch.map((c) => ({
      id: c.id,
      term: c.term,
      kind: c.kind,
      pos: c.pos,
      meaning: c.meaning,
      feel: c.nuance,
      ...(c.literal ? { literal: c.literal } : {}),
    })),
    null,
    1,
  );

// ---------- checks ----------
const words = (s) => s.trim().split(/\s+/).length;
function problems(card, text) {
  const out = [];
  if (typeof text !== 'string' || !text.trim()) return ['empty'];
  const n = words(text);
  if (n < 22 || n > 62) out.push(`${n} words (want 30-50)`);
  if (/^this (means|word|phrase|idiom)\b/i.test(text.trim())) out.push('starts with "This means"');
  // "the image of breaking ice" is fine for an idiom; describing the card's cartoon is not.
  if (/\b(cartoon|illustration|drawing)\b|\bin the (picture|image)\b|\b(picture|image) shows\b/i.test(text)) out.push('describes a picture');
  if (text.trim().toLowerCase() === card.meaning.trim().toLowerCase()) out.push('repeats the meaning');
  if (/[•\n]/.test(text)) out.push('not plain prose');
  return out;
}

// ---------- model ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askJson(user) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
          temperature: 0.4,
          max_completion_tokens: 4000,
          reasoning_split: true, // keep the model's thinking out of `content`
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      if (attempt === 5) throw e;
      await sleep(2000 * (attempt + 1));
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

// Written after every batch, sorted by id, so an interrupted run loses nothing and diffs stay readable.
function save() {
  const sorted = Object.fromEntries(Object.keys(done).sort().map((k) => [k, done[k]]));
  writeFileSync(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
}

// ---------- run ----------
const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

if (DRY) {
  console.log(`${todo.length} cards to explain in ${batches.length} requests (${MODEL}).\n\nSYSTEM:\n${SYSTEM}\n\nUSER:\n${batches[0] ? userPrompt(batches[0]) : '(nothing to do)'}`);
  process.exit(0);
}
if (!KEY) {
  console.error('No key. Put MINIMAX_API_KEY=... in .env.local (gitignored) or export it, then rerun.');
  process.exit(1);
}
if (!todo.length) {
  console.log('Every card already has an explanation. Use --force to redo.');
  process.exit(0);
}

console.log(`Explaining ${todo.length} cards in ${batches.length} requests with ${MODEL}…`);
let written = 0;
let failed = 0;
const retry = [];

async function runBatch(batch) {
  const reply = await askJson(userPrompt(batch));
  const byId = new Map((reply.items ?? []).map((x) => [x.id, x.explanation]));
  for (const card of batch) {
    const text = typeof byId.get(card.id) === 'string' ? byId.get(card.id).trim().replace(/\s+/g, ' ') : '';
    const issues = problems(card, text);
    if (issues.length) retry.push({ card, issues });
    else {
      done[card.id] = text;
      written++;
    }
  }
  save();
}

await pool(batches, CONCURRENCY, async (batch, i) => {
  try {
    await runBatch(batch);
  } catch (e) {
    retry.push(...batch.map((card) => ({ card, issues: [String(e.message ?? e).slice(0, 120)] })));
  }
  if ((i + 1) % 10 === 0 || i === batches.length - 1) console.log(`  ${i + 1}/${batches.length} requests · ${written} written`);
});

// One more pass for anything that failed a check, one card at a time with the reason attached.
if (retry.length) {
  console.log(`Retrying ${retry.length} that didn't pass…`);
  const again = retry.splice(0);
  await pool(again, CONCURRENCY, async ({ card }) => {
    try {
      await runBatch([card]);
    } catch {
      failed++;
    }
  });
  failed += retry.length;
  for (const { card, issues } of retry) console.log(`  ✗ ${card.id}: ${issues.join(', ')}`);
}

console.log(`Done: ${written} written, ${failed} still missing (rerun to try them again). → src/data/explanations.json`);
