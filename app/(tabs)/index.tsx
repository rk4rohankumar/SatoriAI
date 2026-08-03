import { useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useConversations } from '@/src/store/conversations';
import { useTheme } from '@/src/theme';
import { Button, EmptyState, IconButton, Surface, Text } from '@/src/ui';

function formatRelative(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ChatList() {
  const { c, s } = useTheme();
  const router = useRouter();
  const list = useConversations((st) => st.list);
  const loading = useConversations((st) => st.loading);
  const load = useConversations((st) => st.load);
  const create = useConversations((st) => st.create);
  const subscribe = useConversations((st) => st.subscribe);

  useEffect(() => {
    load();
    const unsub = subscribe();
    return unsub;
  }, [load, subscribe]);

  const newChat = async () => {
    const conv = await create();
    if (conv) router.push(`/chat/${conv.id}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: s['5'],
          paddingTop: s['3'],
          paddingBottom: s['4'],
        }}
      >
        <Text variant="display" style={{ fontSize: 28, lineHeight: 32 }}>
          satori
        </Text>
        <IconButton
          icon="plus"
          accessibilityLabel="New chat"
          variant="soft"
          onPress={newChat}
        />
      </View>

      {loading && list.length === 0 ? (
        <View style={{ padding: s['5'] }}>
          <Text variant="meta" color="fgMuted">
            Loading…
          </Text>
        </View>
      ) : list.length === 0 ? (
        <EmptyState
          title="a quiet beginning"
          body="Tap + to start your first conversation. Local for quick thoughts, cloud for the heavy lifts."
          action={<Button label="Start a chat" onPress={newChat} variant="primary" size="lg" />}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingHorizontal: s['5'], paddingBottom: s['7'] }}
          ItemSeparatorComponent={() => <View style={{ height: s['2'] }} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open chat: ${item.title || 'untitled'}`}
              onPress={() => router.push(`/chat/${item.id}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Surface
                level="surface"
                borderToken="border"
                radiusToken="lg"
                style={{ padding: s['4'] }}
              >
                <Text variant="bodyMedium" numberOfLines={1}>
                  {item.title || 'Untitled'}
                </Text>
                <Text variant="meta" color="fgSubtle" style={{ marginTop: 2 }}>
                  {formatRelative(item.updated_at ?? item.created_at)}
                </Text>
              </Surface>
            </Pressable>
          )}
          removeClippedSubviews
          windowSize={9}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
        />
      )}
    </SafeAreaView>
  );
}
