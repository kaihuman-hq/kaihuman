import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { KaihumanShared } from '../../../modules/kaihuman-shared/index.js';
import { searchHeaderRight } from '../../../src/navigation/search-button.js';
import { FocusSessionController } from '../../../src/screens/focus-session.js';
import { KanbanBoardController } from '../../../src/screens/kanban-board.js';
import { todoDetailHref } from '../../../src/screens/todo-detail.js';
import { useTheme } from '../../../src/theme/theme.js';
import { Icon } from '../../../src/ui/index.js';
import { KanbanView } from '../../../src/views/kanban-view.js';

export default function Board() {
  const params = useLocalSearchParams<{
    milestone?: string | string[];
    item?: string | string[];
  }>();
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const milestoneId = first(params.milestone);
  const itemId = first(params.item);
  const controller = useMemo(() => {
    const c = new KanbanBoardController();
    c.pin({ milestoneId, itemId });
    return c;
  }, [milestoneId, itemId]);
  const focus = useMemo(() => new FocusSessionController(KaihumanShared), []);
  const router = useRouter();
  const { platform, colors } = useTheme();
  const add = () => router.push('/quick-todo');
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Board',
          // iOS puts the create action in the navigation bar; Android gets the FAB inside the view.
          headerRight: searchHeaderRight(
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
          ),
        }}
      />
      <KanbanView
        controller={controller}
        focus={focus}
        onOpenTodo={(id) => router.push(todoDetailHref(id))}
        onAddTodo={platform === 'ios' ? undefined : add}
      />
    </>
  );
}
