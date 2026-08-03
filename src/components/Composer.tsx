import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTheme } from '@/src/theme';
import { IconButton } from '@/src/ui';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function Composer({ onSend, disabled, placeholder = 'Ask anything' }: Props) {
  const { c, r, s, t } = useTheme();
  const [text, setText] = useState('');

  const submit = () => {
    const tt = text.trim();
    if (!tt || disabled) return;
    onSend(tt);
    setText('');
  };

  const canSend = !!text.trim() && !disabled;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: s['2'],
        paddingHorizontal: s['4'],
        paddingVertical: s['3'],
        borderTopWidth: 1,
        borderColor: c.border,
        backgroundColor: c.bg,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: c.surface2,
          borderRadius: r['2xl'],
          paddingHorizontal: s['4'],
          paddingVertical: s['3'],
          minHeight: 44,
        }}
      >
        <TextInput
          accessibilityLabel="Message"
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c.fgSubtle}
          multiline
          editable={!disabled}
          style={[
            t.body,
            { color: c.fg, minHeight: 24, maxHeight: 140, padding: 0 },
          ]}
        />
      </View>
      <IconButton
        icon="arrow.up"
        accessibilityLabel="Send message"
        variant="primary"
        size={44}
        iconSize={20}
        disabled={!canSend}
        onPress={submit}
      />
    </View>
  );
}
