import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeckCard, type DeckCardHandle } from '../../components/DeckCard';
import { Icon, IconButton, PressScale, Txt } from '../../components/ui';
import { cardsById, cardsForScope, scopeLabel } from '../../data';
import { buildQueue, practiceQueue } from '../../lib/srs';
import { liveStreak, useStore } from '../../lib/store';
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
}

function newSession(scope: string, practice = false): Session {
  const cards = cardsForScope(scope);
  const reviews = useStore.getState().reviews;
  const ids = practice ? practiceQueue(cards) : buildQueue(cards, reviews);
  return { ids, pos: 0, mode: practice ? 'practice' : 'review', known: 0, learning: 0, log: [], requeued: [] };
}

export default function Learn() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const hydrated = useStore((s) => s.hydrated);
  const scope = useStore((s) => s.scope);
  const streak = useStore((s) => liveStreak(s.streak));
  const answer = useStore((s) => s.answer);
  const undoStore = useStore((s) => s.undo);

  const [session, setSession] = useState<Session | null>(null);
  const [builtFor, setBuiltFor] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const topRef = useRef<DeckCardHandle>(null);

  // (Re)build the session once storage is loaded and whenever the deck changes.
  if (hydrated && builtFor !== scope) {
    setBuiltFor(scope);
    setSession(newSession(scope));
  }

  const onSwiped = useCallback(
    (id: string, known: boolean) => {
      answer(id, known);
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
    [answer],
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

  // Keyboard on web: ← still learning, → know it, space flip, enter details, z undo.
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
      else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDetail, undo]);

  const total = session?.ids.length ?? 0;
  const pos = session?.pos ?? 0;
  const done = !!session && pos >= total;
  const empty = !!session && total === 0;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(total ? pos / total : 0, { duration: 320 }));
  }, [pos, total, progress]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

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
            {streak}-day streak
          </Txt>
        </View>
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

      <View style={styles.deckArea} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {session && !done && width > 0 && (
          <View style={styles.deck}>
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
                  enterFrom={index === 0 ? session.enterFrom : undefined}
                  onSwiped={onSwiped}
                />
              ))}
          </View>
        )}
        {done && (
          <Animated.View entering={FadeIn.duration(260)} style={styles.doneCard}>
            <View style={styles.doneIcon}>
              <Icon name={empty ? 'coffee' : 'check'} size={30} color={colors.ink} />
            </View>
            <Txt weight="semibold" size={26} style={{ letterSpacing: -0.6, textAlign: 'center' }}>
              {empty ? 'All caught up' : 'Deck cleared'}
            </Txt>
            <Txt size={15} color={colors.textMuted} style={{ textAlign: 'center', lineHeight: 22 }}>
              {empty
                ? 'Nothing is due in this deck right now. Practice anyway, or pick another deck.'
                : `${session?.known} known · ${session?.learning} still learning. Missed cards come back tomorrow.`}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
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

      <View style={styles.actions}>
        <IconButton icon="corner-up-left" label="Undo last swipe" size={44} iconSize={18} fg={colors.textMuted} onPress={undo} />
        <IconButton
          icon="rotate-ccw"
          label="Still learning"
          size={64}
          iconSize={26}
          bg={colors.surface}
          fg={colors.orange}
          border="#3A3E35"
          onPress={() => topRef.current?.swipe(false)}
        />
        <IconButton icon="check" label="I know it" size={64} iconSize={28} bg={colors.lime} fg={colors.ink} border={colors.lime} onPress={() => topRef.current?.swipe(true)} />
        <IconButton icon="book-open" label="Open full explanation" size={44} iconSize={18} onPress={openDetail} />
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
  progressWrap: { paddingHorizontal: 20, paddingTop: 8, gap: 8 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.chip, overflow: 'hidden' },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.lime },
  deckArea: { flex: 1, marginTop: 24, marginHorizontal: 20, marginBottom: 8 },
  deck: { flex: 1, marginBottom: 32 },
  doneCard: {
    flex: 1,
    marginBottom: 32,
    borderRadius: radius.card,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: '#2A2D27',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 28,
  },
  doneIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { height: 48, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  secondaryBtn: {
    height: 48,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: '#3A3E35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 14 },
});
