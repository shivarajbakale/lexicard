import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LevelPill } from '../../components/LevelChip';
import { PackBar, PackLegend, PackNode, PackThumbs } from '../../components/packs';
import { Icon, Pill, PressScale, Txt } from '../../components/ui';
import { packInfo, packProgress, packState, todayQueue, trackPackIds } from '../../lib/packs';
import { liveStreak, newLeftToday, useLevel, useStore } from '../../lib/store';
import { colors, kindStyle, radius } from '../../theme';

/** The way into the app: where you are on your path, and one obvious thing to do today. */
export default function Today() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hydrated = useStore((s) => s.hydrated);
  const onboarded = useStore((s) => s.onboarded);
  const reviews = useStore((s) => s.reviews);
  const currentPack = useStore((s) => s.currentPack);
  const celebrated = useStore((s) => s.packsCelebrated);
  const history = useStore((s) => s.history);
  const newLeft = useStore(newLeftToday);
  const setCurrentPack = useStore((s) => s.setCurrentPack);
  const streak = useStore((s) => liveStreak(s.streak, s.freezes));
  const freezes = useStore((s) => s.freezes);
  const level = useLevel();
  // Due counts depend on the clock, so recount whenever the tab comes back into view.
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));

  useEffect(() => {
    if (hydrated && !onboarded) router.replace('/onboarding');
  }, [hydrated, onboarded, router]);

  if (!hydrated || !onboarded) return <View style={styles.screen} />;

  const info = packInfo[currentPack];
  const progress = packProgress(currentPack, reviews);
  const { due, fresh } = todayQueue(reviews, currentPack, newLeft, now);
  const work = due.length + fresh.length;
  const kind = kindStyle[info.track.kind];
  const next = info.next ? packInfo[info.next] : null;
  const studiedBefore = Object.keys(history).length > 0;

  const line = [due.length ? `${due.length} ${due.length === 1 ? 'review' : 'reviews'}` : '', fresh.length ? `${fresh.length} new` : ''].filter(Boolean).join(' + ');
  const heading = work ? (studiedBefore ? 'Welcome back' : 'Ready when you are') : 'Nice work today';
  const restLine = `Done for today. ${
    progress.fresh ? `${progress.fresh} new ${progress.fresh === 1 ? 'card waits' : 'cards wait'} for tomorrow` : 'Missed cards come back tomorrow'
  }${progress.learning ? `, with ${progress.learning} to retry.` : '.'}`;

  const startNext = () => {
    if (!next) return router.push('/library');
    setCurrentPack(next.pack.id);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 28, paddingHorizontal: 20 }}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Txt weight="bold" size={17} color={colors.ink}>
            L
          </Txt>
        </View>
        <LevelPill level={level} />
        <View style={{ flex: 1 }} />
        <View style={styles.streak} accessibilityLabel={streak > 0 ? `${streak}-day streak` : 'No streak yet'}>
          <Icon name="zap" size={14} color={colors.lime} />
          <Txt weight="medium" size={13}>
            {streak > 0 ? `${streak} ${streak === 1 ? 'day' : 'days'}` : 'Start'}
          </Txt>
          {freezes > 0 && (
            <View style={styles.freeze} accessibilityLabel={`${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'}`}>
              <Icon name="cloud-snow" size={13} color={colors.textSoft} />
              <Txt weight="mono" size={12} color={colors.textSoft}>
                {freezes}
              </Txt>
            </View>
          )}
        </View>
      </View>

      <Txt weight="semibold" size={28} style={styles.heading} accessibilityRole="header">
        {heading}
      </Txt>

      <Animated.View entering={FadeInDown.duration(280)} style={styles.packCard}>
        <View style={styles.packMeta}>
          <Pill label={info.track.title} bg={kind.bg} fg={kind.fg} style={{ paddingVertical: 3 }} />
          <Txt weight="mono" size={12} color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1 }}>
            UNIT {info.unitNumber} · PACK {info.number} OF {trackPackIds[info.track.id].length}
          </Txt>
        </View>
        <PressScale
          style={styles.packTitleRow}
          scaleTo={0.99}
          onPress={() => router.push({ pathname: '/pack/[id]', params: { id: currentPack } })}
          accessibilityRole="link"
          accessibilityLabel={`${info.pack.title}. Open pack`}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Txt weight="semibold" size={26} style={{ letterSpacing: -0.7 }}>
              {info.pack.title}
            </Txt>
            <Txt size={14} color={colors.textMuted} numberOfLines={2}>
              {info.unit.title === 'Starter' ? info.pack.blurb : `${info.unit.title} · ${info.pack.cardIds.length} cards`}
            </Txt>
          </View>
          <PackThumbs packId={currentPack} />
        </PressScale>
        <PackBar packId={currentPack} reviews={reviews} />
        <PackLegend packId={currentPack} reviews={reviews} />

        <View style={styles.divider} />
        {work > 0 ? (
          <>
            <View style={styles.sessionRow}>
              <Txt weight="medium" size={15}>
                Today’s session
              </Txt>
              <Txt weight="mono" size={13} color={colors.limeSoft}>
                {line}
              </Txt>
            </View>
            <PressScale style={styles.primaryBtn} onPress={() => router.push('/session')} accessibilityRole="button">
              <Txt weight="semibold" size={16} color={colors.ink}>
                Start session
              </Txt>
              <Icon name="arrow-right" size={18} color={colors.ink} />
            </PressScale>
          </>
        ) : !progress.done ? (
          <>
            <View style={styles.restRow}>
              <View style={styles.restIcon}>
                <Icon name="check" size={18} color={colors.limeSoft} />
              </View>
              <Txt size={14} color={colors.textSoft} style={{ flex: 1, lineHeight: 20 }}>
                {restLine}
              </Txt>
            </View>
            <PressScale
              style={styles.secondaryBtn}
              onPress={() => router.push({ pathname: '/session', params: { practice: currentPack } })}
              accessibilityRole="button"
            >
              <Icon name="shuffle" size={16} color={colors.text} />
              <Txt weight="semibold" size={15}>
                Practice this pack
              </Txt>
            </PressScale>
          </>
        ) : null}

        {progress.done && (
          <View style={[styles.nextRow, work > 0 && { marginTop: 12 }]}>
            <Txt size={14} color={colors.textSoft} style={{ lineHeight: 20 }}>
              Pack done.{' '}
              {next ? (
                <>
                  Next up: <Txt weight="semibold">{next.pack.title}</Txt>
                </>
              ) : (
                'That’s the whole track. Pick another on Path.'
              )}
            </Txt>
            {!celebrated.includes(currentPack) ? (
              <PressScale style={styles.primaryBtn} onPress={() => router.push({ pathname: '/pack-complete', params: { id: currentPack } })} accessibilityRole="button">
                <Txt weight="semibold" size={16} color={colors.ink}>
                  See pack complete
                </Txt>
              </PressScale>
            ) : (
              <PressScale style={work > 0 ? styles.secondaryBtn : styles.primaryBtn} onPress={startNext} accessibilityRole="button">
                <Txt weight="semibold" size={work > 0 ? 15 : 16} color={work > 0 ? colors.text : colors.ink}>
                  {next ? `Start ${next.pack.title}` : 'Open Path'}
                </Txt>
              </PressScale>
            )}
          </View>
        )}
      </Animated.View>

      <View style={styles.unitHead}>
        <Txt weight="semibold" size={12} color={colors.textFaint} style={styles.caps} numberOfLines={1}>
          Unit {info.unitNumber} · {info.unit.title}
        </Txt>
        <PressScale onPress={() => router.navigate('/library')} accessibilityRole="link" style={styles.linkBtn}>
          <Txt weight="medium" size={13} color={colors.limeSoft}>
            See path
          </Txt>
        </PressScale>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }} style={{ marginHorizontal: -20 }}>
        <View style={{ width: 10 }} />
        {info.unit.packs.map((p) => {
          const state = packState(p.id, reviews, currentPack);
          const pr = packProgress(p.id, reviews);
          const status = state === 'done' ? 'Done' : state === 'current' ? `${pr.known}/${pr.total} known` : state === 'open' ? 'Open' : 'Locked';
          return (
            <PressScale
              key={p.id}
              style={[styles.tile, state === 'current' && styles.tileCurrent]}
              scaleTo={0.97}
              onPress={() => router.push({ pathname: '/pack/[id]', params: { id: p.id } })}
              accessibilityRole="link"
              accessibilityLabel={`Pack ${packInfo[p.id].number}, ${p.title}. ${status}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PackNode state={state} size={22} />
                <Txt weight="mono" size={11} color={colors.textMuted}>
                  PACK {packInfo[p.id].number}
                </Txt>
              </View>
              <Txt weight="semibold" size={14} numberOfLines={2} style={{ lineHeight: 18 }}>
                {p.title}
              </Txt>
              <Txt size={12} color={state === 'done' ? colors.lime : colors.textMuted}>
                {status}
              </Txt>
            </PressScale>
          );
        })}
        <View style={{ width: 10 }} />
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: '#2A2D27',
  },
  freeze: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: colors.borderStrong },
  heading: { letterSpacing: -0.8, marginTop: 22 },
  packCard: { marginTop: 16, padding: 20, borderRadius: radius.card, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27', gap: 14 },
  packMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: '#2A2D27', marginVertical: 2 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  restIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.limeDeep, alignItems: 'center', justifyContent: 'center' },
  nextRow: { gap: 12 },
  primaryBtn: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryBtn: {
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#3A3E35',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  unitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 6, gap: 10 },
  caps: { letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  tile: { width: 150, padding: 12, gap: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tileCurrent: { borderColor: '#4A5530', backgroundColor: colors.surface2 },
});
