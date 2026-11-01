import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { playClip, useIsPlaying, type AudioSlot } from '../lib/audio';
import { colors } from '../theme';
import { Icon, PressScale } from './ui';

/** Pulsing ring + icon; shows whether this clip is playing. Purely visual. */
/** `onColor` is for bright backgrounds (the card page's colored slides): a dark disc that stays visible. */
export type SpeakerTone = 'default' | 'onColor';

export function SpeakerGlyph({ cardId, slot, size = 40, style, tone = 'default' }: { cardId: string; slot: AudioSlot; size?: number; style?: StyleProp<ViewStyle>; tone?: SpeakerTone }) {
  const playing = useIsPlaying(cardId, slot);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (playing) pulse.set(withRepeat(withSequence(withTiming(1, { duration: 520 }), withTiming(0, { duration: 520 })), -1));
    else {
      cancelAnimation(pulse);
      pulse.set(withTiming(0, { duration: 160 }));
    }
  }, [playing, pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * pulse.value, transform: [{ scale: 1 + 0.35 * pulse.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.ring, tone === 'onColor' && { backgroundColor: colors.ink }, { borderRadius: size / 2 }, ring]} />
      <Animated.View
        style={[
          styles.disc,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: tone === 'onColor' ? colors.ink : playing ? colors.lime : colors.cardInner },
        ]}
      >
        <Icon name={playing ? 'pause' : 'volume-2'} size={size * 0.45} color={tone === 'onColor' ? (playing ? colors.lime : colors.text) : playing ? colors.ink : colors.text} />
      </Animated.View>
    </Animated.View>
  );
}

/** Pressable speaker for screens outside the swipe card. */
export function SpeakerButton({
  cardId,
  slot,
  fallback,
  label,
  size = 40,
  tone,
}: {
  cardId: string;
  slot: AudioSlot;
  fallback?: string;
  label: string;
  size?: number;
  tone?: SpeakerTone;
}) {
  return (
    <PressScale onPress={() => playClip(cardId, slot, fallback)} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.9} hitSlop={6}>
      <SpeakerGlyph cardId={cardId} slot={slot} size={size} tone={tone} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  ring: { backgroundColor: colors.lime },
  disc: { alignItems: 'center', justifyContent: 'center' },
});
