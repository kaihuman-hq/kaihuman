import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { KanbanBoardController } from '../src/screens/kanban-board.js';
import { TasksView } from '../src/views/tasks-view.js';

export default function Tasks() {
  const controller = useMemo(() => new KanbanBoardController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Tasks' }} />
      <TasksView controller={controller} />
    </>
  );
}
