import { useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressTrack } from '../components/LevelChip';
import { Icon, IconButton, PressScale, Txt } from '../components/ui';
import { allCards, breakdowns, cardsOfRoot, deckOfCard, openDeckIds, rootsById } from '../data';
import type { Review } from '../lib/srs';
import { useLevel, useStore } from '../lib/store';
import type { Card } from '../lib/types';
import { colors, radius } from '../theme';

const ROUND = 6;
const OPTIONS = 4;

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
  options: Card[]; // one is `card`; the others lend their meanings as wrong answers
}

const rootIdsOf = (c: Card) => (breakdowns[c.id]?.parts ?? []).flatMap((p) => (p.rootId ? [p.rootId] : []));

/**
 * Words with a breakdown, new ones first. Wrong answers come from words that share a root
 * (antipathy vs apathy), so a wrong pick still teaches what the other part means.
 */
function newRound(pool: Card[], reviews: Record<string, Review>): Question[] {
  const fresh = shuffle(pool.filter((c) => !reviews[c.id]));
  const seen = shuffle(pool.filter((c) => reviews[c.id]));
  const picks = [...fresh, ...seen].slice(0, ROUND);
  const everyone = allCards.filter((c) => breakdowns[c.id]);
  return picks.map((card) => {
    const kin = shuffle(rootIdsOf(card).flatMap((r) => cardsOfRoot[r] ?? [])).filter((c) => c.id !== card.id);
    const others = shuffle(everyone).filter((c) => c.id !== card.id);
    const wrong: Card[] = [];
    for (const c of [...kin, ...others]) {
      if (wrong.length === OPTIONS - 1) break;
      if (!wrong.some((w) => w.id === c.id || w.meaning === c.meaning) && c.meaning !== card.meaning) wrong.push(c);
    }
    return { card, options: shuffle([card, ...wrong]) };
  });
}

export default function Guess() {
  const { root } = useLocalSearchParams<{ root?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const level = useLevel();
  const reviews = useStore((s) => s.reviews);
  const family = root ? rootsById[root] : undefined;

  const pool = () => {
    const open = openDeckIds(level.n, reviews);
    const base = family ? cardsOfRoot[family.id] : allCards.filter((c) => breakdowns[c.id]);
    return base.filter((c) => open.has(deckOfCard[c.id].id));
  };
  const [round, setRound] = useState(() => newRound(pool(), reviews));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const finished = i >= round.length;
  const q = round[i];
  const title = family ? `Guess · ${family.forms[0]}` : 'Guess from roots';

  if (!round.length) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Icon name="lock" size={28} color={colors.textMuted} />
        <Txt weight="semibold" size={20} style={{ textAlign: 'center' }}>
          No words to guess here yet
        </Txt>
        <PressScale style={styles.secondary} onPress={back} accessibilityRole="button">
          <Txt weight="semibold">Back</Txt>
        </PressScale>
      </View>
    );
  }

  const pick = (id: string) => {
    if (picked) return;
    setPicked(id);
    if (id === q.card.id) setScore((n) => n + 1);
  };
  const next = () => {
    setPicked(null);
    setI((n) => n + 1);
  };
  const again = () => {
    setRound(newRound(pool(), reviews));
    setI(0);
    setScore(0);
    setPicked(null);
  };

  const b = q ? breakdowns[q.card.id] : undefined;
  const wrongPick = picked && picked !== q.card.id ? q.options.find((o) => o.id === picked) : undefined;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.topBar}>
        <IconButton icon="x" label="Close" onPress={back} />
        <Txt weight="semibold" size={17}>
          {title}
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
            {score >= round.length - 1 ? 'You read words like a linguist' : score >= round.length / 2 ? 'The roots are working' : 'Roots take a few rounds'}
          </Txt>
          <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>
            Every root you know is a head start on words you haven’t met yet.
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
        <Animated.ScrollView contentContainerStyle={styles.body}>
          <Animated.View key={q.card.id} entering={FadeInDown.duration(260)} style={{ gap: 14 }}>
            <Txt size={13} color={colors.textMuted}>
              {reviews[q.card.id] ? 'Work it out from its parts.' : 'You haven’t met this word yet. Its parts give it away.'}
            </Txt>
            <Txt weight="bold" size={36} style={{ letterSpacing: -1 }} accessibilityRole="header">
              {q.card.term.toLowerCase()}
            </Txt>
            {b && (
              <View style={styles.strip}>
                {b.parts.map((p, n) => (
                  <Fragment key={`${p.text}-${n}`}>
                    {n > 0 && (
                      <Txt size={15} color={colors.textFaint} style={{ alignSelf: 'center' }} importantForAccessibility="no">
                        +
                      </Txt>
                    )}
                    <View style={[styles.part, p.role === 'suffix' && styles.suffix]}>
                      <Txt weight="semibold" size={17} color={p.role === 'suffix' ? colors.text : colors.orangeSoft} numberOfLines={1}>
                        {p.role === 'suffix' ? `-${p.text}` : p.text}
                      </Txt>
                      <Txt size={12} color={colors.textMuted} numberOfLines={1}>
                        {p.gloss}
                      </Txt>
                    </View>
                  </Fragment>
                ))}
              </View>
            )}
            <Txt weight="semibold" size={15}>
              So it most likely means…
            </Txt>
          </Animated.View>

          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {q.options.map((o) => {
              const right = !!picked && o.id === q.card.id;
              const wrong = picked === o.id && o.id !== q.card.id;
              return (
                <PressScale
                  key={o.id}
                  style={[styles.choice, right && styles.choiceRight, wrong && styles.choiceWrong]}
                  scaleTo={0.98}
                  disabled={!!picked}
                  onPress={() => pick(o.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: picked === o.id, disabled: !!picked }}
                >
                  <Txt size={14.5} color={right ? colors.ink : colors.text} style={{ flex: 1, lineHeight: 20 }}>
                    {o.meaning}
                  </Txt>
                  {right && <Icon name="check" size={18} color={colors.ink} />}
                  {wrong && <Icon name="x" size={18} color={colors.orange} />}
                </PressScale>
              );
            })}
          </View>

          {picked && b && (
            <Animated.View entering={FadeIn.duration(200)} style={styles.reveal}>
              <Txt size={14} color={colors.textSoft} style={{ lineHeight: 21 }}>
                Literally “{b.literal}”.
                {wrongPick ? ` The one you picked is ${wrongPick.term.toLowerCase()}.` : ''}
              </Txt>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PressScale
                  style={[styles.secondary, { flex: 1 }]}
                  onPress={() => router.push({ pathname: '/card/[id]', params: { id: q.card.id } })}
                  accessibilityRole="link"
                >
                  <Txt weight="semibold">Open card</Txt>
                </PressScale>
                <PressScale style={[styles.primarySm, { flex: 1 }]} onPress={next} accessibilityRole="button">
                  <Txt weight="semibold" color={colors.ink}>
                    {i === round.length - 1 ? 'See your score' : 'Next'}
                  </Txt>
                </PressScale>
              </View>
            </Animated.View>
          )}
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  body: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12, gap: 16 },
  strip: { flexDirection: 'row', alignItems: 'stretch', gap: 5 },
  part: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 3,
  },
  suffix: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.borderStrong, flexGrow: 0.7 },
  choice: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  choiceRight: { backgroundColor: colors.lime, borderColor: colors.lime },
  choiceWrong: { borderColor: colors.orange, backgroundColor: colors.orangeDeep },
  reveal: { gap: 12, marginTop: 4 },
  primarySm: { height: 48, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondary: { height: 48, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
