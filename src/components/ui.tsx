import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, radius } from '../theme';

export type IconName = ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}

type Weight = keyof typeof fonts;

export function Txt({
  weight = 'regular',
  size = 15,
  color = colors.text,
  style,
  ...rest
}: TextProps & { weight?: Weight; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  // Phones get type a notch smaller across the app; explicit line heights shrink with it so spacing stays in proportion.
  const scale = useWindowDimensions().width < 430 ? PHONE_TYPE_SCALE : 1;
  const flat = StyleSheet.flatten(style);
  const lineHeight = typeof flat?.lineHeight === 'number' ? Math.round(flat.lineHeight * scale) : undefined;
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fonts[weight], fontSize: Math.round(size * scale * 2) / 2, color }, style, lineHeight != null && { lineHeight }]}
    />
  );
}

export const PHONE_TYPE_SCALE = 0.92;

export function Label({ children, color = colors.lime }: { children: ReactNode; color?: string }) {
  return (
    <Txt weight="semibold" size={12} color={color} style={styles.label}>
      {children}
    </Txt>
  );
}

export function Pill({ label, bg, fg, style }: { label: string; bg: string; fg: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Txt weight="semibold" size={12} color={fg} style={{ letterSpacing: 0.4 }}>
        {label}
      </Txt>
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with a springy press-down scale. */
export function PressScale({
  style,
  children,
  scaleTo = 0.94,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; children?: ReactNode; scaleTo?: number }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        s.set(withSpring(scaleTo, { damping: 18, stiffness: 420 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, { damping: 14, stiffness: 320 }));
        rest.onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  bg = colors.surface2,
  fg = colors.text,
  border = colors.border,
  iconSize = 20,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  bg?: string;
  fg?: string;
  border?: string;
  iconSize?: number;
}) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.iconBtn, { width: size, height: size, borderRadius: size >= 48 ? size / 2 : radius.md, backgroundColor: bg, borderColor: border }]}
    >
      <Icon name={icon} size={iconSize} color={fg} />
    </PressScale>
  );
}

/** `marker` draws the term like a highlighter on light backgrounds instead of coloring the text lime. */
export function Highlighted({
  sentence,
  highlight,
  size = 18,
  color = colors.text,
  marker = false,
}: {
  sentence: string;
  highlight: string;
  size?: number;
  color?: string;
  marker?: boolean;
}) {
  const i = sentence.indexOf(highlight);
  const before = i >= 0 ? sentence.slice(0, i) : sentence;
  const after = i >= 0 ? sentence.slice(i + highlight.length) : '';
  return (
    <Txt size={size} color={color} style={{ lineHeight: size * 1.5 }}>
      “{before}
      {i >= 0 && (
        <Txt weight="semibold" size={size} color={marker ? colors.ink : colors.lime} style={marker ? { backgroundColor: colors.lime, borderRadius: 4 } : undefined}>
          {highlight}
        </Txt>
      )}
      {after}”
    </Txt>
  );
}

const styles = StyleSheet.create({
  label: { letterSpacing: 1, textTransform: 'uppercase' },
  pill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  iconBtn: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
