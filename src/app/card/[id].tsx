import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Highlighted, Icon, IconButton, Label, Pill, PressScale, Txt } from '../../components/ui';
import { cardsById, deckOfCard } from '../../data';
import { useStore } from '../../lib/store';
import type { Setting } from '../../lib/types';
import { colors, confidenceStyle, kindStyle, radius, springs } from '../../theme';

const SETTING_LABEL: Record<Setting, string> = { work: 'At work', social: 'Social', writing: 'Writing' };

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const card = cardsById[id ?? ''];
  const saved = useStore((s) => s.saved.includes(id ?? ''));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const [tab, setTab] = useState(0);
  const [segW, setSegW] = useState(0);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(tab * segW, springs.snappy) }] }), [tab, segW]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!card) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Txt size={18}>Card not found.</Txt>
        <PressScale onPress={back} style={styles.ghostBtn} accessibilityRole="button">
          <Txt weight="semibold">Back to deck</Txt>
        </PressScale>
      </View>
    );
  }

  const kind = kindStyle[card.kind];
  const conf = confidenceStyle[card.origin.confidence];
  const use = card.uses[tab];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton icon="volume-2" label={`Hear ${card.term}`} onPress={() => Speech.speak(card.term, { language: 'en-US', rate: 0.9 })} />
            <IconButton
              icon="bookmark"
              label={saved ? 'Remove from saved' : 'Save'}
              bg={saved ? colors.lime : colors.surface2}
              fg={saved ? colors.ink : colors.text}
              onPress={() => toggleSaved(card.id)}
            />
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(320)} style={styles.hero}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pill label={kind.label.toUpperCase()} bg={kind.bg} fg={kind.fg} />
            <View style={styles.outlinePill}>
              <Txt weight="medium" size={12} color="#C9CDC1">
                {card.register}
              </Txt>
            </View>
          </View>
          <Txt weight="semibold" size={card.term.length > 16 ? 34 : 42} style={{ letterSpacing: -1.3, lineHeight: card.term.length > 16 ? 38 : 46 }}>
            {card.term}
          </Txt>
          <Txt weight={card.phonetic ? 'mono' : 'regular'} size={15} color={colors.textMuted}>
            {card.phonetic ? `${card.phonetic} · ${card.pos}` : `${card.pos} · ${deckOfCard[card.id]?.name ?? ''}`}
          </Txt>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(60)} style={styles.meaning}>
          <Label color={colors.ink}>What it means</Label>
          <Txt weight="medium" size={19} color={colors.ink} style={{ lineHeight: 26 }}>
            {card.meaning}
          </Txt>
        </Animated.View>

        {card.literal && (
          <View style={styles.twoCol}>
            <View style={styles.miniCard}>
              <Txt size={12} color={colors.textMuted}>
                Literally
              </Txt>
              <Txt size={14} style={{ lineHeight: 20 }}>
                {card.literal}
              </Txt>
            </View>
            <View style={styles.miniCard}>
              <Txt size={12} color={colors.textMuted}>
                Really
              </Txt>
              <Txt size={14} style={{ lineHeight: 20 }}>
                {card.meaning}
              </Txt>
            </View>
          </View>
        )}

        <View style={styles.block}>
          <Label>The feel of it</Label>
          <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
            {card.nuance}
          </Txt>
        </View>

        <View style={styles.sectionHead}>
          <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }}>
            Use it today
          </Txt>
        </View>
        <View style={styles.segment} onLayout={(e) => setSegW((e.nativeEvent.layout.width - 8) / 3)}>
          {segW > 0 && <Animated.View style={[styles.segIndicator, { width: segW }, indicator]} />}
          {card.uses.map((u, i) => (
            <PressScale key={u.setting} style={styles.segBtn} scaleTo={0.97} onPress={() => setTab(i)} accessibilityRole="tab" accessibilityState={{ selected: tab === i }}>
              <Txt weight="medium" size={14} color={tab === i ? colors.ink : '#C9CDC1'}>
                {SETTING_LABEL[u.setting]}
              </Txt>
            </PressScale>
          ))}
        </View>
        <Animated.View key={tab} entering={FadeInDown.duration(240)} style={styles.useCard}>
          <Txt size={13} color={colors.textMuted}>
            {use.where}
          </Txt>
          <Highlighted sentence={use.sentence} highlight={use.highlight} />
          <View style={styles.tip}>
            <Icon name="sun" size={16} color={colors.lime} />
            <Txt size={14} color="#C9CDC1" style={{ flex: 1, lineHeight: 21 }}>
              {use.tip}
            </Txt>
          </View>
        </Animated.View>

        <View style={styles.origin}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }}>
              Where it comes from
            </Txt>
            <Pill label={conf.label} bg={conf.bg} fg={conf.fg} />
          </View>
          <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
            {card.origin.summary}
          </Txt>
          <View>
            {card.origin.timeline.map((t, i) => {
              const last = i === card.origin.timeline.length - 1;
              return (
                <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={{ width: 14, alignItems: 'center' }}>
                    <View style={[styles.dot, { backgroundColor: last ? colors.lime : '#5E6357' }]} />
                    {!last && <View style={styles.vline} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 3 }}>
                    <Txt weight="mono" size={12} color={colors.lime}>
                      {t.when}
                    </Txt>
                    <Txt size={14} color={colors.textSoft} style={{ lineHeight: 21 }}>
                      {t.text}
                    </Txt>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {!!card.forms?.length && (
          <View style={styles.section}>
            <Txt weight="semibold" size={17}>
              {card.kind === 'word' ? 'Word family' : 'Forms you’ll hear'}
            </Txt>
            <View style={styles.wrap}>
              {card.forms.map((f) => (
                <View key={f.term} style={styles.formCard}>
                  <Txt weight="medium" size={15}>
                    {f.term}
                  </Txt>
                  <Txt size={12} color={colors.textMuted}>
                    {f.label}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        )}

        {(!!card.similar?.length || !!card.opposite || !!card.pitfall) && (
          <View style={styles.section}>
            <Txt weight="semibold" size={17}>
              Close, but not the same
            </Txt>
            <View style={styles.wrap}>
              {card.similar?.map((s) => (
                <View key={s} style={styles.chip}>
                  <Txt size={14}>{s}</Txt>
                </View>
              ))}
              {card.opposite && (
                <View style={[styles.chip, styles.oppChip]}>
                  <Txt size={14} color={colors.orangeSoft}>
                    opposite: {card.opposite}
                  </Txt>
                </View>
              )}
            </View>
            {card.pitfall && (
              <View style={styles.pitfall}>
                <Icon name="alert-triangle" size={16} color={colors.orangeText} />
                <Txt size={14} color={colors.orangeText} style={{ flex: 1, lineHeight: 21 }}>
                  {card.pitfall}
                </Txt>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  ghostBtn: { height: 48, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3E35', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  hero: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  outlinePill: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3E35' },
  meaning: { marginHorizontal: 16, marginTop: 18, padding: 20, borderRadius: radius.xl, backgroundColor: colors.lime, gap: 8 },
  twoCol: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  miniCard: { flex: 1, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, gap: 6 },
  block: { marginHorizontal: 16, marginTop: 10, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, gap: 8 },
  sectionHead: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 12 },
  segment: { flexDirection: 'row', marginHorizontal: 16, padding: 4, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.md, backgroundColor: colors.text },
  segBtn: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  useCard: { marginHorizontal: 16, marginTop: 12, padding: 20, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, gap: 14 },
  tip: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  origin: { marginHorizontal: 16, marginTop: 24, padding: 20, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#2A2D27', gap: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  vline: { width: 2, flex: 1, backgroundColor: colors.line },
  section: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formCard: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, gap: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.chip },
  oppChip: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.orange },
  pitfall: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.orangeDeep },
});
