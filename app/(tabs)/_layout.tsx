import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTheme } from '@/src/theme';

export default function TabLayout() {
  const { c } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.fg,
        tabBarInactiveTintColor: c.fgSubtle,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: 'Geist_500Medium',
          fontSize: 11,
          letterSpacing: 0.4,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={22} name="bubble.left.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="folder.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="gear" color={color} />,
        }}
      />
    </Tabs>
  );
}
