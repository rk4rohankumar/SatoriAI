import { useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/db/supabase';
import { useAuth } from '@/src/store/auth';
import { downloadModel, isModelDownloaded } from '@/src/llm/local';
import { useTheme } from '@/src/theme';
import { Button, Surface, Text } from '@/src/ui';

export default function Settings() {
  const { c, s, r } = useTheme();
  const user = useAuth((st) => st.user);
  const signOut = useAuth((st) => st.signOut);

  const [consent, setConsent] = useState(false);
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [dlPct, setDlPct] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('cloud_consent').single();
      setConsent(!!data?.cloud_consent);
      setModelReady(await isModelDownloaded());
    })();
  }, []);

  const toggleConsent = async (v: boolean) => {
    setConsent(v);
    await supabase.from('profiles').update({ cloud_consent: v }).eq('id', user?.id ?? '');
  };

  const startDownload = async () => {
    setDlPct(0);
    try {
      await downloadModel((p) => setDlPct(p.pct));
      setModelReady(true);
    } finally {
      setDlPct(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: s['5'], paddingBottom: s['9'] }}>
        <Text variant="display" style={{ fontSize: 28, lineHeight: 32, marginBottom: s['6'] }}>
          settings
        </Text>

        <Section title="account">
          <Surface
            level="surface"
            borderToken="border"
            radiusToken="lg"
            style={{ padding: s['4'] }}
          >
            <Text variant="micro" color="fgSubtle">
              Signed in as
            </Text>
            <Text variant="bodyMedium" style={{ marginTop: 2 }}>
              {user?.email ?? '—'}
            </Text>
          </Surface>
        </Section>

        <Section title="cloud">
          <Surface
            level="surface"
            borderToken="border"
            radiusToken="lg"
            style={{ padding: s['4'], flexDirection: 'row', alignItems: 'center', gap: s['4'] }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Send hard questions to the cloud</Text>
              <Text variant="meta" color="fgMuted" style={{ marginTop: 2 }}>
                Long context, code, and grounded answers route to Claude or Gemini. Your messages leave the device.
              </Text>
            </View>
            <Switch
              value={consent}
              onValueChange={toggleConsent}
              trackColor={{ true: c.accent, false: c.border }}
              thumbColor={c.surface}
              accessibilityLabel="Allow cloud answers"
            />
          </Surface>
        </Section>

        <Section title="local model">
          <Surface
            level="surface"
            borderToken="border"
            radiusToken="lg"
            style={{ padding: s['4'], gap: s['3'] }}
          >
            <View>
              <Text variant="bodyMedium">Gemma 3 4B</Text>
              <Text variant="meta" color="fgMuted" style={{ marginTop: 2 }}>
                ~2.5 GB · stays on your device · runs offline
              </Text>
            </View>

            {modelReady === null ? (
              <Text variant="meta" color="fgMuted">
                Checking…
              </Text>
            ) : modelReady ? (
              <View
                style={{
                  alignSelf: 'flex-start',
                  paddingHorizontal: s['3'],
                  paddingVertical: 4,
                  borderRadius: r.pill,
                  backgroundColor: c.accentSoft,
                }}
              >
                <Text variant="micro" style={{ color: c.accent }}>
                  Ready
                </Text>
              </View>
            ) : dlPct !== null ? (
              <View>
                <Text variant="meta" color="fgMuted">
                  Downloading… {(dlPct * 100).toFixed(0)}%
                </Text>
                <View
                  style={{
                    marginTop: 6,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: c.surface3,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Math.max(2, dlPct * 100)}%`,
                      height: '100%',
                      backgroundColor: c.accent,
                    }}
                  />
                </View>
              </View>
            ) : (
              <Button label="Download model" onPress={startDownload} variant="ghost" />
            )}
          </Surface>
        </Section>

        <View style={{ marginTop: s['7'] }}>
          <Button label="Sign out" onPress={signOut} variant="danger" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ gap: s['2'], marginBottom: s['6'] }}>
      <Text variant="micro" color="fgSubtle">
        {title}
      </Text>
      {children}
    </View>
  );
}
