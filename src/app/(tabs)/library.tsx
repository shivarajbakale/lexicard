import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, PressScale, Txt } from '../../components/ui';
import { cardsById, decks } from '../../data';
import { isDue } from '../../lib/srs';
import { useStore } from '../../lib/store';
import type { CardKind } from '../../lib/types';
import { colors, kindStyle, radius, springs } from '../../theme';

const FILTERS: { key: 'all' | CardKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'word', label: 'Words' },
  { key: 'idiom', label: 'Idioms' },
  { key: 'phrase', label: 'Phrases' },
];

export default function Library() {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));
  const router = useRouter();
  const reviews = useStore((s) => s.reviews);
  const scope = useStore((s) => s.scope);
  const saved = useStore((s) => s.saved);
  const setScope = useStore((s) => s.setScope);
  const [filter, setFilter] = useState(0);
  const [segW, setSegW] = useState(0);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(filter * segW, springs.snappy) }] }), [filter, segW]);

  const shown = useMemo(() => {
    const key = FILTERS[filter].key;
    return decks
      .filter((d) => key === 'all' || d.kind === key)
      .map((d) => {
        const known = d.cards.filter((c) => (reviews[c.id]?.box ?? 0) >= 2).length;
        const due = d.cards.filter((c) => isDue(reviews[c.id], now)).length;
        const fresh = d.cards.filter((c) => !reviews[c.id]).length;
        return { deck: d, known, due, fresh };
      });
  }, [filter, reviews, now]);

  const study = (s: string) => {
    setScope(s);
    router.navigate('/');
  };

  const filterKey = FILTERS[filter].key;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 22, paddingBottom: 24 }}>
      <View style={styles.head}>
        <Txt weight="semibold" size={30} style={{ letterSpacing: -0.9 }}>
          Library
        </Txt>
        <Txt size={14} color={colors.textMuted}>
          Pick what to study. Your choice sets the Learn deck.
        </Txt>
      </View>

      <View style={styles.segment} onLayout={(e) => setSegW((e.nativeEvent.layout.width - 8) / FILTERS.length)}>
        {segW > 0 && <Animated.View style={[styles.segIndicator, { width: segW }, indicator]} />}
        {FILTERS.map((f, i) => (
          <PressScale key={f.key} style={styles.segBtn} scaleTo={0.96} onPress={() => setFilter(i)} accessibilityRole="tab" accessibilityState={{ selected: filter === i }}>
            <Txt weight="medium" size={14} color={filter === i ? colors.ink : '#C9CDC1'}>
              {f.label}
            </Txt>
          </PressScale>
        ))}
      </View>

      <PressScale style={[styles.mix, scope === filterKey && styles.mixActive]} scaleTo={0.98} onPress={() => study(filterKey)} accessibilityRole="button">
        <View style={styles.mixIcon}>
          <Icon name="shuffle" size={18} color={colors.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="semibold" size={15}>
            {filterKey === 'all' ? 'Study a mix of everything' : `Study all ${FILTERS[filter].label.toLowerCase()}`}
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            Due cards first, then new ones
          </Txt>
        </View>
        <Icon name="arrow-right" size={18} color={colors.textMuted} />
      </PressScale>

      <View style={styles.listHead}>
        <Txt weight="semibold" size={17}>
          Decks
        </Txt>
        <Txt size={13} color={colors.textMuted}>
          {shown.length} {shown.length === 1 ? 'deck' : 'decks'}
        </Txt>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {shown.map(({ deck, known, due, fresh }, i) => {
          const active = scope === deck.id;
          const k = kindStyle[deck.kind];
          return (
            <Animated.View key={deck.id} entering={FadeInDown.duration(260).delay(i * 40)} layout={LinearTransition.springify().damping(20)}>
              <PressScale
                style={[styles.deck, active && styles.deckActive]}
                scaleTo={0.98}
                onPress={() => study(deck.id)}
                accessibilityRole="button"
                accessibilityLabel={`Study ${deck.name}`}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt weight="semibold" size={11} color={colors.textMuted} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
                      {k.label}s · {deck.cards.length} cards
                    </Txt>
                    <Txt weight="semibold" size={16}>
                      {deck.name}
                    </Txt>
                    <Txt size={13} color={colors.textMuted}>
                      {deck.blurb}
                    </Txt>
                  </View>
                  <View style={[styles.badge, { backgroundColor: due > 0 ? colors.lime : '#2A2D27' }]}>
                    <Txt weight="semibold" size={12} color={due > 0 ? colors.ink : colors.textSoft}>
                      {due > 0 ? `${due} due` : `${fresh} new`}
                    </Txt>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.track}>
                    <View style={[styles.bar, { width: `${(known / deck.cards.length) * 100}%` }]} />
                  </View>
                  <Txt weight="mono" size={12} color={colors.textMuted}>
                    {known}/{deck.cards.length}
                  </Txt>
                </View>
              </PressScale>
            </Animated.View>
          );
        })}
      </View>

      {saved.length > 0 && (
        <>
          <View style={styles.listHead}>
            <Txt weight="semibold" size={17}>
              Saved
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              {saved.length}
            </Txt>
          </View>
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {saved
              .filter((id) => cardsById[id])
              .map((id) => (
                <PressScale
                  key={id}
                  style={styles.row}
                  scaleTo={0.98}
                  onPress={() => router.push({ pathname: '/card/[id]', params: { id } })}
                  accessibilityRole="link"
                >
                  <Txt weight="medium" size={15}>
                    {cardsById[id].term}
                  </Txt>
                  <Txt size={13} color={colors.textMuted}>
                    {kindStyle[cardsById[id].kind].label}
                  </Txt>
                </PressScale>
              ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 20, gap: 4 },
  segment: { flexDirection: 'row', margin: 16, marginBottom: 0, padding: 4, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 12, backgroundColor: colors.lime },
  segBtn: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  mix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: '#2A2D27',
  },
  mixActive: { borderColor: colors.lime },
  mixIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10 },
  deck: { padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  deckActive: { backgroundColor: colors.card, borderColor: colors.lime },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  track: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: '#2A2D27', overflow: 'hidden' },
  bar: { height: 5, borderRadius: radius.pill, backgroundColor: colors.lime },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
