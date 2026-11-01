import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../theme';

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
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="card/[id]" options={{ animation: 'slide_from_bottom' }} />
            </Stack>
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
