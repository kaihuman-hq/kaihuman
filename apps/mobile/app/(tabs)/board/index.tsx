import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { KanbanBoardController } from '../../../src/screens/kanban-board.js';
import { useTheme } from '../../../src/theme/theme.js';
import { Icon } from '../../../src/ui/index.js';
import { KanbanView } from '../../../src/views/kanban-view.js';

export default function Board() {
  const controller = useMemo(() => new KanbanBoardController(), []);
  const router = useRouter();
  const { platform, colors } = useTheme();
  const add = () => router.push('/quick-todo');
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Board',
          // iOS puts the create action in the navigation bar; Android gets the FAB inside the view.
          headerRight:
            platform === 'ios'
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add todo"
                    hitSlop={12}
                    onPress={add}
                  >
                    <Icon name="add" size={22} color={colors.accent} />
                  </Pressable>
                )
              : undefined,
        }}
      />
      <KanbanView controller={controller} onAddTodo={platform === 'ios' ? undefined : add} />
    </>
  );
}
