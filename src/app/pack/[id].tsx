import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PackBar, STATUS_COLOR } from '../../components/packs';
import { ScreenHeader, useScrollY } from '../../components/ScreenHeader';
import { Icon, IconButton, Pill, PressScale, Txt } from '../../components/ui';
import { cardsById } from '../../data';
import { illustrations } from '../../data/illustrations';
import { clipCount, downloadClips } from '../../lib/audio';
import { cardStatus, packInfo, packProgress, packState } from '../../lib/packs';
import { relativeDue } from '../../lib/srs';
import { useStore } from '../../lib/store';
import { colors, kindStyle, PAPER, radius } from '../../theme';

const STATE_LABEL = { done: 'Done', current: 'In progress', early: 'Started early', open: 'Open', locked: 'Locked' } as const;

/** One pack: how far each card has got, and what you can do with the pack right now. */
export default function PackPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { y, onScroll } = useScrollY();
  const reviews = useStore((s) => s.reviews);
  const currentPack = useStore((s) => s.currentPack);
  const setCurrentPack = useStore((s) => s.setCurrentPack);
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const info = id ? packInfo[id] : undefined;

  if (!info) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingHorizontal: 16 }]}>
        <IconButton icon="chevron-left" label="Back" onPress={back} />
        <Txt size={15} color={colors.textMuted} style={{ padding: 4, paddingTop: 16 }}>
          This pack isn’t on the path any more.
        </Txt>
      </View>
    );
  }

  const p = info.pack;
  const progress = packProgress(p.id, reviews);
  const state = packState(p.id, reviews, currentPack);
  const kind = kindStyle[info.track.kind];
  const prev = info.prev ? packInfo[info.prev] : null;

  const action =
    state === 'done'
      ? { label: 'Practice this pack', icon: 'shuffle' as const, go: () => router.push({ pathname: '/session', params: { practice: p.id } }) }
      : state === 'current' || state === 'early'
        ? { label: 'Continue on Today', icon: 'arrow-right' as const, go: () => router.navigate('/') }
        : state === 'open'
          ? {
              label: 'Make this my current pack',
              icon: 'flag' as const,
              go: () => {
                setCurrentPack(p.id);
                router.navigate('/');
              },
            }
          : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader y={y} style={{ paddingBottom: 8 }}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
          <Txt size={14} color={colors.textMuted}>
            {info.track.title} · Unit {info.unitNumber}
          </Txt>
        </View>
      </ScreenHeader>

      <Animated.ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 16 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={{ gap: 8, paddingTop: 4 }}>
          <View style={styles.meta}>
            <Pill label={info.track.title} bg={kind.bg} fg={kind.fg} style={{ paddingVertical: 3 }} />
            <Txt weight="mono" size={12} color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
              {info.unit.title.toUpperCase()} · PACK {info.number}
            </Txt>
            <View style={[styles.state, state !== 'open' && state !== 'locked' ? { backgroundColor: colors.limeDeep } : null]}>
              <Txt weight="semibold" size={12} color={state !== 'open' && state !== 'locked' ? colors.limeSoft : colors.textMuted}>
                {state === 'current' && progress.started && progress.fresh === 0 ? 'Wrapping up' : STATE_LABEL[state]}
              </Txt>
            </View>
          </View>
          <Txt weight="semibold" size={28} style={{ letterSpacing: -0.8 }} accessibilityRole="header">
            {p.title}
          </Txt>
          <Txt size={14} color={colors.textMuted}>
            {p.blurb}
          </Txt>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Txt size={12} color={colors.textMuted}>
              Known once
            </Txt>
            <Txt weight="mono" size={20}>
              <Txt weight="mono" size={20} color={colors.lime}>
                {progress.known}
              </Txt>{' '}
              / {progress.total}
            </Txt>
          </View>
          <View style={styles.stat}>
            <Txt size={12} color={colors.textMuted}>
              Mastered (box 5)
            </Txt>
            <Txt weight="mono" size={20}>
              {progress.mastered} / {progress.total}
            </Txt>
          </View>
        </View>
        <PackBar packId={p.id} reviews={reviews} />

        {action ? (
          <PressScale style={styles.primaryBtn} onPress={action.go} accessibilityRole="button">
            <Icon name={action.icon} size={17} color={colors.ink} />
            <Txt weight="semibold" size={15} color={colors.ink}>
              {action.label}
            </Txt>
          </PressScale>
        ) : (
          <View style={styles.lockedBtn}>
            <Icon name="lock" size={14} color={colors.textMuted} />
            <Txt size={14} color={colors.textMuted} numberOfLines={2} style={{ flexShrink: 1, textAlign: 'center' }}>
              {prev ? `Opens when Pack ${prev.number} · ${prev.pack.title} is done` : 'Locked'}
            </Txt>
          </View>
        )}
        {Platform.OS === 'web' && clipCount(p.cardIds) > 0 && <OfflineAudio packId={p.id} cardIds={p.cardIds} />}

        <View style={styles.list}>
          {p.cardIds.map((cid) => {
            const card = cardsById[cid];
            if (!card) return null;
            const r = reviews[cid];
            const st = cardStatus(r);
            const status = !r ? 'New' : r.box === 1 ? `Learning · back ${relativeDue(r.dueAt, now)}` : `Box ${r.box} · back ${relativeDue(r.dueAt, now)}`;
            const art = illustrations[cid];
            return (
              <PressScale
                key={cid}
                style={styles.row}
                scaleTo={0.98}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: cid } })}
                accessibilityRole="link"
                accessibilityLabel={`${card.term}. ${status}. Open full story`}
              >
                {art ? <Image source={art} resizeMode="cover" style={styles.rowArt} /> : <View style={[styles.rowArt, styles.noArt]} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semibold" size={15} numberOfLines={1}>
                    {card.term}
                  </Txt>
                  <Txt size={12} color={!r ? colors.textFaint : r.box === 1 ? colors.orangeSoft : colors.textMuted}>
                    {status}
                  </Txt>
                </View>
                <View style={styles.dots}>
                  {[1, 2, 3, 4, 5].map((b) => (
                    <View
                      key={b}
                      style={[styles.dot, { backgroundColor: r && b <= r.box ? (st === 'learning' ? STATUS_COLOR.learning : STATUS_COLOR.known) : STATUS_COLOR.new }]}
                    />
                  ))}
                </View>
                <Icon name="chevron-right" size={15} color={colors.textFaint} />
              </PressScale>
            );
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

/** Web only: fetch this pack's audio so it plays offline. */
function OfflineAudio({ packId, cardIds }: { packId: string; cardIds: string[] }) {
  const voice = useStore((s) => s.voice);
  const done = useStore((s) => s.offlineAudio.includes(`${s.voice}:${packId}`));
  const mark = useStore((s) => s.markOfflineAudio);
  const [progress, setProgress] = useState<string | null>(null);
  return (
    <PressScale
      style={styles.offline}
      disabled={done || progress != null}
      accessibilityRole="button"
      onPress={async () => {
        setProgress('0%');
        await downloadClips(cardIds, (n, total) => setProgress(`${Math.round((n / total) * 100)}%`));
        mark(`${voice}:${packId}`);
        setProgress(null);
      }}
    >
      <Icon name={done ? 'check' : 'download'} size={14} color={done ? colors.limeSoft : colors.textMuted} />
      <Txt weight="medium" size={13} color={done ? colors.limeSoft : colors.textMuted}>
        {done ? 'Audio saved offline' : progress ? `Saving audio… ${progress}` : 'Save this pack’s audio offline'}
      </Txt>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  state: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.chip },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 14, gap: 4, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27' },
  primaryBtn: { height: 52, borderRadius: radius.pill, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  lockedBtn: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  offline: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  list: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#1F221C' },
  rowArt: { width: 52, height: 39, borderRadius: 9, backgroundColor: PAPER },
  noArt: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
