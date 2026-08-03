import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/src/store/auth';

export default function AuthLayout() {
  const session = useAuth((s) => s.session);
  const loading = useAuth((s) => s.loading);
  if (loading) return null;
  if (session) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
