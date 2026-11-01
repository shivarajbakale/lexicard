#!/usr/bin/env node
// Generates pronunciation + example audio for every card with Kokoro-82M, locally.
//
//   node scripts/generate-audio.mjs --dry-run            # what would be generated
//   node scripts/generate-audio.mjs                      # generate missing/changed clips
//   node scripts/generate-audio.mjs --only candid,nuance --slots term,work
//   node scripts/generate-audio.mjs --force --only delegate
//   node scripts/generate-audio.mjs --voice michael        # just one of the voices in audio.config.json
//   node scripts/generate-audio.mjs --verify             # transcribe each new clip and flag mismatches
//
// Kokoro-82M (https://huggingface.co/hexgrad/Kokoro-82M) is Apache-2.0, so the clips can be used freely.
// It runs through scripts/kokoro_tts.py in the .venv-kokoro virtualenv (see README → Audio for setup).
// Every clip is rendered once per voice in audio.config.json (the app lets people pick one);
// per-slot speaking speed and MP3 bitrate live there too. Files: assets/audio/<voice>/<card>/<slot>.mp3
//
// Only clips whose text/voice/speed changed are regenerated (tracked in src/data/audio-manifest.json).
// Afterwards src/data/audio.ts is rewritten so the app can require() each clip.

import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

const CONFIG = JSON.parse(readFileSync('audio.config.json', 'utf8'));
const MANIFEST_PATH = 'src/data/audio-manifest.json';
const INDEX_PATH = 'src/data/audio.ts';
const OUT_DIR = 'assets/audio';
const TMP_DIR = 'audio-work/tmp';
const PYTHON = '.venv-kokoro/bin/python';
export const SLOTS = ['term', 'meaning', 'work', 'social', 'writing'];

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const voiceKeys = opt('voice')?.split(',').map((s) => s.trim()) ?? Object.keys(CONFIG.voices);
for (const v of voiceKeys) if (!CONFIG.voices[v]) fail(`Unknown voice "${v}" (audio.config.json has: ${Object.keys(CONFIG.voices).join(', ')})`);
const only = opt('only')?.split(',').map((s) => s.trim());
const slots = opt('slots')?.split(',').map((s) => s.trim()) ?? SLOTS;
const dryRun = flag('dry-run');
const force = flag('force');
const verify = flag('verify');


// ---------- collect clips ----------
const decks = readdirSync('src/data/decks')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join('src/data/decks', f), 'utf8')));

const clips = [];
for (const deck of decks) {
  for (const card of deck.cards) {
    if (only && !only.includes(card.id)) continue;
    const texts = {
      term: CONFIG.spokenAs?.[card.id] ?? card.term,
      meaning: card.meaning,
      work: card.uses.find((u) => u.setting === 'work')?.sentence,
      social: card.uses.find((u) => u.setting === 'social')?.sentence,
      writing: card.uses.find((u) => u.setting === 'writing')?.sentence,
    };
    for (const voice of voiceKeys) {
      const { id: voiceId, lang } = CONFIG.voices[voice];
      for (const slot of slots) {
        const text = texts[slot];
        if (!text) continue;
        const speed = CONFIG.speed[slot] ?? 1;
        const hash = sha1(JSON.stringify({ engine: 'kokoro', text, voiceId, lang, speed, bitrate: CONFIG.bitrate }));
        // `expect` is what a listener should hear: the real term, not its respelling in spokenAs.
        const expect = slot === 'term' ? card.term : text;
        clips.push({ voice, voiceId, lang, cardId: card.id, slot, text, expect, speed, hash, file: `${OUT_DIR}/${voice}/${card.id}/${slot}.mp3` });
      }
    }
  }
}

const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : {};
const todo = clips.filter((c) => force || manifest[c.voice]?.[c.cardId]?.[c.slot]?.hash !== c.hash || !existsSync(c.file));
const chars = todo.reduce((n, c) => n + c.text.length, 0);

console.log(`Kokoro voices ${voiceKeys.join(', ')} · ${clips.length} clips in scope · ${todo.length} to generate · ${chars} characters`);
if (dryRun) {
  for (const c of todo.slice(0, 20)) console.log(`  ${c.voice}/${c.cardId}/${c.slot}: ${c.text.slice(0, 70)}`);
  if (todo.length > 20) console.log(`  … and ${todo.length - 20} more`);
  process.exit(0);
}

// ---------- preflight ----------
if (!existsSync(PYTHON)) fail('Kokoro virtualenv missing. See README → Audio for the one-time setup.');
if (spawnSync('ffmpeg', ['-version']).error) fail('ffmpeg not found. Install with: brew install ffmpeg');
if (verify && spawnSync('speech', ['--help']).error) fail('--verify needs the `speech` CLI for transcription: brew install speech');
mkdirSync(TMP_DIR, { recursive: true });

// ---------- generate ----------
// One Python process renders every clip (the model loads once) and reports each finished WAV on stdout.
const flagged = [];
let done = 0;
const started = Date.now();
const byRaw = new Map(todo.map((c) => [join(TMP_DIR, `${c.voice}-${c.cardId}-${c.slot}.wav`), c]));
const tts = spawn(PYTHON, ['scripts/kokoro_tts.py'], { stdio: ['pipe', 'pipe', 'inherit'] });
tts.stdin.end(
  JSON.stringify({
    jobs: [...byRaw].map(([out, c]) => ({ text: c.text, voice: c.voiceId, lang: c.lang, speed: c.speed, out })),
  }),
);
for await (const line of createInterface({ input: tts.stdout })) {
  let result;
  try {
    result = JSON.parse(line);
  } catch {
    continue; // stray library output
  }
  const clip = byRaw.get(result.out);
  if (!clip) continue;
  try {
    if (!result.ok) throw new Error(result.error);
    mkdirSync(dirname(clip.file), { recursive: true });
    encode(result.out, clip.file);
  } catch (e) {
    console.error(`✗ ${clip.voice}/${clip.cardId}/${clip.slot}: ${e.message}`);
    flagged.push({ ...clip, reason: `failed: ${e.message}` });
    continue;
  } finally {
    rmSync(result.out, { force: true });
  }

  if (verify) {
    const heard = transcribe(clip.file);
    const score = overlap(clip.expect, heard);
    if (score < 0.8) flagged.push({ ...clip, reason: `transcript match ${(score * 100).toFixed(0)}%: "${heard}"` });
  }

  manifest[clip.voice] ??= {};
  manifest[clip.voice][clip.cardId] ??= {};
  manifest[clip.voice][clip.cardId][clip.slot] = { hash: clip.hash };
  writeFileSync(MANIFEST_PATH, JSON.stringify(sortManifest(manifest), null, 2) + '\n'); // save as we go: safe to interrupt
  done++;
  const avg = (Date.now() - started) / done;
  const eta = Math.round((avg * (todo.length - done)) / 60000);
  console.log(`✓ ${done}/${todo.length} ${clip.voice}/${clip.cardId}/${clip.slot} (~${eta} min left)`);
}
const code = await new Promise((r) => (tts.exitCode !== null ? r(tts.exitCode) : tts.on('close', r)));
if (code !== 0) console.error(`✗ kokoro_tts.py exited with code ${code}`);

writeIndex();
if (flagged.length) {
  writeFileSync('audio-work/flagged.json', JSON.stringify(flagged, null, 2));
  console.log(`\n⚠ ${flagged.length} clip(s) need a listen — see audio-work/flagged.json`);
  for (const f of flagged) console.log(`  ${f.voice}/${f.cardId}/${f.slot}: ${f.reason}`);
}
console.log(`\nDone: ${done} generated. Index written to ${INDEX_PATH}.`);

// ---------- audio helpers ----------
function encode(input, output) {
  // Trim leading/trailing silence, add a short tail, even out loudness, mono 24 kHz MP3 (bitrate from audio.config.json).
  const filter = [
    'silenceremove=start_periods=1:start_threshold=-50dB',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-50dB',
    'areverse',
    'apad=pad_dur=0.12',
    'loudnorm=I=-18:TP=-1.5:LRA=11',
  ].join(',');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-af', filter, '-ac', '1', '-ar', '24000', '-b:a', `${CONFIG.bitrate}k`, output]);
}

function transcribe(file) {
  const res = spawnSync('speech', ['transcribe', file], { encoding: 'utf8' });
  const m = /Result:\s*(.*)/.exec(res.stdout || '');
  return m ? m[1].trim() : '';
}

function overlap(expected, heard) {
  // Normalise curly apostrophes; ignore digits (the ASR writes "12" as "twelve" and vice versa).
  const words = (s) =>
    s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' ]/g, ' ').split(/\s+/).filter((w) => w && w !== "'");
  const want = words(expected);
  const got = new Set(words(heard));
  return want.length ? want.filter((w) => got.has(w)).length / want.length : 1;
}

// ---------- index for the app ----------
function writeIndex() {
  const blocks = [];
  for (const voice of Object.keys(CONFIG.voices)) {
    const lines = [];
    for (const id of Object.keys(manifest[voice] ?? {}).sort()) {
      const entries = SLOTS.filter((s) => manifest[voice][id][s] && existsSync(`${OUT_DIR}/${voice}/${id}/${s}.mp3`)).map(
        (s) => `${s}: require('../../assets/audio/${voice}/${id}/${s}.mp3')`,
      );
      if (entries.length) lines.push(`    '${id}': { ${entries.join(', ')} },`);
    }
    blocks.push(`  ${voice}: {\n${lines.join('\n')}\n  },`);
  }
  writeFileSync(
    INDEX_PATH,
    `// Generated by scripts/generate-audio.mjs — do not edit by hand.
import type { AudioSlot } from '../lib/audio';

/** voice -> card id -> slot -> bundled asset */
export const audioClips: Record<string, Record<string, Partial<Record<AudioSlot, number>>>> = {
${blocks.join('\n')}
};
`,
  );
}

// ---------- utils ----------
function sha1(s) {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}
function sortManifest(m) {
  return Object.fromEntries(Object.keys(m).sort().map((v) => [v, sortKeys(m[v])]));
}
function sortKeys(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
