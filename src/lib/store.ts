import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dayKey, nextReview, type Review } from './srs';

interface Undo {
  cardId: string;
  prev: Review | undefined;
  day: string;
}

interface State {
  reviews: Record<string, Review>;
  /** 'all' | 'word' | 'idiom' | 'phrase' | <deck id> */
  scope: string;
  history: Record<string, number>; // day -> cards reviewed
  streak: { count: number; lastDay: string | null };
  saved: string[];
  undoStack: Undo[];
  hydrated: boolean;

  answer: (cardId: string, known: boolean) => void;
  undo: () => string | null;
  setScope: (scope: string) => void;
  toggleSaved: (cardId: string) => void;
  resetProgress: () => void;
}

function yesterdayKey() {
  return dayKey(Date.now() - 24 * 60 * 60 * 1000);
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      reviews: {},
      scope: 'all',
      history: {},
      streak: { count: 0, lastDay: null },
      saved: [],
      undoStack: [],
      hydrated: false,

      answer: (cardId, known) => {
        const { reviews, history, streak, undoStack } = get();
        const today = dayKey();
        const prev = reviews[cardId];
        let nextStreak = streak;
        if (streak.lastDay !== today) {
          nextStreak = {
            count: streak.lastDay === yesterdayKey() ? streak.count + 1 : 1,
            lastDay: today,
          };
        }
        set({
          reviews: { ...reviews, [cardId]: nextReview(prev, known) },
          history: { ...history, [today]: (history[today] ?? 0) + 1 },
          streak: nextStreak,
          undoStack: [...undoStack.slice(-19), { cardId, prev, day: today }],
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

      setScope: (scope) => set({ scope }),

      toggleSaved: (cardId) => {
        const { saved } = get();
        set({ saved: saved.includes(cardId) ? saved.filter((id) => id !== cardId) : [...saved, cardId] });
      },

      resetProgress: () =>
        set({ reviews: {}, history: {}, streak: { count: 0, lastDay: null }, undoStack: [] }),
    }),
    {
      name: 'lexicard-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ reviews, scope, history, streak, saved }) => ({ reviews, scope, history, streak, saved }),
      onRehydrateStorage: () => () => useStore.setState({ hydrated: true }),
    },
  ),
);

/** Streak only counts if you studied today or yesterday. */
export function liveStreak(streak: { count: number; lastDay: string | null }) {
  if (!streak.lastDay) return 0;
  return streak.lastDay === dayKey() || streak.lastDay === yesterdayKey() ? streak.count : 0;
}
