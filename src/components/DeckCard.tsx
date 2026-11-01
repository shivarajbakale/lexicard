import { useEffect, useImperativeHandle, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Card } from '../lib/types';
import { colors, confidenceStyle, ipaFont, kindStyle, radius, springs } from '../theme';
import { playClip } from '../lib/audio';
import { useStore } from '../lib/store';
import { SpeakerGlyph } from './Speaker';
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
  /** Card height; short cards drop the less important parts of the back face so nothing gets cut off. */
  height: number;
  /** Animate in from a side (used when undoing a swipe) */
  enterFrom?: 'left' | 'right';
  onSwiped: (cardId: string, known: boolean) => void;
  ref?: Ref<DeckCardHandle>;
}

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 900;
const SPEAKER_HIT = 72;
const FLIP_TIMING = { duration: 460, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };

export function DeckCard({ card, index, width, height, enterFrom, onSwiped, ref }: Props) {
  // Level 8 reward: black front with a lime edge.
  const ink = useStore((s) => s.cardStyle === 'ink');
  const startX = enterFrom ? (enterFrom === 'right' ? 1 : -1) * width * 1.4 : 0;
  const x = useSharedValue(startX);
  const y = useSharedValue(0);
  const flip = useSharedValue(0);
  const pos = useSharedValue(index);
  const leaving = useSharedValue(false);
  const isTop = index === 0;
  const daily = card.uses.find((u) => u.setting === 'social') ?? card.uses[0];

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
    x.set(
      withTiming(dest, { duration: 300 - speed / 20, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) scheduleOnRN(onSwiped, card.id, known);
      }),
    );
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

  const playTerm = () => playClip(card.id, 'term', card.term);
  const playExample = () => playClip(card.id, 'social', daily.sentence);

  const tap = useTapGesture({
    enabled: isTop,
    onActivate: (e) => {
      'worklet';
      if (leaving.value) return;
      // Top-right corner of either face is the speaker; everywhere else flips.
      if (e.x > width - SPEAKER_HIT && e.y < SPEAKER_HIT) {
        scheduleOnRN(flip.value < 0.5 ? playTerm : playExample);
        return;
      }
      toggleFlip();
    },
  });

  const gesture = useExclusiveGestures(pan, tap);

  const cardStyle = useAnimatedStyle(() => {
    const p = pos.value;
    // Cards behind shrink 4% each and drop by just enough that ~8px of each peeks out below.
    const lift = Math.sin(Math.PI * flip.value) * 0.035;
    return {
      opacity: interpolate(p, [0, 1, 2, 3], [1, 1, 0.7, 0], Extrapolation.CLAMP),
      transform: [{ translateX: x.value }, { translateY: y.value + p * (height * 0.02 + 8) }, { rotate: `${x.value / 20}deg` }, { scale: 1 - p * 0.04 + lift }],
    };
  });

  const frontStyle = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 1400 }, { rotateY: `${flip.value * 180}deg` }] }));
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
  // Back face budget: everything fits from ~520px; below that the origin goes (it is on the detail page),
  // and on the smallest phones the example loses its setting line too.
  const showOrigin = height >= 520;
  const tight = height < 340;
  const termSize = card.term.length > 14 ? (tight ? 30 : 38) : tight ? 38 : 46;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.card, { zIndex: 10 - index, height }, cardStyle]}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessibilityElementsHidden={!isTop}
        importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
        aria-hidden={!isTop}
        accessibilityRole="button"
        accessibilityLabel={`${card.term}. Tap to flip.`}
      >
        {/* Front */}
        <Animated.View style={[styles.face, styles.front, ink && styles.ink, frontStyle]}>
          <SpeakerGlyph cardId={card.id} slot="term" style={styles.speaker} />
          <View style={styles.frontBody}>
            <Pill label={kind.label.toUpperCase()} bg={kind.bg} fg={kind.fg} style={{ alignSelf: 'center' }} />
            <Txt weight="semibold" size={termSize} style={[styles.term, { lineHeight: termSize * 1.1 }]} numberOfLines={3}>
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
        <Animated.View style={[styles.face, styles.back, tight && styles.backTight, backStyle]}>
          <SpeakerGlyph cardId={card.id} slot="social" style={styles.speaker} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingRight: 44 }}>
            <Txt weight="semibold" size={24} style={{ letterSpacing: -0.6 }}>
              {card.term}
            </Txt>
            <Txt size={13} color={colors.textMuted}>
              {card.pos}
            </Txt>
          </View>
          <View style={{ gap: 5 }}>
            <Label>Meaning</Label>
            <Txt size={tight ? 15 : 16} color={colors.textSoft} style={{ lineHeight: tight ? 21 : 23 }} numberOfLines={tight ? 3 : 4}>
              {card.meaning}
            </Txt>
          </View>
          <View style={[styles.daily, tight && { padding: 12 }]}>
            <Label>In daily life</Label>
            <Txt size={15} style={{ lineHeight: 21 }} numberOfLines={tight ? 3 : 4}>
              “{daily.sentence}”
            </Txt>
            {!tight && (
              <Txt size={12} color={colors.textMuted}>
                {daily.where}
              </Txt>
            )}
          </View>
          {showOrigin && (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Label>Origin</Label>
                <Pill label={conf.label} bg={conf.bg} fg={conf.fg} style={{ paddingVertical: 2, paddingHorizontal: 8 }} />
              </View>
              <Txt size={14} color={colors.textSoft} style={{ lineHeight: 20 }} numberOfLines={4}>
                {card.origin.summary}
              </Txt>
            </View>
          )}
          {!tight && (
            <Txt size={12} color={colors.textFaint} style={{ marginTop: 'auto', textAlign: 'center' }}>
              {showOrigin ? 'Tap to flip back · speaker plays the example' : 'Tap to flip back · book icon for the full story'}
            </Txt>
          )}
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
  ink: { backgroundColor: '#050604', borderColor: colors.lime, borderWidth: 1.5 },
  frontBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28, paddingTop: 28 },
  term: { textAlign: 'center', letterSpacing: -1.4 },
  frontFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 22 },
  back: { padding: 24, gap: 14 },
  backTight: { padding: 18, gap: 10 },
  daily: { gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.cardInner },
  speaker: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  stamp: { position: 'absolute', top: 24, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 2 },
  stampKnow: { left: 22, borderColor: colors.lime },
  stampLearn: { right: 22, borderColor: colors.orange },
  stampText: { letterSpacing: 1.2 },
});
