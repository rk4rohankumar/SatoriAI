import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts,
} from '@expo-google-fonts/geist';

import { darkColors, lightColors } from '@/src/theme';
import { useAuth } from '@/src/store/auth';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = {
  anchor: '(tabs)',
};

function buildNavTheme(scheme: 'light' | 'dark'): Theme {
  const c = scheme === 'dark' ? darkColors : lightColors;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === 'dark',
    colors: {
      ...base.colors,
      background: c.bg,
      card: c.surface,
      text: c.fg,
      border: c.border,
      primary: c.accent,
      notification: c.accent,
    },
  };
}

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });

  const init = useAuth((s) => s.init);
  const session = useAuth((s) => s.session);
  const loading = useAuth((s) => s.loading);
  const segments = useSegments();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (fontsLoaded && !loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, loading]);

  if (!fontsLoaded || loading) return null;

  const inAuthGroup = segments[0] === '(auth)';
  if (!session && !inAuthGroup) return <Redirect href="/(auth)/sign-in" />;

  const c = scheme === 'dark' ? darkColors : lightColors;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={buildNavTheme(scheme)}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.fg,
            headerTitleStyle: { fontFamily: 'Geist_500Medium' },
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: true, headerBackTitle: '' }} />
        </Stack>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
