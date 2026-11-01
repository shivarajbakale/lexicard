import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeOnScroll, ScreenHeader, useScrollY } from '../../components/ScreenHeader';
import { SpeakerButton, SpeakerGlyph } from '../../components/Speaker';
import { SETTING_ICON, SETTING_LABEL, UsedItSheet } from '../../components/UsedItSheet';
import { playClip } from '../../lib/audio';
import { Highlighted, Icon, IconButton, Label, Pill, PressScale, Txt } from '../../components/ui';
import { allCards, cardsById, deckOfCard } from '../../data';
import { isDue, MAX_BOX, relativeDue } from '../../lib/srs';
import { levelInput, useStore } from '../../lib/store';
import { levelState } from '../../lib/levels';
import { colors, confidenceStyle, ipaFont, kindStyle, radius } from '../../theme';


/** Other cards whose term matches one of this card's "similar" entries, so they can be opened directly. */
const termToId: Record<string, string> = Object.fromEntries(allCards.map((c) => [c.term.toLowerCase(), c.id]));

export default function CardDetail() {
  const { id, log } = useLocalSearchParams<{ id: string; log?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const card = cardsById[id ?? ''];
  const saved = useStore((s) => s.saved.includes(id ?? ''));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const review = useStore((s) => s.reviews[id ?? '']);
  const used = useStore((s) => s.uses[id ?? '']);
  const [sheet, setSheet] = useState(log === '1');
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const { y, onScroll } = useScrollY();
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Prev/next reuse this screen with a new id: start the new card at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

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
  return (
    <View style={styles.screen}>
      <ScreenHeader y={y} style={{ paddingBottom: 10 }}>
        <View style={styles.topBar}>
          <IconButton icon="chevron-left" label="Back" onPress={back} />
          <FadeOnScroll y={y} after={70} style={styles.topTitle}>
            <Txt weight="semibold" size={16} numberOfLines={1}>
              {card.term}
            </Txt>
          </FadeOnScroll>
          <IconButton
            icon="bookmark"
            label={saved ? 'Remove from saved' : 'Save'}
            bg={saved ? colors.lime : colors.surface2}
            fg={saved ? colors.ink : colors.text}
            onPress={() => toggleSaved(card.id)}
          />
        </View>
      </ScreenHeader>
      <Animated.ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 32 }} onScroll={onScroll} scrollEventThrottle={16}>
        <Animated.View entering={FadeInDown.duration(320)} style={styles.hero}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pill label={kind.label.toUpperCase()} bg={kind.bg} fg={kind.fg} />
            <View style={styles.outlinePill}>
              <Txt weight="medium" size={12} color="#C9CDC1">
                {card.register}
              </Txt>
            </View>
          </View>
          <Txt weight="semibold" size={card.term.length > 16 ? 34 : 42} style={{ letterSpacing: -1.3, lineHeight: card.term.length > 16 ? 38 : 46 }}>
            {card.term}
          </Txt>
          <PressScale
            onPress={() => playClip(card.id, 'term', card.term)}
            scaleTo={0.97}
            style={styles.sayIt}
            accessibilityRole="button"
            accessibilityLabel={card.sayIt ? `Say it: ${card.sayIt}. Tap to hear it.` : `Hear ${card.term}`}
          >
            <SpeakerGlyph cardId={card.id} slot="term" size={30} />
            {/* Respelling and IPA each stay whole; on narrow screens the IPA drops to its own line. */}
            <View style={styles.sayItText}>
              <Txt weight="medium" size={17} numberOfLines={1} style={{ letterSpacing: 0.5, flexShrink: 0 }}>
                {card.sayIt ?? 'Hear it'}
              </Txt>
              {card.phonetic && (
                <Txt size={13} color={colors.textFaint} numberOfLines={1} style={{ fontFamily: ipaFont, flexShrink: 0 }}>
                  {card.phonetic}
                </Txt>
              )}
            </View>
          </PressScale>
          <Txt size={13} color={colors.textMuted}>
            {deck ? `${deck.name} · ${status}` : status}
          </Txt>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(60)} style={styles.meaning}>
          <View style={styles.rowBetween}>
            <Label color={colors.ink}>What it means</Label>
            <SpeakerButton cardId={card.id} slot="meaning" fallback={card.meaning} label="Hear the meaning" size={34} />
          </View>
          <Txt weight="medium" size={19} color={colors.ink} style={{ lineHeight: 26 }}>
            {card.meaning}
          </Txt>
        </Animated.View>

        {card.literal && (
          <View style={styles.literal}>
            <Txt size={12} color={colors.textMuted}>
              Taken literally
            </Txt>
            <Txt size={15} color={colors.textSoft} style={{ lineHeight: 22 }}>
              {card.literal}
            </Txt>
          </View>
        )}

        <View style={styles.block}>
          <Label>The feel of it</Label>
          <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
            {card.nuance}
          </Txt>
        </View>

        <View style={[styles.sectionHead, styles.rowBetween]}>
          <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }}>
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
            <Icon name={allUsed ? 'check' : 'plus'} size={15} color={canLog && !allUsed ? colors.ink : colors.textFaint} />
            <Txt weight="semibold" size={13} color={canLog && !allUsed ? colors.ink : colors.textFaint}>
              {allUsed ? 'Used everywhere' : 'I used it'}
            </Txt>
          </PressScale>
        </View>
        {!canLog && (
          <Txt size={13} color={colors.textMuted} style={{ paddingHorizontal: 20, marginTop: -4, marginBottom: 10 }}>
            Swipe “know it” on this card once, then log real uses for points.
          </Txt>
        )}
        <View style={{ gap: 10, marginHorizontal: 16 }}>
          {card.uses.map((u) => (
            <View key={u.setting} style={styles.useCard}>
              <View style={styles.rowBetween}>
                {/* Setting on one line, the situation under it: neither gets squeezed or cut off. */}
                <View style={styles.setting}>
                  <View style={styles.settingLabel}>
                    <Icon name={SETTING_ICON[u.setting]} size={13} color={colors.lime} />
                    <Txt weight="semibold" size={12} color={colors.lime} numberOfLines={1} style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
                      {SETTING_LABEL[u.setting]}
                    </Txt>
                    {usedSettings.has(u.setting) && (
                      <View style={styles.usedTag}>
                        <Icon name="check" size={11} color={colors.limeSoft} />
                        <Txt weight="medium" size={11} color={colors.limeSoft}>
                          You used it
                        </Txt>
                      </View>
                    )}
                  </View>
                  <Txt size={13} color={colors.textMuted} style={{ lineHeight: 18 }}>
                    {u.where}
                  </Txt>
                </View>
                <SpeakerButton
                  cardId={card.id}
                  slot={u.setting}
                  fallback={u.sentence}
                  label={`Hear the ${SETTING_LABEL[u.setting].toLowerCase()} example`}
                  size={34}
                />
              </View>
              <Highlighted sentence={u.sentence} highlight={u.highlight} size={17} />
              <View style={styles.tip}>
                <Icon name="info" size={15} color={colors.textMuted} />
                <Txt size={14} color={colors.textMuted} style={{ flex: 1, lineHeight: 20 }}>
                  {u.tip}
                </Txt>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.origin}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }}>
              Where it comes from
            </Txt>
            <Pill label={conf.label} bg={conf.bg} fg={conf.fg} />
          </View>
          <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
            {card.origin.summary}
          </Txt>
          <View>
            {card.origin.timeline.map((t, i) => {
              const last = i === card.origin.timeline.length - 1;
              return (
                <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={{ width: 14, alignItems: 'center' }}>
                    <View style={[styles.dot, { backgroundColor: last ? colors.lime : '#5E6357' }]} />
                    {!last && <View style={styles.vline} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: last ? 0 : 16, gap: 3 }}>
                    <Txt weight="mono" size={12} color={colors.lime}>
                      {t.when}
                    </Txt>
                    <Txt size={14} color={colors.textSoft} style={{ lineHeight: 21 }}>
                      {t.text}
                    </Txt>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {!!card.forms?.length && (
          <View style={styles.section}>
            <Txt weight="semibold" size={17}>
              {card.kind === 'word' ? 'Word family' : 'Forms you’ll hear'}
            </Txt>
            <View style={styles.wrap}>
              {card.forms.map((f) => (
                <View key={f.term} style={styles.formCard}>
                  <Txt weight="medium" size={15}>
                    {f.term}
                  </Txt>
                  <Txt size={12} color={colors.textMuted}>
                    {f.label}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        )}

        {(!!card.similar?.length || !!card.opposite || !!card.pitfall) && (
          <View style={styles.section}>
            <Txt weight="semibold" size={17}>
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
                    <Txt size={14}>{s}</Txt>
                    <Icon name="arrow-up-right" size={14} color={colors.lime} />
                  </PressScale>
                ) : (
                  <View key={s} style={styles.chip}>
                    <Txt size={14}>{s}</Txt>
                  </View>
                );
              })}
              {card.opposite && (
                <View style={[styles.chip, styles.oppChip]}>
                  <Txt size={14} color={colors.orangeSoft}>
                    opposite: {card.opposite}
                  </Txt>
                </View>
              )}
            </View>
            {card.pitfall && (
              <View style={styles.pitfall}>
                <Icon name="alert-triangle" size={16} color={colors.orangeText} />
                <Txt size={14} color={colors.orangeText} style={{ flex: 1, lineHeight: 21 }}>
                  {card.pitfall}
                </Txt>
              </View>
            )}
          </View>
        )}
      </Animated.ScrollView>

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
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  topTitle: { flex: 1, alignItems: 'center' },
  hero: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sayIt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingLeft: 6,
    paddingRight: 16,
    paddingVertical: 6,
    maxWidth: '100%',
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sayItText: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10, rowGap: 2 },
  outlinePill: { paddingHorizontal: 11, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3E35' },
  meaning: { marginHorizontal: 16, marginTop: 18, padding: 20, borderRadius: radius.xl, backgroundColor: colors.lime, gap: 8 },
  literal: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    gap: 4,
  },
  block: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  sectionHead: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 12 },
  setting: { flex: 1, gap: 3 },
  settingLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  usedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.limeDeep },
  usedBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.lime },
  usedBtnOff: { backgroundColor: colors.surface2 },
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
  useCard: { padding: 18, borderRadius: radius.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong, gap: 12 },
  tip: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  origin: {
    marginHorizontal: 16,
    marginTop: 24,
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#2A2D27',
    gap: 16,
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  vline: { width: 2, flex: 1, backgroundColor: colors.line },
  section: { paddingHorizontal: 20, paddingTop: 24, gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.limeDeep },
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
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.chip },
  oppChip: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.orange },
  pitfall: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.orangeDeep },
});
