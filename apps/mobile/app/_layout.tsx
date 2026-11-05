import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { bootstrap, startAppLinkHandling } from '../src/runtime/bootstrap.js';
import { colors, typography } from '../src/theme/tokens.js';

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => bootstrap(), []);
  useEffect(() => startAppLinkHandling((href) => router.push(href as never)), [router]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.accent,
          headerTitleStyle: { fontFamily: typography.mono },
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}
