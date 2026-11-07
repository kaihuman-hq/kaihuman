import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { KnowledgeScreenController } from '../src/screens/knowledge-screen.js';
import { KnowledgeView } from '../src/views/knowledge-view.js';

export default function Route() {
  const controller = useMemo(() => new KnowledgeScreenController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Knowledge' }} />
      <KnowledgeView controller={controller} />
    </>
  );
}
