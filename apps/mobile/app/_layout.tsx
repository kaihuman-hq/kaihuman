// Must load first: the OS can start the app headless to run the background task, which needs
// TaskManager.defineTask to have run at module scope.
import '../src/sync/background.js';
import { authStore, githubProfileStore } from '@kaihuman/core';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { CloseButton } from '../src/navigation/close-button.js';
import { useStackScreenOptions } from '../src/navigation/stack-options.js';
import { guardRedirect } from '../src/navigation/start-route.js';
import { webBackOptions as webBack } from '../src/navigation/web-back-button.js';
import { notificationSettings } from '../src/notifications/index.js';
import { reminderPromptShown, shouldShowReminderPrompt } from '../src/notifications/soft-prompt.js';
import {
  bootstrap,
  setNotificationNavigator,
  startAppLinkHandling,
} from '../src/runtime/bootstrap.js';
import { tokenHydrated } from '../src/runtime/token-sync.js';
import { useTheme } from '../src/theme/theme.js';
import { GestureRoot } from '../src/ui/gesture-root.js';
import { useSignalValue } from '../src/views/use-signal.js';

const QUICK_ROUTES = [
  'quick-todo',
  'quick-note',
  'quick-log',
  'quick-idea',
  'quick-knowledge',
  'quick-inbox',
  // The ＋ menu's one-field Track entry (`?path=`); not a deep link.
  'quick-entry',
];

export default function RootLayout() {
  const router = useRouter();
  const options = useStackScreenOptions();
  const { platform } = useTheme();
  const largeTitles = platform === 'ios' && Platform.OS !== 'web';

  const segment = useSegments()[0];
  const token = useSignalValue(authStore.token);
  const repo = useSignalValue(githubProfileStore.currentRepo);
  const hydrated = useSignalValue(tokenHydrated);
  const remindersOn = useSignalValue(notificationSettings).enabled;
  const reminderPromptPending = shouldShowReminderPrompt({
    shown: reminderPromptShown(),
    enabled: remindersOn,
  });

  // Keychain restore is async, so the session can change after first render; the guard follows it.
  useEffect(() => {
    const to = guardRedirect({ token, repo, reminderPromptPending, hydrated }, segment);
    if (to) router.replace(to);
  }, [token, repo, reminderPromptPending, hydrated, segment, router]);

  useEffect(() => bootstrap(), []);
  useEffect(() => {
    setNotificationNavigator((href) => router.push(href as never));
    return startAppLinkHandling((href) => router.push(href as never));
  }, [router]);

  // Swipeable rows need the gesture root above every navigator.
  return (
    <GestureRoot>
      <StatusBar style="auto" />
      <Stack screenOptions={options}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="reminders" options={{ headerShown: false, gestureEnabled: false }} />
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
          name="search"
          options={{ title: 'Search', headerLargeTitle: largeTitles, ...webBack('/dashboard') }}
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
