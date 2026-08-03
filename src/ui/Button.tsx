import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/src/theme';
import { Text } from './Text';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

type Props = Omit<PressableProps, 'children' | 'onPress'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  onPress?: () => void | Promise<void>;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  onPress,
  style,
  ...rest
}: Props) {
  const { c, r, s, TOUCH_TARGET } = useTheme();

  const palette = {
    primary: { bg: c.primary, fg: c.primaryFg, pressedBg: c.fgMuted },
    accent: { bg: c.accent, fg: c.accentFg, pressedBg: c.fg },
    ghost: { bg: 'transparent', fg: c.fg, pressedBg: c.surface3 },
    danger: { bg: c.danger, fg: c.dangerFg, pressedBg: c.fg },
  }[variant];

  const sizeStyle = {
    md: { minHeight: TOUCH_TARGET, paddingHorizontal: s['5'], paddingVertical: s['3'] },
    lg: { minHeight: 52, paddingHorizontal: s['6'], paddingVertical: s['4'] },
  }[size];

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={async () => {
        if (!onPress) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        await onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        sizeStyle,
        {
          backgroundColor: pressed ? palette.pressedBg : palette.bg,
          borderRadius: r.pill,
          opacity: disabled ? 0.55 : 1,
          width: fullWidth ? '100%' : undefined,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: c.border,
        },
        style as object,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.content}>
          <Text variant={size === 'lg' ? 'h3' : 'bodyMedium'} style={{ color: palette.fg }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
