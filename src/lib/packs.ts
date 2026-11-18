// Packs: the unit a learner finishes. Everything here is derived from the stored reviews, so pack
// progress needs no extra bookkeeping and works offline.
//
//   locked   the pack before it (in its track) isn't done yet
//   open     can be made current
//   current  the one pack new cards come from
//   done     every card has been known at least once (best box ≥ 2); the next pack opens
//   mastered every card has reached box 5 (shown as a count, not a state)

import pathJson from '../data/path.json';
import { MAX_BOX, type Review } from './srs';
import type { Pack, Track, TrackId, Unit } from './types';

export const tracks: Track[] = (pathJson as { tracks: Track[] }).tracks;
export const trackById = Object.fromEntries(tracks.map((t) => [t.id, t])) as Record<TrackId, Track>;

export interface PackInfo {
  pack: Pack;
  track: Track;
  unit: Unit;
  /** 1-based position of the unit in its track */
  unitNumber: number;
  /** 1-based position of the pack in its track */
  number: number;
  prev: string | null;
  next: string | null;
}

/** Pack ids of each track, in path order. */
export const trackPackIds = {} as Record<TrackId, string[]>;
export const packInfo: Record<string, PackInfo> = {};
export const packOfCard: Record<string, string> = {};

for (const track of tracks) {
  const ids: string[] = [];
  track.units.forEach((unit, u) => {
    for (const pack of unit.packs) {
      ids.push(pack.id);
      packInfo[pack.id] = { pack, track, unit, unitNumber: u + 1, number: ids.length, prev: null, next: null };
      for (const id of pack.cardIds) packOfCard[id] = pack.id;
    }
  });
  ids.forEach((id, i) => {
    packInfo[id].prev = ids[i - 1] ?? null;
    packInfo[id].next = ids[i + 1] ?? null;
  });
  trackPackIds[track.id] = ids;
}

export const allPackIds = tracks.flatMap((t) => trackPackIds[t.id]);
export const firstPack = (track: TrackId) => trackPackIds[track][0];

const best = (r: Review) => Math.max(r.box, r.bestBox ?? r.box);

export interface PackProgress {
  total: number;
  /** known at least once (best box ≥ 2) */
  known: number;
  /** seen but never known yet */
  learning: number;
  /** never seen */
  fresh: number;
  /** reached box 5 */
  mastered: number;
  done: boolean;
  started: boolean;
}

export function packProgress(packId: string, reviews: Record<string, Review>): PackProgress {
  const ids = packInfo[packId]?.pack.cardIds ?? [];
  let known = 0;
  let learning = 0;
  let fresh = 0;
  let mastered = 0;
  for (const id of ids) {
    const r = reviews[id];
    if (!r) fresh++;
    else if (best(r) >= 2) known++;
    else learning++;
    if (r && best(r) >= MAX_BOX) mastered++;
  }
  return { total: ids.length, known, learning, fresh, mastered, done: ids.length > 0 && known === ids.length, started: fresh < ids.length };
}

/** Status of one card inside a pack, for progress bars and lists. */
export type CardStatus = 'new' | 'learning' | 'known' | 'mastered';
export function cardStatus(r: Review | undefined): CardStatus {
  if (!r) return 'new';
  const b = best(r);
  return b >= MAX_BOX ? 'mastered' : b >= 2 ? 'known' : 'learning';
}

export type PackState = 'locked' | 'open' | 'current' | 'done';

/** Open when it's first in its track, the pack before it is done, it's already started, or it's current. */
export function packOpen(packId: string, reviews: Record<string, Review>, current: string | null) {
  const info = packInfo[packId];
  if (!info) return false;
  return !info.prev || packId === current || packProgress(info.prev, reviews).done || packProgress(packId, reviews).started;
}

export function packState(packId: string, reviews: Record<string, Review>, current: string | null): PackState {
  if (packProgress(packId, reviews).done) return 'done';
  if (packId === current) return 'current';
  return packOpen(packId, reviews, current) ? 'open' : 'locked';
}

/** Due reviews come from every pack; this caps a day so a long break doesn't bury the learner. */
export const MAX_DUE = 30;

/** Today's session: due cards first (oldest first), then up to `newLeft` unseen cards from the current pack. */
export function todayQueue(reviews: Record<string, Review>, current: string | null, newLeft: number, now = Date.now()) {
  const due = Object.keys(reviews)
    .filter((id) => packOfCard[id] && reviews[id].dueAt <= now)
    .sort((a, b) => reviews[a].dueAt - reviews[b].dueAt)
    .slice(0, MAX_DUE);
  const pack = current ? packInfo[current]?.pack : undefined;
  const fresh = pack && newLeft > 0 ? pack.cardIds.filter((id) => !reviews[id]).slice(0, newLeft) : [];
  return { due, fresh };
}

/**
 * How much trouble a card has given: the answers it took beyond the ones that moved it up.
 * Leitner only keeps counts, so this is an estimate: every "still learning" adds one.
 */
export function struggle(r: Review | undefined) {
  if (!r) return 0;
  return Math.max(0, r.seen - (best(r) - 1));
}

/**
 * The pack someone with existing history should be on: the started, unfinished pack they've done the
 * most in; otherwise the first unfinished pack of `track`.
 */
export function pickCurrentPack(reviews: Record<string, Review>, track: TrackId = 'words'): string {
  let bestId: string | null = null;
  let bestCount = 0;
  for (const id of allPackIds) {
    const p = packProgress(id, reviews);
    if (!p.started || p.done) continue;
    const count = p.total - p.fresh;
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  if (bestId) return bestId;
  return trackPackIds[track].find((id) => !packProgress(id, reviews).done) ?? firstPack(track);
}
