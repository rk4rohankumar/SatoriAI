import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Composer } from '@/src/components/Composer';
import { MessageBubble } from '@/src/components/MessageBubble';
import { ToolChip } from '@/src/components/ToolChip';
import { sendMessage } from '@/src/llm/chat';
import type { ToolEventRecord } from '@/src/llm/types';
import { useConversations } from '@/src/store/conversations';
import { useMessages } from '@/src/store/messages';
import type { Message } from '@/src/store/messages';
import { useTheme } from '@/src/theme';
import { Text, TypingDots } from '@/src/ui';

const EMPTY_MSGS: Message[] = [];

export default function ChatDetail() {
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = id!;

  const title = useConversations(
    (st) => st.list.find((conv) => conv.id === conversationId)?.title,
  );

  const messages = useMessages((st) => st.byConv[conversationId] ?? EMPTY_MSGS);
  const streaming = useMessages((st) => st.streaming[conversationId]);
  const streamingTool = useMessages((st) => st.streamingTool[conversationId]);
  const load = useMessages((st) => st.load);
  const subscribe = useMessages((st) => st.subscribe);

  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Android + SDK54 edge-to-edge: adjustResize is ignored and
  // KeyboardAvoidingView misbehaves, so track the keyboard inset manually.
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKbHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    load(conversationId);
    const unsub = subscribe(conversationId);
    return unsub;
  }, [conversationId, load, subscribe]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, streaming]);

  const onSend = async (text: string) => {
    setBusy(true);
    try {
      await sendMessage(conversationId, text);
    } finally {
      setBusy(false);
    }
  };

  const showTyping = busy && !streaming;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={['left', 'right', 'bottom']}
    >
      <Stack.Screen options={{ title: title ?? 'New chat' }} />
      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? kbHeight : 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight + insets.bottom : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => (
            <MessageBubble
              role={item.role}
              content={item.content}
              route={item.route}
              model={item.model}
              toolEvents={item.tool_events as ToolEventRecord[] | null}
              animateEntrance={index >= messages.length - 3}
            />
          )}
          contentContainerStyle={{ paddingVertical: s['3'], flexGrow: 1 }}
          ListEmptyComponent={
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: s['7'],
              }}
            >
              <Text variant="display" align="center" style={{ fontSize: 24 }}>
                a fresh canvas
              </Text>
              <Text variant="meta" color="fgMuted" align="center" style={{ marginTop: 8 }}>
                Type below. Short asks stay on-device.
              </Text>
            </View>
          }
          ListFooterComponent={
            streaming !== undefined || streamingTool ? (
              <>
                {streamingTool && (
                  <View style={{ paddingHorizontal: s['5'] + 26 + s['2'] }}>
                    <ToolChip event={streamingTool} />
                  </View>
                )}
                {streaming ? (
                  <MessageBubble
                    role="assistant"
                    content={streaming}
                    animateEntrance={false}
                  />
                ) : null}
              </>
            ) : showTyping ? (
              <View style={{ paddingHorizontal: s['5'] + 26 + s['2'], paddingVertical: s['2'] }}>
                <TypingDots />
              </View>
            ) : null
          }
          removeClippedSubviews
          windowSize={11}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
        />
        <Composer onSend={onSend} disabled={busy} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
