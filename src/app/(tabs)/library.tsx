import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { ScreenHeader, useScrollY } from '../../components/ScreenHeader';
import { Icon, PressScale, Txt } from '../../components/ui';
import { cardsById, decks } from '../../data';
import { clipCount, downloadClips, playClip, useIsPlaying } from '../../lib/audio';
import { deckLevel, deckOpen, LEVELS } from '../../lib/levels';
import { isDue } from '../../lib/srs';
import { useLevel, useStore } from '../../lib/store';
import type { CardKind } from '../../lib/types';
import { VOICES, type VoiceId } from '../../lib/voices';
import { colors, kindStyle, radius, springs } from '../../theme';

const FILTERS: { key: 'all' | CardKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'word', label: 'Words' },
  { key: 'idiom', label: 'Idioms' },
  { key: 'phrase', label: 'Phrases' },
];

function OfflineAudioButton({ deckId, cardIds }: { deckId: string; cardIds: string[] }) {
  const voice = useStore((s) => s.voice);
  const done = useStore((s) => s.offlineAudio.includes(`${s.voice}:${deckId}`));
  const mark = useStore((s) => s.markOfflineAudio);
  const [progress, setProgress] = useState<string | null>(null);
  const label = done ? 'Audio saved offline' : (progress ?? 'Save audio offline');
  return (
    <PressScale
      style={[styles.offline, done && { borderColor: colors.limeDeep, backgroundColor: colors.limeDeep }]}
      scaleTo={0.95}
      disabled={done || progress != null}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={async () => {
        setProgress('0%');
        await downloadClips(cardIds, (n, total) => setProgress(`${Math.round((n / total) * 100)}%`));
        mark(`${voice}:${deckId}`);
        setProgress(null);
      }}
    >
      <Icon name={done ? 'check' : 'download'} size={13} color={done ? colors.limeSoft : colors.textMuted} />
      <Txt weight="medium" size={11} color={done ? colors.limeSoft : colors.textMuted}>
        {done ? 'Offline' : (progress ?? 'Audio')}
      </Txt>
    </PressScale>
  );
}

const PREVIEW_CARD = 'candid';
const OFFLINE_W = 80;

function VoiceOption({ id, name, blurb }: { id: VoiceId; name: string; blurb: string }) {
  const selected = useStore((s) => s.voice === id);
  const setVoice = useStore((s) => s.setVoice);
  const playing = useIsPlaying(PREVIEW_CARD, 'term');
  return (
    <PressScale
      style={[styles.voice, selected && styles.voiceActive]}
      scaleTo={0.97}
      onPress={() => {
        setVoice(id);
        playClip(PREVIEW_CARD, 'term', cardsById[PREVIEW_CARD]?.term, id);
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name} voice. ${blurb}. Plays a sample.`}
    >
      <View style={[styles.voiceIcon, selected && { backgroundColor: colors.lime }]}>
        <Icon name={selected && playing ? 'volume-2' : selected ? 'check' : 'volume-1'} size={16} color={selected ? colors.ink : colors.textMuted} />
      </View>
      <View style={{ gap: 2, flex: 1 }}>
        <Txt weight="semibold" size={15}>
          {name}
        </Txt>
        <Txt size={12} color={colors.textMuted}>
          {blurb}
        </Txt>
      </View>
    </PressScale>
  );
}

export default function Library() {
  const { y, onScroll } = useScrollY();
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));
  const router = useRouter();
  const reviews = useStore((s) => s.reviews);
  const scope = useStore((s) => s.scope);
  const saved = useStore((s) => s.saved);
  const setScope = useStore((s) => s.setScope);
  const level = useLevel();
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
        const open = deckOpen(d.id, d.cards.map((c) => c.id), level.n, reviews);
        return { deck: d, known, due, fresh, open };
      });
  }, [filter, reviews, now, level.n]);

  const study = (s: string) => {
    setScope(s);
    router.navigate('/');
  };

  const filterKey = FILTERS[filter].key;

  return (
    <View style={styles.screen}>
      <ScreenHeader y={y}>
        <Txt weight="semibold" size={28} style={styles.title} accessibilityRole="header">
          Library
        </Txt>
        <View style={styles.segment} onLayout={(e) => setSegW((e.nativeEvent.layout.width - 8) / FILTERS.length)} accessibilityRole="tablist">
          {segW > 0 && <Animated.View style={[styles.segIndicator, { width: segW }, indicator]} />}
          {FILTERS.map((f, i) => (
            <PressScale
              key={f.key}
              style={styles.segBtn}
              scaleTo={0.96}
              onPress={() => setFilter(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === i }}
            >
              <Txt weight="medium" size={14} color={filter === i ? colors.ink : colors.textSoft}>
                {f.label}
              </Txt>
            </PressScale>
          ))}
        </View>
      </ScreenHeader>

      <Animated.ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: 12, paddingBottom: 28 }} onScroll={onScroll} scrollEventThrottle={16}>
        <PressScale style={[styles.mix, scope === filterKey && styles.mixActive]} scaleTo={0.98} onPress={() => study(filterKey)} accessibilityRole="button">
          <View style={styles.mixIcon}>
            <Icon name="shuffle" size={18} color={colors.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="semibold" size={15}>
              {filterKey === 'all' ? 'Study everything' : `Study all ${FILTERS[filter].label.toLowerCase()}`}
            </Txt>
            <Txt size={13} color={colors.textMuted} numberOfLines={1}>
              Due cards first, then new
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
          {shown.map(({ deck, known, due, fresh, open }, i) => {
            if (!open) {
              const at = LEVELS[deckLevel(deck.id) - 1];
              const away = Math.max(0, at.points - level.points);
              return (
                <Animated.View key={deck.id} entering={FadeInDown.duration(260).delay(i * 40)} layout={LinearTransition.springify().damping(20)}>
                  <PressScale
                    style={styles.locked}
                    scaleTo={0.98}
                    onPress={() => router.push('/levels')}
                    accessibilityRole="link"
                    accessibilityLabel={`${deck.name} is locked. Opens at level ${at.n}, ${at.name}. See your level path.`}
                  >
                    <View style={styles.lockIcon}>
                      <Icon name="lock" size={16} color={colors.textMuted} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Txt weight="semibold" size={16} color={colors.textSoft}>
                        {deck.name}
                      </Txt>
                      <Txt size={12} color={colors.textMuted}>
                        Opens at level {at.n} · {at.name}
                        {away > 0 ? ` · ${away} points away` : ' · finish the trial'}
                      </Txt>
                    </View>
                    <Icon name="chevron-right" size={16} color={colors.textFaint} />
                  </PressScale>
                </Animated.View>
              );
            }
            const active = scope === deck.id;
            const k = kindStyle[deck.kind];
          const offline = Platform.OS === 'web' && clipCount(deck.cards.map((c) => c.id)) > 0;
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
                    {offline && <View style={styles.offlineSlot} />}
                    <View style={styles.track}>
                      <View style={[styles.bar, { width: `${(known / deck.cards.length) * 100}%` }]} />
                    </View>
                    <Txt weight="mono" size={12} color={colors.textMuted}>
                      {known}/{deck.cards.length}
                    </Txt>
                  </View>
                </PressScale>
                {/* Sits on top of the card rather than inside it: a button can't contain another button. */}
                {offline && (
                  <View style={styles.offlineSpot}>
                    <OfflineAudioButton deckId={deck.id} cardIds={deck.cards.map((c) => c.id)} />
                  </View>
                )}
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

        <View style={styles.listHead}>
          <Txt weight="semibold" size={17}>
            Voice
          </Txt>
          <Txt size={13} color={colors.textMuted}>
            Tap to hear it
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 16, gap: 8 }} accessibilityRole="radiogroup">
          {VOICES.map((v) => (
            <VoiceOption key={v.id} id={v.id} name={v.name} blurb={v.blurb} />
          ))}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { letterSpacing: -0.8, paddingHorizontal: 20 },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 12, backgroundColor: colors.lime },
  segBtn: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  mix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
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
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  offlineSlot: { width: OFFLINE_W, height: 32 },
  offlineSpot: { position: 'absolute', left: 16, bottom: 13 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: OFFLINE_W,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  track: { flex: 1, height: 5, borderRadius: radius.pill, backgroundColor: '#2A2D27', overflow: 'hidden' },
  bar: { height: 5, borderRadius: radius.pill, backgroundColor: colors.lime },
  voice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceActive: { backgroundColor: colors.card, borderColor: colors.lime },
  voiceIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#2A2D27', alignItems: 'center', justifyContent: 'center' },
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
