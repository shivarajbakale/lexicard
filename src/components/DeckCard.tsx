import { useRouter } from 'expo-router';
import { useEffect, useImperativeHandle, type Ref } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { illustrations } from '../data/illustrations';
import { scenes } from '../data/scenes';
import type { Card } from '../lib/types';
import { colors, ipaFont, kindStyle, PAPER, radius, springs } from '../theme';
import { playClip } from '../lib/audio';
import { useStore } from '../lib/store';
import { CardStory } from './CardStory';
import { SpeakerGlyph } from './Speaker';
import { Icon, Pill, PressScale, Txt } from './ui';

export interface DeckCardHandle {
  swipe: (known: boolean) => void;
  flip: () => void;
  /** Flip to the back if needed and scroll into story mode */
  openStory: () => void;
  /** Scroll back up into the card */
  closeStory: () => void;
}

/** Distances from the card's edges to the screen's, so the back can grow to fill the screen in story mode. */
export interface StoryFrame {
  top: number;
  left: number;
  right: number;
  bottom: number;
  /** status-bar inset, kept clear by the story bar */
  insetTop: number;
}

interface Props {
  card: Card;
  /** 0 = top of the stack */
  index: number;
  width: number;
  height: number;
  /** Animate in from a side (used when undoing a swipe) */
  enterFrom?: 'left' | 'right';
  onSwiped: (cardId: string, known: boolean) => void;
  /** Where the card sits on screen; without it the back still scrolls, inside the card. */
  frame?: StoryFrame;
  /** Shared with the screen: 0 = card, 1 = story mode. Written by the top card. */
  story: SharedValue<number>;
  ref?: Ref<DeckCardHandle>;
}

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 900;
const SPEAKER_HIT = 72;
const FLIP_TIMING = { duration: 460, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
/** Scroll distance over which the card opens into story mode. */
const STORY_RUN = 220;
const NO_FRAME: StoryFrame = { top: 0, left: 0, right: 0, bottom: 0, insetTop: 0 };

export function DeckCard({ card, index, width, height, enterFrom, onSwiped, frame = NO_FRAME, story, ref }: Props) {
  const router = useRouter();
  // Level 8 reward: black front with a lime edge.
  const ink = useStore((s) => s.cardStyle === 'ink');
  const startX = enterFrom ? (enterFrom === 'right' ? 1 : -1) * width * 1.4 : 0;
  const x = useSharedValue(startX);
  const y = useSharedValue(0);
  const flip = useSharedValue(0);
  const pos = useSharedValue(index);
  const leaving = useSharedValue(false);
  const scrollY = useSharedValue(0);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const isTop = index === 0;
  const art = illustrations[card.id];
  const scene = art ? scenes[card.id] : undefined;

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
    const toFront = flip.value > 0.5;
    if (toFront) scrollTo(scrollRef, 0, 0, false);
    flip.set(withTiming(toFront ? 0 : 1, FLIP_TIMING));
  };

  const openStory = () => {
    'worklet';
    if (flip.value < 0.5) flip.set(withTiming(1, FLIP_TIMING));
    scrollTo(scrollRef, 0, STORY_RUN + 40, true);
  };
  const closeStory = () => {
    'worklet';
    scrollTo(scrollRef, 0, 0, true);
  };

  useImperativeHandle(ref, () => ({
    swipe: (known: boolean) => scheduleOnUI(flyOut, known, 0),
    flip: () => scheduleOnUI(toggleFlip),
    openStory: () => scheduleOnUI(openStory),
    closeStory: () => scheduleOnUI(closeStory),
  }));

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
    if (isTop) story.set(Math.min(1, Math.max(0, e.contentOffset.y / STORY_RUN)));
  });

  // Horizontal drags sort the card; vertical ones are left to the back's scroll.
  const pan = usePanGesture({
    enabled: isTop,
    activeOffsetX: [-12, 12],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      if (leaving.value || scrollY.value > 4) return;
      x.set(e.translationX);
      y.set(e.translationY * 0.2);
    },
    onDeactivate: (e) => {
      'worklet';
      if (leaving.value) return;
      const far = Math.abs(e.translationX) > SWIPE_DISTANCE;
      const fast = Math.abs(e.velocityX) > SWIPE_VELOCITY && Math.sign(e.velocityX) === Math.sign(e.translationX);
      if (scrollY.value <= 4 && (far || fast)) {
        flyOut(e.translationX > 0, e.velocityX);
      } else {
        x.set(withSpring(0, springs.snappy));
        y.set(withSpring(0, springs.snappy));
      }
    },
  });

  const playTerm = () => playClip(card.id, 'term', card.term);
  const playExample = () => playClip(card.id, 'social', (card.uses.find((u) => u.setting === 'social') ?? card.uses[0]).sentence);

  const tap = useTapGesture({
    enabled: isTop,
    onActivate: (e) => {
      'worklet';
      // In story mode taps are for the page (buttons, reading), not for flipping.
      if (leaving.value || scrollY.value > 4) return;
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
    // ...and step aside while the top card is open as a story.
    const behind = p > 0.5 ? Math.max(0, 1 - story.value * 2.5) : 1;
    return {
      opacity: interpolate(p, [0, 1, 2, 3], [1, 1, 0.7, 0], Extrapolation.CLAMP) * behind,
      transform: [{ translateX: x.value }, { translateY: y.value + p * (height * 0.02 + 8) }, { rotate: `${x.value / 20}deg` }, { scale: 1 - p * 0.04 + lift }],
    };
  });

  const frontStyle = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 1400 }, { rotateY: `${flip.value * 180}deg` }] }));

  // Story mode: the back's edges move out to the screen's while its content stays put and keeps scrolling,
  // so the card turns into the page with no jump. The content box is fixed to the screen; only the clip grows.
  const screenW = frame.left + width + frame.right;
  const screenH = frame.top + height + frame.bottom;
  const backStyle = useAnimatedStyle(() => {
    const s = isTop ? scrollY.value : 0;
    const t = Math.min(1, Math.max(0, s / STORY_RUN));
    const e = t * t * (3 - 2 * t);
    return {
      opacity: flip.value >= 0.5 ? 1 : 0,
      top: -Math.min(s, frame.top),
      left: -frame.left * e,
      right: -frame.right * e,
      bottom: -frame.bottom * e,
      borderRadius: radius.card * (1 - e),
      borderWidth: 1 - e,
      backgroundColor: `rgb(${Math.round(30 - 9 * e)},${Math.round(33 - 10 * e)},${Math.round(27 - 8 * e)})`,
      transform: [{ perspective: 1400 }, { rotateY: `${flip.value * 180 + 180}deg` }],
    };
  });
  const scrollBoxStyle = useAnimatedStyle(() => {
    const s = isTop ? scrollY.value : 0;
    const t = Math.min(1, Math.max(0, s / STORY_RUN));
    const e = t * t * (3 - 2 * t);
    return { top: -(frame.top - Math.min(s, frame.top)), left: -frame.left * (1 - e) };
  });
  const barStyle = useAnimatedStyle(() => {
    const b = isTop ? Math.max(0, (story.value - 0.65) / 0.35) : 0;
    return { opacity: b, transform: [{ translateY: -12 * (1 - b) }] };
  });

  const knowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [20, SWIPE_DISTANCE], [0, 1], Extrapolation.CLAMP),
    transform: [{ rotate: '-10deg' }, { scale: interpolate(x.value, [20, SWIPE_DISTANCE], [0.8, 1], Extrapolation.CLAMP) }],
  }));
  const learnStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE_DISTANCE, -20], [1, 0], Extrapolation.CLAMP),
    transform: [{ rotate: '10deg' }, { scale: interpolate(x.value, [-SWIPE_DISTANCE, -20], [1, 0.8], Extrapolation.CLAMP) }],
  }));

  const kind = kindStyle[card.kind];
  const tight = height < 340;
  const long = card.term.length > 14;

  // Picture on the front runs edge to edge at 4:3. On short cards the hint line goes first, then the picture
  // gets shorter (letterboxed in its own paper colour) so the term always fits under it.
  const fullH = Math.round(width * 0.75);
  const textRoom = card.sayIt ? 150 : 128;
  const showFoot = !art || height - fullH - textRoom >= 44;
  const frontArtH = art ? Math.max(0, Math.min(fullH, height - textRoom - (showFoot ? 44 : 0))) : 0;
  const showFrontArt = frontArtH >= 120;
  const base = long ? (tight ? 28 : 32) : tight ? 34 : 40;
  const termBase = showFrontArt ? base - 4 : base;
  // Sized to the card, not fixed: on a phone the card is ~350px wide and a fixed 46px term crowds it.
  const termSize = Math.round(Math.max(long ? 24 : 28, Math.min(termBase, (width / 360) * termBase)));

  const openFullPage = () => router.push({ pathname: '/card/[id]', params: { id: card.id } });

  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <Animated.View
        style={[styles.card, { zIndex: 10 - index, height }, cardStyle]}
        pointerEvents={isTop ? 'auto' : 'none'}
        accessibilityElementsHidden={!isTop}
        importantForAccessibility={isTop ? 'auto' : 'no-hide-descendants'}
        aria-hidden={!isTop}
        accessibilityLabel={`${card.term}. Tap to flip.`}
      >
        {/* Front */}
        <Animated.View style={[styles.face, styles.front, ink && styles.ink, frontStyle]}>
          {showFrontArt && art ? (
            <View style={[styles.frontArt, { height: frontArtH }]}>
              <Image source={art} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityIgnoresInvertColors />
              <SpeakerGlyph cardId={card.id} slot="term" style={styles.speakerOnArt} />
            </View>
          ) : (
            <SpeakerGlyph cardId={card.id} slot="term" style={styles.speaker} />
          )}
          <View style={[styles.frontBody, showFrontArt && styles.frontBodyArt]}>
            <Pill label={kind.label.toUpperCase()} bg={kind.bg} fg={kind.fg} style={{ alignSelf: 'center' }} />
            <Txt weight="semibold" size={termSize} style={[styles.term, { lineHeight: termSize * 1.1 }]} numberOfLines={showFrontArt ? 2 : 3}>
              {card.term}
            </Txt>
            {card.sayIt ? (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Txt weight="medium" size={showFrontArt ? 18 : 20} color={colors.textSoft} style={{ letterSpacing: 0.6 }}>
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
          {showFoot ? (
          <View style={styles.frontFoot}>
            <Icon name="refresh-cw" size={14} color={colors.textFaint} />
            <Txt size={13} color={colors.textFaint}>
              Tap to explain · swipe to sort
            </Txt>
          </View>
          ) : (
            <View style={{ height: 16 }} />
          )}
        </Animated.View>

        {/* Back: scrolls on into the story */}
        <Animated.View style={[styles.face, backStyle]}>
          <Animated.View style={[{ position: 'absolute', width: screenW, height: screenH }, scrollBoxStyle]}>
            <Animated.ScrollView
              ref={scrollRef}
              onScroll={onScroll}
              scrollEventThrottle={16}
              scrollEnabled={isTop}
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingTop: frame.top + 12,
                paddingLeft: frame.left + 12,
                paddingRight: frame.right + 12,
                paddingBottom: frame.bottom + 24,
              }}
            >
              <CardStory card={card} art={art} scene={scene} artW={width} artH={fullH} progress={story} onFullPage={openFullPage} />
            </Animated.ScrollView>
          </Animated.View>

          {/* Slim bar that slides in once the card has opened up */}
          <Animated.View style={[styles.storyBar, { paddingTop: frame.insetTop + 10 }, barStyle]} pointerEvents="box-none">
            <PressScale style={styles.barBtn} scaleTo={0.94} onPress={() => scheduleOnUI(closeStory)} accessibilityRole="button" accessibilityLabel="Back to the card">
              <Icon name="chevron-down" size={16} color={colors.text} />
              <Txt weight="medium" size={13}>
                Card
              </Txt>
            </PressScale>
            <Txt weight="semibold" size={16} numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
              {card.term}
            </Txt>
            <PressScale style={styles.barRound} scaleTo={0.92} onPress={playTerm} accessibilityRole="button" accessibilityLabel={`Say ${card.term}`}>
              <Icon name="volume-2" size={16} color={colors.text} />
            </PressScale>
          </Animated.View>
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
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', userSelect: 'none' } as object) : null),
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
  frontArt: { width: '100%', backgroundColor: PAPER },
  speakerOnArt: { position: 'absolute', top: 10, right: 10 },
  frontBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28, paddingTop: 28 },
  frontBodyArt: { gap: 8, paddingTop: 8, paddingHorizontal: 20 },
  term: { textAlign: 'center', letterSpacing: -1.4 },
  frontFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 22 },
  speaker: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  storyBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  barBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  barRound: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  stamp: { position: 'absolute', top: 24, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 2 },
  stampKnow: { left: 22, borderColor: colors.lime },
  stampLearn: { right: 22, borderColor: colors.orange },
  stampText: { letterSpacing: 1.2 },
});
