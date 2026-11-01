import { deckOpen } from '../lib/levels';
import type { Review } from '../lib/srs';
import type { Card, CardKind, Deck } from '../lib/types';

import everydayEloquence from './decks/everyday-eloquence.json';
import workplaceClarity from './decks/workplace-clarity.json';
import idiomsWeekly from './decks/idioms-weekly.json';
import idiomsStrangeOrigins from './decks/idioms-strange-origins.json';
import meetingPhrases from './decks/meeting-phrases.json';
import politePushback from './decks/polite-pushback.json';
import { generatedDecks } from './generated';

// To add a deck: drop a JSON file in ./decks and add it to this list.
// `npm run check:decks` validates every file against the schema in lib/types.ts.
export const decks: Deck[] = [
  everydayEloquence,
  idiomsWeekly,
  meetingPhrases,
  idiomsStrangeOrigins,
  workplaceClarity,
  politePushback,
  // Decks written by the content pipeline (scripts/content/generate.mjs).
  ...generatedDecks,
] as Deck[];

// Round-robin across decks so a mixed session alternates words, idioms and phrases.
function interleave(lists: Card[][]): Card[] {
  const out: Card[] = [];
  const max = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

export const allCards: Card[] = interleave(decks.map((d) => d.cards));

export const cardsById: Record<string, Card> = Object.fromEntries(allCards.map((c) => [c.id, c]));

export const deckOfCard: Record<string, Deck> = Object.fromEntries(
  decks.flatMap((d) => d.cards.map((c) => [c.id, d] as const)),
);

/** Ids of the decks this learner can study at `level` (see deckOpen in lib/levels). */
export function openDeckIds(level: number, reviews: Record<string, Review>): Set<string> {
  return new Set(decks.filter((d) => deckOpen(d.id, d.cards.map((c) => c.id), level, reviews)).map((d) => d.id));
}

/** Cards for a study scope, limited to open decks when `open` is given. A locked deck scope falls back to everything open. */
export function cardsForScope(scope: string, open?: Set<string>): Card[] {
  const pool = open ? allCards.filter((c) => open.has(deckOfCard[c.id].id)) : allCards;
  if (scope === 'all') return pool;
  if (scope === 'word' || scope === 'idiom' || scope === 'phrase') {
    return pool.filter((c) => c.kind === (scope as CardKind));
  }
  const deck = decks.find((d) => d.id === scope);
  if (deck && (!open || open.has(deck.id))) return deck.cards;
  return pool;
}

export function scopeLabel(scope: string): string {
  if (scope === 'all') return 'Mixed · words, idioms, phrases';
  if (scope === 'word') return 'All words';
  if (scope === 'idiom') return 'All idioms';
  if (scope === 'phrase') return 'All phrases';
  return decks.find((d) => d.id === scope)?.name ?? 'Mixed';
}
