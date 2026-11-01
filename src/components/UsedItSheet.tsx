import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { USE_POINTS } from '../lib/levels';
import { MAX_BOX } from '../lib/srs';
import { useLevel, useStore } from '../lib/store';
import type { Card, Setting } from '../lib/types';
import { colors, radius } from '../theme';
import { Icon, PressScale, Txt, type IconName } from './ui';

export const SETTING_LABEL: Record<Setting, string> = { work: 'At work', social: 'Social', writing: 'Writing' };
export const SETTING_ICON: Record<Setting, IconName> = { work: 'briefcase', social: 'coffee', writing: 'edit-3' };
const SETTING_SUB: Record<Setting, string> = {
  work: 'Meeting, message, review',
  social: 'Friends, family, a chat',
  writing: 'Email, doc, post',
};
const SETTINGS: Setting[] = ['work', 'social', 'writing'];

/** Bottom sheet for logging a real-world use of a card. Calls onLogged after a successful log. */
export function UsedItSheet({ card, onClose, onLogged }: { card: Card; onClose: () => void; onLogged: () => void }) {
  const insets = useSafeAreaInsets();
  const review = useStore((s) => s.reviews[card.id]);
  const logged = useStore((s) => s.uses[card.id]);
  const logUse = useStore((s) => s.logUse);
  const level = useLevel();
  const done = new Set((logged ?? []).map((u) => u.setting));
  const [picked, setPicked] = useState<Setting | null>(SETTINGS.find((s) => !done.has(s)) ?? null);

  const box = review?.box ?? 1;
  const boxLine = box >= MAX_BOX ? 'stays mastered' : `moves to Box ${box + 1}`;
  const trial = level.next?.trial;
  const useTrial = trial && (trial.hint === 'use-any' || trial.hint === 'use-all-settings' || (trial.hint === 'use-work' && picked === 'work'));

  const submit = () => {
    if (!picked) return;
    if (logUse(card.id, picked)) onLogged();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={SlideOutDown.duration(180)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
        accessibilityViewIsModal
      >
        <View style={styles.grip} />
        <View style={{ gap: 4 }}>
          <Txt weight="semibold" size={22} style={{ letterSpacing: -0.5 }} accessibilityRole="header">
            Where did you use “{card.term.toLowerCase()}”?
          </Txt>
          <Txt size={14} color={colors.textMuted}>
            Only log it if you actually said or wrote it.
          </Txt>
        </View>

        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {SETTINGS.map((s) => {
            const isDone = done.has(s);
            const on = picked === s && !isDone;
            return (
              <PressScale
                key={s}
                style={[styles.option, on && styles.optionOn, isDone && styles.optionDone]}
                scaleTo={0.98}
                disabled={isDone}
                onPress={() => setPicked(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: isDone }}
              >
                <Icon name={isDone ? 'check' : SETTING_ICON[s]} size={18} color={on ? colors.ink : isDone ? colors.textFaint : colors.lime} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Txt weight="semibold" size={15} color={on ? colors.ink : isDone ? colors.textFaint : colors.text}>
                    {SETTING_LABEL[s]}
                  </Txt>
                  <Txt size={12} color={on ? colors.ink : colors.textMuted}>
                    {isDone ? 'Already logged' : SETTING_SUB[s]}
                  </Txt>
                </View>
                {on && (
                  <Txt weight="mono" size={13} color={colors.ink}>
                    +{USE_POINTS}
                  </Txt>
                )}
              </PressScale>
            );
          })}
        </View>

        {picked && (
          <View style={styles.reward}>
            <Txt size={13} color={colors.textSoft}>
              +{USE_POINTS} points · {boxLine}
            </Txt>
            {useTrial && (
              <Txt size={13} color={colors.limeSoft} numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right' }}>
                Counts toward level {level.next!.n}
              </Txt>
            )}
          </View>
        )}

        <PressScale
          style={[styles.primary, !picked && { opacity: 0.4 }]}
          scaleTo={0.97}
          disabled={!picked}
          onPress={submit}
          accessibilityRole="button"
        >
          <Txt weight="semibold" size={16} color={colors.ink}>
            {picked ? 'Log it' : 'All three settings logged'}
          </Txt>
        </PressScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderTopWidth: 1,
    borderColor: colors.borderStrong,
  },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  option: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  optionOn: { backgroundColor: colors.lime, borderColor: colors.lime },
  optionDone: { backgroundColor: colors.bgRaised, borderColor: colors.border },
  reward: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.card },
  primary: { height: 54, borderRadius: radius.pill, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
});
