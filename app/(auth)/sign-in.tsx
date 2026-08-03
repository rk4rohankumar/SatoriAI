import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useAuth } from '@/src/store/auth';
import { useTheme } from '@/src/theme';
import { Button, Input, Text } from '@/src/ui';

export default function SignIn() {
  const { c, s } = useTheme();
  const signIn = useAuth((st) => st.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setBusy(true);
    const { error: err } = await signIn(email.trim(), password);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, padding: s['6'], justifyContent: 'center' }}
      >
        <View style={{ gap: s['1'], marginBottom: s['7'] }}>
          <Text variant="display">welcome back</Text>
          <Text variant="body" color="fgMuted">
            Sign in to pick up where you left off.
          </Text>
        </View>

        <View style={{ gap: s['4'] }}>
          <Input
            label="email"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="password"
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            error={error}
          />

          <Button
            label="Sign in"
            onPress={onSubmit}
            loading={busy}
            disabled={!email || !password}
            fullWidth
            size="lg"
          />
        </View>

        <View style={{ marginTop: s['7'], alignItems: 'center' }}>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable hitSlop={12} accessibilityRole="link">
              <Text variant="body" color="fgMuted">
                New here?{' '}
                <Text variant="bodyMedium" color="fg">
                  Create an account
                </Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
