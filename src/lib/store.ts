import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { freezeSlots, LEVELS, levelState, type LevelInput, type UseLog } from './levels';
import { dayKey, nextReview, type Review } from './srs';
import type { Setting } from './types';
import { DEFAULT_VOICE, VOICES, type VoiceId } from './voices';

interface Undo {
  cardId: string;
  prev: Review | undefined;
  day: string;
}

export type CardStyle = 'classic' | 'ink';

interface Streak {
  count: number;
  lastDay: string | null;
}

interface State {
  reviews: Record<string, Review>;
  /** 'all' | 'word' | 'idiom' | 'phrase' | <deck id> */
  scope: string;
  history: Record<string, number>; // day -> cards reviewed
  streak: Streak;
  /** longest streak ever; level 7's trial reads it */
  bestStreak: number;
  /** streak freezes in hand; each covers one missed day */
  freezes: number;
  /** real-world uses the learner logged, per card */
  uses: Record<string, UseLog[]>;
  /** highest level whose level-up screen has been shown; levels never drop below it */
  levelSeen: number;
  cardStyle: CardStyle;
  challengeBest: number;
  saved: string[];
  /** narration voice for all audio clips */
  voice: VoiceId;
  /** "<voice>:<deck id>" pairs whose audio has been fetched for offline use (web) */
  offlineAudio: string[];
  undoStack: Undo[];
  hydrated: boolean;

  /** `practice` swipes keep the streak alive but never move a card between boxes (and so earn no points). */
  answer: (cardId: string, known: boolean, practice?: boolean) => void;
  undo: () => string | null;
  /** Returns false when the use can't be logged (card still in box 1, or that setting already logged). */
  logUse: (cardId: string, setting: Setting) => boolean;
  /** Mark level `n` as celebrated and hand out any streak freezes it unlocks. */
  claimLevel: (n: number) => void;
  setScope: (scope: string) => void;
  setVoice: (voice: VoiceId) => void;
  setCardStyle: (style: CardStyle) => void;
  recordChallenge: (score: number) => void;
  toggleSaved: (cardId: string) => void;
  markOfflineAudio: (deckId: string) => void;
  resetProgress: () => void;
}

const DAY = 24 * 60 * 60 * 1000;

function yesterdayKey() {
  return dayKey(Date.now() - DAY);
}

/** Whole calendar days from day key `a` to day key `b` (local time). */
export function daysBetween(a: string, b: string) {
  const parse = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((parse(b) - parse(a)) / DAY);
}

export function levelInput(s: Pick<State, 'reviews' | 'uses' | 'history' | 'bestStreak'>): LevelInput {
  return { reviews: s.reviews, uses: s.uses, history: s.history, bestStreak: s.bestStreak };
}

/** Streak bookkeeping for a study action today: extends, bridges a gap with freezes, or restarts. */
function bumpStreak(s: Pick<State, 'streak' | 'freezes' | 'bestStreak' | 'reviews' | 'uses' | 'history' | 'levelSeen'>) {
  const today = dayKey();
  const { streak } = s;
  let freezes = s.freezes;
  if (streak.lastDay === today) return { streak, freezes, bestStreak: s.bestStreak };
  let count = 1;
  if (streak.lastDay === yesterdayKey()) count = streak.count + 1;
  else if (streak.lastDay) {
    const missed = daysBetween(streak.lastDay, today) - 1;
    if (missed > 0 && missed <= freezes) {
      freezes -= missed;
      count = streak.count + 1;
    }
  }
  // Every full week of streak earns a freeze, up to the slots your level allows.
  const slots = freezeSlots(levelState(levelInput(s), s.levelSeen).n);
  if (count % 7 === 0 && freezes < slots) freezes += 1;
  return { streak: { count, lastDay: today }, freezes, bestStreak: Math.max(s.bestStreak, count) };
}

const FRESH = {
  reviews: {} as Record<string, Review>,
  history: {} as Record<string, number>,
  streak: { count: 0, lastDay: null } as Streak,
  bestStreak: 0,
  freezes: 0,
  uses: {} as Record<string, UseLog[]>,
  levelSeen: 1,
  undoStack: [] as Undo[],
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...FRESH,
      scope: 'all',
      cardStyle: 'classic',
      challengeBest: 0,
      saved: [],
      voice: DEFAULT_VOICE,
      offlineAudio: [],
      hydrated: false,

      answer: (cardId, known, practice = false) => {
        const s = get();
        const today = dayKey();
        const prev = s.reviews[cardId];
        set({
          ...bumpStreak(s),
          reviews: practice ? s.reviews : { ...s.reviews, [cardId]: nextReview(prev, known) },
          history: { ...s.history, [today]: (s.history[today] ?? 0) + 1 },
          undoStack: [...s.undoStack.slice(-19), { cardId, prev, day: today }],
        });
      },

      undo: () => {
        const { undoStack, reviews, history } = get();
        const last = undoStack[undoStack.length - 1];
        if (!last) return null;
        const nextReviews = { ...reviews };
        if (last.prev) nextReviews[last.cardId] = last.prev;
        else delete nextReviews[last.cardId];
        set({
          reviews: nextReviews,
          history: { ...history, [last.day]: Math.max(0, (history[last.day] ?? 1) - 1) },
          undoStack: undoStack.slice(0, -1),
        });
        return last.cardId;
      },

      logUse: (cardId, setting) => {
        const s = get();
        const prev = s.reviews[cardId];
        const list = s.uses[cardId] ?? [];
        if (!prev || Math.max(prev.box, prev.bestBox ?? 1) < 2) return false;
        if (list.some((u) => u.setting === setting)) return false;
        const entry: UseLog = { setting, at: Date.now() };
        set({
          ...bumpStreak(s),
          // A real use is the strongest evidence you know it: the card moves up a box.
          reviews: { ...s.reviews, [cardId]: nextReview(prev, true) },
          uses: { ...s.uses, [cardId]: [...list, entry] },
        });
        return true;
      },

      claimLevel: (n) => {
        const { levelSeen, freezes } = get();
        if (n <= levelSeen) return;
        const granted = LEVELS.filter(
          (l) => l.n > levelSeen && l.n <= n && l.unlocks.some((u) => u.kind === 'feature' && u.feature.startsWith('freeze')),
        ).length;
        set({ levelSeen: n, freezes: Math.min(freezeSlots(n), freezes + granted) });
      },

      setScope: (scope) => set({ scope }),

      setVoice: (voice) => set({ voice }),

      setCardStyle: (cardStyle) => set({ cardStyle }),

      recordChallenge: (score) => set({ challengeBest: Math.max(get().challengeBest, score) }),

      toggleSaved: (cardId) => {
        const { saved } = get();
        set({ saved: saved.includes(cardId) ? saved.filter((id) => id !== cardId) : [...saved, cardId] });
      },

      markOfflineAudio: (deckId) => {
        const { offlineAudio } = get();
        if (!offlineAudio.includes(deckId)) set({ offlineAudio: [...offlineAudio, deckId] });
      },

      resetProgress: () => set({ ...FRESH, scope: 'all', cardStyle: 'classic', challengeBest: 0 }),
    }),
    {
      name: 'lexicard-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        reviews: s.reviews,
        scope: s.scope,
        history: s.history,
        streak: s.streak,
        bestStreak: s.bestStreak,
        freezes: s.freezes,
        uses: s.uses,
        levelSeen: s.levelSeen,
        cardStyle: s.cardStyle,
        challengeBest: s.challengeBest,
        saved: s.saved,
        voice: s.voice,
        offlineAudio: s.offlineAudio,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<State>;
        if (version < 1) {
          // Before levels: backfill best boxes, and start people at the level they've already earned
          // without throwing a level-up screen at them for progress made before levels existed.
          const reviews = Object.fromEntries(
            Object.entries(p.reviews ?? {}).map(([id, r]) => [id, { ...r, bestBox: Math.max(r.box, r.bestBox ?? 1) }]),
          );
          const base = { reviews, uses: {}, history: p.history ?? {}, bestStreak: p.streak?.count ?? 0 };
          return { ...p, ...base, freezes: 0, levelSeen: levelState(base).n, cardStyle: 'classic', challengeBest: 0 } as State;
        }
        return p as State;
      },
      onRehydrateStorage: () => () => {
        // A saved voice that has since been dropped from VOICES falls back to the default.
        const { voice, uses } = useStore.getState();
        // The app never keeps free text the learner wrote: drop notes saved by an earlier build.
        const clean = Object.fromEntries(Object.entries(uses).map(([id, list]) => [id, list.map(({ setting, at }) => ({ setting, at }))]));
        useStore.setState({ hydrated: true, uses: clean, voice: VOICES.some((v) => v.id === voice) ? voice : DEFAULT_VOICE });
      },
    },
  ),
);

/** Streak only counts if you studied today or yesterday, or the missed days are covered by freezes. */
export function liveStreak(streak: Streak, freezes = 0) {
  if (!streak.lastDay) return 0;
  const missed = daysBetween(streak.lastDay, dayKey()) - 1;
  return missed <= 0 || missed <= freezes ? streak.count : 0;
}

/** Current level state; re-renders only when the inputs change. */
export function useLevel() {
  const reviews = useStore((s) => s.reviews);
  const uses = useStore((s) => s.uses);
  const history = useStore((s) => s.history);
  const bestStreak = useStore((s) => s.bestStreak);
  const levelSeen = useStore((s) => s.levelSeen);
  return useMemo(() => levelState({ reviews, uses, history, bestStreak }, levelSeen), [reviews, uses, history, bestStreak, levelSeen]);
}
