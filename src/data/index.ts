import type { Card, CardKind, Deck } from '../lib/types';

import everydayEloquence from './decks/everyday-eloquence.json';
import workplaceClarity from './decks/workplace-clarity.json';
import idiomsWeekly from './decks/idioms-weekly.json';
import idiomsStrangeOrigins from './decks/idioms-strange-origins.json';
import meetingPhrases from './decks/meeting-phrases.json';
import politePushback from './decks/polite-pushback.json';

// To add a deck: drop a JSON file in ./decks and add it to this list.
// `npm run check:decks` validates every file against the schema in lib/types.ts.
export const decks: Deck[] = [
  everydayEloquence,
  idiomsWeekly,
  meetingPhrases,
  idiomsStrangeOrigins,
  workplaceClarity,
  politePushback,
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

export function cardsForScope(scope: string): Card[] {
  if (scope === 'all') return allCards;
  if (scope === 'word' || scope === 'idiom' || scope === 'phrase') {
    return allCards.filter((c) => c.kind === (scope as CardKind));
  }
  return decks.find((d) => d.id === scope)?.cards ?? allCards;
}

export function scopeLabel(scope: string): string {
  if (scope === 'all') return 'Mixed · words, idioms, phrases';
  if (scope === 'word') return 'All words';
  if (scope === 'idiom') return 'All idioms';
  if (scope === 'phrase') return 'All phrases';
  return decks.find((d) => d.id === scope)?.name ?? 'Mixed';
}
