import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { WikiScreenController } from '../src/screens/wiki-screen.js';
import { WikiView } from '../src/views/wiki-view.js';

export default function Route() {
  const controller = useMemo(() => new WikiScreenController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Wiki' }} />
      <WikiView controller={controller} />
    </>
  );
}
