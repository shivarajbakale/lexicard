import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { cardsOfRoot, deckOfCard, rootFamilies } from '../data';
import { deckLevel, deckOpen, LEVELS } from '../lib/levels';
import { useLevel, useStore } from '../lib/store';
import { colors, radius } from '../theme';
import { Icon, PressScale, Txt } from './ui';

/** Library › Roots: one card per root family. A family opens once any of its words is in an open deck. */
export function RootFamilyList() {
  const router = useRouter();
  const reviews = useStore((s) => s.reviews);
  const level = useLevel();

  return (
    <>
      <PressScale style={styles.guess} scaleTo={0.98} onPress={() => router.push('/guess')} accessibilityRole="button">
        <View style={styles.guessIcon}>
          <Icon name="help-circle" size={18} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="semibold" size={15}>
            Guess from roots
          </Txt>
          <Txt size={13} color={colors.textMuted} numberOfLines={1}>
            Work out new words from parts you know
          </Txt>
        </View>
        <Icon name="arrow-right" size={18} color={colors.textMuted} />
      </PressScale>
      <View style={styles.listHead}>
        <Txt weight="semibold" size={17}>
          Root families
        </Txt>
        <Txt size={13} color={colors.textMuted}>
          Learn 1 root, read many words
        </Txt>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {rootFamilies.map((root, i) => {
          const cards = cardsOfRoot[root.id];
          const decks = [...new Set(cards.map((c) => deckOfCard[c.id]))];
          const open = decks.some((d) => deckOpen(d.id, d.cards.map((c) => c.id), level.n, reviews));
          const known = cards.filter((c) => (reviews[c.id]?.box ?? 0) >= 2).length;
          const words = cards.map((c) => c.term.toLowerCase());
          const preview = words.slice(0, 3).join(' · ') + (words.length > 3 ? ` +${words.length - 3}` : '');
          const forms = root.forms.join(' · ');

          if (!open) {
            const at = LEVELS[Math.min(...decks.map((d) => deckLevel(d.id))) - 1];
            return (
              <Animated.View key={root.id} entering={FadeInDown.duration(260).delay(i * 40)}>
                <PressScale
                  style={styles.locked}
                  scaleTo={0.98}
                  onPress={() => router.push('/levels')}
                  accessibilityRole="link"
                  accessibilityLabel={`Root ${forms} is locked. Opens at level ${at.n}. See your level path.`}
                >
                  <View style={styles.lockIcon}>
                    <Icon name="lock" size={16} color={colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt weight="semibold" size={16} color={colors.textSoft}>
                      {forms} · {root.meaning}
                    </Txt>
                    <Txt size={12} color={colors.textMuted}>
                      Opens at level {at.n} · {cards.length} words
                    </Txt>
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.textFaint} />
                </PressScale>
              </Animated.View>
            );
          }

          return (
            <Animated.View key={root.id} entering={FadeInDown.duration(260).delay(i * 40)}>
              <PressScale
                style={styles.card}
                scaleTo={0.98}
                onPress={() => router.push({ pathname: '/root/[id]', params: { id: root.id } })}
                accessibilityRole="link"
                accessibilityLabel={`Root ${forms}, ${root.meaning}. ${cards.length} words, ${known} known.`}
              >
                <View style={styles.head}>
                  <Txt weight="bold" size={21} color={colors.orangeSoft} style={{ flexShrink: 1 }} numberOfLines={1}>
                    {forms}
                  </Txt>
                  <Txt weight="semibold" size={11} color={colors.textMuted} style={styles.caps} numberOfLines={1}>
                    {root.language} · {cards.length} words
                  </Txt>
                </View>
                <Txt size={15} color={colors.textSoft} style={{ marginTop: -4 }}>
                  {root.meaning}
                </Txt>
                <Txt size={13} color={colors.textMuted} numberOfLines={1}>
                  {preview}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.track}>
                    <View style={[styles.bar, { width: `${(known / cards.length) * 100}%` }]} />
                  </View>
                  <Txt weight="mono" size={12} color={colors.textMuted}>
                    {known}/{cards.length}
                  </Txt>
                </View>
              </PressScale>
            </Animated.View>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  guess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guessIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10 },
  card: { padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  caps: { letterSpacing: 1, textTransform: 'uppercase' },
  track: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: '#2A2D27', overflow: 'hidden' },
  bar: { height: 5, borderRadius: radius.pill, backgroundColor: colors.lime },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  lockIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
