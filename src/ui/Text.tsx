import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme, type TypeVariant } from '@/src/theme';
import type { Palette } from '@/src/theme/colors';

type Props = RNTextProps & {
  variant?: TypeVariant;
  /** Token from palette ('fg', 'fgMuted', etc.) — defaults to fg. */
  color?: keyof Palette;
  align?: TextStyle['textAlign'];
};

export function Text({ variant = 'body', color = 'fg', align, style, ...rest }: Props) {
  const { c, t } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        t[variant],
        { color: c[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
