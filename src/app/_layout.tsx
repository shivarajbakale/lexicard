import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack as JSStack, type StackNavigationOptions } from 'expo-router/js-stack';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { forBloom, forPush, forRise, transitionSpec } from '../lib/transitions';
import { colors } from '../theme';

/**
 * Every screen and how it arrives. Native builds use the platform animations; the web uses the JavaScript stack
 * with the matching soft transitions in lib/transitions (the native stack doesn't animate in a browser).
 */
type Motion = 'push' | 'rise' | 'bloom';
const SCREENS: { name: string; motion: Motion; locked?: boolean }[] = [
  { name: '(tabs)', motion: 'push' },
  { name: 'onboarding', motion: 'bloom', locked: true },
  { name: 'session', motion: 'rise', locked: true },
  { name: 'pack-complete', motion: 'bloom', locked: true },
  { name: 'pack/[id]', motion: 'push' },
  { name: 'card/[id]', motion: 'rise' },
  { name: 'levels', motion: 'push' },
  { name: 'root/[id]', motion: 'push' },
  { name: 'level-up', motion: 'bloom', locked: true },
  { name: 'quiz', motion: 'rise' },
  { name: 'guess', motion: 'rise' },
  { name: 'challenge', motion: 'rise' },
];

const NATIVE_ANIMATION = { push: 'slide_from_right', rise: 'slide_from_bottom', bloom: 'fade_from_bottom' } as const;
const WEB_INTERPOLATOR = { push: forPush, rise: forRise, bloom: forBloom } as const;

const webScreenOptions: StackNavigationOptions = {
  headerShown: false,
  // The JS stack turns transitions off on web unless asked; ours are set below.
  animation: 'default',
  // When the stack fills the window, the JS stack lets the whole document scroll instead of the screen
  // ('page overflow'), which stops every ScrollView inside from scrolling. A floating header mode turns that
  // off; there's no header to show either way.
  headerMode: 'float',
  cardStyle: { backgroundColor: colors.bg },
  cardOverlayEnabled: false,
  gestureEnabled: false,
  transitionSpec,
  cardStyleInterpolator: forPush,
};

function Navigator() {
  if (Platform.OS === 'web') {
    return (
      <JSStack screenOptions={webScreenOptions}>
        {SCREENS.map((s) => (
          <JSStack.Screen key={s.name} name={s.name} options={{ cardStyleInterpolator: WEB_INTERPOLATOR[s.motion] }} />
        ))}
      </JSStack>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      {SCREENS.map((s) => (
        <Stack.Screen key={s.name} name={s.name} options={{ animation: NATIVE_ANIMATION[s.motion], ...(s.locked ? { gestureEnabled: false } : null) }} />
      ))}
    </Stack>
  );
}

if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('lexicard-global')) {
  const style = document.createElement('style');
  style.id = 'lexicard-global';
  style.textContent = `
    html, body, #root { background: ${colors.bg}; height: 100%; }
    body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
    * { -webkit-font-smoothing: antialiased; }
    :focus-visible { outline: 2px solid ${colors.lime}; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

export default function RootLayout() {
  const [loaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular });


  if (!loaded) return <View style={styles.root} />;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.root}>
          <View style={styles.column}>
            <Navigator />
          </View>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center' },
});
