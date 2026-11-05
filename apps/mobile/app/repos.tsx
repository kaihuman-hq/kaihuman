import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RepoSelectorController } from '../src/screens/repo-selector-screen.js';
import { RepoSelectorView } from '../src/views/repo-selector-view.js';

export default function Repos() {
  const router = useRouter();
  const controller = useMemo(() => new RepoSelectorController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Repositories' }} />
      <RepoSelectorView controller={controller} onSelected={() => router.back()} />
    </>
  );
}
