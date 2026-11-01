import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextStep, ProgressTrack, TIER_BADGE } from '../components/LevelChip';
import { ScreenHeader, useScrollY } from '../components/ScreenHeader';
import { Icon, IconButton, PressScale, Txt, type IconName } from '../components/ui';
import { allCards } from '../data';
import { freezeSlots, hasFeature, LEVELS, type Feature, type LevelDef } from '../lib/levels';
import type { Setting } from '../lib/types';
import { levelInput, useLevel, useStore } from '../lib/store';
import { colors, radius } from '../theme';

const SETTING_LABEL: Record<Setting, string> = { work: 'at work', social: 'socially', writing: 'in writing' };

const TOOLS: { feature: Feature; icon: IconName; title: string; blurb: string; route?: '/quiz' | '/challenge' }[] = [
  { feature: 'quiz', icon: 'help-circle', title: 'Origin quiz', blurb: 'Well recorded, Likely or Myth check?', route: '/quiz' },
  { feature: 'challenge', icon: 'clock', title: 'Challenge mode', blurb: '60 seconds. Match terms to meanings.', route: '/challenge' },
  { feature: 'recap', icon: 'calendar', title: 'Weekly recap', blurb: 'Your week, on the Progress tab' },
];

function unlockText(def: LevelDef) {
  return def.unlocks.map((u) => u.label).join(' + ');
}

export default function Levels() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { y, onScroll } = useScrollY();
  const level = useLevel();
  const reviews = useStore((s) => s.reviews);
  const uses = useStore((s) => s.uses);
  const history = useStore((s) => s.history);
  const bestStreak = useStore((s) => s.bestStreak);
  const freezes = useStore((s) => s.freezes);
  const cardStyle = useStore((s) => s.cardStyle);
  const setCardStyle = useStore((s) => s.setCardStyle);
  const challengeBest = useStore((s) => s.challengeBest);

  const input = levelInput({ reviews, uses, history, bestStreak });
  const mastered = Object.values(reviews).filter((r) => Math.max(r.box, r.bestBox ?? 1) >= 5).length;
  const useCount = Object.values(uses).reduce((n, l) => n + l.length, 0);
  const next = level.next;
  const trial = next?.trial ?? null;
  const tp = trial ? trial.progress(input) : null;

  // Cards that can move the next trial forward right now.
  const candidates = useMemo(() => {
    const hint = trial?.hint;
    if (hint !== 'use-work' && hint !== 'use-any' && hint !== 'use-all-settings') return [];
    return allCards
      .filter((c) => {
        const r = reviews[c.id];
        if (!r || Math.max(r.box, r.bestBox ?? 1) < 2) return false;
        const done = new Set((uses[c.id] ?? []).map((u) => u.setting));
        if (hint === 'use-work') return !done.has('work');
        return done.size < 3;
      })
      .sort((a, b) => (uses[b.id]?.length ?? 0) - (uses[a.id]?.length ?? 0) || (reviews[b.id]?.box ?? 0) - (reviews[a.id]?.box ?? 0))
      .slice(0, 3)
      .map((c) => {
        const done = new Set((uses[c.id] ?? []).map((u) => u.setting));
        const missing = (['work', 'social', 'writing'] as Setting[]).filter((s) => !done.has(s));
        const where =
          hint === 'use-work'
            ? c.uses.find((u) => u.setting === 'work')?.where
            : missing.length === 3
              ? 'No uses logged yet'
              : `Not yet used ${missing.map((m) => SETTING_LABEL[m]).join(' or ')}`;
        return { id: c.id, term: c.term, where: where ?? '' };
      });
  }, [trial, reviews, uses]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const slots = freezeSlots(level.n);

  return (
    <View style={styles.screen}>
      <ScreenHeader y={y} style={{ paddingBottom: 10 }}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
          <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }} accessibilityRole="header">
            Your path
          </Txt>
        </View>
      </ScreenHeader>
      <Animated.ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} onScroll={onScroll} scrollEventThrottle={16}>
        <Animated.View entering={FadeInDown.duration(300)} style={styles.hero}>
          <View style={styles.rowBetween}>
            <View style={{ gap: 2, flex: 1 }}>
              <Txt weight="semibold" size={12} color={colors.ink} style={styles.caps}>
                Level {level.n} · {level.def.tier}
              </Txt>
              <Txt weight="semibold" size={30} color={colors.ink} style={{ letterSpacing: -0.8 }}>
                {level.def.name}
                {level.stars > 0 ? ` ${'★'.repeat(Math.min(level.stars, 5))}` : ''}
              </Txt>
            </View>
            <Txt weight="mono" size={14} color={colors.ink}>
              {level.points} pts
            </Txt>
          </View>
          <ProgressTrack frac={next ? level.frac : 1} height={8} color={colors.ink} track="rgba(11,12,10,0.15)" />
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Txt weight="mono" size={18} color={colors.ink}>
                {mastered}
              </Txt>
              <Txt size={12} color={colors.ink}>
                mastered
              </Txt>
            </View>
            <View style={styles.stat}>
              <Txt weight="mono" size={18} color={colors.ink}>
                {useCount}
              </Txt>
              <Txt size={12} color={colors.ink}>
                real uses
              </Txt>
            </View>
            <View style={styles.stat}>
              <Txt weight="mono" size={18} color={colors.ink}>
                {next ? level.toNext : level.stars}
              </Txt>
              <Txt size={12} color={colors.ink}>
                {next ? `to level ${next.n}` : 'stars'}
              </Txt>
            </View>
          </View>
        </Animated.View>

        {next && (
          <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.panel}>
            <View style={styles.rowBetween}>
              <Txt weight="semibold" size={17}>
                Next: {next.name}
              </Txt>
              {level.trialReady && (
                <View style={styles.readyPill}>
                  <Txt weight="semibold" size={12} color={colors.limeSoft}>
                    Points ready
                  </Txt>
                </View>
              )}
            </View>
            <Txt size={14} color={colors.textMuted} style={{ lineHeight: 20 }}>
              {nextStep(level)}. Unlocks: {unlockText(next)}.
            </Txt>
            {trial && tp && (
              <View style={styles.trialBox}>
                <View style={styles.rowBetween}>
                  <Txt weight="medium" size={14} style={{ flex: 1 }}>
                    Trial: {trial.label}
                  </Txt>
                  <Txt weight="mono" size={13} color={tp.have >= tp.need ? colors.limeSoft : colors.textMuted}>
                    {tp.have}/{tp.need}
                  </Txt>
                </View>
                <ProgressTrack frac={tp.have / tp.need} />
                {tp.have >= tp.need && !level.trialReady && (
                  <Txt size={13} color={colors.limeSoft}>
                    Trial passed. Earn the points and the level is yours.
                  </Txt>
                )}
              </View>
            )}
            {candidates.length > 0 && tp && tp.have < tp.need && (
              <View style={{ gap: 8 }}>
                <Txt weight="semibold" size={12} color={colors.textMuted} style={styles.caps}>
                  Ready to use
                </Txt>
                {candidates.map((c) => (
                  <PressScale
                    key={c.id}
                    style={styles.candidate}
                    scaleTo={0.98}
                    onPress={() => router.push({ pathname: '/card/[id]', params: { id: c.id, log: '1' } })}
                    accessibilityRole="button"
                    accessibilityLabel={`Log a real use of ${c.term}`}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt weight="semibold" size={15}>
                        {c.term}
                      </Txt>
                      <Txt size={12} color={colors.textMuted} numberOfLines={1}>
                        {c.where}
                      </Txt>
                    </View>
                    <View style={styles.smallBtn}>
                      <Txt weight="semibold" size={13} color={colors.ink}>
                        Used it
                      </Txt>
                    </View>
                  </PressScale>
                ))}
              </View>
            )}
            {(trial?.hint === 'review' || trial?.hint === 'master' || (!level.trialReady && !candidates.length)) && (
              <PressScale style={styles.primary} scaleTo={0.97} onPress={() => router.navigate('/')} accessibilityRole="button">
                <Txt weight="semibold" size={15} color={colors.ink}>
                  Study now
                </Txt>
              </PressScale>
            )}
          </Animated.View>
        )}

        <Txt weight="semibold" size={17} style={styles.sectionHead}>
          All levels
        </Txt>
        <View style={{ paddingHorizontal: 20 }}>
          {LEVELS.map((def, i) => {
            const isDone = def.n < level.n;
            const isCur = def.n === level.n;
            const isNext = def.n === level.n + 1;
            const last = i === LEVELS.length - 1;
            const t = TIER_BADGE[def.tier];
            const sub = isCur
              ? `You are here${def.unlocks.length ? ` · ${unlockText(def)}` : ''}`
              : isNext && def.trial
                ? `${def.trial.label} · opens ${unlockText(def)}`
                : unlockText(def) || 'Where everyone starts';
            return (
              <View key={def.n} style={{ flexDirection: 'row', gap: 14, opacity: isDone || isCur || isNext ? 1 : 0.55 }}>
                <View style={{ alignItems: 'center', width: 36 }}>
                  <View
                    style={[
                      styles.step,
                      { backgroundColor: isCur ? colors.lime : isDone ? t.bg : colors.surface, borderColor: isCur ? colors.lime : isNext ? colors.lime : colors.borderStrong },
                    ]}
                  >
                    {isDone ? (
                      <Icon name="check" size={16} color={t.fg} />
                    ) : (
                      <Txt weight="mono" size={14} color={isCur ? colors.ink : colors.text}>
                        {def.n}
                      </Txt>
                    )}
                  </View>
                  {!last && <View style={[styles.vline, { backgroundColor: isDone ? colors.lime : colors.line }]} />}
                </View>
                <View style={{ flex: 1, paddingTop: 7, paddingBottom: last ? 0 : 18, gap: 3 }}>
                  <View style={styles.rowBetween}>
                    <Txt weight="semibold" size={16}>
                      {def.name}
                    </Txt>
                    <Txt weight="mono" size={12} color={colors.textMuted}>
                      {def.points}
                    </Txt>
                  </View>
                  <Txt size={13} color={isNext ? colors.limeSoft : colors.textMuted} style={{ lineHeight: 18 }}>
                    {sub}
                  </Txt>
                </View>
              </View>
            );
          })}
        </View>

        <Txt weight="semibold" size={17} style={styles.sectionHead}>
          Rewards
        </Txt>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          <View style={styles.tool}>
            <View style={styles.toolIcon}>
              <Icon name="cloud-snow" size={18} color={slots ? colors.text : colors.textFaint} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="semibold" size={15} color={slots ? colors.text : colors.textMuted}>
                Streak freezes · {freezes}/{slots}
              </Txt>
              <Txt size={12} color={colors.textMuted}>
                {slots ? 'Each covers one missed day. Earn one every 7-day streak.' : 'Opens at level 3 · Speaker'}
              </Txt>
            </View>
          </View>
          {TOOLS.map((tool) => {
            const open = hasFeature(level.n, tool.feature);
            const at = LEVELS.find((l) => l.unlocks.some((u) => u.kind === 'feature' && u.feature === tool.feature))!;
            const blurb = open
              ? tool.feature === 'challenge' && challengeBest > 0
                ? `Best: ${challengeBest} in 60 seconds`
                : tool.blurb
              : `Opens at level ${at.n} · ${at.name}`;
            const route = tool.route;
            return (
              <PressScale
                key={tool.feature}
                style={[styles.tool, !open && styles.toolLocked]}
                scaleTo={0.98}
                disabled={!open || !route}
                onPress={() => route && router.push(route)}
                accessibilityRole={route ? 'button' : 'text'}
                accessibilityState={{ disabled: !open }}
              >
                <View style={styles.toolIcon}>
                  <Icon name={open ? tool.icon : 'lock'} size={18} color={open ? colors.lime : colors.textFaint} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semibold" size={15} color={open ? colors.text : colors.textMuted}>
                    {tool.title}
                  </Txt>
                  <Txt size={12} color={colors.textMuted}>
                    {blurb}
                  </Txt>
                </View>
                {open && route && <Icon name="chevron-right" size={18} color={colors.textMuted} />}
              </PressScale>
            );
          })}
          {hasFeature(level.n, 'ink') ? (
            <View style={styles.tool}>
              <View style={styles.toolIcon}>
                <Icon name="feather" size={18} color={colors.lime} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" size={15}>
                  Card style
                </Txt>
                <Txt size={12} color={colors.textMuted}>
                  {cardStyle === 'ink' ? 'Ink: black cards, lime edge' : 'Classic'}
                </Txt>
              </View>
              <View style={styles.segment} accessibilityRole="radiogroup">
                {(['classic', 'ink'] as const).map((k) => (
                  <PressScale
                    key={k}
                    style={[styles.segBtn, cardStyle === k && styles.segOn]}
                    scaleTo={0.95}
                    onPress={() => setCardStyle(k)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: cardStyle === k }}
                  >
                    <Txt weight="medium" size={13} color={cardStyle === k ? colors.ink : colors.textSoft}>
                      {k === 'ink' ? 'Ink' : 'Classic'}
                    </Txt>
                  </PressScale>
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.tool, styles.toolLocked]}>
              <View style={styles.toolIcon}>
                <Icon name="lock" size={18} color={colors.textFaint} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" size={15} color={colors.textMuted}>
                  Ink card style
                </Txt>
                <Txt size={12} color={colors.textMuted}>
                  Opens at level 8 · Wordsmith
                </Txt>
              </View>
            </View>
          )}
        </View>

        <View style={styles.rules}>
          <Txt weight="semibold" size={15}>
            How points work
          </Txt>
          <Txt size={13} color={colors.textMuted} style={{ lineHeight: 20 }}>
            A card earns points the first time it reaches each box: 1, 2, 3, then 4 for Box 5. That’s 10 per mastered card. Logging a real use earns 3 per setting. Practice swipes earn nothing, and levels never go down.
          </Txt>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  caps: { letterSpacing: 0.8, textTransform: 'uppercase' },
  hero: { marginHorizontal: 16, marginTop: 8, padding: 20, borderRadius: radius.xl, backgroundColor: colors.lime, gap: 14 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, gap: 1 },
  panel: { marginHorizontal: 16, marginTop: 12, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  readyPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.limeDeep },
  trialBox: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, gap: 10 },
  candidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingLeft: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  smallBtn: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.lime, justifyContent: 'center' },
  primary: { height: 48, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12 },
  step: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  vline: { width: 2, flex: 1, minHeight: 12 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  toolLocked: { backgroundColor: colors.bgRaised, borderStyle: 'dashed', borderColor: colors.borderStrong },
  toolIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  segBtn: { height: 32, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  segOn: { backgroundColor: colors.lime },
  rules: { marginHorizontal: 16, marginTop: 24, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, gap: 6 },
});

