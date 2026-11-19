import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, PressScale, Txt } from '../components/ui';
import { cardsById } from '../data';
import { illustrations } from '../data/illustrations';
import { feedback } from '../lib/haptics';
import { cardPoints } from '../lib/levels';
import { packInfo, packProgress, struggle, todayQueue, trackPackIds, tracks } from '../lib/packs';
import { BONUS_NEW, daysBetween, newLeftToday, useLevel, useStore } from '../lib/store';
import { dayKey, relativeDue } from '../lib/srs';
import { colors, kindStyle, PAPER, radius } from '../theme';

/** Shown once per pack, the moment every card in it has been known at least once. */
export default function PackComplete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reviews = useStore((s) => s.reviews);
  const uses = useStore((s) => s.uses);
  const started = useStore((s) => s.packStarted);
  const currentPack = useStore((s) => s.currentPack);
  const levelSeen = useStore((s) => s.levelSeen);
  const celebratePack = useStore((s) => s.celebratePack);
  const setCurrentPack = useStore((s) => s.setCurrentPack);
  const addBonusNew = useStore((s) => s.addBonusNew);
  const level = useLevel();

  const info = id ? packInfo[id] : undefined;
  // Decided once: starting the next pack changes the current pack, and the screen shouldn't re-lay itself out on the way out.
  const [offerNext] = useState(() => !!info?.next && currentPack === info.pack.id);
  // How many new cards the next pack would give today, worked out once for the same reason.
  const [nextNew] = useState(() => {
    const s = useStore.getState();
    if (!info?.next) return 0;
    const q = todayQueue(s.reviews, info.next, newLeftToday(s));
    return q.fresh.length + q.early.length;
  });
  // At the end of a track: the next pack worth doing on each other track (ones already started first).
  const [elsewhere] = useState(() => {
    if (!info || info.next || currentPack !== info.pack.id) return [];
    const s = useStore.getState();
    return tracks
      .filter((t) => t.id !== info.track.id)
      .map((t) => trackPackIds[t.id].find((pid) => !packProgress(pid, s.reviews).done))
      .filter((pid): pid is string => !!pid)
      .sort((a, b) => Number(packProgress(b, s.reviews).started) - Number(packProgress(a, s.reviews).started));
  });

  useEffect(() => {
    if (!info) return;
    celebratePack(info.pack.id);
    feedback('success');
  }, [info, celebratePack]);

  if (!info) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: 20 }]}>
        <Txt size={15} color={colors.textMuted}>
          This pack isn’t on the path any more.
        </Txt>
      </View>
    );
  }

  const ids = info.pack.cardIds;
  const progress = packProgress(info.pack.id, reviews);
  const points = ids.reduce((n, cid) => n + cardPoints(reviews[cid], uses[cid]), 0);
  const days = started[info.pack.id] ? daysBetween(started[info.pack.id], dayKey()) + 1 : null;
  const hard = ids
    .filter((cid) => struggle(reviews[cid]) > 0)
    .sort((a, b) => struggle(reviews[b]) - struggle(reviews[a]))
    .slice(0, 3);
  const arts = ids.filter((cid) => illustrations[cid]).slice(0, 5);
  const next = info.next ? packInfo[info.next] : null;
  const nextProgress = next ? packProgress(next.pack.id, reviews) : null;
  const unitDone = info.unit.packs.every((p) => packProgress(p.id, reviews).done);
  const unitCards = info.unit.packs.reduce((n, p) => n + p.cardIds.length, 0);
  const trackDone = trackPackIds[info.track.id].every((pid) => packProgress(pid, reviews).done);
  const kindLabel = kindStyle[info.track.kind].label.toLowerCase();

  // Pack first, then any level-up that came with it.
  const after = () => {
    if (level.n > levelSeen) router.replace('/level-up');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  // Straight into the next pack's first session, unless a level-up is waiting to be shown first.
  const go = (packId: string, bonus = 0) => {
    setCurrentPack(packId);
    if (bonus) addBonusNew(bonus);
    if (level.n > levelSeen) router.replace('/level-up');
    else if (nextNew > 0 || bonus) router.replace('/session');
    else after();
  };
  const continueTomorrow = () => {
    if (next) setCurrentPack(next.pack.id);
    after();
  };
  const choose = () => {
    if (level.n > levelSeen) router.replace('/level-up');
    else router.replace('/library');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 18, paddingBottom: 12 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.ring}>
            <View style={styles.badge}>
              <Icon name="check" size={34} color={colors.ink} />
            </View>
          </Animated.View>
          <Txt weight="mono" size={12} color={colors.limeSoft} style={{ letterSpacing: 0.8, marginTop: 8 }}>
            PACK {info.number} COMPLETE
          </Txt>
          <Txt weight="semibold" size={30} style={{ letterSpacing: -0.9, textAlign: 'center' }} accessibilityRole="header">
            {info.pack.title}
          </Txt>
        </View>

        {unitDone && (
          <Animated.View entering={FadeInDown.duration(320).delay(80)} style={styles.unit}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Txt weight="mono" size={12} color={colors.limeSoft} style={{ letterSpacing: 0.6 }}>
                {trackDone ? `${info.track.title.toUpperCase()} TRACK COMPLETE` : `UNIT ${info.unitNumber} COMPLETE`}
              </Txt>
              <Txt weight="mono" size={12} color={colors.limeSoft}>
                {info.unit.packs.length}/{info.unit.packs.length} {info.unit.packs.length === 1 ? 'pack' : 'packs'}
              </Txt>
            </View>
            <Txt weight="semibold" size={17}>
              {info.unit.title}
            </Txt>
            <Txt size={13} color={colors.textSoft} style={{ lineHeight: 18 }}>
              {unitCards} {kindLabel}s known once. They keep coming back in reviews until they reach box 5.
            </Txt>
          </Animated.View>
        )}

        {arts.length > 0 && (
          <Animated.View entering={FadeInDown.duration(320).delay(120)} style={styles.arts} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {arts.map((cid) => (
              <Image key={cid} source={illustrations[cid]} resizeMode="cover" style={styles.art} />
            ))}
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(320).delay(180)} style={styles.stats}>
          <Stat value={`${progress.known}`} label="cards known" />
          {days != null && <Stat value={`${days}`} label={days === 1 ? 'day' : 'days'} />}
          <Stat value={`+${points}`} label="points" />
        </Animated.View>

        <View style={{ gap: 8 }}>
          <Txt weight="semibold" size={12} color={colors.textFaint} style={styles.caps}>
            Keep an eye on
          </Txt>
          {hard.length ? (
            <View style={styles.list}>
              {hard.map((cid) => (
                <PressScale
                  key={cid}
                  style={styles.row}
                  scaleTo={0.98}
                  onPress={() => router.push({ pathname: '/card/[id]', params: { id: cid } })}
                  accessibilityRole="link"
                >
                  {illustrations[cid] && <Image source={illustrations[cid]} resizeMode="cover" style={styles.rowArt} />}
                  <Txt weight="semibold" size={15} style={{ flex: 1 }} numberOfLines={1}>
                    {cardsById[cid]?.term}
                  </Txt>
                  <Txt size={12} color={colors.textMuted}>
                    <Txt size={12} color={colors.orangeSoft}>
                      {struggle(reviews[cid]) + 1} goes
                    </Txt>
                    {reviews[cid] ? ` · back ${relativeDue(reviews[cid].dueAt)}` : ''}
                  </Txt>
                  <Icon name="chevron-right" size={15} color={colors.textFaint} />
                </PressScale>
              ))}
            </View>
          ) : (
            <Txt size={14} color={colors.textSoft}>
              No misses. A clean run.
            </Txt>
          )}
          <Txt size={13} color={colors.textMuted} style={{ lineHeight: 19 }}>
            Every card keeps coming back in your reviews until it reaches box 5. That’s mastered.
          </Txt>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {next && nextProgress && offerNext ? (
          <>
            <View style={styles.next}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                <Txt weight="mono" size={12} color={colors.limeSoft} numberOfLines={1} style={{ flexShrink: 1 }}>
                  NEXT UP · PACK {next.number}
                  {next.unit.id !== info.unit.id ? ' · NEW UNIT' : ''}
                </Txt>
                <Txt weight="mono" size={12} color={colors.textMuted}>
                  {nextProgress.started ? `${nextProgress.total - nextProgress.fresh}/${nextProgress.total} seen` : `${nextProgress.total} cards`}
                </Txt>
              </View>
              <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }}>
                {next.pack.title}
              </Txt>
              <Txt size={13} color={colors.textMuted} style={{ lineHeight: 18 }}>
                {nextNew > 0
                  ? `${nextProgress.started ? 'Already started. ' : ''}${nextNew} new ${nextNew === 1 ? 'card' : 'cards'} ready today.`
                  : `You’ve learned today’s new cards. This pack ${nextProgress.started ? 'carries on' : 'starts'} tomorrow.`}
              </Txt>
            </View>
            {nextNew > 0 ? (
              <>
                <PressScale style={styles.primaryBtn} onPress={() => go(next.pack.id)} accessibilityRole="button">
                  <Txt weight="semibold" size={16} color={colors.ink} numberOfLines={1}>
                    {nextProgress.started ? 'Continue' : 'Start'} Pack {next.number} · {nextNew} new
                  </Txt>
                </PressScale>
                <PressScale style={styles.textBtn} onPress={choose} accessibilityRole="button">
                  <Txt weight="medium" size={14} color={colors.textMuted}>
                    Choose a different pack
                  </Txt>
                </PressScale>
              </>
            ) : (
              <>
                <PressScale style={styles.primaryBtn} onPress={continueTomorrow} accessibilityRole="button">
                  <Txt weight="semibold" size={16} color={colors.ink}>
                    Continue tomorrow
                  </Txt>
                </PressScale>
                {nextProgress.fresh > 0 && (
                  <PressScale style={styles.secondaryBtn} onPress={() => go(next.pack.id, Math.min(BONUS_NEW, nextProgress.fresh))} accessibilityRole="button">
                    <Icon name="plus" size={16} color={colors.text} />
                    <Txt weight="semibold" size={15}>
                      Learn {Math.min(BONUS_NEW, nextProgress.fresh)} more today
                    </Txt>
                  </PressScale>
                )}
              </>
            )}
          </>
        ) : !next && elsewhere.length > 0 ? (
          <>
            <Txt weight="semibold" size={12} color={colors.textFaint} style={styles.caps}>
              Keep going on another track
            </Txt>
            {elsewhere.map((pid, i) => {
              const o = packInfo[pid];
              const op = packProgress(pid, reviews);
              return (
                <PressScale
                  key={pid}
                  style={[styles.next, i === 0 && { borderColor: colors.lime }]}
                  scaleTo={0.98}
                  onPress={() => {
                    setCurrentPack(pid);
                    after();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${o.track.title}, pack ${o.number}, ${o.pack.title}. ${op.started ? 'In progress' : 'Not started'}.`}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <Txt weight="mono" size={12} color={i === 0 ? colors.limeSoft : colors.textMuted}>
                      {o.track.title.toUpperCase()} · PACK {o.number} · {op.started ? 'IN PROGRESS' : 'NOT STARTED'}
                    </Txt>
                    {op.started && (
                      <Txt weight="mono" size={12} color={colors.textMuted}>
                        {op.total - op.fresh}/{op.total} seen
                      </Txt>
                    )}
                  </View>
                  <Txt weight="semibold" size={18}>
                    {o.pack.title}
                  </Txt>
                </PressScale>
              );
            })}
            <PressScale style={styles.textBtn} onPress={choose} accessibilityRole="button">
              <Txt weight="medium" size={14} color={colors.textMuted}>
                Open Path
              </Txt>
            </PressScale>
          </>
        ) : (
          <PressScale style={styles.primaryBtn} onPress={next ? after : choose} accessibilityRole="button">
            <Txt weight="semibold" size={16} color={colors.ink}>
              {next ? 'Keep going' : trackDone ? 'Track complete · open Path' : 'Open Path'}
            </Txt>
          </PressScale>
        )}
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Txt weight="mono" size={22}>
        {value}
      </Txt>
      <Txt size={12} color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  ring: { width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  arts: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  art: { width: 58, height: 44, borderRadius: 10, backgroundColor: PAPER },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27', alignItems: 'center', gap: 2 },
  caps: { letterSpacing: 0.8, textTransform: 'uppercase' },
  list: { borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#222520' },
  rowArt: { width: 36, height: 27, borderRadius: 6, backgroundColor: PAPER },
  next: { padding: 16, gap: 6, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong },
  primaryBtn: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  textBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryBtn: {
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  unit: { padding: 16, gap: 8, borderRadius: radius.xl, backgroundColor: colors.limeDeep },
});
