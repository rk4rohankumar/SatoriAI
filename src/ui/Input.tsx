import { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useTheme } from '@/src/theme';
import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
};

export function Input({ label, error, style, ...rest }: Props) {
  const { c, r, s, t } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: s['1'] }}>
      {label && (
        <Text variant="micro" color="fgMuted">
          {label}
        </Text>
      )}
      <TextInput
        accessibilityLabel={label ?? rest.placeholder}
        placeholderTextColor={c.fgSubtle}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          t.body,
          {
            color: c.fg,
            backgroundColor: c.surface,
            borderRadius: r.lg,
            borderWidth: 1,
            borderColor: error ? c.danger : focused ? c.fg : c.border,
            paddingHorizontal: s['4'],
            paddingVertical: s['3'],
            minHeight: 52,
          },
          style,
        ]}
      />
      {error && (
        <Text variant="meta" color="danger">
          {error}
        </Text>
      )}
    </View>
  );
}

// Silence `style` array unused-warning in some configs.
StyleSheet.create({});
