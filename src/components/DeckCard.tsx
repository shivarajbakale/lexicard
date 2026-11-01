import { useEffect, useImperativeHandle, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Card } from '../lib/types';
import { colors, confidenceStyle, ipaFont, kindStyle, radius, springs } from '../theme';
import { Icon, Label, Pill, Txt } from './ui';

export interface DeckCardHandle {
  swipe: (known: boolean) => void;
  flip: () => void;
}

interface Props {
  card: Card;
  /** 0 = top of the stack */
  index: number;
  width: number;
  /** Animate in from a side (used when undoing a swipe) */
  enterFrom?: 'left' | 'right';
  onSwiped: (cardId: string, known: boolean) => void;
  ref?: Ref<DeckCardHandle>;
}

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 900;
const FLIP_TIMING = { duration: 460, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };

export function DeckCard({ card, index, width, enterFrom, onSwiped, ref }: Props) {
  const startX = enterFrom ? (enterFrom === 'right' ? 1 : -1) * width * 1.4 : 0;
  const x = useSharedValue(startX);
  const y = useSharedValue(0);
  const flip = useSharedValue(0);
  const pos = useSharedValue(index);
  const leaving = useSharedValue(false);
  const isTop = index === 0;

  // Cards behind rise smoothly into place when the top card leaves.
  useEffect(() => {
    pos.set(withSpring(index, springs.soft));
  }, [index, pos]);

  useEffect(() => {
    if (enterFrom) x.set(withSpring(0, springs.snappy));
  }, [enterFrom, x]);

  const flyOut = (known: boolean, velocityX = 0) => {
    'worklet';
    if (leaving.value) return;
    leaving.set(true);
    const dest = (known ? 1 : -1) * width * 1.5;
    const speed = Math.min(Math.abs(velocityX), 2400);
    x.set(withTiming(
      dest,
      { duration: 300 - speed / 20, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) scheduleOnRN(onSwiped, card.id, known);
      },
    ));
    y.set(withTiming(y.value + 30, { duration: 300 }));
  };

  const toggleFlip = () => {
    'worklet';
    flip.set(withTiming(flip.value > 0.5 ? 0 : 1, FLIP_TIMING));
  };

  useImperativeHandle(ref, () => ({ swipe: (known: boolean) => flyOut(known), flip: () => toggleFlip() }));

  const pan = usePanGesture({
    enabled: isTop,
    minDistance: 6,
    onUpdate: (e) => {
      'worklet';
      if (leaving.value) return;
      x.set(e.translationX);
      y.set(e.translationY * 0.2);
    },
    onDeactivate: (e) => {
      'worklet';
      if (leaving.value) return;
      const far = Math.abs(e.translationX) > SWIPE_DISTANCE;
      const fast = Math.abs(e.velocityX) > SWIPE_VELOCITY && Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (far || fast) {
        flyOut(e.translationX > 0, e.velocityX);
      } else {
        x.set(withSpring(0, springs.snappy));
        y.set(withSpring(0, springs.snappy));
      }
    },
  });

  const tap = useTapGesture({
    enabled: isTop,
    onActivate: () => {
      'worklet';
      if (!leaving.value) toggleFlip();
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    const p = pos.value;
    const lift = Math.sin(Math.PI * flip.value) * 0.035;
    return {
      opacity: interpolate(p, [0, 1, 2, 3], [1, 1, 0.7, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: x.value },
        { translateY: y.value + p * 24 },
        { rotate: `${x.value / 20}deg` },
        { scale: 1 - p * 0.05 + lift },
      ],
    };
  });

  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1400 }, { rotateY: `${flip.value * 180}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1400 }, { rotateY: `${flip.value * 180 + 180}deg` }],
  }));

  const knowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [20, SWIPE_DISTANCE], [0, 1], Extrapolation.CLAMP),
    transform: [{ rotate: '-10deg' }, { scale: interpolate(x.value, [20, SWIPE_DISTANCE], [0.8, 1], Extrapolation.CLAMP) }],
  }));
  const learnStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE_DISTANCE, -20], [1, 0], Extrapolation.CLAMP),
    transform: [{ rotate: '10deg' }, { scale: interpolate(x.value, [-SWIPE_DISTANCE, -20], [1, 0.8], Extrapolation.CLAMP) }],
  }));

  const kind = kindStyle[card.kind];
  const conf = confidenceStyle[card.origin.confidence];
  const daily = card.uses.find((u) => u.setting === 'social') ?? card.uses[0];

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, { zIndex: 10 - index }, cardStyle]}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessibilityElementsHidden={!isTop}
        importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
        aria-hidden={!isTop}
        accessibilityRole="button"
        accessibilityLabel={`${card.term}. Tap to flip.`}
      >
        {/* Front */}
        <Animated.View style={[styles.face, styles.front, frontStyle]}>
          <View style={styles.frontBody}>
            <Pill label={kind.label.toUpperCase()} bg={kind.bg} fg={kind.fg} style={{ alignSelf: 'center' }} />
            <Txt weight="semibold" size={card.term.length > 14 ? 38 : 46} style={styles.term} numberOfLines={3}>
              {card.term}
            </Txt>
            {card.sayIt ? (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Txt weight="medium" size={20} color={colors.textSoft} style={{ letterSpacing: 0.6 }}>
                  {card.sayIt}
                </Txt>
                <Txt size={13} color={colors.textFaint} style={{ fontFamily: ipaFont }}>
                  {card.phonetic}
                </Txt>
              </View>
            ) : (
              <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center' }}>
                {card.hint ?? card.pos}
              </Txt>
            )}
          </View>
          <View style={styles.frontFoot}>
            <Icon name="refresh-cw" size={14} color={colors.textFaint} />
            <Txt size={13} color={colors.textFaint}>
              Tap to explain · swipe to sort
            </Txt>
          </View>
        </Animated.View>

        {/* Back */}
        <Animated.View style={[styles.face, styles.back, backStyle]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <Txt weight="semibold" size={24} style={{ letterSpacing: -0.6 }}>
              {card.term}
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              {card.pos}
            </Txt>
          </View>
          <View style={{ gap: 5 }}>
            <Label>Meaning</Label>
            <Txt size={16} color={colors.textSoft} style={{ lineHeight: 23 }} numberOfLines={4}>
              {card.meaning}
            </Txt>
          </View>
          <View style={styles.daily}>
            <Label>In daily life</Label>
            <Txt size={15} style={{ lineHeight: 21 }} numberOfLines={4}>
              “{daily.sentence}”
            </Txt>
            <Txt size={12} color={colors.textMuted}>
              {daily.where}
            </Txt>
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Label>Origin</Label>
              <Pill label={conf.label} bg={conf.bg} fg={conf.fg} style={{ paddingVertical: 2, paddingHorizontal: 8 }} />
            </View>
            <Txt size={14} color={colors.textSoft} style={{ lineHeight: 20 }} numberOfLines={4}>
              {card.origin.summary}
            </Txt>
          </View>
          <Txt size={12} color={colors.textFaint} style={{ marginTop: 'auto', textAlign: 'center' }}>
            Tap to flip back · book icon for more
          </Txt>
        </Animated.View>

        <Animated.View style={[styles.stamp, styles.stampKnow, knowStyle]} pointerEvents="none">
          <Txt weight="bold" size={14} color={colors.lime} style={styles.stampText}>
            KNOW IT
          </Txt>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampLearn, learnStyle]} pointerEvents="none">
          <Txt weight="bold" size={14} color={colors.orange} style={styles.stampText}>
            LEARNING
          </Txt>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.card,
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none', touchAction: 'none' } as object) : null),
  },
  face: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
    boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
  },
  front: { justifyContent: 'space-between' },
  frontBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28, paddingTop: 32 },
  term: { textAlign: 'center', letterSpacing: -1.4, lineHeight: 50 },
  frontFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 26 },
  back: { padding: 24, gap: 14 },
  daily: { gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.cardInner },
  stamp: { position: 'absolute', top: 24, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 2 },
  stampKnow: { left: 22, borderColor: colors.lime },
  stampLearn: { right: 22, borderColor: colors.orange },
  stampText: { letterSpacing: 1.2 },
});
