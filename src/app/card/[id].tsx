import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View, type ScrollViewInstance, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { SpeakerButton, SpeakerGlyph } from '../../components/Speaker';
import { SETTING_ICON, SETTING_LABEL, UsedItSheet } from '../../components/UsedItSheet';
import { Highlighted, Icon, PressScale, Txt } from '../../components/ui';
import { allCards, cardsById, deckOfCard } from '../../data';
import { playClip } from '../../lib/audio';
import { levelState } from '../../lib/levels';
import { isDue, MAX_BOX, relativeDue } from '../../lib/srs';
import { levelInput, useStore } from '../../lib/store';
import { colors, confidenceStyle, ipaFont, kindStyle, radius } from '../../theme';

/** Other cards whose term matches one of this card's "similar" entries, so they can be opened directly. */
const termToId: Record<string, string> = Object.fromEntries(allCards.map((c) => [c.term.toLowerCase(), c.id]));

// The card page is four full-color slides. The header and rail take on the current slide's colors.
const SLIDES = [
  { name: 'Meaning', bg: colors.lime, fg: colors.ink, sub: '#2E3326', line: 'rgba(11,12,10,0.22)', thumb: colors.ink, track: 'rgba(11,12,10,0.18)', tagBg: colors.ink, tagFg: colors.lime },
  { name: 'Use it', bg: '#F4F5F0', fg: colors.ink, sub: '#4A4F44', line: 'rgba(11,12,10,0.16)', thumb: colors.ink, track: 'rgba(11,12,10,0.14)', tagBg: colors.ink, tagFg: '#F4F5F0' },
  { name: 'Origin', bg: colors.orangeSoft, fg: colors.ink, sub: '#3A2A1C', line: 'rgba(11,12,10,0.22)', thumb: colors.ink, track: 'rgba(11,12,10,0.18)', tagBg: colors.ink, tagFg: colors.orangeText },
  { name: 'More', bg: colors.card, fg: colors.text, sub: colors.textMuted, line: colors.borderStrong, thumb: colors.lime, track: colors.borderStrong, tagBg: colors.lime, tagFg: colors.ink },
] as const;

const RAIL_H = 176;
const THUMB_H = 44;
const RAIL_GUTTER = 44; // room on the right so the rail never covers text

// Web snapping: "proximity" lets a slide taller than the screen scroll freely before the next one snaps in.
const webSnapContainer = (Platform.OS === 'web' ? { scrollSnapType: 'y proximity', overscrollBehavior: 'contain' } : {}) as ViewStyle;
const webSnapChild = (Platform.OS === 'web' ? { scrollSnapAlign: 'start' } : {}) as ViewStyle;

function NextHint({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.nextHint}>
      <Icon name="chevron-down" size={14} color={color} />
      <Txt weight="medium" size={12} color={color}>
        Next: {label}
      </Txt>
    </View>
  );
}

function Caps({ children, color }: { children: ReactNode; color: string }) {
  return (
    <Txt weight="semibold" size={11} color={color} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
      {children}
    </Txt>
  );
}

export default function CardDetail() {
  const { id, log } = useLocalSearchParams<{ id: string; log?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const phone = useWindowDimensions().width < 430;
  const card = cardsById[id ?? ''];
  const saved = useStore((s) => s.saved.includes(id ?? ''));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const review = useStore((s) => s.reviews[id ?? '']);
  const used = useStore((s) => s.uses[id ?? '']);
  const [sheet, setSheet] = useState(log === '1');
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const [viewH, setViewH] = useState(0);
  const [offsets, setOffsets] = useState<number[]>([0, 0, 0, 0]);
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const y = useSharedValue(0);
  const contentH = useSharedValue(1);
  const frameH = useSharedValue(1);
  const starts = useSharedValue<number[]>([0, 0, 0, 0]);
  const lastActive = useSharedValue(0);
  const labelOpacity = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });

  // Track the current slide on the UI thread; tell JS only when it changes. Show the rail label while scrolling.
  useAnimatedReaction(
    () => ({ cur: y.value, s: starts.value }),
    (now, before) => {
      const { cur, s } = now;
      let a = 0;
      // Slides not laid out yet report 0; skip them so the page doesn't start on the last one.
      for (let i = 1; i < s.length; i++) if (s[i] > 0 && cur + frameH.value * 0.4 >= s[i]) a = i;
      if (a !== lastActive.value) {
        lastActive.value = a;
        scheduleOnRN(setActive, a);
      }
      if (before != null && Math.abs(cur - before.cur) > 0.5) {
        labelOpacity.value = withSequence(withTiming(1, { duration: 90 }), withDelay(900, withTiming(0, { duration: 220 })));
      }
    },
  );

  const thumbStyle = useAnimatedStyle(() => {
    const max = Math.max(1, contentH.value - frameH.value);
    const f = Math.min(1, Math.max(0, y.value / max));
    return { transform: [{ translateY: f * (RAIL_H - THUMB_H) }] };
  });
  const labelStyle = useAnimatedStyle(() => {
    const max = Math.max(1, contentH.value - frameH.value);
    const f = Math.min(1, Math.max(0, y.value / max));
    return { opacity: labelOpacity.value, transform: [{ translateY: f * (RAIL_H - THUMB_H) + 9 }] };
  });

  // Prev/next reuse this screen with a new id: start the new card at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const setStart = useCallback(
    (i: number, top: number) => {
      setOffsets((o) => {
        if (o[i] === top) return o;
        const n = o.slice();
        n[i] = top;
        starts.set(n);
        return n;
      });
    },
    [starts],
  );

  const goTo = (i: number) => scrollRef.current?.scrollTo({ y: offsets[i], animated: true });

  const onLogged = () => {
    setSheet(false);
    // A real use can finish a trial: celebrate right away (this is not mid-swipe).
    const s = useStore.getState();
    if (levelState(levelInput(s), s.levelSeen).n > s.levelSeen) router.push('/level-up');
    else setToast({ id: card.id, text: 'Logged · +3 points' });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!card) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Txt size={18}>Card not found.</Txt>
        <PressScale onPress={back} style={styles.ghostBtn} accessibilityRole="button">
          <Txt weight="semibold">Back to deck</Txt>
        </PressScale>
      </View>
    );
  }

  const theme = SLIDES[active];
  const heroSize = card.term.length > 16 ? (phone ? 26 : 34) : phone ? 30 : 42;
  const kind = kindStyle[card.kind];
  const conf = confidenceStyle[card.origin.confidence];
  const deck = deckOfCard[card.id];
  const at = deck ? deck.cards.findIndex((c) => c.id === card.id) : -1;
  const prev = at > 0 ? deck.cards[at - 1] : undefined;
  const next = deck && at >= 0 && at < deck.cards.length - 1 ? deck.cards[at + 1] : undefined;
  const open = (cardId: string) => router.replace({ pathname: '/card/[id]', params: { id: cardId } });
  const status = !review
    ? 'New card'
    : isDue(review)
      ? 'Due for review'
      : review.box >= MAX_BOX
        ? `Mastered · back ${relativeDue(review.dueAt)}`
        : `Box ${review.box} of ${MAX_BOX} · back ${relativeDue(review.dueAt)}`;
  const canLog = !!review && Math.max(review.box, review.bestBox ?? 1) >= 2;
  const usedSettings = new Set((used ?? []).map((u) => u.setting));
  const allUsed = usedSettings.size >= 3;
  const slideStyle = (i: number) => [styles.slide, webSnapChild, { minHeight: viewH || undefined, backgroundColor: SLIDES[i].bg }];
  const hasMore = !!card.forms?.length || !!card.similar?.length || !!card.opposite || !!card.pitfall;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: theme.bg }]}>
        <PressScale
          style={[styles.headBtn, { borderColor: theme.line }]}
          scaleTo={0.92}
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="chevron-left" size={20} color={theme.fg} />
        </PressScale>
        <View style={styles.headTitle}>
          <Txt weight="semibold" size={14} color={theme.fg} numberOfLines={1}>
            {card.term}
          </Txt>
          <Txt size={11} color={theme.sub}>
            {theme.name} · {active + 1} of 4
          </Txt>
        </View>
        <PressScale
          style={[styles.headBtn, { borderColor: theme.line }, saved && { backgroundColor: theme.tagBg, borderColor: theme.tagBg }]}
          scaleTo={0.92}
          onPress={() => toggleSaved(card.id)}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
          accessibilityState={{ selected: saved }}
        >
          <Icon name="bookmark" size={18} color={saved ? theme.tagFg : theme.fg} />
        </PressScale>
      </View>

      <View style={{ flex: 1 }}>
        <Animated.ScrollView
          ref={scrollRef}
          style={[{ flex: 1 }, webSnapContainer]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          onLayout={(e) => {
            setViewH(e.nativeEvent.layout.height);
            frameH.set(e.nativeEvent.layout.height);
          }}
          onContentSizeChange={(_, h) => contentH.set(h)}
          snapToOffsets={Platform.OS === 'web' ? undefined : offsets}
          snapToEnd={false}
          decelerationRate={Platform.OS === 'web' ? undefined : 'fast'}
        >
          {/* 1 · Meaning */}
          <View style={slideStyle(0)} onLayout={(e) => setStart(0, e.nativeEvent.layout.y)} accessibilityLabel="Meaning">
            <View style={styles.row}>
              <View style={[styles.tag, { backgroundColor: colors.ink }]}>
                <Txt weight="semibold" size={11} color={colors.lime} style={{ letterSpacing: 0.5 }}>
                  {kind.label.toUpperCase()}
                </Txt>
              </View>
              <View style={[styles.tag, styles.tagOutline]}>
                <Txt weight="medium" size={11} color={colors.ink}>
                  {card.register}
                </Txt>
              </View>
            </View>
            <Txt weight="semibold" size={heroSize} color={colors.ink} style={{ letterSpacing: heroSize > 32 ? -1.1 : -0.8, lineHeight: Math.round(heroSize * 1.1) }}>
              {card.term}
            </Txt>
            <View style={[styles.row, { flexWrap: 'wrap' }]}>
              <PressScale
                onPress={() => playClip(card.id, 'term', card.term)}
                scaleTo={0.97}
                style={styles.sayIt}
                accessibilityRole="button"
                accessibilityLabel={card.sayIt ? `Say it: ${card.sayIt}. Tap to hear it.` : `Hear ${card.term}`}
              >
                <SpeakerGlyph cardId={card.id} slot="term" size={26} />
                <Txt weight="medium" size={14} color={colors.text} numberOfLines={1} style={{ letterSpacing: 0.4, flexShrink: 0 }}>
                  {card.sayIt ?? 'Hear it'}
                </Txt>
                {card.phonetic && (
                  <Txt size={12} color={colors.textFaint} numberOfLines={1} style={{ fontFamily: ipaFont, flexShrink: 1 }}>
                    {card.phonetic}
                  </Txt>
                )}
              </PressScale>
            </View>
            <Txt size={12} color={SLIDES[0].sub}>
              {deck ? `${deck.name} · ${status}` : status}
            </Txt>

            <View style={[styles.block, { marginTop: 14 }]}>
              <View style={styles.rowBetween}>
                <Caps color={SLIDES[0].sub}>What it means</Caps>
                <SpeakerButton cardId={card.id} slot="meaning" fallback={card.meaning} label="Hear the meaning" size={32} tone="onColor" />
              </View>
              <Txt weight="medium" size={phone ? 19 : 21} color={colors.ink} style={{ lineHeight: phone ? 26 : 29, letterSpacing: -0.2 }}>
                {card.meaning}
              </Txt>
            </View>

            {card.literal && (
              <View style={[styles.block, styles.rule, { borderTopColor: SLIDES[0].line }]}>
                <Caps color={SLIDES[0].sub}>Taken literally</Caps>
                <Txt size={14} color={colors.ink} style={{ lineHeight: 21 }}>
                  {card.literal}
                </Txt>
              </View>
            )}

            <View style={[styles.block, styles.rule, { borderTopColor: SLIDES[0].line }]}>
              <Caps color={SLIDES[0].sub}>The feel of it</Caps>
              <Txt size={14} color={colors.ink} style={{ lineHeight: 22 }}>
                {card.nuance}
              </Txt>
            </View>
            <NextHint label="how to use it" color={SLIDES[0].sub} />
          </View>

          {/* 2 · Use it */}
          <View style={slideStyle(1)} onLayout={(e) => setStart(1, e.nativeEvent.layout.y)} accessibilityLabel="Use it">
            <View style={styles.rowBetween}>
              <Txt weight="semibold" size={phone ? 22 : 24} color={colors.ink} style={{ letterSpacing: -0.5 }} accessibilityRole="header">
                Use it today
              </Txt>
              <PressScale
                style={[styles.usedBtn, (!canLog || allUsed) && styles.usedBtnOff]}
                scaleTo={0.95}
                disabled={!canLog || allUsed}
                onPress={() => setSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={canLog ? 'I used it: log a real use' : 'Know this card once before logging real uses'}
              >
                <Icon name={allUsed ? 'check' : 'plus'} size={14} color={canLog && !allUsed ? colors.lime : '#6B7064'} />
                <Txt weight="semibold" size={12} color={canLog && !allUsed ? '#F4F5F0' : '#6B7064'}>
                  {allUsed ? 'Used everywhere' : 'I used it'}
                </Txt>
              </PressScale>
            </View>
            {!canLog && (
              <Txt size={12} color={SLIDES[1].sub} style={{ marginTop: 4 }}>
                Swipe “know it” on this card once, then log real uses for points.
              </Txt>
            )}
            <View style={{ marginTop: 6 }}>
              {card.uses.map((u) => (
                <View key={u.setting} style={[styles.useRow, { borderTopColor: SLIDES[1].line }]}>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
                        <Icon name={SETTING_ICON[u.setting]} size={12} color={colors.ink} />
                        <Txt weight="bold" size={11} color={colors.ink} numberOfLines={1} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
                          {SETTING_LABEL[u.setting]}
                        </Txt>
                        {usedSettings.has(u.setting) && (
                          <View style={styles.usedTag}>
                            <Icon name="check" size={10} color={colors.lime} />
                            <Txt weight="medium" size={10} color={colors.lime}>
                              You used it
                            </Txt>
                          </View>
                        )}
                      </View>
                      <Txt size={12} color={SLIDES[1].sub} numberOfLines={1}>
                        {u.where}
                      </Txt>
                    </View>
                    <SpeakerButton
                      cardId={card.id}
                      slot={u.setting}
                      fallback={u.sentence}
                      label={`Hear the ${SETTING_LABEL[u.setting].toLowerCase()} example`}
                      size={30}
                      tone="onColor"
                    />
                  </View>
                  <Highlighted sentence={u.sentence} highlight={u.highlight} size={phone ? 15.5 : 17} color={colors.ink} marker />
                  <Txt size={12.5} color={SLIDES[1].sub} style={{ lineHeight: 18 }}>
                    {u.tip}
                  </Txt>
                </View>
              ))}
            </View>
            <NextHint label="where it comes from" color={SLIDES[1].sub} />
          </View>

          {/* 3 · Origin */}
          <View style={slideStyle(2)} onLayout={(e) => setStart(2, e.nativeEvent.layout.y)} accessibilityLabel="Origin">
            <View style={styles.rowBetween}>
              <Txt weight="semibold" size={phone ? 22 : 24} color={colors.ink} style={{ letterSpacing: -0.5, flex: 1 }} accessibilityRole="header">
                Where it comes from
              </Txt>
              <View style={[styles.tag, { backgroundColor: colors.ink }]}>
                <Txt weight="semibold" size={11} color={conf.fg}>
                  {conf.label}
                </Txt>
              </View>
            </View>
            <Txt weight="medium" size={phone ? 15.5 : 17} color={colors.ink} style={{ lineHeight: phone ? 23 : 25 }}>
              {card.origin.summary}
            </Txt>
            <View style={[styles.rule, { borderTopColor: SLIDES[2].line, paddingTop: 18 }]}>
              {card.origin.timeline.map((t, i) => {
                const last = i === card.origin.timeline.length - 1;
                return (
                  <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                    <View style={{ width: 12, alignItems: 'center' }}>
                      <View style={[styles.dot, last && { backgroundColor: colors.ink }]} />
                      {!last && <View style={styles.vline} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 3 }}>
                      <Txt weight="mono" size={12} color={colors.ink}>
                        {t.when}
                      </Txt>
                      <Txt size={13.5} color="#2A1E14" style={{ lineHeight: 20 }}>
                        {t.text}
                      </Txt>
                    </View>
                  </View>
                );
              })}
            </View>
            <NextHint label={hasMore ? 'close, but not the same' : 'next card'} color={SLIDES[2].sub} />
          </View>

          {/* 4 · More, then on to the next card */}
          <View style={[slideStyle(3), { paddingBottom: 24 }]} onLayout={(e) => setStart(3, e.nativeEvent.layout.y)} accessibilityLabel="More">
            {!!card.forms?.length && (
              <View style={{ gap: 10 }}>
                <Txt weight="semibold" size={phone ? 20 : 22} style={{ letterSpacing: -0.4 }} accessibilityRole="header">
                  {card.kind === 'word' ? 'Word family' : 'Forms you’ll hear'}
                </Txt>
                <View style={styles.wrap}>
                  {card.forms.map((f) => (
                    <View key={f.term} style={styles.formChip}>
                      <Txt weight="medium" size={14}>
                        {f.term}
                      </Txt>
                      <Txt size={11} color={colors.textMuted}>
                        {f.label}
                      </Txt>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {(!!card.similar?.length || !!card.opposite) && (
              <View style={{ gap: 10, marginTop: card.forms?.length ? 8 : 0 }}>
                <Txt weight="semibold" size={phone ? 20 : 22} style={{ letterSpacing: -0.4 }} accessibilityRole="header">
                  Close, but not the same
                </Txt>
                <View style={styles.wrap}>
                  {card.similar?.map((s) => {
                    const linked = termToId[s.toLowerCase()];
                    return linked ? (
                      <PressScale
                        key={s}
                        style={[styles.chip, styles.linkChip]}
                        scaleTo={0.95}
                        onPress={() => router.push({ pathname: '/card/[id]', params: { id: linked } })}
                        accessibilityRole="link"
                        accessibilityLabel={`Open ${s}`}
                      >
                        <Txt size={13}>{s}</Txt>
                        <Icon name="arrow-up-right" size={13} color={colors.lime} />
                      </PressScale>
                    ) : (
                      <View key={s} style={styles.chip}>
                        <Txt size={13}>{s}</Txt>
                      </View>
                    );
                  })}
                  {card.opposite && (
                    <View style={[styles.chip, styles.oppChip]}>
                      <Txt size={13} color={colors.orangeSoft}>
                        opposite: {card.opposite}
                      </Txt>
                    </View>
                  )}
                </View>
              </View>
            )}

            {card.pitfall && (
              <View style={[styles.pitfall, styles.rule, { borderTopColor: SLIDES[3].line }]}>
                <Icon name="alert-triangle" size={16} color={colors.orangeText} />
                <Txt size={14} color={colors.orangeText} style={{ flex: 1, lineHeight: 21 }}>
                  {card.pitfall}
                </Txt>
              </View>
            )}

            <View style={styles.endBlock}>
              {deck && (
                <Txt size={12} color={colors.textMuted}>
                  End of this card · {at + 1} of {deck.cards.length} in {deck.name}
                </Txt>
              )}
              {next ? (
                <PressScale style={styles.nextBtn} scaleTo={0.97} onPress={() => open(next.id)} accessibilityRole="link" accessibilityLabel={`Next card: ${next.term}`}>
                  <Txt weight="semibold" size={15} color={colors.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
                    Next card: {next.term}
                  </Txt>
                  <Icon name="chevron-right" size={17} color={colors.ink} />
                </PressScale>
              ) : (
                <PressScale style={styles.nextBtn} scaleTo={0.97} onPress={back} accessibilityRole="button">
                  <Txt weight="semibold" size={15} color={colors.ink}>
                    End of deck · back
                  </Txt>
                </PressScale>
              )}
              <PressScale style={styles.topBtn} scaleTo={0.97} onPress={() => goTo(0)} accessibilityRole="button">
                <Txt weight="semibold" size={14}>
                  Back to the top
                </Txt>
              </PressScale>
            </View>
          </View>
        </Animated.ScrollView>

        {/* Section rail: shows where you are, tap a segment to jump. */}
        <View style={styles.rail} accessibilityRole="tablist" accessibilityLabel="Sections">
          <View style={[styles.railTrack, { backgroundColor: theme.track }]} pointerEvents="none" />
          <Animated.View style={[styles.railThumb, { backgroundColor: theme.thumb }, thumbStyle]} pointerEvents="none" />
          {SLIDES.map((s, i) => (
            <PressScale
              key={s.name}
              style={styles.railHit}
              scaleTo={1}
              onPress={() => goTo(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active === i }}
              accessibilityLabel={`Go to ${s.name}`}
            />
          ))}
          <Animated.View style={[styles.railLabel, { backgroundColor: theme.tagBg }, labelStyle]} pointerEvents="none">
            <Txt weight="semibold" size={12} color={theme.tagFg} numberOfLines={1}>
              {theme.name}
            </Txt>
          </Animated.View>
        </View>
      </View>

      {toast?.id === card.id && (
        <View style={[styles.toast, { bottom: (deck ? 64 : 16) + insets.bottom }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Icon name="check" size={15} color={colors.ink} />
          <Txt weight="semibold" size={14} color={colors.ink}>
            {toast.text}
          </Txt>
        </View>
      )}

      {/* Pinned deck navigation: step through the deck without scrolling to the end. */}
      {deck && (
        <View style={[styles.pager, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <PressScale
            style={[styles.pageBtn, !prev && styles.pageBtnOff]}
            scaleTo={0.96}
            disabled={!prev}
            onPress={() => prev && open(prev.id)}
            accessibilityRole="link"
            accessibilityLabel={prev ? `Previous card: ${prev.term}` : 'No previous card'}
          >
            <Icon name="chevron-left" size={16} color={prev ? colors.text : colors.textFaint} />
            <Txt weight="medium" size={13} numberOfLines={1} color={prev ? colors.textSoft : colors.textFaint} style={{ flexShrink: 1 }}>
              {prev?.term ?? 'Start'}
            </Txt>
          </PressScale>
          <Txt weight="mono" size={12} color={colors.textMuted} accessibilityLabel={`Card ${at + 1} of ${deck.cards.length}`}>
            {at + 1}/{deck.cards.length}
          </Txt>
          <PressScale
            style={[styles.pageBtn, { justifyContent: 'flex-end' }, !next && styles.pageBtnOff]}
            scaleTo={0.96}
            disabled={!next}
            onPress={() => next && open(next.id)}
            accessibilityRole="link"
            accessibilityLabel={next ? `Next card: ${next.term}` : 'No next card'}
          >
            <Txt weight="medium" size={13} numberOfLines={1} color={next ? colors.text : colors.textFaint} style={{ flexShrink: 1 }}>
              {next?.term ?? 'End of deck'}
            </Txt>
            <Icon name="chevron-right" size={16} color={next ? colors.lime : colors.textFaint} />
          </PressScale>
        </View>
      )}

      {sheet && <UsedItSheet card={card} onClose={() => setSheet(false)} onLogged={onLogged} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  ghostBtn: { height: 48, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3E35', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10, zIndex: 2 },
  headBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, alignItems: 'center', gap: 1, minWidth: 0 },
  slide: { paddingTop: 18, paddingBottom: 20, paddingLeft: 22, paddingRight: RAIL_GUTTER, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  tagOutline: { borderWidth: 1, borderColor: 'rgba(11,12,10,0.3)', paddingVertical: 3 },
  sayIt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 5,
    paddingRight: 14,
    paddingVertical: 5,
    maxWidth: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  block: { gap: 8 },
  rule: { borderTopWidth: 1, paddingTop: 14, marginTop: 4 },
  nextHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 18 },
  usedBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.ink },
  usedBtnOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(11,12,10,0.2)' },
  usedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.ink },
  useRow: { paddingVertical: 14, borderTopWidth: 1, gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3, borderWidth: 2, borderColor: colors.ink },
  vline: { width: 2, flex: 1, backgroundColor: 'rgba(11,12,10,0.3)' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: '#4A4F44', gap: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: '#4A4F44' },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: colors.limeDeep, backgroundColor: colors.limeDeep },
  oppChip: { borderStyle: 'dashed', borderColor: colors.orange },
  pitfall: { flexDirection: 'row', gap: 10 },
  endBlock: { marginTop: 'auto', paddingTop: 24, gap: 10 },
  nextBtn: { height: 50, borderRadius: radius.pill, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 18 },
  topBtn: { height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: '#4A4F44', alignItems: 'center', justifyContent: 'center' },
  rail: { position: 'absolute', right: 6, top: '50%', marginTop: -RAIL_H / 2, width: 28, height: RAIL_H },
  railTrack: { position: 'absolute', left: 12, top: 0, bottom: 0, width: 4, borderRadius: 2 },
  railThumb: { position: 'absolute', left: 12, top: 0, width: 4, height: THUMB_H, borderRadius: 2 },
  railHit: { width: 28, height: RAIL_H / 4 },
  railLabel: { position: 'absolute', right: 30, top: 0, height: 26, paddingHorizontal: 10, borderRadius: radius.pill, justifyContent: 'center', boxShadow: '0 6px 16px rgba(0,0,0,0.25)' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.bgRaised,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  pageBtnOff: { backgroundColor: 'transparent' },
});
