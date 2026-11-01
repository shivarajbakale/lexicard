import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressTrack } from '../components/LevelChip';
import { Icon, IconButton, Pill, PressScale, Txt } from '../components/ui';
import { allCards, openDeckIds, deckOfCard } from '../data';
import { hasFeature } from '../lib/levels';
import { useLevel, useStore } from '../lib/store';
import type { Card, Confidence } from '../lib/types';
import { colors, confidenceStyle, kindStyle, radius } from '../theme';

const ROUND = 8;
const CHOICES: Confidence[] = ['recorded', 'likely', 'myth'];
const HELP: Record<Confidence, string> = {
  recorded: 'Dated sources back it up',
  likely: 'Plausible, not fully proven',
  myth: 'The popular story doesn’t hold up',
};

function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newRound(pool: Card[]): Card[] {
  // Lead with idioms and phrases (their origins are the fun ones), but keep every confidence in play.
  const lively = pool.filter((c) => c.kind !== 'word');
  return shuffle(lively.length >= ROUND ? lively : pool).slice(0, ROUND);
}

export default function Quiz() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const level = useLevel();
  const reviews = useStore((s) => s.reviews);
  const unlocked = hasFeature(level.n, 'quiz');
  const [round, setRound] = useState(() => {
    const open = openDeckIds(level.n, reviews);
    return newRound(allCards.filter((c) => open.has(deckOfCard[c.id].id)));
  });
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Confidence | null>(null);
  const [score, setScore] = useState(0);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const card = round[i];
  const finished = i >= round.length;

  if (!unlocked) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Icon name="lock" size={28} color={colors.textMuted} />
        <Txt weight="semibold" size={20}>
          Origin quiz opens at level 5
        </Txt>
        <PressScale style={styles.secondary} onPress={back} accessibilityRole="button">
          <Txt weight="semibold">Back</Txt>
        </PressScale>
      </View>
    );
  }

  const pick = (c: Confidence) => {
    if (picked) return;
    setPicked(c);
    if (c === card.origin.confidence) setScore((n) => n + 1);
  };
  const next = () => {
    setPicked(null);
    setI((n) => n + 1);
  };
  const again = () => {
    const open = openDeckIds(level.n, reviews);
    setRound(newRound(allCards.filter((c) => open.has(deckOfCard[c.id].id))));
    setI(0);
    setScore(0);
    setPicked(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.topBar}>
        <IconButton icon="x" label="Close quiz" onPress={back} />
        <Txt weight="semibold" size={17}>
          Origin quiz
        </Txt>
        <Txt weight="mono" size={13} color={colors.textMuted} style={{ minWidth: 44, textAlign: 'right' }}>
          {Math.min(i + 1, round.length)}/{round.length}
        </Txt>
      </View>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <ProgressTrack frac={(i + (picked ? 1 : 0)) / round.length} />
      </View>

      {finished ? (
        <Animated.View entering={FadeIn.duration(260)} style={[styles.body, styles.center]}>
          <Txt weight="mono" size={56}>
            {score}/{round.length}
          </Txt>
          <Txt weight="semibold" size={22} style={{ textAlign: 'center' }}>
            {score >= round.length - 1 ? 'Sharp eye for a myth' : score >= round.length / 2 ? 'Good instincts' : 'Folk etymology is sneaky'}
          </Txt>
          <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>
            Many famous origin stories were made up after the fact. Knowing which ones makes you the person who can tell.
          </Txt>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <PressScale style={styles.primarySm} onPress={again} accessibilityRole="button">
              <Txt weight="semibold" color={colors.ink}>
                Play again
              </Txt>
            </PressScale>
            <PressScale style={styles.secondary} onPress={back} accessibilityRole="button">
              <Txt weight="semibold">Done</Txt>
            </PressScale>
          </View>
        </Animated.View>
      ) : (
        <View style={styles.body}>
          <Animated.View key={card.id} entering={FadeInDown.duration(260)} style={styles.card}>
            <Pill label={kindStyle[card.kind].label.toUpperCase()} bg={kindStyle[card.kind].bg} fg={kindStyle[card.kind].fg} style={{ alignSelf: 'flex-start' }} />
            <Txt weight="semibold" size={30} style={{ letterSpacing: -0.8 }}>
              {card.term}
            </Txt>
            <Txt size={15} color={colors.textSoft} style={{ lineHeight: 22 }}>
              {card.origin.timeline[0]?.text}
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              How solid is the usual origin story?
            </Txt>
          </Animated.View>

          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {CHOICES.map((c) => {
              const conf = confidenceStyle[c];
              const right = picked && c === card.origin.confidence;
              const wrong = picked === c && c !== card.origin.confidence;
              return (
                <PressScale
                  key={c}
                  style={[styles.choice, right && styles.choiceRight, wrong && styles.choiceWrong]}
                  scaleTo={0.98}
                  disabled={!!picked}
                  onPress={() => pick(c)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: picked === c, disabled: !!picked }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="semibold" size={15} color={right ? colors.ink : colors.text}>
                      {conf.label}
                    </Txt>
                    <Txt size={12} color={right ? colors.ink : colors.textMuted}>
                      {HELP[c]}
                    </Txt>
                  </View>
                  {right && <Icon name="check" size={18} color={colors.ink} />}
                  {wrong && <Icon name="x" size={18} color={colors.orange} />}
                </PressScale>
              );
            })}
          </View>

          {picked && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.reveal}>
              <Txt size={14} color={colors.textSoft} style={{ lineHeight: 21 }}>
                {card.origin.summary}
              </Txt>
              <PressScale style={styles.primary} onPress={next} accessibilityRole="button">
                <Txt weight="semibold" size={16} color={colors.ink}>
                  {i === round.length - 1 ? 'See your score' : 'Next'}
                </Txt>
              </PressScale>
            </Animated.View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  card: { padding: 20, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, gap: 10 },
  choice: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  choiceRight: { backgroundColor: colors.lime, borderColor: colors.lime },
  choiceWrong: { borderColor: colors.orange, backgroundColor: colors.orangeDeep },
  reveal: { gap: 12, marginTop: 'auto' },
  primary: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  primarySm: { height: 48, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondary: { height: 48, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
