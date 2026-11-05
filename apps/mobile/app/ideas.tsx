import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { IdeasScreenController } from '../src/screens/ideas-screen.js';
import { IdeasView } from '../src/views/ideas-view.js';

export default function Route() {
  const controller = useMemo(() => new IdeasScreenController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Ideas' }} />
      <IdeasView controller={controller} />
    </>
  );
}
