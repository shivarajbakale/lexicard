import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PackNode } from '../components/packs';
import { IconButton, Icon, PressScale, Txt } from '../components/ui';
import { firstPack, packInfo, trackById, trackPackIds, tracks } from '../lib/packs';
import { DAILY_NEW_OPTIONS, DEFAULT_DAILY_NEW, useStore } from '../lib/store';
import type { TrackId } from '../lib/types';
import { colors, kindStyle, radius } from '../theme';

type Step = 'welcome' | 'track' | 'pace' | 'ready';
const PACE_NAMES: Record<number, string> = { 5: 'Light', 10: 'Steady', 15: 'Intense' };

/** First run: what Lexicard is, where to start, how much a day. Then straight to Today. */
export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const finish = useStore((s) => s.finishOnboarding);
  const [step, setStep] = useState<Step>('welcome');
  const [track, setTrack] = useState<TrackId>('words');
  const [pace, setPace] = useState<number>(DEFAULT_DAILY_NEW);

  const done = () => {
    finish(track, pace);
    router.replace('/');
  };
  const skip = () => {
    finish('words', DEFAULT_DAILY_NEW);
    router.replace('/');
  };

  const t = trackById[track];
  const p1 = packInfo[firstPack(track)];
  const p2 = p1.next ? packInfo[p1.next] : null;
  const unit2 = t.units[1];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
      {step !== 'welcome' && step !== 'ready' && (
        <View style={styles.stepper}>
          <IconButton icon="chevron-left" label="Back" onPress={() => setStep(step === 'pace' ? 'track' : 'welcome')} bg="transparent" border="transparent" />
          <View style={styles.steps}>
            <View style={[styles.stepBar, styles.stepOn]} />
            <View style={[styles.stepBar, step === 'pace' && styles.stepOn]} />
          </View>
          <Txt weight="mono" size={12} color={colors.textFaint}>
            {step === 'track' ? '1' : '2'} of 2
          </Txt>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body} key={step}>
        {step === 'welcome' && (
          <Animated.View entering={FadeIn.duration(300)} style={{ gap: 14, paddingTop: 24 }}>
            <View style={styles.brand}>
              <View style={styles.logo}>
                <Txt weight="bold" size={19} color={colors.ink}>
                  L
                </Txt>
              </View>
              <Txt weight="semibold" size={17}>
                Lexicard
              </Txt>
            </View>
            <View style={styles.fan} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <FanCard term="Circle back" kind="phrase" style={{ left: 0, top: 34, transform: [{ rotate: '-9deg' }] }} />
              <FanCard term="Break the ice" kind="idiom" style={{ right: 0, top: 8, transform: [{ rotate: '7deg' }] }} />
              <FanCard term="Pragmatic" kind="word" sub="prag-MAT-ik" front style={{ left: '12%', top: 74, transform: [{ rotate: '-1.5deg' }] }} />
            </View>
            <Txt weight="semibold" size={34} style={styles.h1} accessibilityRole="header">
              Words that make you sound sharp.
            </Txt>
            <Txt size={16} color={colors.textMuted} style={{ lineHeight: 24 }}>
              Learn them in small packs. Finish one and the next one opens. A few minutes a day.
            </Txt>
          </Animated.View>
        )}

        {step === 'track' && (
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 12 }}>
            <Txt weight="semibold" size={30} style={styles.h1} accessibilityRole="header">
              Where do you want to start?
            </Txt>
            <Txt size={15} color={colors.textMuted} style={{ lineHeight: 22, marginBottom: 10 }}>
              Each track is a path of packs. You can switch any time.
            </Txt>
            {tracks.map((tr) => {
              const selected = tr.id === track;
              const k = kindStyle[tr.kind];
              const cards = tr.units.reduce((n, u) => n + u.packs.reduce((m, pk) => m + pk.cardIds.length, 0), 0);
              return (
                <PressScale
                  key={tr.id}
                  style={[styles.option, selected && styles.optionOn]}
                  scaleTo={0.98}
                  onPress={() => setTrack(tr.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={styles.optionTop}>
                    <View style={[styles.chip, { backgroundColor: k.bg }]}>
                      <Txt weight="semibold" size={12} color={k.fg}>
                        {tr.title}
                      </Txt>
                    </View>
                    <Radio on={selected} />
                  </View>
                  <Txt weight="semibold" size={18} style={{ letterSpacing: -0.3 }}>
                    {tr.blurb}
                  </Txt>
                  <Txt weight="mono" size={12} color={colors.textMuted}>
                    {trackPackIds[tr.id].length} packs · {cards} cards
                  </Txt>
                </PressScale>
              );
            })}
          </Animated.View>
        )}

        {step === 'pace' && (
          <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 12 }}>
            <Txt weight="semibold" size={30} style={styles.h1} accessibilityRole="header">
              How many new cards a day?
            </Txt>
            <Txt size={15} color={colors.textMuted} style={{ lineHeight: 22, marginBottom: 10 }}>
              New cards come from your current pack. Reviews of cards you’ve learned come on top, and they’re quick.
            </Txt>
            {DAILY_NEW_OPTIONS.map((n) => {
              const selected = n === pace;
              const starter = Math.ceil(12 / n);
              const big = Math.ceil(20 / n);
              return (
                <PressScale
                  key={n}
                  style={[styles.option, styles.paceOption, selected && styles.optionOn]}
                  scaleTo={0.98}
                  onPress={() => setPace(n)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Txt weight="mono" size={30} color={selected ? colors.lime : colors.textSoft} style={{ width: 48 }}>
                    {n}
                  </Txt>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Txt weight="semibold" size={17}>
                        {PACE_NAMES[n]}
                      </Txt>
                      {n === DEFAULT_DAILY_NEW && (
                        <View style={[styles.chip, { backgroundColor: colors.limeDeep }]}>
                          <Txt weight="semibold" size={11} color={colors.limeSoft}>
                            Recommended
                          </Txt>
                        </View>
                      )}
                    </View>
                    <Txt size={13} color={colors.textMuted}>
                      {starter === 1 ? 'A starter pack in a day' : `A starter pack in about ${starter} days`}, bigger packs in {big}
                    </Txt>
                  </View>
                  <Radio on={selected} />
                </PressScale>
              );
            })}
          </Animated.View>
        )}

        {step === 'ready' && (
          <Animated.View entering={FadeInDown.duration(280)} style={{ gap: 6, paddingTop: 20 }}>
            <Txt weight="mono" size={12} color={colors.limeSoft} style={{ letterSpacing: 0.6 }}>
              YOUR PATH · {t.title.toUpperCase()}
            </Txt>
            <Txt weight="semibold" size={30} style={styles.h1} accessibilityRole="header">
              {trackPackIds[track].length} packs, one at a time.
            </Txt>
            <View style={{ marginTop: 20, gap: 12 }}>
              <Txt weight="semibold" size={12} color={colors.textFaint} style={styles.caps}>
                Unit 1 · Starter
              </Txt>
              <View style={[styles.pathRow, styles.pathRowOn]}>
                <PackNode state="current" />
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt weight="mono" size={11} color={colors.limeSoft}>
                    PACK 1 · START HERE · {p1.pack.cardIds.length} CARDS
                  </Txt>
                  <Txt weight="semibold" size={17}>
                    {p1.pack.title}
                  </Txt>
                  <Txt size={13} color={colors.textMuted} numberOfLines={1}>
                    {p1.pack.blurb}
                  </Txt>
                </View>
              </View>
              {p2 && (
                <View style={styles.pathRow}>
                  <PackNode state="locked" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt weight="mono" size={11} color={colors.textFaint}>
                      PACK 2 · OPENS WHEN PACK 1 IS DONE
                    </Txt>
                    <Txt weight="semibold" size={16} color={colors.textSoft}>
                      {p2.pack.title}
                    </Txt>
                  </View>
                </View>
              )}
              {unit2 && (
                <View style={styles.pathRow}>
                  <PackNode state="locked" />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt weight="mono" size={11} color={colors.textFaint}>
                      UNIT 2 · {unit2.packs.length} PACKS
                    </Txt>
                    <Txt weight="semibold" size={16} color={colors.textSoft}>
                      {unit2.title}
                    </Txt>
                    <Txt size={13} color={colors.textFaint}>
                      then {t.units.length - 2} more units
                    </Txt>
                  </View>
                </View>
              )}
            </View>
            <View style={styles.rule}>
              <View style={styles.ruleIcon}>
                <Icon name="check" size={15} color={colors.limeSoft} />
              </View>
              <Txt size={14} color={colors.textSoft} style={{ flex: 1, lineHeight: 21 }}>
                A pack is <Txt weight="semibold">done</Txt> when you’ve known every card once. Then the next pack opens, and done cards keep coming back in reviews until they stick.
              </Txt>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, gap: 6 }}>
        <PressScale
          style={styles.primaryBtn}
          onPress={() => (step === 'welcome' ? setStep('track') : step === 'track' ? setStep('pace') : step === 'pace' ? setStep('ready') : done())}
          accessibilityRole="button"
        >
          <Txt weight="semibold" size={16} color={colors.ink}>
            {step === 'welcome' ? 'Get started' : step === 'track' ? 'Continue' : step === 'pace' ? 'Build my path' : 'Start Pack 1'}
          </Txt>
        </PressScale>
        {step === 'welcome' && (
          <PressScale style={styles.textBtn} onPress={skip} accessibilityRole="button">
            <Txt weight="medium" size={14} color={colors.textMuted}>
              Skip, start with Words
            </Txt>
          </PressScale>
        )}
      </View>
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View style={[styles.radio, on && styles.radioOn]}>
      {on && <Icon name="check" size={13} color={colors.ink} />}
    </View>
  );
}

function FanCard({ term, kind, sub, front, style }: { term: string; kind: 'word' | 'idiom' | 'phrase'; sub?: string; front?: boolean; style: object }) {
  const k = kindStyle[kind];
  return (
    <View style={[styles.fanCard, front && styles.fanFront, style]}>
      <View style={[styles.chip, { backgroundColor: k.bg }]}>
        <Txt weight="semibold" size={11} color={k.fg}>
          {k.label}
        </Txt>
      </View>
      <Txt weight="semibold" size={front ? 32 : 22} style={{ letterSpacing: front ? -1 : -0.5, marginTop: front ? 14 : 0 }}>
        {term}
      </Txt>
      {sub && (
        <Txt weight="mono" size={13} color={colors.limeSoft}>
          {sub}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  steps: { flex: 1, flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#2E322A' },
  stepOn: { backgroundColor: colors.lime },
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  fan: { height: 280, marginVertical: 8 },
  fanCard: {
    position: 'absolute',
    width: 210,
    height: 180,
    borderRadius: 24,
    padding: 18,
    gap: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  fanFront: { width: 240, height: 200, borderRadius: radius.card, backgroundColor: colors.card, borderColor: colors.borderStrong, boxShadow: '0 24px 60px rgba(0,0,0,0.55)' },
  h1: { letterSpacing: -1, lineHeight: 36 },
  caps: { letterSpacing: 0.8, textTransform: 'uppercase' },
  option: { padding: 16, gap: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#2A2D27' },
  optionOn: { backgroundColor: '#1C2114', borderColor: colors.lime, borderWidth: 1.5 },
  optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paceOption: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#3A3E35', alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.lime, borderColor: colors.lime },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18 },
  pathRowOn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.lime },
  rule: { flexDirection: 'row', gap: 12, marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ruleIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.limeDeep, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  textBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
