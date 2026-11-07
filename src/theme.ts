import { Platform } from 'react-native';

export const colors = {
  bg: '#0B0C0A',
  bgRaised: '#0E0F0D',
  surface: '#151713',
  surface2: '#1A1C18',
  card: '#1E211B',
  cardInner: '#262A22',
  chip: '#22251F',
  border: '#262922',
  borderStrong: '#343830',
  line: '#2E322A',
  text: '#F4F5F0',
  textSoft: '#D7DBCF',
  textMuted: '#A3A89C',
  textFaint: '#8E9387',
  lime: '#C6F432',
  limeSoft: '#D9F59A',
  limeDeep: '#2E3326',
  orange: '#FF9F5A',
  orangeSoft: '#FFB27D',
  orangeDeep: '#2A1E14',
  orangeText: '#FFCFAA',
  ink: '#0B0C0A',
} as const;

/** The card pictures' own off-white, so a letterboxed picture blends into its box. */
export const PAPER = '#FCF6E9';

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_400Regular',
} as const;

/** IPA needs a font with phonetic glyphs (ˈ ə ɪ æ); system fonts have them, Geist does not. */
export const ipaFont = Platform.select({
  web: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  default: undefined,
});

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, card: 28, pill: 999 } as const;

/** Spring tuned for cards: quick settle, no wobble. */
export const springs = {
  snappy: { damping: 22, stiffness: 260, mass: 0.9 },
  soft: { damping: 26, stiffness: 180, mass: 1 },
} as const;

export const kindStyle = {
  word: { label: 'Word', bg: '#2A2E25', fg: '#D7DBCF' },
  idiom: { label: 'Idiom', bg: '#F4F5F0', fg: '#0B0C0A' },
  phrase: { label: 'Phrase', bg: '#C6F432', fg: '#0B0C0A' },
} as const;

export const confidenceStyle = {
  recorded: { label: 'Well recorded', bg: '#2E3326', fg: '#D9F59A' },
  likely: { label: 'Likely', bg: '#2A2D27', fg: '#D7DBCF' },
  myth: { label: 'Myth check', bg: '#2A1E14', fg: '#FFB27D' },
} as const;
