import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, PressScale, Txt, type IconName } from '../components/ui';
import { decks } from '../data';
import { LEVELS, type Unlock } from '../lib/levels';
import { useLevel, useStore } from '../lib/store';
import { colors, radius } from '../theme';

function unlockIcon(u: Unlock): IconName {
  if (u.kind === 'deck') return 'book';
  switch (u.feature) {
    case 'quiz':
      return 'help-circle';
    case 'challenge':
      return 'clock';
    case 'recap':
      return 'calendar';
    case 'ink':
      return 'feather';
    case 'stars':
      return 'star';
    default:
      return 'cloud-snow';
  }
}

function unlockSub(u: Unlock): string {
  if (u.kind === 'deck') {
    const d = decks.find((x) => x.id === u.deckId);
    return d ? `New deck · ${d.cards.length} cards` : 'New deck';
  }
  switch (u.feature) {
    case 'quiz':
      return 'Well recorded, Likely or Myth check?';
    case 'challenge':
      return '60 seconds, match terms to meanings';
    case 'recap':
      return 'Your week, on the Progress tab';
    case 'ink':
      return 'Switch it on from Your path';
    case 'stars':
      return 'Keep climbing past the top';
    default:
      return 'Covers one missed day. Added now.';
  }
}

export default function LevelUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const level = useLevel();
  const levelSeen = useStore((s) => s.levelSeen);
  const claimLevel = useStore((s) => s.claimLevel);
  const setScope = useStore((s) => s.setScope);
  // Remember where we came from before claiming, so a jump of two levels lists everything it opened.
  const [from] = useState(levelSeen);

  useEffect(() => {
    claimLevel(level.n);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [claimLevel, level.n]);

  const gained = LEVELS.filter((l) => l.n > from && l.n <= level.n);
  const unlocks = gained.flatMap((l) => l.unlocks);
  const passed = gained[gained.length - 1]?.trial?.label;
  const newDeck = unlocks.find((u): u is Extract<Unlock, { kind: 'deck' }> => u.kind === 'deck');
  const quiz = unlocks.some((u) => u.kind === 'feature' && u.feature === 'quiz');
  const challenge = unlocks.some((u) => u.kind === 'feature' && u.feature === 'challenge');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const primary = newDeck
    ? {
        label: 'Open the new deck',
        go: () => {
          setScope(newDeck.deckId);
          router.dismissTo('/');
        },
      }
    : challenge
      ? { label: 'Try Challenge mode', go: () => router.replace('/challenge') }
      : quiz
        ? { label: 'Try the origin quiz', go: () => router.replace('/quiz') }
        : { label: 'Keep going', go: close };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 40, paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
      <View style={styles.top}>
        <Txt size={13} color={colors.textMuted}>
          Level up
        </Txt>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.badge}>
          <Txt weight="mono" size={56} color={colors.ink}>
            {level.n}
          </Txt>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(320).delay(120)} style={{ gap: 6, alignItems: 'center' }}>
          <Txt weight="semibold" size={32} style={{ letterSpacing: -1, textAlign: 'center' }} accessibilityRole="header">
            You’re {level.def.name}
          </Txt>
          <Txt size={15} color={colors.textSoft} style={{ textAlign: 'center', lineHeight: 22 }}>
            {passed ? `Trial passed: ${passed.charAt(0).toLowerCase()}${passed.slice(1)}.` : `${level.points} points earned.`}
          </Txt>
        </Animated.View>
      </View>

      {unlocks.length > 0 && (
        <Animated.View entering={FadeInDown.duration(320).delay(200)} style={{ gap: 10 }}>
          <Txt weight="semibold" size={12} color={colors.textMuted} style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Unlocked
          </Txt>
          {unlocks.map((u) => (
            <View key={u.label} style={styles.unlock}>
              <View style={[styles.unlockIcon, u.kind === 'deck' && { backgroundColor: colors.text }]}>
                <Icon name={unlockIcon(u)} size={19} color={u.kind === 'deck' ? colors.ink : colors.lime} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="semibold" size={15}>
                  {u.label}
                </Txt>
                <Txt size={13} color={colors.textMuted}>
                  {unlockSub(u)}
                </Txt>
              </View>
            </View>
          ))}
        </Animated.View>
      )}

      {level.next && (
        <View style={styles.next}>
          <Txt size={13} color={colors.textMuted}>
            Next: <Txt size={13}>{level.next.name}</Txt> at {level.next.points}
          </Txt>
          {level.next.trial && (
            <Txt size={13} color={colors.textMuted} numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
              {level.next.trial.label}
            </Txt>
          )}
        </View>
      )}

      <View style={{ marginTop: 'auto', gap: 10 }}>
        <PressScale style={styles.primary} scaleTo={0.97} onPress={primary.go} accessibilityRole="button">
          <Txt weight="semibold" size={16} color={colors.ink}>
            {primary.label}
          </Txt>
        </PressScale>
        {primary.go !== close && (
          <PressScale style={styles.secondary} scaleTo={0.97} onPress={close} accessibilityRole="button">
            <Txt weight="semibold" size={16}>
              Done
            </Txt>
          </PressScale>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, gap: 26 },
  top: { alignItems: 'center', gap: 18 },
  badge: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 0 10px ${colors.limeDeep}`,
  },
  unlock: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong },
  unlockIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  next: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  primary: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondary: { height: 54, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
