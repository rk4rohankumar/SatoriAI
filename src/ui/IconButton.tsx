import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/src/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

type Variant = 'plain' | 'soft' | 'primary';

type Props = Omit<PressableProps, 'children' | 'onPress' | 'accessibilityLabel'> & {
  icon: Parameters<typeof IconSymbol>[0]['name'];
  /** Required for screen readers. */
  accessibilityLabel: string;
  variant?: Variant;
  size?: number;     // visible size; touch target always 44+
  iconSize?: number;
  haptic?: boolean;
  onPress?: () => void | Promise<void>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'plain',
  size = 44,
  iconSize = 20,
  haptic = true,
  disabled,
  onPress,
  style,
  ...rest
}: Props) {
  const { c, r, TOUCH_TARGET } = useTheme();

  const palette = {
    plain: { bg: 'transparent', pressedBg: c.surface3, fg: c.fg },
    soft: { bg: c.surface2, pressedBg: c.surface3, fg: c.fg },
    primary: { bg: c.primary, pressedBg: c.fgMuted, fg: c.primaryFg },
  }[variant];

  const visible = Math.max(size, 32);
  const target = Math.max(visible, TOUCH_TARGET);
  const padding = (target - visible) / 2;

  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={padding > 0 ? padding : undefined}
      onPress={async () => {
        if (!onPress) return;
        if (haptic) Haptics.selectionAsync().catch(() => {});
        await onPress();
      }}
      style={({ pressed }) => [
        {
          width: visible,
          height: visible,
          borderRadius: r.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? palette.pressedBg : palette.bg,
          opacity: disabled ? 0.4 : 1,
        },
        style as object,
      ]}
    >
      <IconSymbol name={icon} size={iconSize} color={palette.fg} />
    </Pressable>
  );
}
