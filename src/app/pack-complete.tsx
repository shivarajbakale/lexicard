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
import { packInfo, packProgress, struggle } from '../lib/packs';
import { daysBetween, useLevel, useStore } from '../lib/store';
import { dayKey, relativeDue } from '../lib/srs';
import { colors, PAPER, radius } from '../theme';

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
  const level = useLevel();

  const info = id ? packInfo[id] : undefined;
  // Decided once: starting the next pack changes the current pack, and the screen shouldn't re-lay itself out on the way out.
  const [offerNext] = useState(() => !!info?.next && currentPack === info.pack.id);

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

  // Pack first, then any level-up that came with it.
  const after = () => {
    if (level.n > levelSeen) router.replace('/level-up');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const startNext = () => {
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
        {next && offerNext ? (
          <>
            <View style={styles.next}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt weight="mono" size={12} color={colors.limeSoft}>
                  NEXT UP · PACK {next.number}
                </Txt>
                <Txt weight="mono" size={12} color={colors.textMuted}>
                  {next.pack.cardIds.length} cards
                </Txt>
              </View>
              <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }}>
                {next.pack.title}
              </Txt>
              <Txt size={13} color={colors.textMuted} numberOfLines={1}>
                {next.unit.id === info.unit.id ? next.pack.blurb : `New unit: ${next.unit.title}`}
              </Txt>
            </View>
            <PressScale style={styles.primaryBtn} onPress={startNext} accessibilityRole="button">
              <Txt weight="semibold" size={16} color={colors.ink} numberOfLines={1}>
                Start {next.pack.title}
              </Txt>
            </PressScale>
            <PressScale style={styles.textBtn} onPress={choose} accessibilityRole="button">
              <Txt weight="medium" size={14} color={colors.textMuted}>
                Choose a different pack
              </Txt>
            </PressScale>
          </>
        ) : (
          <PressScale style={styles.primaryBtn} onPress={next ? after : choose} accessibilityRole="button">
            <Txt weight="semibold" size={16} color={colors.ink}>
              {next ? 'Keep going' : 'Track complete · open Path'}
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
});
