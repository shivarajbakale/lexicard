import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, PressScale, Txt, type IconName } from '../../components/ui';
import { colors, springs } from '../../theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Learn', icon: 'layers' },
  library: { label: 'Library', icon: 'book' },
  progress: { label: 'Progress', icon: 'bar-chart-2' },
};

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const slot = w / state.routes.length;
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(state.index * slot, springs.snappy) }] }), [state.index, slot]);

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      <View style={styles.inner} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Animated.View style={[styles.pillWrap, { width: slot }, pill]}>
            <View style={styles.pill} />
          </Animated.View>
        )}
        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const active = state.index === i;
          return (
            <PressScale
              key={route.key}
              style={styles.tab}
              scaleTo={0.92}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={meta.label}
              onPress={() => {
                if (!active) navigateToTab(route.key);
              }}
            >
              <Icon name={meta.icon} size={18} color={active ? colors.lime : colors.textFaint} />
              <Txt weight="medium" size={11} color={active ? colors.lime : colors.textFaint}>
                {meta.label}
              </Txt>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'shift' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Learn' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.bgRaised, borderTopWidth: 1, borderTopColor: '#1F221C', paddingTop: 6, paddingHorizontal: 12 },
  inner: { flexDirection: 'row' },
  pillWrap: { position: 'absolute', top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 56, height: '100%', borderRadius: 12, backgroundColor: '#1A1D16' },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
