import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type Palette } from './colors';
import { radius, spacing, TOUCH_TARGET } from './spacing';
import { fontFamily, type } from './typography';

export type Theme = {
  scheme: 'light' | 'dark';
  c: Palette;
  s: typeof spacing;
  r: typeof radius;
  t: typeof type;
  TOUCH_TARGET: typeof TOUCH_TARGET;
  fontFamily: typeof fontFamily;
};

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return {
    scheme,
    c: scheme === 'dark' ? darkColors : lightColors,
    s: spacing,
    r: radius,
    t: type,
    TOUCH_TARGET,
    fontFamily,
  };
}

export { darkColors, lightColors, spacing, radius, type, fontFamily, TOUCH_TARGET };
export type { TypeVariant } from './typography';
export type { Palette } from './colors';
