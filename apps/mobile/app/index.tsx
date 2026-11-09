import { authStore, githubProfileStore } from '@kaihuman/core';
import { Redirect } from 'expo-router';
import { resolveStartRoute } from '../src/navigation/start-route.js';
import { tokenHydrated } from '../src/runtime/token-sync.js';
import { useSignalValue } from '../src/views/use-signal.js';

export default function Index() {
  const token = useSignalValue(authStore.token);
  const repo = useSignalValue(githubProfileStore.currentRepo);
  // Until the Keychain answers, an empty token means "unknown", not "signed out": show the splash.
  if (!useSignalValue(tokenHydrated)) return null;
  return <Redirect href={resolveStartRoute({ token, repo })} />;
}
