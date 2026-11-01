import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressTrack } from '../components/LevelChip';
import { Icon, IconButton, Pill, PressScale, Txt } from '../components/ui';
import { allCards, deckOfCard, openDeckIds } from '../data';
import { hasFeature } from '../lib/levels';
import { useLevel, useStore } from '../lib/store';
import type { Card } from '../lib/types';
import { colors, kindStyle, radius } from '../theme';

const SECONDS = 60;

function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Question {
  card: Card;
  options: { id: string; meaning: string }[];
}

/** One term, its meaning and two others of the same kind when possible. */
function makeQuestions(pool: Card[]): Question[] {
  return shuffle(pool).map((card) => {
    const same = pool.filter((c) => c.id !== card.id && c.kind === card.kind);
    const others = shuffle(same.length >= 2 ? same : pool.filter((c) => c.id !== card.id)).slice(0, 2);
    return { card, options: shuffle([card, ...others]).map((c) => ({ id: c.id, meaning: c.meaning })) };
  });
}

export default function Challenge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const level = useLevel();
  const reviews = useStore((s) => s.reviews);
  const best = useStore((s) => s.challengeBest);
  const record = useStore((s) => s.recordChallenge);
  const unlocked = hasFeature(level.n, 'challenge');

  const build = () => {
    const open = openDeckIds(level.n, reviews);
    // Cards you've met first, so it tests what you're learning; the rest fill in after.
    const pool = allCards.filter((c) => open.has(deckOfCard[c.id].id));
    const seen = pool.filter((c) => reviews[c.id]);
    return makeQuestions(seen.length >= 8 ? seen : pool);
  };

  const [qs, setQs] = useState<Question[]>(build);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [left, setLeft] = useState(SECONDS);
  const [prevBest, setPrevBest] = useState(best);

  const running = startedAt != null && left > 0;
  const over = startedAt != null && left <= 0;

  useEffect(() => {
    if (startedAt == null) return;
    const t = setInterval(() => {
      const remaining = Math.max(0, SECONDS - (Date.now() - startedAt) / 1000);
      setLeft(remaining);
      if (remaining <= 0) clearInterval(t);
    }, 200);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    if (over) record(score);
  }, [over, score, record]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!unlocked) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Icon name="lock" size={28} color={colors.textMuted} />
        <Txt weight="semibold" size={20}>
          Challenge mode opens at level 7
        </Txt>
        <PressScale style={styles.secondary} onPress={back} accessibilityRole="button">
          <Txt weight="semibold">Back</Txt>
        </PressScale>
      </View>
    );
  }

  const start = () => {
    setQs(build());
    setI(0);
    setScore(0);
    setPicked(null);
    setLeft(SECONDS);
    setPrevBest(useStore.getState().challengeBest);
    setStartedAt(Date.now());
  };

  const q = qs[i % qs.length];
  const choose = (id: string) => {
    if (picked || !running) return;
    const right = id === q.card.id;
    setPicked(id);
    if (right) setScore((n) => n + 1);
    if (Platform.OS !== 'web') Haptics.impactAsync(right ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(
      () => {
        setPicked(null);
        setI((n) => n + 1);
      },
      right ? 280 : 900,
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.topBar}>
        <IconButton icon="x" label="Close challenge" onPress={back} />
        <Txt weight="semibold" size={17}>
          Challenge
        </Txt>
        <Txt weight="mono" size={15} color={running && left < 10 ? colors.orange : colors.textMuted} style={{ minWidth: 44, textAlign: 'right' }}>
          {Math.ceil(left)}s
        </Txt>
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <ProgressTrack frac={left / SECONDS} color={left < 10 ? colors.orange : colors.lime} />
      </View>

      {startedAt == null || over ? (
        <Animated.View entering={FadeIn.duration(240)} style={[styles.body, styles.center]}>
          {over ? (
            <>
              <Txt weight="mono" size={64}>
                {score}
              </Txt>
              <Txt weight="semibold" size={22} style={{ textAlign: 'center' }}>
                {score > prevBest ? 'New best' : `Best: ${Math.max(best, score)}`}
              </Txt>
              <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center' }}>
                Matched in 60 seconds. Challenge is for fun: it doesn’t move cards or earn points.
              </Txt>
            </>
          ) : (
            <>
              <View style={styles.clock}>
                <Icon name="clock" size={30} color={colors.ink} />
              </View>
              <Txt weight="semibold" size={24} style={{ textAlign: 'center' }}>
                60 seconds. Match each term to its meaning.
              </Txt>
              <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center' }}>
                {best > 0 ? `Your best is ${best}.` : 'Set your first score.'}
              </Txt>
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <PressScale style={styles.primarySm} onPress={start} accessibilityRole="button">
              <Txt weight="semibold" color={colors.ink}>
                {over ? 'Go again' : 'Start'}
              </Txt>
            </PressScale>
            {over && (
              <PressScale style={styles.secondary} onPress={back} accessibilityRole="button">
                <Txt weight="semibold">Done</Txt>
              </PressScale>
            )}
          </View>
        </Animated.View>
      ) : (
        <View style={styles.body}>
          <View style={styles.rowBetween}>
            <Pill label={kindStyle[q.card.kind].label.toUpperCase()} bg={kindStyle[q.card.kind].bg} fg={kindStyle[q.card.kind].fg} />
            <Txt weight="mono" size={14} color={colors.limeSoft}>
              {score} right
            </Txt>
          </View>
          <Animated.View key={i} entering={FadeInDown.duration(180)}>
            <Txt weight="semibold" size={34} style={{ letterSpacing: -1 }}>
              {q.card.term}
            </Txt>
          </Animated.View>
          <View style={{ gap: 8 }}>
            {q.options.map((o) => {
              const right = picked && o.id === q.card.id;
              const wrong = picked === o.id && o.id !== q.card.id;
              return (
                <PressScale
                  key={`${i}-${o.id}`}
                  style={[styles.option, right && styles.optionRight, wrong && styles.optionWrong]}
                  scaleTo={0.98}
                  disabled={!!picked}
                  onPress={() => choose(o.id)}
                  accessibilityRole="button"
                >
                  <Txt size={15} color={right ? colors.ink : colors.text} style={{ lineHeight: 21 }} numberOfLines={4}>
                    {o.meaning}
                  </Txt>
                </PressScale>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 18, gap: 16 },
  clock: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  option: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  optionRight: { backgroundColor: colors.lime, borderColor: colors.lime },
  optionWrong: { backgroundColor: colors.orangeDeep, borderColor: colors.orange },
  primarySm: { height: 48, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondary: { height: 48, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
