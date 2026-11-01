import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';

/** Scroll offset of a screen's main list, for headers that react to scrolling. */
export function useScrollY() {
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.set(e.contentOffset.y);
  });
  return { y, onScroll };
}

/**
 * Header that stays put while the content below it scrolls. It covers the status-bar area
 * (the PWA draws under it) and shows a hairline once the content has scrolled underneath.
 */
export function ScreenHeader({ y, children, style }: { y: SharedValue<number>; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const line = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 16], [0, 1], Extrapolation.CLAMP) }));
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }, style]}>
      {children}
      <Animated.View style={[styles.line, line]} pointerEvents="none" />
    </View>
  );
}

/** Fades content in once the page has scrolled past `after` pixels (e.g. a compact title). */
export function FadeOnScroll({ y, after, children, style }: { y: SharedValue<number>; after: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const anim = useAnimatedStyle(() => {
    const t = interpolate(y.value, [after, after + 24], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 6 }] };
  });
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.bg, zIndex: 10 },
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth || 1, backgroundColor: colors.borderStrong },
});
