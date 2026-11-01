import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { LevelChip } from '../../components/LevelChip';
import { ScreenHeader, useScrollY } from '../../components/ScreenHeader';
import { PressScale, Txt } from '../../components/ui';
import { allCards, cardsById } from '../../data';
import { BOX_INTERVAL_DAYS, dayKey, isDue, relativeDue } from '../../lib/srs';
import { hasFeature } from '../../lib/levels';
import { liveStreak, useLevel, useStore } from '../../lib/store';
import { colors, radius, springs } from '../../theme';

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function Bar({ value, max, highlight, delay }: { value: number; max: number; highlight: boolean; delay: number }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.set(withDelay(delay, withSpring(max ? (value / max) * 76 : 0, springs.soft)));
  }, [value, max, delay, h]);
  const style = useAnimatedStyle(() => ({ height: Math.max(4, h.value) }));
  return <Animated.View style={[styles.bar, { backgroundColor: highlight ? colors.lime : '#3A3E35' }, style]} />;
}

export default function Progress() {
  const { y, onScroll } = useScrollY();
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));
  const router = useRouter();
  const reviews = useStore((s) => s.reviews);
  const history = useStore((s) => s.history);
  const streak = useStore((s) => liveStreak(s.streak, s.freezes));
  const uses = useStore((s) => s.uses);
  const level = useLevel();
  const resetProgress = useStore((s) => s.resetProgress);
  const [confirmReset, setConfirmReset] = useState(false);

  const stats = useMemo(() => {
    const list = Object.entries(reviews);
    const boxes = [1, 2, 3, 4, 5].map((b) => list.filter(([, r]) => r.box === b).length);
    const due = list.filter(([, r]) => isDue(r, now)).length;
    const mastered = boxes[4];
    const upcoming = list
      .filter(([id, r]) => cardsById[id] && r.dueAt > now)
      .sort((a, b) => a[1].dueAt - b[1].dueAt)
      .slice(0, 5)
      .map(([id, r]) => ({ id, term: cardsById[id].term, when: relativeDue(r.dueAt, now) }));
    const week = Array.from({ length: 7 }, (_, i) => {
      const t = now - (6 - i) * DAY;
      return { label: WEEKDAY[new Date(t).getDay()], n: history[dayKey(t)] ?? 0, today: i === 6 };
    });
    const since = now - 7 * DAY;
    const recap = {
      reviewed: week.reduce((n, w) => n + w.n, 0),
      days: week.filter((w) => w.n > 0).length,
      mastered: list.filter(([, r]) => r.box >= 5 && r.lastSeen >= since).length,
      used: Object.values(uses).reduce((n, l) => n + l.filter((u) => u.at >= since).length, 0),
    };
    return { boxes, due, mastered, upcoming, week, seen: list.length, recap };
  }, [reviews, history, uses, now]);

  const maxWeek = Math.max(1, ...stats.week.map((w) => w.n));
  const quietWeek = stats.week.every((w) => w.n === 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader y={y} style={{ paddingBottom: 12 }}>
        <Txt weight="semibold" size={28} style={{ letterSpacing: -0.8, paddingHorizontal: 20 }} accessibilityRole="header">
          Progress
        </Txt>
      </ScreenHeader>
      <Animated.ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 28 }} onScroll={onScroll} scrollEventThrottle={16}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <LevelChip level={level} />
        </View>
        <View style={styles.statRow}>
          <View style={[styles.stat, streak > 0 && { backgroundColor: colors.lime, borderColor: colors.lime }]}>
            <Txt weight="semibold" size={26} color={streak > 0 ? colors.ink : colors.text}>
              {streak}
            </Txt>
            <Txt weight="medium" size={12} color={streak > 0 ? colors.ink : colors.textMuted}>
              day streak
            </Txt>
          </View>
          <View style={styles.stat}>
            <Txt weight="semibold" size={26}>
              {stats.mastered}
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              mastered
            </Txt>
          </View>
          <View style={styles.stat}>
            <Txt weight="semibold" size={26}>
              {stats.due}
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              due now
            </Txt>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Txt weight="semibold" size={16}>
              This week
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              cards reviewed
            </Txt>
          </View>
          <View style={styles.chart}>
            {stats.week.map((w, i) => (
              <View key={i} style={styles.col}>
                <Txt weight="mono" size={11} color={colors.textMuted}>
                  {w.n > 0 ? w.n : ' '}
                </Txt>
                <Bar value={w.n} max={maxWeek} highlight={w.today} delay={i * 40} />
                <Txt size={11} color={w.today ? colors.text : colors.textMuted}>
                  {w.label}
                </Txt>
              </View>
            ))}
            {quietWeek && (
              <View style={styles.chartEmpty} pointerEvents="none">
                <Txt size={13} color={colors.textMuted} style={{ textAlign: 'center' }}>
                  No reviews yet this week. Sort a few cards on Learn.
                </Txt>
              </View>
            )}
          </View>
        </View>

        {hasFeature(level.n, 'recap') && (
          <View style={[styles.panel, styles.recap]}>
            <View style={styles.panelHead}>
              <Txt weight="semibold" size={16}>
                Your week
              </Txt>
              <Txt size={12} color={colors.textMuted}>
                last 7 days
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
              {[
                { n: stats.recap.reviewed, label: 'cards reviewed' },
                { n: stats.recap.days, label: stats.recap.days === 1 ? 'day studied' : 'days studied' },
                { n: stats.recap.mastered, label: 'mastered' },
                { n: stats.recap.used, label: stats.recap.used === 1 ? 'real use' : 'real uses' },
              ].map((r) => (
                <View key={r.label} style={{ width: '50%', gap: 2 }}>
                  <Txt weight="semibold" size={24}>
                    {r.n}
                  </Txt>
                  <Txt size={12} color={colors.textMuted}>
                    {r.label}
                  </Txt>
                </View>
              ))}
            </View>
            <Txt size={13} color={colors.textSoft} style={{ lineHeight: 19 }}>
              {stats.recap.used > 0
                ? 'You used new language for real this week. That is what sticks.'
                : 'Try one term at work this week, then log it on the card.'}
            </Txt>
          </View>
        )}

        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Txt weight="semibold" size={16}>
              Memory boxes
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              {stats.seen} of {allCards.length} seen
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {stats.boxes.map((n, i) => {
              const top = i === 4 && n > 0;
              return (
                <View key={i} style={[styles.box, { backgroundColor: top ? colors.lime : i >= 2 ? colors.limeDeep : colors.chip }]}>
                  <Txt weight="semibold" size={20} color={top ? colors.ink : colors.text}>
                    {n}
                  </Txt>
                  <Txt weight="medium" size={11} color={top ? colors.ink : colors.textMuted}>
                    {BOX_INTERVAL_DAYS[i] === 1 ? 'daily' : `${BOX_INTERVAL_DAYS[i]} days`}
                  </Txt>
                </View>
              );
            })}
          </View>
          <Txt size={12} color={colors.textFaint} style={{ lineHeight: 18 }}>
            Swipe right: up one box. Swipe left: back to box 1.
          </Txt>
        </View>

        {stats.upcoming.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 8 }}>
            <Txt weight="semibold" size={16} style={{ marginLeft: 4, marginBottom: 2 }}>
              Coming back soon
            </Txt>
            {stats.upcoming.map((u) => (
              <PressScale
                key={u.id}
                style={styles.row}
                scaleTo={0.98}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: u.id } })}
                accessibilityRole="link"
              >
                <Txt weight="medium" size={15}>
                  {u.term}
                </Txt>
                <Txt size={13} color={colors.textMuted}>
                  {u.when}
                </Txt>
              </PressScale>
            ))}
          </View>
        )}

        {stats.seen > 0 && (
          <PressScale
            style={[styles.reset, confirmReset && { borderColor: colors.orange }]}
            onPress={() => {
              if (confirmReset) {
                resetProgress();
                setConfirmReset(false);
              } else setConfirmReset(true);
            }}
            accessibilityRole="button"
          >
            <Txt weight="medium" size={14} color={confirmReset ? colors.orange : colors.textMuted}>
              {confirmReset ? 'Tap again to erase all progress' : 'Reset progress'}
            </Txt>
          </PressScale>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  statRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  stat: { flex: 1, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, gap: 2 },
  panel: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  recap: { borderColor: colors.limeDeep },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chart: { height: 116, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  chartEmpty: { position: 'absolute', left: 0, right: 0, top: 18, alignItems: 'center', paddingHorizontal: 12 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  bar: { width: '100%', borderRadius: 8 },
  box: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', gap: 2 },
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
  reset: {
    alignSelf: 'center',
    marginTop: 24,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
});
