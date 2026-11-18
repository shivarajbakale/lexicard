// Screen transitions for the JavaScript stack (web). Native builds use the platform's own animations
// (see app/_layout.tsx); the browser has none, so without these every screen would appear in one frame.
//
// All of them are short, eased-out moves of a few percent plus a crossfade: the new screen settles into place
// rather than sliding a full screen width, and the screen underneath eases back a touch so the change reads
// as depth, not a cut.

import { Animated, Easing } from 'react-native';
import type { StackCardInterpolationProps, StackCardStyleInterpolator, StackNavigationOptions } from 'expo-router/js-stack';

type TransitionSpec = NonNullable<StackNavigationOptions['transitionSpec']>['open'];

/** Opens decelerate (fast start, long soft landing); closes are a little quicker so going back feels light. */
const OPEN: TransitionSpec = { animation: 'timing', config: { duration: 380, easing: Easing.bezier(0.22, 1, 0.36, 1) } };
const CLOSE: TransitionSpec = { animation: 'timing', config: { duration: 280, easing: Easing.bezier(0.4, 0, 0.2, 1) } };
export const transitionSpec = { open: OPEN, close: CLOSE };

/** The screen underneath dims and shrinks slightly while another opens over it. */
function underneath(next: StackCardInterpolationProps['next']) {
  if (!next) return { opacity: 1, scale: 1 };
  return {
    opacity: next.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55], extrapolate: 'clamp' }),
    scale: next.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97], extrapolate: 'clamp' }),
  };
}

const fadeIn = (p: Animated.AnimatedInterpolation<number>) => p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.9, 1], extrapolate: 'clamp' });

/** Going deeper (a pack, a root, levels): drifts in from the right by a few percent. */
export const forPush: StackCardStyleInterpolator = ({ current, next, layouts }) => {
  const under = underneath(next);
  return {
    cardStyle: {
      opacity: Animated.multiply(fadeIn(current.progress), under.opacity),
      transform: [
        { translateX: current.progress.interpolate({ inputRange: [0, 1], outputRange: [Math.min(48, layouts.screen.width * 0.08), 0] }) },
        { scale: under.scale },
      ],
    },
  };
};

/** Focused work over the app (a session, a card, a quiz): rises a little from below. */
export const forRise: StackCardStyleInterpolator = ({ current, next, layouts }) => {
  const under = underneath(next);
  return {
    cardStyle: {
      opacity: Animated.multiply(fadeIn(current.progress), under.opacity),
      transform: [
        { translateY: current.progress.interpolate({ inputRange: [0, 1], outputRange: [Math.min(64, layouts.screen.height * 0.07), 0] }) },
        { scale: under.scale },
      ],
    },
  };
};

/** Moments (pack complete, level up, onboarding): a crossfade with a slight grow. */
export const forBloom: StackCardStyleInterpolator = ({ current, next }) => {
  const under = underneath(next);
  return {
    cardStyle: {
      opacity: Animated.multiply(fadeIn(current.progress), under.opacity),
      transform: [{ scale: Animated.multiply(current.progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }), under.scale) }],
    },
  };
};
