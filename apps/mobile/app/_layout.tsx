import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { CloseButton } from '../src/navigation/close-button.js';
import { useStackScreenOptions } from '../src/navigation/stack-options.js';
import { webBackOptions as webBack } from '../src/navigation/web-back-button.js';
import { bootstrap, startAppLinkHandling } from '../src/runtime/bootstrap.js';
import { useTheme } from '../src/theme/theme.js';
import { GestureRoot } from '../src/ui/gesture-root.js';

const QUICK_ROUTES = ['quick-todo', 'quick-note', 'quick-log', 'quick-idea', 'quick-knowledge'];

export default function RootLayout() {
  const router = useRouter();
  const options = useStackScreenOptions();
  const { platform } = useTheme();
  const largeTitles = platform === 'ios' && Platform.OS !== 'web';

  useEffect(() => bootstrap(), []);
  useEffect(() => startAppLinkHandling((href) => router.push(href as never)), [router]);

  // Swipeable rows need the gesture root above every navigator.
  return (
    <GestureRoot>
      <StatusBar style="auto" />
      <Stack screenOptions={options}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        {QUICK_ROUTES.map((name) => (
          <Stack.Screen
            key={name}
            name={name}
            options={{
              presentation: 'modal',
              sheetGrabberVisible: true,
              // The iOS sheet has a grabber and swipe; Android and web need an explicit close.
              headerRight: platform === 'ios' && Platform.OS !== 'web' ? undefined : CloseButton,
            }}
          />
        ))}
        <Stack.Screen
          name="analytics"
          options={{ title: 'Analytics', headerLargeTitle: largeTitles, ...webBack('/more') }}
        />
        <Stack.Screen
          name="wiki/index"
          options={{ title: 'Wiki', headerLargeTitle: largeTitles, ...webBack('/more') }}
        />
        {/* Page titles are arbitrary, so the reader uses a standard inline title. */}
        <Stack.Screen name="wiki/[...page]" options={{ title: 'Page', ...webBack('/wiki') }} />
        <Stack.Screen
          name="knowledge"
          options={{ title: 'Knowledge', headerLargeTitle: largeTitles, ...webBack('/more') }}
        />
        <Stack.Screen
          name="repos"
          options={{ title: 'Repositories', headerLargeTitle: largeTitles, ...webBack('/more') }}
        />
        <Stack.Screen
          name="files/index"
          options={{ title: 'Files', headerLargeTitle: largeTitles, ...webBack('/more') }}
        />
        <Stack.Screen name="files/[...path]" options={{ title: 'File', ...webBack('/files') }} />
      </Stack>
    </GestureRoot>
  );
}
