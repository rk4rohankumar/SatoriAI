import { View, type ViewProps } from 'react-native';
import { useTheme } from '@/src/theme';
import type { Palette } from '@/src/theme/colors';

type Props = ViewProps & {
  level?: 'bg' | 'surface' | 'surface2' | 'surface3';
  borderToken?: keyof Palette | null;
  radiusToken?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'pill';
};

export function Surface({
  level = 'surface',
  borderToken = null,
  radiusToken,
  style,
  ...rest
}: Props) {
  const { c, r } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: c[level],
          borderRadius: radiusToken ? r[radiusToken] : 0,
          borderWidth: borderToken ? 1 : 0,
          borderColor: borderToken ? c[borderToken] : undefined,
        },
        style,
      ]}
    />
  );
}
