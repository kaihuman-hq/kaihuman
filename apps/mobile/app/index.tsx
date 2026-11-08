import { authStore, githubProfileStore } from '@kaihuman/core';
import { Redirect } from 'expo-router';
import { resolveStartRoute } from '../src/navigation/start-route.js';
import { useSignalValue } from '../src/views/use-signal.js';

export default function Index() {
  const token = useSignalValue(authStore.token);
  const repo = useSignalValue(githubProfileStore.currentRepo);
  return <Redirect href={resolveStartRoute({ token, repo })} />;
}
