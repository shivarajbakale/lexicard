import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { LevelState } from '../lib/levels';
import { colors, radius } from '../theme';
import { Icon, PressScale, Txt } from './ui';

export const TIER_BADGE = {
  Foundation: { bg: '#2A2E25', fg: colors.textSoft },
  Fluent: { bg: colors.limeDeep, fg: colors.limeSoft },
  Mastery: { bg: colors.lime, fg: colors.ink },
} as const;

/** One line under the level name: what stands between you and the next level. */
export function nextStep(level: LevelState): string {
  if (!level.next) return level.stars > 0 ? `${level.stars} ${level.stars === 1 ? 'star' : 'stars'} past Lexicon` : 'Top level reached';
  if (level.trialReady) return `Points ready · trial: ${level.next.trial?.label.toLowerCase()}`;
  return `${level.toNext} ${level.toNext === 1 ? 'point' : 'points'} to ${level.next.name}`;
}

export function LevelBadge({ level, size = 36 }: { level: Pick<LevelState, 'n' | 'def'>; size?: number }) {
  const t = TIER_BADGE[level.def.tier];
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: t.bg }]}>
      <Txt weight="mono" size={Math.round(size * 0.42)} color={t.fg}>
        {level.n}
      </Txt>
    </View>
  );
}

export function ProgressTrack({ frac, height = 6, color = colors.lime, track = colors.cardInner }: { frac: number; height?: number; color?: string; track?: string }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withTiming(frac, { duration: 420 }));
  }, [frac, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height, borderRadius: radius.pill, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: radius.pill, backgroundColor: color }, style]} />
    </View>
  );
}

/** Compact level summary for the Learn tab; opens the level path. */
export function LevelChip({ level, compact = false }: { level: LevelState; compact?: boolean }) {
  const router = useRouter();
  const target = level.next ? `${level.points}/${level.next.points}` : `${level.points} pts`;
  return (
    <PressScale
      style={[styles.chip, compact && styles.chipCompact]}
      scaleTo={0.98}
      onPress={() => router.push('/levels')}
      accessibilityRole="link"
      accessibilityLabel={`Level ${level.n}, ${level.def.name}. ${nextStep(level)}. Open your level path.`}
    >
      <View style={styles.row}>
        <LevelBadge level={level} size={compact ? 30 : 36} />
        <View style={{ flex: 1, gap: 1 }}>
          <Txt weight="semibold" size={compact ? 14 : 15} numberOfLines={1}>
            {level.def.name}
            {level.stars > 0 ? ` · ${'★'.repeat(Math.min(level.stars, 5))}` : ''}
          </Txt>
          <Txt size={12} color={level.trialReady ? colors.limeSoft : colors.textMuted} numberOfLines={1}>
            {nextStep(level)}
          </Txt>
        </View>
        <Txt weight="mono" size={12} color={colors.textMuted}>
          {target}
        </Txt>
        <Icon name="chevron-right" size={16} color={colors.textMuted} />
      </View>
      {!compact && <ProgressTrack frac={level.next ? level.frac : 1} />}
    </PressScale>
  );
}

/** Header-sized level pill: badge, name, points to next, and a hairline progress bar. Opens the level path. */
export function LevelPill({ level }: { level: LevelState }) {
  const router = useRouter();
  // On the narrowest phones the name wins; the points live on the path screen.
  const narrow = useWindowDimensions().width < 360;
  const target = level.next ? `${level.points}/${level.next.points}` : level.stars > 0 ? `★${level.stars}` : `${level.points}`;
  return (
    <PressScale
      style={styles.pill}
      scaleTo={0.97}
      onPress={() => router.push('/levels')}
      accessibilityRole="link"
      accessibilityLabel={`Level ${level.n}, ${level.def.name}. ${nextStep(level)}. Open your level path.`}
    >
      <LevelBadge level={level} size={22} />
      <Txt weight="semibold" size={13} numberOfLines={1} style={{ flexShrink: 1 }}>
        {level.def.name}
      </Txt>
      {!narrow && (
        <Txt weight="mono" size={11} color={level.trialReady ? colors.limeSoft : colors.textMuted} style={{ marginLeft: 'auto' }}>
          {target}
        </Txt>
      )}
      <View style={styles.pillTrack} pointerEvents="none">
        <ProgressTrack frac={level.next ? level.frac : 1} height={2} track="transparent" />
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    minWidth: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: '#2A2D27',
    overflow: 'hidden',
  },
  pillTrack: { position: 'absolute', left: 14, right: 14, bottom: 0 },
  chip: { padding: 12, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  chipCompact: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { alignItems: 'center', justifyContent: 'center' },
});
