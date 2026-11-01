// Leitner spaced repetition. Five boxes; knowing a card moves it up a box,
// missing it sends it back to box 1. Higher boxes come back less often.

import type { Card } from './types';

export const BOX_INTERVAL_DAYS = [1, 2, 4, 8, 16] as const; // box 1..5
export const MAX_BOX = 5;
export const NEW_PER_SESSION = 10;
const DAY = 24 * 60 * 60 * 1000;

export interface Review {
  box: number; // 1..5
  /** highest box this card has ever reached; levels count this, so forgetting never costs points */
  bestBox?: number;
  dueAt: number; // epoch ms
  seen: number;
  lastSeen: number;
  lastResult: 'know' | 'learn';
}

export function nextReview(prev: Review | undefined, known: boolean, now = Date.now()): Review {
  const box = known ? Math.min((prev?.box ?? 1) + 1, MAX_BOX) : 1;
  return {
    box,
    bestBox: Math.max(box, prev?.bestBox ?? prev?.box ?? 1),
    dueAt: now + BOX_INTERVAL_DAYS[box - 1] * DAY,
    seen: (prev?.seen ?? 0) + 1,
    lastSeen: now,
    lastResult: known ? 'know' : 'learn',
  };
}

export function isDue(r: Review | undefined, now = Date.now()) {
  return !!r && r.dueAt <= now;
}

/** Due cards first (oldest first), then up to `newLimit` unseen cards. */
export function buildQueue(
  cards: Card[],
  reviews: Record<string, Review>,
  now = Date.now(),
  newLimit = NEW_PER_SESSION,
): string[] {
  const due = cards
    .filter((c) => isDue(reviews[c.id], now))
    .sort((a, b) => reviews[a.id].dueAt - reviews[b.id].dueAt)
    .map((c) => c.id);
  const fresh = cards.filter((c) => !reviews[c.id]).slice(0, newLimit).map((c) => c.id);
  return [...due, ...fresh];
}

/** Practice mode when nothing is due: a shuffled sample of the scope. */
export function practiceQueue(cards: Card[], size = 10): string[] {
  const ids = cards.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, size);
}

export function dayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function relativeDue(dueAt: number, now = Date.now()): string {
  const diff = dueAt - now;
  if (diff <= 0) return 'now';
  const hours = Math.round(diff / (60 * 60 * 1000));
  if (hours < 1) return 'within the hour';
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(diff / DAY);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}
