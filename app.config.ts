import type { ExpoConfig } from 'expo/config';

// BASE_URL lets the web build live under a sub-path, e.g. "/lexicard" on
// GitHub Pages (https://<user>.github.io/lexicard). Empty for local dev.
const baseUrl = (process.env.BASE_URL ?? '').replace(/\/$/, '');

const config: ExpoConfig = {
  name: 'Lexicard',
  slug: 'lexicard',
  version: '1.0.0',
  scheme: 'lexicard',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#0B0C0A',
  ios: { supportsTablet: true },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0B0C0A',
      foregroundImage: './assets/android-icon-foreground.png',
    },
  },
  web: {
    output: 'single',
    bundler: 'metro',
    favicon: './assets/favicon.png',
    name: 'Lexicard',
    shortName: 'Lexicard',
    themeColor: '#0B0C0A',
    backgroundColor: '#0B0C0A',
  },
  plugins: ['expo-router', 'expo-font'],
  experiments: {
    typedRoutes: false,
    ...(baseUrl ? { baseUrl } : {}),
  },
};

export default config;
