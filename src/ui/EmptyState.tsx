import { View } from 'react-native';
import { useTheme } from '@/src/theme';
import { Text } from './Text';

type Props = {
  title: string;
  body?: string;
  /** A Pressable / Button rendered below the copy. */
  action?: React.ReactNode;
  /** Slot for an icon or illustration above the title. */
  ornament?: React.ReactNode;
};

export function EmptyState({ title, body, action, ornament }: Props) {
  const { s } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: s['7'],
        gap: s['4'],
      }}
    >
      {ornament}
      <Text variant="display" align="center">
        {title}
      </Text>
      {body && (
        <Text variant="body" color="fgMuted" align="center" style={{ maxWidth: 320 }}>
          {body}
        </Text>
      )}
      {action && <View style={{ marginTop: s['3'] }}>{action}</View>}
    </View>
  );
}
