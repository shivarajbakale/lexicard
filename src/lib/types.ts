// Content schema for Lexicard deck files (src/data/decks/*.json).
// Every card is a word, an idiom, or a phrase. All content is static JSON.

export type CardKind = 'word' | 'idiom' | 'phrase';
export type Setting = 'work' | 'social' | 'writing';
export type Confidence = 'recorded' | 'likely' | 'myth';

export interface Use {
  setting: Setting;
  /** Short scene label, e.g. "Team stand-up · scoping a release" */
  where: string;
  /** Example sentence, plain text, no surrounding quotes */
  sentence: string;
  /** Exact substring of `sentence` to highlight (the term as it appears) */
  highlight: string;
  /** One-line usage tip */
  tip: string;
}

export interface Origin {
  /** One or two sentences, shown on the card back */
  summary: string;
  confidence: Confidence;
  /** 2–4 steps, oldest first */
  timeline: { when: string; text: string }[];
}

export interface Card {
  /** kebab-case slug of the term; unique across ALL decks */
  id: string;
  kind: CardKind;
  term: string;
  /** "adjective", "verb", "idiom", "phrase", ... */
  pos: string;
  /** IPA, words only */
  phonetic?: string;
  /** Plain sound-it-out spelling, stressed syllable in CAPS, e.g. "KAN-did". Words only. */
  sayIt?: string;
  /** Front-of-card hint for idioms/phrases, e.g. "nothing to do with cooking" */
  hint?: string;
  /** e.g. "Common at work", "Casual", "Formal" */
  register: string;
  meaning: string;
  /** How it feels / when it fits, 1–2 sentences */
  nuance: string;
  /** Idioms only: the literal picture */
  literal?: string;
  /** Exactly 3, one per setting: work, social, writing */
  uses: Use[];
  origin: Origin;
  /** Word family / other forms */
  forms?: { term: string; label: string }[];
  similar?: string[];
  opposite?: string;
  /** A common mistake or confusion */
  pitfall?: string;
}

export interface Deck {
  id: string;
  kind: CardKind;
  name: string;
  blurb: string;
  cards: Card[];
}
