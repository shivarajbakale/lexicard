// Levels: ten steps from Listener to Lexicon.
//
// Points come only from real progress:
//   - a card's best box ever (spaced repetition sets the pace, forgetting never takes points away)
//   - real-world uses the learner logs (+3 per setting, once per card per setting)
// A level opens when you have its points AND have passed its trial.
// Everything here is pure and derived from stored state, so it works offline with no backend.

import type { Review } from './srs';
import type { Setting } from './types';

export interface UseLog {
  setting: Setting;
  at: number;
}

/** The slice of persisted state levels are computed from. */
export interface LevelInput {
  reviews: Record<string, Review>;
  uses: Record<string, UseLog[]>;
  history: Record<string, number>;
  bestStreak: number;
}

export type Unlock =
  | { kind: 'deck'; deckId: string; label: string }
  | { kind: 'feature'; feature: Feature; label: string };

export type Feature = 'freeze1' | 'freeze2' | 'freeze3' | 'quiz' | 'recap' | 'challenge' | 'ink' | 'stars';

export interface Trial {
  label: string;
  /** progress toward the trial, and the target */
  progress: (s: LevelInput) => { have: number; need: number };
  /** what a "do this next" hint should point at */
  hint?: 'use-work' | 'use-any' | 'use-all-settings' | 'master' | 'review' | 'streak';
}

export interface LevelDef {
  n: number;
  name: string;
  tier: 'Foundation' | 'Fluent' | 'Mastery';
  points: number;
  trial: Trial | null;
  unlocks: Unlock[];
}

export const USE_POINTS = 3;
/** Points for reaching each box for the first time, cumulative: box 5 (mastered) = 10. */
const BOX_POINTS = [0, 0, 1, 3, 6, 10]; // index = best box
export const STAR_EVERY = 150;

function bestBox(r: Review) {
  return Math.max(r.box, r.bestBox ?? r.box);
}

function countBestBox(s: LevelInput, min: number) {
  let n = 0;
  for (const r of Object.values(s.reviews)) if (bestBox(r) >= min) n++;
  return n;
}

function totalUses(s: LevelInput) {
  let n = 0;
  for (const list of Object.values(s.uses)) n += list.length;
  return n;
}

function cardsUsedIn(s: LevelInput, setting: Setting) {
  let n = 0;
  for (const list of Object.values(s.uses)) if (list.some((u) => u.setting === setting)) n++;
  return n;
}

function cardsUsedEverywhere(s: LevelInput) {
  let n = 0;
  for (const list of Object.values(s.uses)) if (new Set(list.map((u) => u.setting)).size >= 3) n++;
  return n;
}

function daysStudied(s: LevelInput) {
  return Object.values(s.history).filter((n) => n > 0).length;
}

const cap = (have: number, need: number) => ({ have: Math.min(have, need), need });

export const LEVELS: LevelDef[] = [
  {
    n: 1,
    name: 'Listener',
    tier: 'Foundation',
    points: 0,
    trial: null,
    unlocks: [],
  },
  {
    n: 2,
    name: 'Learner',
    tier: 'Foundation',
    points: 20,
    trial: { label: 'Study on 3 different days', progress: (s) => cap(daysStudied(s), 3), hint: 'review' },
    unlocks: [{ kind: 'deck', deckId: 'idioms-weekly', label: 'Idioms you’ll hear weekly' }],
  },
  {
    n: 3,
    name: 'Speaker',
    tier: 'Foundation',
    points: 50,
    trial: { label: 'Get 5 cards to Box 3', progress: (s) => cap(countBestBox(s, 3), 5), hint: 'review' },
    unlocks: [{ kind: 'feature', feature: 'freeze1', label: 'Streak freeze' }],
  },
  {
    n: 4,
    name: 'Conversant',
    tier: 'Fluent',
    points: 100,
    trial: { label: 'Log your first real use', progress: (s) => cap(totalUses(s), 1), hint: 'use-any' },
    unlocks: [{ kind: 'deck', deckId: 'polite-pushback', label: 'Polite pushback' }],
  },
  {
    n: 5,
    name: 'Articulate',
    tier: 'Fluent',
    points: 170,
    trial: { label: 'Master 5 cards', progress: (s) => cap(countBestBox(s, 5), 5), hint: 'master' },
    unlocks: [
      { kind: 'deck', deckId: 'idioms-strange-origins', label: 'Idioms with strange origins' },
      { kind: 'feature', feature: 'quiz', label: 'Origin quiz' },
    ],
  },
  {
    n: 6,
    name: 'Persuasive',
    tier: 'Fluent',
    points: 260,
    trial: { label: 'Use 3 different terms at work', progress: (s) => cap(cardsUsedIn(s, 'work'), 3), hint: 'use-work' },
    unlocks: [
      { kind: 'feature', feature: 'freeze2', label: 'A second streak freeze' },
      { kind: 'feature', feature: 'recap', label: 'Weekly recap' },
    ],
  },
  {
    n: 7,
    name: 'Eloquent',
    tier: 'Fluent',
    points: 370,
    trial: { label: 'Keep a 14-day streak', progress: (s) => cap(s.bestStreak, 14), hint: 'streak' },
    unlocks: [{ kind: 'feature', feature: 'challenge', label: 'Challenge mode' }],
  },
  {
    n: 8,
    name: 'Wordsmith',
    tier: 'Mastery',
    points: 500,
    trial: { label: 'Use one term at work, socially and in writing', progress: (s) => cap(cardsUsedEverywhere(s), 1), hint: 'use-all-settings' },
    unlocks: [{ kind: 'feature', feature: 'ink', label: 'Ink card style' }],
  },
  {
    n: 9,
    name: 'Orator',
    tier: 'Mastery',
    points: 650,
    trial: { label: 'Master 40 cards', progress: (s) => cap(countBestBox(s, 5), 40), hint: 'master' },
    unlocks: [{ kind: 'feature', feature: 'freeze3', label: 'A third streak freeze' }],
  },
  {
    n: 10,
    name: 'Lexicon',
    tier: 'Mastery',
    points: 850,
    trial: { label: 'Log 30 real uses', progress: (s) => cap(totalUses(s), 30), hint: 'use-any' },
    unlocks: [{ kind: 'feature', feature: 'stars', label: `A star every ${STAR_EVERY} points from here on` }],
  },
];

export const MAX_LEVEL = LEVELS.length;

export function cardPoints(r: Review | undefined, uses: UseLog[] | undefined) {
  return (r ? BOX_POINTS[Math.min(bestBox(r), 5)] : 0) + (uses?.length ?? 0) * USE_POINTS;
}

export function points(s: LevelInput) {
  let total = 0;
  for (const r of Object.values(s.reviews)) total += BOX_POINTS[Math.min(bestBox(r), 5)];
  return total + totalUses(s) * USE_POINTS;
}

export function trialDone(def: LevelDef, s: LevelInput) {
  if (!def.trial) return true;
  const p = def.trial.progress(s);
  return p.have >= p.need;
}

export interface LevelState {
  points: number;
  /** current level, 1..10 */
  n: number;
  def: LevelDef;
  next: LevelDef | null;
  /** points still needed for the next level (0 when only the trial is left) */
  toNext: number;
  /** 0..1 progress through the points band toward the next level */
  frac: number;
  /** next level's points are in hand; only its trial is left */
  trialReady: boolean;
  /** stars earned after level 10 */
  stars: number;
}

/**
 * Levels never go down: `floor` is the highest level already reached (levelSeen),
 * so an edge case like an undone history entry can't take one away.
 */
export function levelState(s: LevelInput, floor = 1): LevelState {
  const pts = points(s);
  let n = 1;
  for (const def of LEVELS) {
    if (def.n === 1) continue;
    if (pts >= def.points && trialDone(def, s)) n = def.n;
    else break;
  }
  n = Math.max(n, Math.min(floor, MAX_LEVEL));
  const def = LEVELS[n - 1];
  const next = LEVELS[n] ?? null;
  const toNext = next ? Math.max(0, next.points - pts) : 0;
  const band = next ? next.points - def.points : STAR_EVERY;
  const into = next ? pts - def.points : (pts - def.points) % STAR_EVERY;
  const frac = Math.max(0, Math.min(1, into / band));
  const stars = n === MAX_LEVEL ? Math.floor((pts - def.points) / STAR_EVERY) : 0;
  return { points: pts, n, def, next, toNext, frac, trialReady: !!next && toNext === 0, stars };
}

/** Every unlock earned at or below level `n`. */
export function unlocksUpTo(n: number): Unlock[] {
  return LEVELS.filter((l) => l.n <= n).flatMap((l) => l.unlocks);
}

export function hasFeature(n: number, feature: Feature) {
  return unlocksUpTo(n).some((u) => u.kind === 'feature' && u.feature === feature);
}

/** Level at which a deck opens; decks not listed are open from the start. */
export function deckLevel(deckId: string): number {
  for (const l of LEVELS) for (const u of l.unlocks) if (u.kind === 'deck' && u.deckId === deckId) return l.n;
  return 1;
}

/**
 * A deck is open at its level, or if the learner already has history in it
 * (so nobody loses access to cards they were studying before levels existed).
 */
export function deckOpen(deckId: string, cardIds: string[], level: number, reviews: Record<string, Review>) {
  return level >= deckLevel(deckId) || cardIds.some((id) => !!reviews[id]);
}

export function freezeSlots(n: number) {
  return (['freeze1', 'freeze2', 'freeze3'] as Feature[]).filter((f) => hasFeature(n, f)).length;
}
