import * as Haptics from 'expo-haptics';
import { playClip, stopAudio } from '../../lib/audio';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckCard, type DeckCardHandle } from '../../components/DeckCard';
import { LevelChip } from '../../components/LevelChip';
import { Icon, IconButton, PressScale, Txt } from '../../components/ui';
import { cardsById, cardsForScope, openDeckIds, scopeLabel } from '../../data';
import { levelState } from '../../lib/levels';
import { buildQueue, practiceQueue } from '../../lib/srs';
import { levelInput, liveStreak, useLevel, useStore } from '../../lib/store';
import { colors, radius } from '../../theme';

interface Session {
  ids: string[];
  pos: number;
  mode: 'review' | 'practice';
  known: number;
  learning: number;
  /** what each swipe did, so undo can reverse it */
  log: { id: string; known: boolean; requeued: boolean }[];
  requeued: string[];
  enterFrom?: 'left' | 'right';
  /** level points when the session started, for the "+N points" line at the end */
  pointsAtStart: number;
}

function newSession(scope: string, practice = false): Session {
  const state = useStore.getState();
  const level = levelState(levelInput(state), state.levelSeen);
  const cards = cardsForScope(scope, openDeckIds(level.n, state.reviews));
  const ids = practice ? practiceQueue(cards) : buildQueue(cards, state.reviews);
  return { ids, pos: 0, mode: practice ? 'practice' : 'review', known: 0, learning: 0, log: [], requeued: [], pointsAtStart: level.points };
}

export default function Learn() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hydrated = useStore((s) => s.hydrated);
  const scope = useStore((s) => s.scope);
  const streak = useStore((s) => liveStreak(s.streak, s.freezes));
  const freezes = useStore((s) => s.freezes);
  const levelSeen = useStore((s) => s.levelSeen);
  const level = useLevel();
  const answer = useStore((s) => s.answer);
  const undoStore = useStore((s) => s.undo);

  const short = useWindowDimensions().height < 700;
  const [session, setSession] = useState<Session | null>(null);
  const [builtFor, setBuiltFor] = useState<string | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const width = area.width;
  const topRef = useRef<DeckCardHandle>(null);

  // (Re)build the session once storage is loaded and whenever the deck changes.
  if (hydrated && builtFor !== scope) {
    setBuiltFor(scope);
    setSession(newSession(scope));
  }

  const mode = session?.mode;
  const onSwiped = useCallback(
    (id: string, known: boolean) => {
      // Practice keeps the streak alive but never moves a card between boxes, so it can't farm points.
      answer(id, known, mode === 'practice');
      stopAudio();
      if (Platform.OS !== 'web') Haptics.impactAsync(known ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft);
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
    [answer, mode],
  );

  const undo = useCallback(() => {
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
  }, [undoStore]);

  const top = session ? session.ids[session.pos] : undefined;
  const openDetail = useCallback(() => {
    if (top) router.push({ pathname: '/card/[id]', params: { id: top } });
  }, [router, top]);

  // Keyboard on web: ← still learning, → know it, space flip, enter details, z undo, s say it, shift+s hear the example.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') topRef.current?.swipe(true);
      else if (e.key === 'ArrowLeft') topRef.current?.swipe(false);
      else if (e.key === ' ') {
        e.preventDefault();
        topRef.current?.flip();
      } else if (e.key === 'Enter') openDetail();
      else if (e.key.toLowerCase() === 'z') undo();
      else if (e.key.toLowerCase() === 's' && top) {
        const c = cardsById[top];
        const ex = c.uses.find((u) => u.setting === 'social') ?? c.uses[0];
        if (e.shiftKey) playClip(c.id, 'social', ex.sentence);
        else playClip(c.id, 'term', c.term);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDetail, undo, top]);

  const total = session?.ids.length ?? 0;
  const pos = session?.pos ?? 0;
  const done = !!session && pos >= total;
  const empty = !!session && total === 0;
  const gained = session ? Math.max(0, level.points - session.pointsAtStart) : 0;

  // Level-ups are celebrated once, at the end of a session, never mid-swipe.
  const swiped = session?.log.length ?? 0;
  useEffect(() => {
    if (done && swiped > 0 && level.n > levelSeen) router.push('/level-up');
  }, [done, swiped, level.n, levelSeen, router]);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(total ? pos / total : 0, { duration: 320 }));
  }, [pos, total, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // The card fills the space between the progress bar and the buttons. The cap only matters on
  // unusually tall/narrow windows; short phones get a compact card (see DeckCard).
  const PEEK = 18; // room under the top card for the two behind it
  const cardHeight = Math.max(0, Math.min(area.height - PEEK, Math.round(width * 1.9)));

  const visible = useMemo(() => {
    if (!session) return [];
    return session.ids.slice(session.pos, session.pos + 3).map((id, i) => ({ id, key: `${id}-${session.pos + i}`, index: i }));
  }, [session]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Txt weight="bold" size={17} color={colors.ink}>
              L
            </Txt>
          </View>
          <Txt weight="semibold" size={19} style={{ letterSpacing: -0.4 }}>
            Lexicard
          </Txt>
        </View>
        <View style={styles.streak}>
          <Icon name="zap" size={14} color={colors.lime} />
          <Txt weight="medium" size={13}>
            {streak > 0 ? `${streak}-day streak` : 'Start a streak'}
          </Txt>
          {freezes > 0 && (
            <View style={styles.freeze} accessibilityLabel={`${freezes} streak ${freezes === 1 ? 'freeze' : 'freezes'}`}>
              <Icon name="cloud-snow" size={13} color={colors.textSoft} />
              <Txt weight="mono" size={12} color={colors.textSoft}>
                {freezes}
              </Txt>
            </View>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 }}>
        <LevelChip level={level} compact={short} />
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Txt size={13} color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
            {session?.mode === 'practice' ? 'Practice · ' : 'Today · '}
            {scopeLabel(scope)}
          </Txt>
          <Txt weight="mono" size={13} color={colors.textMuted}>
            {Math.min(pos + 1, total)} / {total}
          </Txt>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.bar, barStyle]} />
        </View>
      </View>

      <View
        style={[styles.deckArea, short && { marginTop: 10 }]}
        onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {session && !done && cardHeight > 0 && (
          <View style={[styles.deck, { height: cardHeight }]}>
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
                />
              ))}
          </View>
        )}
        {done && (
          <Animated.View entering={FadeIn.duration(260)} style={[styles.doneCard, short && styles.doneCardShort]}>
            <View style={styles.doneIcon}>
              <Icon name={empty ? 'coffee' : 'check'} size={30} color={colors.ink} />
            </View>
            <Txt weight="semibold" size={26} style={{ letterSpacing: -0.6, textAlign: 'center' }}>
              {empty ? 'All caught up' : 'Deck cleared'}
            </Txt>
            <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>
              {empty
                ? 'Nothing is due in this deck right now. Practice anyway, or pick another deck.'
                : session?.mode === 'practice'
                  ? `${session.known} known · ${session.learning} still learning. Practice keeps your streak going; boxes only move on due cards.`
                  : session?.learning
                    ? `${session.known} known · ${session.learning} still learning. Missed cards come back tomorrow.`
                    : `All ${session?.known} known. They come back in a few days to check they stuck.`}
            </Txt>
            {gained > 0 && (
              <View style={styles.gained}>
                <Txt weight="mono" size={13} color={colors.limeSoft}>
                  +{gained} points
                </Txt>
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 }}>
              <PressScale style={styles.primaryBtn} onPress={() => setSession(newSession(scope, true))} accessibilityRole="button">
                <Txt weight="semibold" size={15} color={colors.ink}>
                  Practice 10 more
                </Txt>
              </PressScale>
              <PressScale style={styles.secondaryBtn} onPress={() => router.navigate('/library')} accessibilityRole="button">
                <Txt weight="semibold" size={15}>
                  Decks
                </Txt>
              </PressScale>
            </View>
          </Animated.View>
        )}
      </View>

      {/* Same height whether or not the sort buttons show, so the deck doesn't jump when it's cleared. */}
      <View style={[styles.actions, { minHeight: (short ? 48 : 54) + 16 }]}>
        {(!done || (session?.log.length ?? 0) > 0) && (
          <IconButton icon="corner-up-left" label="Undo last swipe" size={40} iconSize={17} fg={colors.textMuted} onPress={undo} />
        )}
        {!done && (
          <>
            <IconButton
              icon="rotate-ccw"
              label="Still learning"
              size={short ? 48 : 54}
              iconSize={22}
              bg={colors.surface}
              fg={colors.orange}
              border="#3A3E35"
              onPress={() => topRef.current?.swipe(false)}
            />
            <IconButton
              icon="check"
              label="I know it"
              size={short ? 48 : 54}
              iconSize={24}
              bg={colors.lime}
              fg={colors.ink}
              border={colors.lime}
              onPress={() => topRef.current?.swipe(true)}
            />
            <IconButton icon="book-open" label="Open full explanation" size={40} iconSize={17} onPress={openDetail} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: '#2A2D27',
  },
  freeze: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: colors.borderStrong },
  gained: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.limeDeep },
  progressWrap: { paddingHorizontal: 20, paddingTop: 10, gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.chip, overflow: 'hidden' },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.lime },
  deckArea: { flex: 1, marginTop: 14, marginHorizontal: 20, marginBottom: 0, justifyContent: 'center' },
  deck: { width: '100%', marginBottom: 18 },
  doneCard: {
    marginBottom: 18,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: '#2A2D27',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 28,
  },
  doneCardShort: { padding: 18, gap: 10, marginBottom: 0 },
  doneIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { height: 48, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondaryBtn: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#3A3E35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 8 },
});
