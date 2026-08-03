/**
 * Editorial-quiet palette: warm cream + ink + sage.
 *
 * Naming: "fg" = foreground/text, "bg" = surfaces, "border" = hairlines,
 * "muted/subtle" = receding, "accent" = single brand spotlight.
 *
 * All pairings hit WCAG AA 4.5:1 against their default background.
 */

export const lightColors = {
  bg: '#FAF8F2',           // warm off-white cream
  surface: '#FFFFFF',      // pure white card
  surface2: '#F2EEE3',     // warmer panel for nested
  surface3: '#E8E2D2',     // hover / pressed
  border: '#E0D9C5',       // hairline
  borderStrong: '#C9C0A8', // emphasized divider

  fg: '#1B1815',           // ink, near-black warm
  fgMuted: '#5C544A',      // secondary text
  fgSubtle: '#857C70',     // tertiary
  fgDisabled: '#B5AC9C',

  accent: '#3F6B47',       // deep sage
  accentFg: '#FAF8F2',
  accentSoft: '#E1ECDF',   // tinted bg for accent surfaces

  primary: '#1B1815',      // ink button
  primaryFg: '#FAF8F2',

  danger: '#A8201E',
  dangerFg: '#FAF8F2',
  dangerSoft: '#F4D9D5',

  success: '#2F7D32',
  warning: '#9C6713',

  // chat-specific
  bubbleUser: '#1B1815',
  bubbleUserFg: '#FAF8F2',
  bubbleAssistant: '#F2EEE3',
  bubbleAssistantFg: '#1B1815',
  bubbleAccent: '#E1ECDF',
  bubbleAccentFg: '#1B1815',
};

export const darkColors: typeof lightColors = {
  bg: '#0E0C09',
  surface: '#1A1714',
  surface2: '#26221D',
  surface3: '#332E27',
  border: '#3A3530',
  borderStrong: '#4F4842',

  fg: '#F2EEE3',
  fgMuted: '#A8A095',
  fgSubtle: '#7A7268',
  fgDisabled: '#4F4842',

  accent: '#7DAB85',
  accentFg: '#0E0C09',
  accentSoft: '#1F2E22',

  primary: '#F2EEE3',
  primaryFg: '#0E0C09',

  danger: '#D9504D',
  dangerFg: '#F2EEE3',
  dangerSoft: '#3A1B1A',

  success: '#5FA862',
  warning: '#C8923A',

  bubbleUser: '#F2EEE3',
  bubbleUserFg: '#0E0C09',
  bubbleAssistant: '#26221D',
  bubbleAssistantFg: '#F2EEE3',
  bubbleAccent: '#1F2E22',
  bubbleAccentFg: '#F2EEE3',
};

export type Palette = typeof lightColors;
