import { githubProfileStore } from '@kaihuman/core';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RepoSelectorController } from '../src/screens/repo-selector-screen.js';
import { OnboardingView } from '../src/views/onboarding-view.js';

export default function Onboarding() {
  const router = useRouter();
  const controller = useMemo(() => new RepoSelectorController(), []);
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <OnboardingView
        controller={controller}
        onSignOut={() => {
          githubProfileStore.clear();
          router.replace('/login');
        }}
        // replace drops onboarding and login from history, so back never returns to them.
        onDone={() => router.replace('/dashboard')}
      />
    </>
  );
}
