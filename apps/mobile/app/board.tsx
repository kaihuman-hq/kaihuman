import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { KanbanBoardController } from '../src/screens/kanban-board.js';
import { KanbanView } from '../src/views/kanban-view.js';

export default function Board() {
  const controller = useMemo(() => new KanbanBoardController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Board' }} />
      <KanbanView controller={controller} />
    </>
  );
}
