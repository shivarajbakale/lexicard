import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type Feedback = 'light' | 'soft' | 'heavy' | 'success';

// Web has no taptic engine. Android browsers can buzz through the Vibration API; iOS Safari has no
// equivalent, so there it does nothing. Patterns are kept short so they read as a tick, not a buzz.
const VIBRATE: Record<Feedback, number | number[]> = {
  light: 10,
  soft: 6,
  heavy: 22,
  success: [12, 60, 18],
};

/** A small physical tick for a swipe, an answer or a celebration, on every platform that has one. */
export function feedback(kind: Feedback) {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    try {
      nav?.vibrate?.(VIBRATE[kind]);
    } catch {
      // Some browsers throw before the first user gesture; a missed tick is fine.
    }
    return;
  }
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else
    Haptics.impactAsync(
      kind === 'heavy'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : kind === 'soft'
          ? Haptics.ImpactFeedbackStyle.Soft
          : Haptics.ImpactFeedbackStyle.Light,
    );
}
