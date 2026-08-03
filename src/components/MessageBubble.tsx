import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/src/theme';
import { Text } from '@/src/ui';

type Props = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  route?: 'local' | 'cloud' | null;
  model?: string | null;
  /** When true, plays a subtle haptic on first mount of an assistant bubble (final response). */
  hapticOnMount?: boolean;
  animateEntrance?: boolean;
};

export function MessageBubble({
  role,
  content,
  route,
  model,
  hapticOnMount,
  animateEntrance = true,
}: Props) {
  const { c, r, s } = useTheme();
  const isUser = role === 'user';

  useEffect(() => {
    if (hapticOnMount) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [hapticOnMount]);

  const Wrapper = animateEntrance ? Animated.View : View;
  const wrapperProps = animateEntrance ? { entering: FadeInUp.duration(220) } : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={{
        flexDirection: 'row',
        paddingHorizontal: s['5'],
        marginVertical: s['1'],
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && (
        <View
          accessibilityElementsHidden
          style={{
            width: 26,
            height: 26,
            borderRadius: r.pill,
            backgroundColor: c.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: s['2'],
            marginTop: 2,
          }}
        >
          <Text variant="micro" style={{ color: c.accent }}>
            S
          </Text>
        </View>
      )}

      <View
        style={{
          maxWidth: '82%',
          paddingHorizontal: s['4'],
          paddingVertical: s['3'],
          borderRadius: r['2xl'],
          borderBottomRightRadius: isUser ? r.sm : r['2xl'],
          borderBottomLeftRadius: !isUser ? r.sm : r['2xl'],
          backgroundColor: isUser ? c.bubbleUser : c.bubbleAssistant,
        }}
      >
        <Text
          variant="body"
          style={{
            color: isUser ? c.bubbleUserFg : c.bubbleAssistantFg,
          }}
        >
          {content}
        </Text>
        {!isUser && (route || model) && (
          <Text
            variant="micro"
            style={{
              marginTop: 6,
              color: c.fgSubtle,
            }}
          >
            {route ?? ''}
            {model ? ` · ${model}` : ''}
          </Text>
        )}
      </View>
    </Wrapper>
  );
}
