import { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/src/db/supabase';
import type { Database } from '@/src/db/types';
import { useTheme } from '@/src/theme';
import { Button, EmptyState, IconButton, Surface, Text } from '@/src/ui';

type Doc = Database['public']['Tables']['documents']['Row'];

const STATUS_LABEL: Record<Doc['status'] & string, string> = {
  pending: 'Queued',
  processing: 'Indexing',
  ready: 'Ready',
  error: 'Error',
};

export default function Library() {
  const { c, s } = useTheme();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });
    setDocs(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('docs-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const upload = async () => {
    const pick = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain', 'text/markdown'],
      copyToCacheDirectory: true,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const file = pick.assets[0];
    setUploading(true);

    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Not signed in');

      const path = `${u.user.id}/${Date.now()}_${file.name}`;
      const fileBytes = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const arrayBuf = Uint8Array.from(atob(fileBytes), (ch) => ch.charCodeAt(0));
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(path, arrayBuf, {
          contentType: file.mimeType ?? 'application/octet-stream',
          upsert: false,
        });
      if (upErr) throw upErr;

      const { data: doc, error: insErr } = await supabase
        .from('documents')
        .insert({
          user_id: u.user.id,
          filename: file.name,
          mime: file.mimeType ?? null,
          size_bytes: file.size ?? null,
          storage_path: path,
          status: 'pending',
        })
        .select()
        .single();
      if (insErr) throw insErr;
      if (doc) {
        supabase.functions.invoke('ingest-doc', { body: { document_id: doc.id } });
      }
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
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
          library
        </Text>
        <IconButton
          icon="paperclip"
          accessibilityLabel="Upload document"
          variant="soft"
          disabled={uploading}
          onPress={upload}
        />
      </View>

      {loading && docs.length === 0 ? (
        <View style={{ padding: s['5'] }}>
          <Text variant="meta" color="fgMuted">
            Loading…
          </Text>
        </View>
      ) : docs.length === 0 ? (
        <EmptyState
          title="bring your sources"
          body="Upload PDFs, notes, or text. They become searchable context the cloud model can ground its answers in."
          action={
            <Button
              label="Upload a document"
              onPress={upload}
              loading={uploading}
              size="lg"
            />
          }
        />
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ paddingHorizontal: s['5'], paddingBottom: s['7'] }}
          ItemSeparatorComponent={() => <View style={{ height: s['2'] }} />}
          renderItem={({ item }) => (
            <Surface
              level="surface"
              borderToken="border"
              radiusToken="lg"
              style={{ padding: s['4'] }}
            >
              <Text variant="bodyMedium" numberOfLines={1}>
                {item.filename}
              </Text>
              <View style={{ flexDirection: 'row', gap: s['2'], marginTop: 4 }}>
                <Text
                  variant="meta"
                  color={item.status === 'error' ? 'danger' : 'fgSubtle'}
                >
                  {STATUS_LABEL[item.status ?? 'pending']}
                </Text>
                <Text variant="meta" color="fgSubtle">
                  ·
                </Text>
                <Text variant="meta" color="fgSubtle">
                  {new Date(item.created_at ?? Date.now()).toLocaleDateString()}
                </Text>
              </View>
            </Surface>
          )}
          removeClippedSubviews
          windowSize={9}
        />
      )}
    </SafeAreaView>
  );
}
