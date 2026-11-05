import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { TodoAnalyticsController } from '../src/screens/todo-analytics.js';
import { TodoAnalyticsView } from '../src/views/todo-analytics-view.js';

export default function Analytics() {
  const controller = useMemo(() => new TodoAnalyticsController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Analytics' }} />
      <TodoAnalyticsView controller={controller} />
    </>
  );
}
