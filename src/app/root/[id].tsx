import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SplitTerm } from '../../components/RootParts';
import { ScreenHeader, useScrollY } from '../../components/ScreenHeader';
import { Icon, IconButton, PressScale, Txt } from '../../components/ui';
import { breakdowns, cardsOfRoot, ROOT_SCOPE, rootsById } from '../../data';
import { useStore } from '../../lib/store';
import { colors, radius } from '../../theme';

/** A root family: what the root means, every card that uses it, and words that only look like they do. */
export default function RootPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { y, onScroll } = useScrollY();
  const reviews = useStore((s) => s.reviews);
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const root = rootsById[id ?? ''];
  const cards = root ? cardsOfRoot[root.id] : [];

  if (!root || !cards.length) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
        </View>
        <Txt size={15} color={colors.textMuted} style={{ padding: 20 }}>
          This root isn’t in the library.
        </Txt>
      </View>
    );
  }

  const known = cards.filter((c) => (reviews[c.id]?.box ?? 0) >= 2).length;
  const studyScope = `${ROOT_SCOPE}${root.id}`;
  const study = () => {
    setScope(studyScope);
    router.navigate('/');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader y={y} style={{ paddingBottom: 10 }}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
          <Txt size={14} color={colors.textMuted}>
            Root
          </Txt>
        </View>
      </ScreenHeader>

      <Animated.ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 18 }} onScroll={onScroll} scrollEventThrottle={16}>
        <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 6, paddingTop: 8 }}>
          <View style={styles.tag}>
            <Txt size={12} color={colors.textSoft}>
              {root.language} · {root.etymon}
            </Txt>
          </View>
          <Txt weight="bold" size={42} style={{ letterSpacing: -1.4 }} accessibilityRole="header">
            {root.forms.join(' · ')}
          </Txt>
          <Txt size={18} color={colors.textSoft}>
            {root.meaning}
          </Txt>
        </Animated.View>

        <View style={styles.progress}>
          <View style={styles.rowBetween}>
            <Txt size={13} color={colors.textSoft}>
              You know {known} of {cards.length} words
            </Txt>
            <Txt weight="mono" size={12} color={colors.textMuted}>
              {known}/{cards.length}
            </Txt>
          </View>
          <View style={styles.track}>
            <View style={[styles.bar, { width: `${(known / cards.length) * 100}%` }]} />
          </View>
        </View>

        <View>
          {cards.map((c, i) => {
            const b = breakdowns[c.id];
            const r = reviews[c.id];
            const status = !r ? 'New' : r.box >= 2 ? 'Known' : 'Learning';
            return (
              <PressScale
                key={c.id}
                style={[styles.wordRow, i === cards.length - 1 && { borderBottomWidth: 0 }]}
                scaleTo={0.98}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: c.id } })}
                accessibilityRole="link"
                accessibilityLabel={`${c.term}: ${b.literal}. ${status}. Open card.`}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <SplitTerm card={c} rootId={root.id} size={16} />
                  <Txt size={13} color={colors.textMuted}>
                    “{b.literal}”
                  </Txt>
                  {b.drift && (
                    <Txt size={12.5} color={colors.orangeSoft} style={{ lineHeight: 18 }}>
                      {b.drift}
                    </Txt>
                  )}
                </View>
                <View style={[styles.status, status === 'Known' ? styles.known : status === 'Learning' ? styles.learning : styles.fresh]}>
                  <Txt size={11.5} color={status === 'Known' ? colors.limeSoft : status === 'Learning' ? colors.textSoft : colors.textMuted}>
                    {status}
                  </Txt>
                </View>
              </PressScale>
            );
          })}
        </View>

        {root.elsewhere.length > 0 && (
          <View style={{ gap: 8 }}>
            <Txt weight="semibold" size={15} color={colors.textSoft}>
              Elsewhere in English
            </Txt>
            <View style={styles.wrap}>
              {root.elsewhere.map((w) => (
                <View key={w} style={styles.chip}>
                  <Txt size={13} color={colors.textSoft}>
                    {w}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        )}

        {root.lookalikes?.map((l) => (
          <View key={l.term} style={styles.lookalike}>
            <Icon name="alert-triangle" size={16} color={colors.orangeText} />
            <Txt size={13.5} color={colors.orangeText} style={{ flex: 1, lineHeight: 20 }}>
              Looks like it, isn’t: <Txt weight="semibold" size={13.5} color={colors.orangeText}>{l.term}</Txt> comes {l.note}.
            </Txt>
          </View>
        ))}

        <PressScale style={[styles.studyBtn, scope === studyScope && styles.studyActive]} scaleTo={0.97} onPress={study} accessibilityRole="button">
          <Txt weight="semibold" size={15} color={colors.ink}>
            Study all {cards.length}
          </Txt>
        </PressScale>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  tag: { alignSelf: 'flex-start', backgroundColor: colors.chip, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { gap: 8, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: '#2A2D27', overflow: 'hidden' },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.lime },
  wordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  status: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  known: { backgroundColor: colors.limeDeep },
  learning: { backgroundColor: colors.chip },
  fresh: { borderWidth: 1, borderColor: colors.borderStrong },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  lookalike: { flexDirection: 'row', gap: 10, backgroundColor: colors.orangeDeep, borderRadius: radius.md, padding: 14 },
  studyBtn: { height: 52, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  studyActive: { borderWidth: 2, borderColor: colors.limeSoft },
});
