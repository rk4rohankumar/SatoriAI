import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { MarkdownBody } from '@/src/components/MarkdownBody';
import { matchCitedSources } from '@/src/components/sources';
import { ToolChip } from '@/src/components/ToolChip';
import type { ToolEventRecord } from '@/src/llm/types';
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
  /** Web-search (and other tool) activity attached to this assistant message, if any. */
  toolEvents?: ToolEventRecord[] | null;
  /**
   * Render assistant content as markdown. Defaults on; the live streaming
   * bubble turns it off (re-parsing on every token janks the stream).
   */
  markdown?: boolean;
};

export function MessageBubble({
  role,
  content,
  route,
  model,
  hapticOnMount,
  animateEntrance = true,
  toolEvents,
  markdown = true,
}: Props) {
  const { c, r, s } = useTheme();
  const isUser = role === 'user';

  const sources =
    !isUser && toolEvents?.length
      ? matchCitedSources(
          content,
          toolEvents.flatMap((t) => t.results ?? []),
        ).slice(0, 3)
      : [];

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
        {!isUser &&
          toolEvents?.map((event) => <ToolChip key={event.id} event={event} />)}
        {!isUser && markdown ? (
          <MarkdownBody color={c.bubbleAssistantFg}>{content}</MarkdownBody>
        ) : (
          <Text
            variant="body"
            style={{
              color: isUser ? c.bubbleUserFg : c.bubbleAssistantFg,
            }}
          >
            {content}
          </Text>
        )}
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
        {!isUser && sources.length > 0 && (
          <View style={{ marginTop: s['2'], gap: 4 }}>
            <Text variant="micro" color="fgSubtle">
              Sources
            </Text>
            {sources.map((src) => (
              <Pressable
                key={src.url}
                accessibilityRole="link"
                accessibilityLabel={src.title}
                onPress={() => {
                  WebBrowser.openBrowserAsync(src.url).catch(() => {});
                }}
              >
                <Text variant="meta" style={{ color: c.accent }} numberOfLines={1}>
                  {src.title}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Wrapper>
  );
}
