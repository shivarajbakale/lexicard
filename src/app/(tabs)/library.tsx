import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { PackNode } from '../../components/packs';
import { RootFamilyList } from '../../components/RootFamilyList';
import { ScreenHeader, useScrollY } from '../../components/ScreenHeader';
import { Icon, PressScale, Txt } from '../../components/ui';
import { cardsById } from '../../data';
import { illustrations } from '../../data/illustrations';
import { playClip, useIsPlaying } from '../../lib/audio';
import { packInfo, packProgress, packState, tracks, type PackState } from '../../lib/packs';
import { useStore } from '../../lib/store';
import type { Pack, TrackId } from '../../lib/types';
import { VOICES, type VoiceId } from '../../lib/voices';
import { colors, kindStyle, PAPER, radius, springs } from '../../theme';

type Segment = TrackId | 'roots';
const SEGMENTS: { key: Segment; label: string }[] = [...tracks.map((t) => ({ key: t.id as Segment, label: t.title })), { key: 'roots', label: 'Roots' }];

const PREVIEW_CARD = 'candid';

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

const STATUS_TEXT: Record<PackState, string> = { done: 'Done', current: '', open: 'Open', locked: '' };

function PackRow({ pack, state }: { pack: Pack; state: PackState }) {
  const router = useRouter();
  const reviews = useStore((s) => s.reviews);
  const info = packInfo[pack.id];
  const p = packProgress(pack.id, reviews);
  const art = pack.cardIds.map((id) => illustrations[id]).find(Boolean);
  const status = state === 'current' ? `${p.known}/${p.total}` : state === 'open' && info.number === 1 && !p.started ? 'Start here' : STATUS_TEXT[state];
  return (
    <PressScale
      style={[styles.row, state === 'current' && styles.rowCurrent]}
      scaleTo={0.98}
      onPress={() => router.push({ pathname: '/pack/[id]', params: { id: pack.id } })}
      accessibilityRole="link"
      accessibilityLabel={`Pack ${info.number}, ${pack.title}. ${state === 'current' ? `Current, ${p.known} of ${p.total} known` : state}.`}
    >
      <PackNode state={state} />
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <Txt weight="mono" size={11} color={state === 'current' ? colors.limeSoft : colors.textFaint}>
          PACK {info.number} · {pack.cardIds.length} CARDS
        </Txt>
        <Txt weight="semibold" size={16} color={state === 'locked' ? colors.textMuted : colors.text} numberOfLines={1}>
          {pack.title}
        </Txt>
        <Txt size={12} color={colors.textFaint} numberOfLines={1}>
          {pack.blurb}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        {art && <Image source={art} resizeMode="cover" style={[styles.rowArt, state === 'locked' && { opacity: 0.45 }]} />}
        {!!status && (
          <Txt size={12} color={state === 'done' ? colors.lime : state === 'current' ? colors.limeSoft : colors.textMuted}>
            {status}
          </Txt>
        )}
      </View>
    </PressScale>
  );
}

/** The learning path: tracks → units → packs. Packs open one after another; every track is open from the start. */
export default function PathTab() {
  const { y, onScroll } = useScrollY();
  const router = useRouter();
  const reviews = useStore((s) => s.reviews);
  const currentPack = useStore((s) => s.currentPack);
  const saved = useStore((s) => s.saved);
  const [segment, setSegment] = useState<Segment>(() => packInfo[currentPack]?.track.id ?? 'words');
  const index = SEGMENTS.findIndex((s) => s.key === segment);
  const [segW, setSegW] = useState(0);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(index * segW, springs.snappy) }] }), [index, segW]);

  const track = segment === 'roots' ? null : tracks.find((t) => t.id === segment)!;
  const units = useMemo(() => {
    if (!track) return [];
    return track.units.map((unit) => {
      const packs = unit.packs.map((p) => ({ pack: p, state: packState(p.id, reviews, currentPack) }));
      return { unit, packs, cards: unit.packs.reduce((n, p) => n + p.cardIds.length, 0), locked: packs.every((x) => x.state === 'locked') };
    });
  }, [track, reviews, currentPack]);
  const allPacks = units.flatMap((u) => u.packs);
  const done = allPacks.filter((x) => x.state === 'done').length;
  const cards = units.reduce((n, u) => n + u.cards, 0);
  // Fully locked units collapse to one line; only the first of them says what opens it.
  const firstLocked = units.findIndex((u) => u.locked);

  return (
    <View style={styles.screen}>
      <ScreenHeader y={y}>
        <Txt weight="semibold" size={28} style={styles.title} accessibilityRole="header">
          Path
        </Txt>
        <View style={styles.segment} onLayout={(e) => setSegW((e.nativeEvent.layout.width - 8) / SEGMENTS.length)} accessibilityRole="tablist">
          {segW > 0 && <Animated.View style={[styles.segIndicator, { width: segW }, indicator]} />}
          {SEGMENTS.map((s) => (
            <PressScale
              key={s.key}
              style={styles.segBtn}
              scaleTo={0.96}
              onPress={() => setSegment(s.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: segment === s.key }}
            >
              <Txt weight="medium" size={13.5} color={segment === s.key ? colors.ink : colors.textSoft} numberOfLines={1}>
                {s.label}
              </Txt>
            </PressScale>
          ))}
        </View>
      </ScreenHeader>

      <Animated.ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: 8, paddingBottom: 28 }} onScroll={onScroll} scrollEventThrottle={16}>
        {segment === 'roots' && <RootFamilyList />}

        {track && (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.summary}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Txt size={13} color={colors.textMuted}>
                  {done} of {allPacks.length} packs done
                </Txt>
                <Txt weight="mono" size={12} color={colors.textMuted}>
                  {cards} {kindStyle[track.kind].label.toLowerCase()}s
                </Txt>
              </View>
              <View style={styles.summaryTrack}>
                <View style={[styles.summaryFill, { width: `${(done / Math.max(1, allPacks.length)) * 100}%` }]} />
              </View>
            </View>

            {units.map(({ unit, packs, cards: n, locked }, i) => (
              <View key={unit.id} style={{ marginTop: 18 }}>
                <View style={styles.unitHead}>
                  <Txt weight="semibold" size={12} color={locked ? colors.textFaint : colors.textSoft} style={styles.caps} numberOfLines={1}>
                    Unit {i + 1} · {unit.title}
                  </Txt>
                  <Txt weight="mono" size={11} color={colors.textFaint}>
                    {packs.length} {packs.length === 1 ? 'pack' : 'packs'} · {n} cards
                  </Txt>
                </View>
                {locked ? (
                  <View style={styles.lockedUnit}>
                    <Icon name="lock" size={13} color={colors.textFaint} />
                    <Txt size={13} color={colors.textFaint} numberOfLines={2} style={{ flex: 1 }}>
                      {i === firstLocked ? `Opens when you finish ${packInfo[packs[0].pack.id].prev ? packInfo[packInfo[packs[0].pack.id].prev!].pack.title : 'the unit before'}` : packs[0].pack.blurb}
                    </Txt>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {packs.map(({ pack, state }) => (
                      <PackRow key={pack.id} pack={pack} state={state} />
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

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
                    style={styles.savedRow}
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
  summary: { gap: 8, paddingHorizontal: 4 },
  summaryTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  summaryFill: { height: 4, backgroundColor: colors.lime },
  unitHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingHorizontal: 4, marginBottom: 8 },
  caps: { letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: '#222520',
  },
  rowCurrent: { backgroundColor: colors.surface2, borderColor: '#4A5530' },
  rowArt: { width: 44, height: 33, borderRadius: 8, backgroundColor: PAPER },
  lockedUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 20, paddingTop: 26, paddingBottom: 10 },
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
  savedRow: {
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
