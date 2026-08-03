// 4px-base spacing scale. Reach for these instead of raw numbers.

export const spacing = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 32,
  '8': 40,
  '9': 48,
  '10': 64,
  '11': 80,
  '12': 96,
} as const;

export type SpacingKey = keyof typeof spacing;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  '3xl': 32,
  pill: 999,
} as const;

/** Minimum WCAG 2.5.5 target size. Always pair with hitSlop if visual smaller. */
export const TOUCH_TARGET = 44;
