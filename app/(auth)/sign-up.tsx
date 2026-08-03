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

export default function SignUp() {
  const { c, s } = useTheme();
  const signUp = useAuth((st) => st.signUp);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    const { error: err } = await signUp(email.trim(), password);
    if (err) setError(err);
    else setInfo('Check your inbox to confirm your email.');
    setBusy(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, padding: s['6'], justifyContent: 'center' }}
      >
        <View style={{ gap: s['1'], marginBottom: s['7'] }}>
          <Text variant="display">begin again</Text>
          <Text variant="body" color="fgMuted">
            One account. Local model. Cloud when you need it.
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
            placeholder="at least 8 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            error={error}
          />
          {info && (
            <Text variant="meta" color="success">
              {info}
            </Text>
          )}

          <Button
            label="Create account"
            onPress={onSubmit}
            loading={busy}
            disabled={!email || password.length < 8}
            fullWidth
            size="lg"
          />
        </View>

        <View style={{ marginTop: s['7'], alignItems: 'center' }}>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable hitSlop={12} accessibilityRole="link">
              <Text variant="body" color="fgMuted">
                Already have an account?{' '}
                <Text variant="bodyMedium" color="fg">
                  Sign in
                </Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
