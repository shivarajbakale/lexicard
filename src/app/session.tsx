import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckCard, type DeckCardHandle, type StoryFrame } from '../components/DeckCard';
import { PackBar } from '../components/packs';
import { Icon, IconButton, PressScale, Txt } from '../components/ui';
import { cardsById, cardsForScope } from '../data';
import { playClip, stopAudio } from '../lib/audio';
import { feedback } from '../lib/haptics';
import { levelState } from '../lib/levels';
import { packInfo, packOfCard, packProgress, todayQueue } from '../lib/packs';
import { buildQueue, practiceQueue } from '../lib/srs';
import { levelInput, newLeftToday, useLevel, useStore } from '../lib/store';
import { colors, radius } from '../theme';

/**
 * A study session, full screen.
 *   /session                      today: due reviews from every pack + new cards from the current pack
 *   /session?practice=<pack id>   practice a pack: keeps the streak, never moves cards between boxes
 *   /session?scope=<scope>        a root family or other scope (see cardsForScope)
 */
interface Session {
  ids: string[];
  pos: number;
  mode: 'review' | 'practice';
  /** the pack this session reports on at the end */
  packId: string | null;
  /** cards that were new when the session started */
  fresh: string[];
  known: number;
  learning: number;
  /** what each swipe did, so undo can reverse it */
  log: { id: string; known: boolean; requeued: boolean }[];
  requeued: string[];
  enterFrom?: 'left' | 'right';
  /** level points when the session started, for the "+N points" line at the end */
  pointsAtStart: number;
}

function newSession(params: { practice?: string; scope?: string }): Session {
  const state = useStore.getState();
  const level = levelState(levelInput(state), state.levelSeen);
  const base = { pos: 0, known: 0, learning: 0, log: [], requeued: [], pointsAtStart: level.points };
  if (params.practice && packInfo[params.practice]) {
    const cards = packInfo[params.practice].pack.cardIds.map((id) => cardsById[id]).filter(Boolean);
    return { ...base, ids: practiceQueue(cards), mode: 'practice', packId: params.practice, fresh: [] };
  }
  if (params.scope) {
    const ids = buildQueue(cardsForScope(params.scope), state.reviews);
    const fresh = ids.filter((id) => !state.reviews[id]);
    return { ...base, ids, mode: 'review', packId: null, fresh };
  }
  const { due, fresh } = todayQueue(state.reviews, state.currentPack, newLeftToday(state));
  return { ...base, ids: [...due, ...fresh], mode: 'review', packId: state.currentPack, fresh };
}

export default function SessionScreen() {
  const params = useLocalSearchParams<{ practice?: string; scope?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hydrated = useStore((s) => s.hydrated);
  const reviews = useStore((s) => s.reviews);
  const levelSeen = useStore((s) => s.levelSeen);
  const celebrated = useStore((s) => s.packsCelebrated);
  const level = useLevel();
  const answer = useStore((s) => s.answer);
  const undoStore = useStore((s) => s.undo);

  const win = useWindowDimensions();
  const short = win.height < 700;
  const [session, setSession] = useState<Session | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const width = area.width;
  const topRef = useRef<DeckCardHandle>(null);
  // 0 = card, 1 = the top card's back has opened into story mode (header and controls fade).
  const story = useSharedValue(0);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const deckRef = useRef<ComponentRef<typeof View>>(null);
  const [frame, setFrame] = useState<StoryFrame | undefined>(undefined);
  const measureFrame = useCallback(() => {
    const root = rootRef.current;
    const deck = deckRef.current;
    if (!root || !deck) return;
    root.measureInWindow((rx: number, ry: number, rw: number, rh: number) => {
      deck.measureInWindow((dx: number, dy: number, dw: number, dh: number) => {
        if (!rw || !dw) return;
        setFrame({ top: dy - ry, left: dx - rx, right: rx + rw - (dx + dw), bottom: ry + rh - (dy + dh), insetTop: insets.top });
      });
    });
  }, [insets.top]);

  // Build the queue once, after storage has loaded.
  const built = useRef(false);
  useEffect(() => {
    if (!hydrated || built.current) return;
    built.current = true;
    setSession(newSession(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [hydrated]);

  const close = useCallback(() => {
    stopAudio();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const mode = session?.mode;
  const onSwiped = useCallback(
    (id: string, known: boolean) => {
      // Practice keeps the streak alive but never moves a card between boxes, so it can't farm points.
      answer(id, known, mode === 'practice');
      story.set(withTiming(0, { duration: 220 }));
      stopAudio();
      feedback(known ? 'light' : 'soft');
      setSession((s) => {
        if (!s) return s;
        // Missed cards come back once more at the end of this session.
        const requeue = !known && !s.requeued.includes(id);
        return {
          ...s,
          pos: s.pos + 1,
          ids: requeue ? [...s.ids, id] : s.ids,
          requeued: requeue ? [...s.requeued, id] : s.requeued,
          known: s.known + (known ? 1 : 0),
          learning: s.learning + (known ? 0 : 1),
          log: [...s.log, { id, known, requeued: requeue }],
          enterFrom: undefined,
        };
      });
    },
    [answer, mode, story],
  );

  const undo = useCallback(() => {
    story.set(withTiming(0, { duration: 220 }));
    setSession((s) => {
      if (!s || s.log.length === 0) return s;
      const last = s.log[s.log.length - 1];
      undoStore();
      return {
        ...s,
        pos: s.pos - 1,
        ids: last.requeued ? s.ids.slice(0, -1) : s.ids,
        requeued: last.requeued ? s.requeued.filter((r) => r !== last.id) : s.requeued,
        known: s.known - (last.known ? 1 : 0),
        learning: s.learning - (last.known ? 0 : 1),
        log: s.log.slice(0, -1),
        enterFrom: last.known ? 'right' : 'left',
      };
    });
  }, [undoStore, story]);

  const top = session ? session.ids[session.pos] : undefined;
  // Keyboard on web: ← still learning, → know it, space flip, enter story, esc back to card (or out), z undo, s say it, shift+s hear the example.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      // The picture viewer has its own keys (Esc closes it).
      if (document.querySelector('.pswp')) return;
      if (e.key === 'ArrowRight') topRef.current?.swipe(true);
      else if (e.key === 'ArrowLeft') topRef.current?.swipe(false);
      else if (e.key === ' ') {
        e.preventDefault();
        topRef.current?.flip();
      } else if (e.key === 'Enter') topRef.current?.openStory();
      else if (e.key === 'Escape') {
        if (story.value > 0.05) topRef.current?.closeStory();
        else close();
      } else if (e.key.toLowerCase() === 'z') undo();
      else if (e.key.toLowerCase() === 's' && top) {
        const c = cardsById[top];
        const ex = c.uses.find((u) => u.setting === 'social') ?? c.uses[0];
        if (e.shiftKey) playClip(c.id, 'social', ex.sentence);
        else playClip(c.id, 'term', c.term);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, top, close, story]);

  const total = session?.ids.length ?? 0;
  const pos = session?.pos ?? 0;
  const done = !!session && pos >= total;
  const empty = !!session && total === 0;
  const gained = session ? Math.max(0, level.points - session.pointsAtStart) : 0;
  const packId = session?.packId ?? null;
  const pack = packId ? packInfo[packId] : undefined;
  const progress = packId ? packProgress(packId, reviews) : null;
  // A pack finished in this session gets its own screen, once, before any level-up.
  const packJustDone = !!packId && session?.mode === 'review' && !!progress?.done && !celebrated.includes(packId);

  const swiped = session?.log.length ?? 0;
  useEffect(() => {
    if (done && swiped > 0 && !packJustDone && level.n > levelSeen) router.push('/level-up');
  }, [done, swiped, packJustDone, level.n, levelSeen, router]);

  const chromeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - story.value * 2.2), transform: [{ translateY: -24 * story.value }] }));
  const controlsStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - story.value * 2.2) }));

  const PEEK = 18; // room under the top card for the two behind it
  const cardHeight = Math.max(0, Math.min(area.height - PEEK, Math.round(width * 1.9)));

  const visible = useMemo(() => {
    if (!session) return [];
    return session.ids.slice(session.pos, session.pos + 3).map((id, i) => ({ id, key: `${id}-${session.pos + i}`, index: i }));
  }, [session]);

  const topCard = top ? cardsById[top] : undefined;
  const tag =
    session?.mode === 'practice'
      ? 'Practice'
      : top && session?.log.some((l) => l.id === top && !l.known)
        ? 'Again'
        : top && session?.fresh.includes(top) && !reviews[top]
          ? 'New'
          : 'Review';
  const tagColors = tag === 'New' ? [colors.limeDeep, colors.limeSoft] : tag === 'Again' ? [colors.orangeDeep, colors.orangeText] : [colors.chip, colors.textSoft];
  const contextLabel = topCard ? (packInfo[packOfCard[topCard.id]]?.pack.title ?? '') : '';

  const summaryLine = !progress
    ? ''
    : session?.mode === 'practice'
      ? 'Practice keeps your streak going. Boxes only move on due cards, so this pack’s progress is unchanged.'
      : progress.done
        ? 'Every card known at least once. That completes the pack.'
        : `${progress.learning ? `${progress.learning} to retry tomorrow` : 'Nothing to retry'}${
            progress.fresh ? `, and ${progress.fresh} new ${progress.fresh === 1 ? 'card' : 'cards'} left.` : '.'
          } Know them all once and the pack is done.`;

  return (
    <View ref={rootRef} onLayout={measureFrame} style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {!done && (
        <Animated.View style={chromeStyle} pointerEvents="box-none">
          <View style={styles.header}>
            <IconButton icon="x" label="End session" onPress={close} bg="transparent" border="transparent" />
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${total ? (pos / total) * 100 : 0}%` }]} />
            </View>
            <Txt weight="mono" size={12} color={colors.textMuted} style={{ minWidth: 40, textAlign: 'right' }}>
              {Math.min(pos + 1, total)}/{total}
            </Txt>
          </View>
          <View style={styles.context}>
            <Txt size={13} color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
              {contextLabel}
            </Txt>
            {topCard && (
              <View style={[styles.tag, { backgroundColor: tagColors[0] }]}>
                <Txt weight="semibold" size={11} color={tagColors[1]}>
                  {tag}
                </Txt>
              </View>
            )}
          </View>
        </Animated.View>
      )}

      <View
        style={[styles.deckArea, short && { marginTop: 6 }]}
        onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {session && !done && cardHeight > 0 && (
          <Animated.View entering={FadeIn.duration(280)}>
          <View ref={deckRef} onLayout={measureFrame} style={[styles.deck, { height: cardHeight }]}>
            {visible
              .slice()
              .reverse()
              .map(({ id, key, index }) => (
                <DeckCard
                  key={key}
                  ref={index === 0 ? topRef : undefined}
                  card={cardsById[id]}
                  index={index}
                  width={width}
                  height={cardHeight}
                  enterFrom={index === 0 ? session.enterFrom : undefined}
                  onSwiped={onSwiped}
                  frame={frame}
                  story={story}
                />
              ))}
          </View>
          </Animated.View>
        )}
        {done && (
          <Animated.View entering={FadeIn.duration(260)} style={[styles.doneWrap, short && { gap: 12 }]}>
            <View style={styles.doneIcon}>
              <Icon name={empty ? 'coffee' : 'check'} size={30} color={colors.ink} />
            </View>
            <Txt weight="semibold" size={28} style={{ letterSpacing: -0.8 }} accessibilityRole="header">
              {empty ? 'Nothing due right now' : session?.mode === 'practice' ? 'Practice done' : 'Session done'}
            </Txt>
            {!empty && (
              <View style={styles.stats}>
                <Stat value={`${session?.known ?? 0}`} label="known" color={colors.lime} />
                <Stat value={`${session?.learning ?? 0}`} label="still learning" color={colors.orange} />
                <Stat value={`+${gained}`} label="points" color={colors.text} />
              </View>
            )}
            {pack && progress && (
              <View style={styles.packCard}>
                <View style={styles.packHead}>
                  <Txt weight="semibold" size={16} style={{ flex: 1 }} numberOfLines={1}>
                    {pack.pack.title}
                  </Txt>
                  <Txt weight="mono" size={12} color={colors.textMuted}>
                    {progress.known}/{progress.total} known
                  </Txt>
                </View>
                <PackBar packId={pack.pack.id} reviews={reviews} />
                <Txt size={14} color={colors.textSoft} style={{ lineHeight: 21 }}>
                  {empty ? 'Come back tomorrow, or practise this pack.' : summaryLine}
                </Txt>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {packJustDone ? (
              <PressScale
                style={styles.primaryBtn}
                onPress={() => router.replace({ pathname: '/pack-complete', params: { id: packId! } })}
                accessibilityRole="button"
              >
                <Txt weight="semibold" size={16} color={colors.ink}>
                  Pack complete! See it
                </Txt>
              </PressScale>
            ) : (
              <>
                <PressScale style={styles.primaryBtn} onPress={close} accessibilityRole="button">
                  <Txt weight="semibold" size={16} color={colors.ink}>
                    Back to Today
                  </Txt>
                </PressScale>
                {packId && (
                  <PressScale style={styles.secondaryBtn} onPress={() => setSession(newSession({ practice: packId }))} accessibilityRole="button">
                    <Txt weight="semibold" size={15}>
                      Practice this pack
                    </Txt>
                  </PressScale>
                )}
              </>
            )}
          </Animated.View>
        )}
      </View>

      {!done && (
        <Animated.View style={[styles.controls, controlsStyle]} pointerEvents="box-none">
          <PressScale style={styles.learnBtn} onPress={() => topRef.current?.swipe(false)} accessibilityRole="button" accessibilityLabel="Still learning">
            <Icon name="rotate-ccw" size={17} color={colors.orange} />
            <Txt weight="semibold" size={15}>
              Still learning
            </Txt>
          </PressScale>
          <PressScale style={styles.knowBtn} onPress={() => topRef.current?.swipe(true)} accessibilityRole="button" accessibilityLabel="Know it">
            <Icon name="check" size={17} color={colors.ink} />
            <Txt weight="semibold" size={15} color={colors.ink}>
              Know it
            </Txt>
          </PressScale>
        </Animated.View>
      )}
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Txt weight="mono" size={24} color={color}>
        {value}
      </Txt>
      <Txt size={12} color={colors.textMuted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.lime },
  context: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 4 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  deckArea: { flex: 1, zIndex: 2, marginTop: 12, marginHorizontal: 20, justifyContent: 'center' },
  deck: { width: '100%' },
  controls: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 14 },
  learnBtn: {
    flex: 1,
    height: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#3A3E35',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  knowBtn: { flex: 1, height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  doneWrap: { flex: 1, gap: 16, paddingTop: 24 },
  doneIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27', gap: 2 },
  packCard: { padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27', gap: 12 },
  packHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  primaryBtn: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondaryBtn: { height: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3E35', alignItems: 'center', justifyContent: 'center' },
});
