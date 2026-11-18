import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { SceneText } from '../../components/CardStory';
import { ImageViewer } from '../../components/ImageViewer';
import { BuiltFrom, SameRoot } from '../../components/RootParts';
import { SpeakerButton, SpeakerGlyph } from '../../components/Speaker';
import { SETTING_ICON, SETTING_LABEL, UsedItSheet } from '../../components/UsedItSheet';
import { Highlighted, Icon, PressScale, Txt } from '../../components/ui';
import { allCards, breakdowns, cardsById, cardsOfRoot, explanations } from '../../data';
import { illustrations } from '../../data/illustrations';
import { scenes } from '../../data/scenes';
import { playClip } from '../../lib/audio';
import { levelState } from '../../lib/levels';
import { packInfo, packOfCard } from '../../lib/packs';
import { isDue, MAX_BOX, relativeDue } from '../../lib/srs';
import { levelInput, useStore } from '../../lib/store';
import { colors, confidenceStyle, ipaFont, kindStyle, PAPER, radius } from '../../theme';

/** Other cards whose term matches one of this card's "similar" entries, so they can be opened directly. */
const termToId: Record<string, string> = Object.fromEntries(allCards.map((c) => [c.term.toLowerCase(), c.id]));

// One dark, continuous page. Each section keeps a colour of its own as an accent (its label and tab), so the
// page reads as part of the app rather than four full-screen colour blocks.
const SECTIONS = [
  { key: 'meaning', label: 'Meaning', accent: colors.lime },
  { key: 'use', label: 'Use it', accent: colors.text },
  { key: 'origin', label: 'Origin', accent: colors.orangeSoft },
  { key: 'related', label: 'Related', accent: colors.limeSoft },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

/** A section counts as the one you're reading once its top passes this far down the screen. */
const READ_LINE = 0.3;

function Label({ children, color = colors.textMuted }: { children: ReactNode; color?: string }) {
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
  const [viewing, setViewing] = useState(false);
  const [timeline, setTimeline] = useState(false);
  const [active, setActive] = useState(0);
  const [pageH, setPageH] = useState(0);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Where each section starts; the scroll position picks the tab to highlight.
  const [starts, setStarts] = useState<Partial<Record<SectionKey, number>>>({});
  const offsets = useSharedValue<number[]>([]);
  const viewH = useSharedValue(1);
  const lastActive = useSharedValue(0);
  // While a tab tap is scrolling the page, the tapped tab stays lit (the page may not be able to bring a short
  // last section to the top, which would otherwise light the one below it).
  const pinned = useSharedValue(false);

  const art: number | undefined = illustrations[id ?? ''];
  const scene = scenes[id ?? ''];

  const sectionStart = (key: SectionKey) => (y: number) => setStarts((prev) => (prev[key] === y ? prev : { ...prev, [key]: y }));
  useEffect(() => {
    offsets.set(SECTIONS.map((s) => starts[s.key] ?? Number.MAX_SAFE_INTEGER));
  }, [starts, offsets]);

  const onScroll = useAnimatedScrollHandler((e) => {
    if (pinned.value) return;
    const ys = offsets.value;
    const at = e.contentOffset.y + viewH.value * READ_LINE;
    let i = 0;
    while (i < ys.length - 1 && ys[i + 1] <= at) i++;
    if (i !== lastActive.value) {
      lastActive.value = i;
      scheduleOnRN(setActive, i);
    }
  });

  const goTo = (key: SectionKey) => {
    const y = starts[key];
    if (y == null) return;
    const i = SECTIONS.findIndex((s) => s.key === key);
    pinned.set(true);
    lastActive.set(i);
    setActive(i);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    setTimeout(() => pinned.set(false), 700);
  };

  // Prev/next reuse this screen with a new id: start the new card at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    lastActive.set(0);
  }, [id, scrollRef, lastActive]);

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
          <Txt weight="semibold">Back</Txt>
        </PressScale>
      </View>
    );
  }

  const kind = kindStyle[card.kind];
  const conf = confidenceStyle[card.origin.confidence];
  const pack = packInfo[packOfCard[card.id]];
  const ids = pack?.pack.cardIds ?? [];
  const at = ids.indexOf(card.id);
  const prev = at > 0 ? cardsById[ids[at - 1]] : undefined;
  const next = at >= 0 && at < ids.length - 1 ? cardsById[ids[at + 1]] : undefined;
  const open = (cardId: string) => router.replace({ pathname: '/card/[id]', params: { id: cardId } });

  const status = !review
    ? 'New card'
    : isDue(review)
      ? `Box ${review.box} · due now`
      : review.box >= MAX_BOX
        ? `Mastered · back ${relativeDue(review.dueAt)}`
        : `Box ${review.box} · back ${relativeDue(review.dueAt)}`;
  const canLog = !!review && Math.max(review.box, review.bestBox ?? 1) >= 2;
  const usedSettings = new Set((used ?? []).map((u) => u.setting));
  const allUsed = usedSettings.size >= 3;
  const sameRoot = !!breakdowns[card.id]?.parts.some((p) => p.rootId && cardsOfRoot[p.rootId].length >= 2);
  const hasRelated = sameRoot || !!card.forms?.length || !!card.similar?.length || !!card.opposite;
  const tabs = SECTIONS.filter((s) => s.key !== 'related' || hasRelated);
  const heroSize = card.term.length > 16 ? (phone ? 30 : 36) : phone ? 36 : 44;
  const bubbles = scene && scene.bubbles.length > 1 ? scene.bubbles : [];

  return (
    <View style={styles.screen}>
      {/* Fixed header: back, the term, save; then section tabs that follow the scroll and jump on tap. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headRow}>
          <PressScale style={styles.headBtn} scaleTo={0.92} onPress={back} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="chevron-left" size={20} />
          </PressScale>
          <Txt weight="semibold" size={15} numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
            {card.term}
          </Txt>
          <PressScale
            style={[styles.headBtn, saved && { backgroundColor: colors.lime, borderColor: colors.lime }]}
            scaleTo={0.92}
            onPress={() => toggleSaved(card.id)}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
            accessibilityState={{ selected: saved }}
          >
            <Icon name="bookmark" size={18} color={saved ? colors.ink : colors.text} />
          </PressScale>
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((s) => {
            const on = SECTIONS[active]?.key === s.key;
            return (
              <PressScale
                key={s.key}
                style={styles.tab}
                scaleTo={0.96}
                onPress={() => goTo(s.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Txt weight={on ? 'semibold' : 'medium'} size={13} color={on ? colors.text : colors.textMuted}>
                  {s.label}
                </Txt>
                <View style={[styles.tabBar, { backgroundColor: on ? s.accent : 'transparent' }]} />
              </PressScale>
            );
          })}
        </View>
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          viewH.set(e.nativeEvent.layout.height);
          setPageH(e.nativeEvent.layout.height);
        }}
      >
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          // Room below the last section so every tab can bring its section up to the top.
          contentContainerStyle={{ paddingBottom: Math.max(32, Math.round(pageH * 0.5)) }}
        >
          {/* ── Meaning ── */}
          <View style={styles.section} onLayout={(e) => sectionStart('meaning')(e.nativeEvent.layout.y)}>
            {art && (
              <PressScale
                nativeID={`art-page-${card.id}`}
                style={styles.art}
                scaleTo={0.99}
                onPress={() => setViewing(true)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Cartoon of ${card.term}. Open full screen`}
              >
                <Image source={art} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              </PressScale>
            )}

            <View style={styles.row}>
              <View style={[styles.tag, { backgroundColor: kind.bg }]}>
                <Txt weight="semibold" size={11} color={kind.fg} style={{ letterSpacing: 0.5 }}>
                  {kind.label.toUpperCase()}
                </Txt>
              </View>
              <View style={[styles.tag, styles.tagOutline]}>
                <Txt weight="medium" size={11} color={colors.textSoft}>
                  {card.register}
                </Txt>
              </View>
            </View>
            <Txt weight="semibold" size={heroSize} style={{ letterSpacing: -1.1, lineHeight: Math.round(heroSize * 1.08) }} accessibilityRole="header">
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
              <Txt weight="medium" size={15} numberOfLines={1} style={{ letterSpacing: 0.4, flexShrink: 0 }}>
                {card.sayIt ?? card.hint ?? 'Hear it'}
              </Txt>
              {card.phonetic && (
                <Txt size={12} color={colors.textFaint} numberOfLines={1} style={{ fontFamily: ipaFont, flexShrink: 1 }}>
                  {card.phonetic}
                </Txt>
              )}
            </PressScale>

            {/* Where this card stands in your learning, and the pack it belongs to. */}
            <PressScale
              style={styles.status}
              scaleTo={0.98}
              disabled={!pack}
              onPress={() => pack && router.push({ pathname: '/pack/[id]', params: { id: pack.pack.id } })}
              accessibilityRole={pack ? 'link' : undefined}
              accessibilityLabel={`${status}${pack ? `. In ${pack.pack.title}, pack ${pack.number}. Open pack` : ''}`}
            >
              <View style={styles.boxDots}>
                {Array.from({ length: MAX_BOX }, (_, i) => (
                  <View key={i} style={[styles.boxDot, review && i < review.box && { backgroundColor: review.box === 1 ? colors.orange : colors.lime }]} />
                ))}
              </View>
              <Txt size={13} color={colors.textSoft} numberOfLines={1} style={{ flexShrink: 1 }}>
                {status}
              </Txt>
              {pack && (
                <>
                  <Txt size={13} color={colors.textFaint}>
                    ·
                  </Txt>
                  <Txt size={13} color={colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
                    Pack {pack.number} · {pack.pack.title}
                  </Txt>
                  <Icon name="chevron-right" size={15} color={colors.textFaint} />
                </>
              )}
            </PressScale>

            <View style={styles.block}>
              <View style={styles.rowBetween}>
                <Label color={colors.lime}>What it means</Label>
                <SpeakerButton cardId={card.id} slot="meaning" fallback={card.meaning} label="Hear the meaning" size={32} />
              </View>
              <Txt weight="medium" size={phone ? 20 : 22} style={{ lineHeight: phone ? 28 : 31, letterSpacing: -0.2 }}>
                {card.meaning}
              </Txt>
            </View>

            {explanations[card.id] && (
              <View style={styles.block}>
                <Label>Explained</Label>
                <Txt size={16} color={colors.text} style={{ lineHeight: 24 }}>
                  {explanations[card.id]}
                </Txt>
              </View>
            )}

            <View style={styles.block}>
              <Label>How it feels</Label>
              <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
                {card.nuance}
              </Txt>
            </View>

            {card.literal && (
              <View style={styles.block}>
                <Label>Taken literally</Label>
                <Txt size={15} color={colors.textSoft} style={{ lineHeight: 23 }}>
                  {card.literal}
                </Txt>
              </View>
            )}

            {card.pitfall && (
              <View style={styles.watch}>
                <View style={styles.row}>
                  <Icon name="alert-triangle" size={14} color={colors.orangeSoft} />
                  <Label color={colors.orangeSoft}>Watch out</Label>
                </View>
                <Txt size={14} color={colors.orangeText} style={{ lineHeight: 21 }}>
                  {card.pitfall}
                </Txt>
              </View>
            )}

            {scene && (
              <View style={styles.block}>
                <Label>In the picture</Label>
                <SceneText text={bubbles.length ? scene.scene : scene.scene.replace(/\s*\[\d+\]/g, '')} size={15} color={colors.textSoft} />
                {bubbles.map((b, i) => (
                  <View key={i} style={styles.bubbleRow}>
                    <View style={styles.bubbleNum}>
                      <Txt weight="bold" size={11} color={colors.lime}>
                        {i + 1}
                      </Txt>
                    </View>
                    <Txt size={14} color={colors.textSoft} style={{ flex: 1, lineHeight: 20 }}>
                      {b}
                    </Txt>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── Use it ── */}
          <View style={styles.section} onLayout={(e) => sectionStart('use')(e.nativeEvent.layout.y)}>
            <View style={styles.rowBetween}>
              <Txt weight="semibold" size={22} style={{ letterSpacing: -0.5 }} accessibilityRole="header">
                Use it
              </Txt>
              {canLog && (
                <PressScale
                  style={[styles.usedBtn, allUsed && styles.usedBtnDone]}
                  scaleTo={0.95}
                  disabled={allUsed}
                  onPress={() => setSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel={allUsed ? 'Used in every setting' : 'I used it: log a real use'}
                >
                  <Icon name={allUsed ? 'check' : 'plus'} size={14} color={allUsed ? colors.limeSoft : colors.ink} />
                  <Txt weight="semibold" size={13} color={allUsed ? colors.limeSoft : colors.ink}>
                    {allUsed ? 'Used everywhere' : 'I used it'}
                  </Txt>
                </PressScale>
              )}
            </View>
            {card.uses.map((u) => (
              <View key={u.setting} style={styles.useCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
                      <Icon name={SETTING_ICON[u.setting]} size={12} color={colors.limeSoft} />
                      <Label color={colors.limeSoft}>{SETTING_LABEL[u.setting]}</Label>
                      {usedSettings.has(u.setting) && (
                        <View style={styles.usedTag}>
                          <Icon name="check" size={10} color={colors.ink} />
                          <Txt weight="semibold" size={10} color={colors.ink}>
                            You used it
                          </Txt>
                        </View>
                      )}
                    </View>
                    <Txt size={12} color={colors.textMuted} numberOfLines={1}>
                      {u.where}
                    </Txt>
                  </View>
                  <SpeakerButton
                    cardId={card.id}
                    slot={u.setting}
                    fallback={u.sentence}
                    label={`Hear the ${SETTING_LABEL[u.setting].toLowerCase()} example`}
                    size={32}
                  />
                </View>
                <Highlighted sentence={u.sentence} highlight={u.highlight} size={phone ? 16 : 17} />
                <Txt size={13} color={colors.textMuted} style={{ lineHeight: 19 }}>
                  {u.tip}
                </Txt>
              </View>
            ))}
          </View>

          {/* ── Origin: an orange card, so the root breakdown keeps its colours ── */}
          <View style={styles.section} onLayout={(e) => sectionStart('origin')(e.nativeEvent.layout.y)}>
            <View style={styles.originCard}>
              <View style={styles.rowBetween}>
                <Txt weight="semibold" size={20} color={colors.ink} style={{ letterSpacing: -0.4, flex: 1 }} accessibilityRole="header">
                  Where it comes from
                </Txt>
                <View style={[styles.tag, { backgroundColor: colors.ink }]}>
                  <Txt weight="semibold" size={11} color={conf.fg}>
                    {conf.label}
                  </Txt>
                </View>
              </View>
              <BuiltFrom card={card} phone={phone} />
              <Txt weight="medium" size={16} color={colors.ink} style={{ lineHeight: 24 }}>
                {card.origin.summary}
              </Txt>
              {card.origin.timeline.length > 0 && (
                <>
                  <PressScale
                    style={styles.timelineBtn}
                    scaleTo={0.98}
                    onPress={() => setTimeline((t) => !t)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: timeline }}
                  >
                    <Txt weight="semibold" size={13} color={colors.ink}>
                      {timeline ? 'Hide the timeline' : `Show the timeline · ${card.origin.timeline.length} steps`}
                    </Txt>
                    <Icon name={timeline ? 'chevron-up' : 'chevron-down'} size={15} color={colors.ink} />
                  </PressScale>
                  {timeline &&
                    card.origin.timeline.map((t, i) => {
                      const last = i === card.origin.timeline.length - 1;
                      return (
                        <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                          <View style={{ width: 12, alignItems: 'center' }}>
                            <View style={[styles.dot, last && { backgroundColor: colors.ink }]} />
                            {!last && <View style={styles.vline} />}
                          </View>
                          <View style={{ flex: 1, paddingBottom: last ? 0 : 14, gap: 3 }}>
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
                </>
              )}
            </View>
          </View>

          {/* ── Related ── */}
          {hasRelated && (
            <View style={styles.section} onLayout={(e) => sectionStart('related')(e.nativeEvent.layout.y)}>
              {!!card.forms?.length && (
                <View style={{ gap: 10 }}>
                  <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }} accessibilityRole="header">
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

              <SameRoot card={card} phone={phone} />

              {(!!card.similar?.length || !!card.opposite) && (
                <View style={{ gap: 10 }}>
                  <Txt weight="semibold" size={20} style={{ letterSpacing: -0.4 }} accessibilityRole="header">
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
            </View>
          )}
        </Animated.ScrollView>
      </View>

      {toast?.id === card.id && (
        <View style={[styles.toast, { bottom: (pack ? 64 : 16) + insets.bottom }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Icon name="check" size={15} color={colors.ink} />
          <Txt weight="semibold" size={14} color={colors.ink}>
            {toast.text}
          </Txt>
        </View>
      )}

      {/* Step through the pack without scrolling to the end. */}
      {pack && (
        <View style={[styles.pager, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <PressScale
            style={[styles.pageBtn, !prev && styles.pageBtnOff]}
            scaleTo={0.96}
            disabled={!prev}
            onPress={() => prev && open(prev.id)}
            accessibilityRole="link"
            accessibilityLabel={prev ? `Previous card: ${prev.term}` : 'First card in the pack'}
          >
            <Icon name="chevron-left" size={16} color={prev ? colors.text : colors.textFaint} />
            <Txt weight="medium" size={13} numberOfLines={1} color={prev ? colors.textSoft : colors.textFaint} style={{ flexShrink: 1 }}>
              {prev?.term ?? 'Start'}
            </Txt>
          </PressScale>
          <Txt weight="mono" size={12} color={colors.textMuted} accessibilityLabel={`Card ${at + 1} of ${ids.length} in ${pack.pack.title}`}>
            {at + 1}/{ids.length}
          </Txt>
          <PressScale
            style={[styles.pageBtn, { justifyContent: 'flex-end' }, !next && styles.pageBtnOff]}
            scaleTo={0.96}
            disabled={!next}
            onPress={() => next && open(next.id)}
            accessibilityRole="link"
            accessibilityLabel={next ? `Next card: ${next.term}` : 'Last card in the pack'}
          >
            <Txt weight="medium" size={13} numberOfLines={1} color={next ? colors.text : colors.textFaint} style={{ flexShrink: 1 }}>
              {next?.term ?? 'End of pack'}
            </Txt>
            <Icon name="chevron-right" size={16} color={next ? colors.lime : colors.textFaint} />
          </PressScale>
        </View>
      )}

      {art && (
        <ImageViewer
          source={art}
          label={scene ? scene.scene.replace(/\s*\[\d+\]/g, '') : `Cartoon of ${card.term}`}
          visible={viewing}
          fromId={`art-page-${card.id}`}
          onClose={() => setViewing(false)}
        />
      )}
      {sheet && <UsedItSheet card={card} onClose={() => setSheet(false)} onLogged={onLogged} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  ghostBtn: { height: 48, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: '#3A3E35', justifyContent: 'center' },
  header: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  headBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 6 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 6 },
  tabBar: { height: 2, width: '60%', borderRadius: 1 },
  section: { paddingHorizontal: 20, paddingTop: 24, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' },
  art: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: PAPER },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  tagOutline: { borderWidth: 1, borderColor: colors.borderStrong },
  sayIt: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
    paddingLeft: 5,
    paddingRight: 16,
    paddingVertical: 5,
    maxWidth: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  boxDots: { flexDirection: 'row', gap: 3 },
  boxDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2E322A' },
  block: { gap: 8, paddingTop: 4 },
  watch: { gap: 6, padding: 14, borderRadius: radius.lg, backgroundColor: colors.orangeDeep, borderWidth: 1, borderColor: '#4A3320' },
  bubbleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  bubbleNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  useCard: { gap: 10, padding: 16, borderRadius: radius.xl, backgroundColor: colors.surface2, borderWidth: 1, borderColor: '#2A2D27' },
  usedBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.lime },
  usedBtnDone: { backgroundColor: colors.limeDeep },
  usedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.lime },
  originCard: { gap: 12, padding: 18, borderRadius: radius.xl, backgroundColor: colors.orangeSoft },
  timelineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(11,12,10,0.22)',
  },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3, borderWidth: 2, borderColor: colors.ink },
  vline: { width: 2, flex: 1, backgroundColor: 'rgba(11,12,10,0.3)' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: '#4A4F44', gap: 1 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: '#4A4F44' },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: colors.limeDeep, backgroundColor: colors.limeDeep },
  oppChip: { borderStyle: 'dashed', borderColor: colors.orange },
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
  pageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.surface2 },
  pageBtnOff: { backgroundColor: 'transparent' },
});
