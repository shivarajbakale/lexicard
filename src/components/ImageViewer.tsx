import { useEffect } from 'react';
import { Image, Modal, Platform, StyleSheet, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, PAPER, radius } from '../theme';
import { Icon, PressScale, Txt } from './ui';

const MAX = 5;
const DOUBLE = 2.5;
const EASE = { duration: 220 };

/** Full-screen picture: pinch or double-tap to zoom, drag to look around. */
export function ImageViewer({ source, label, visible, onClose }: { source: ImageSourcePropType; label: string; visible: boolean; onClose: () => void }) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const w = Math.min(win.width, (win.height - 120) / 0.75);
  const h = w * 0.75;

  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    scale.set(1);
    baseScale.set(1);
    tx.set(0);
    ty.set(0);
  }, [visible, scale, baseScale, tx, ty]);

  // Keeps the zoomed picture from being dragged off screen.
  const clamp = (s: number) => {
    'worklet';
    const mx = Math.max(0, (w * s - win.width) / 2);
    const my = Math.max(0, (h * s - win.height) / 2);
    tx.set(Math.min(mx, Math.max(-mx, tx.value)));
    ty.set(Math.min(my, Math.max(-my, ty.value)));
  };

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      baseScale.set(scale.value);
    },
    onUpdate: (e) => {
      'worklet';
      scale.set(Math.min(MAX, Math.max(0.8, baseScale.value * e.scale)));
    },
    onDeactivate: () => {
      'worklet';
      const s = Math.max(1, scale.value);
      scale.set(withTiming(s, EASE));
      if (s === 1) {
        tx.set(withTiming(0, EASE));
        ty.set(withTiming(0, EASE));
      } else clamp(s);
    },
  });

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      baseX.set(tx.value);
      baseY.set(ty.value);
    },
    onUpdate: (e) => {
      'worklet';
      tx.set(baseX.value + e.translationX);
      ty.set(baseY.value + e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      // At normal size, a downward flick closes the viewer.
      if (scale.value <= 1.01 && (e.translationY > 120 || e.velocityY > 900)) {
        scheduleOnRN(onClose);
        return;
      }
      if (scale.value <= 1.01) {
        tx.set(withTiming(0, EASE));
        ty.set(withTiming(0, EASE));
      } else clamp(scale.value);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      if (scale.value > 1.01) {
        scale.set(withTiming(1, EASE));
        tx.set(withTiming(0, EASE));
        ty.set(withTiming(0, EASE));
      } else {
        // Zoom in on the spot that was tapped.
        scale.set(withTiming(DOUBLE, EASE));
        tx.set(withTiming((w / 2 - e.x) * (DOUBLE - 1), EASE));
        ty.set(withTiming((h / 2 - e.y) * (DOUBLE - 1), EASE));
      }
    },
  });

  const gesture = useExclusiveGestures(doubleTap, useSimultaneousGestures(pinch, pan));

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // Web: Escape closes, and ctrl/cmd + wheel (a trackpad pinch) zooms.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = Math.min(MAX, Math.max(1, scale.value * Math.exp(-e.deltaY / 200)));
      scale.set(s);
      if (s === 1) {
        tx.set(0);
        ty.set(0);
      } else clamp(s);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('wheel', onWheel);
    };
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]} />
        <GestureDetector gesture={gesture}>
          <View style={styles.stage}>
            <Animated.View style={[{ width: w, height: h, backgroundColor: PAPER }, imgStyle]}>
              <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessible accessibilityLabel={label} />
            </Animated.View>
          </View>
        </GestureDetector>
        <View style={[styles.top, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
          <PressScale style={styles.close} scaleTo={0.92} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close picture">
            <Icon name="x" size={20} color={colors.text} />
          </PressScale>
        </View>
        <View style={[styles.hint, { paddingBottom: insets.bottom + 18 }]} pointerEvents="none">
          <Txt size={13} color={colors.textMuted}>
            Pinch or double-tap to zoom
          </Txt>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  hint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
