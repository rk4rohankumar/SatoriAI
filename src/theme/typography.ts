import type { TextStyle } from 'react-native';

/**
 * Type scale. Display = serif italic editorial. UI = Geist sans.
 *
 * Font names match what we register in the font loader (RootLayout).
 * Use these as the source of truth — never inline `fontSize` literals.
 */

export const fontFamily = {
  display: 'InstrumentSerif_400Regular_Italic',
  displayUpright: 'InstrumentSerif_400Regular',
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  mono: 'Geist_400Regular', // swap to Geist Mono later if needed
} as const;

type Variant = TextStyle & { fontFamily: string };

export const type: Record<
  | 'display'
  | 'title'
  | 'subtitle'
  | 'h3'
  | 'body'
  | 'bodyMedium'
  | 'meta'
  | 'micro'
  | 'mono',
  Variant
> = {
  display: {
    fontFamily: fontFamily.display,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  h3: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    lineHeight: 24,
  },
  meta: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  micro: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: 14,
    lineHeight: 20,
  },
};

export type TypeVariant = keyof typeof type;
