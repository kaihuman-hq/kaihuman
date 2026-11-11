import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { presentTile } from '../../../src/components/widgets/tile-controllers.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { optimisticWrite } from '../../../src/sync/optimistic.js';
import { EmptyState, errorMessage, Icon, InlineError, Screen } from '../../../src/ui/index.js';
import { TILE_META, Tile } from '../../../src/views/tile-view.js';
import { TodosDetailView } from '../../../src/views/todos-detail-view.js';

export default function TileDetail() {
  const { path } = useLocalSearchParams<{ path: string }>();
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  // What is on screen now, so a rollback restores the text the optimistic write replaced.
  const shown = useRef<string | null>(null);
  shown.current = content;
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!path) return;
    githubContentFiles
      .read(path)
      .then((text) => setContent(text))
      .catch(() => setFailed(true));
  }, [path]);

  const write = useCallback(
    (file: string, next: string) =>
      optimisticWrite({
        apply: () => {
          const before = shown.current;
          shown.current = next;
          setContent(next);
          setNow(new Date());
          return before;
        },
        write: () => githubContentFiles.write(file, next),
        rollback: (before) => {
          shown.current = before;
          setContent(before);
        },
      }),
    [],
  );

  // A file the controller chokes on shows an inline error instead of closing the app.
  const tile = path && content !== null ? safePresent(path, content, now) : undefined;
  const isTodos = tile !== undefined && !(tile instanceof Error) && tile.kind === 'todos';
  const addTodo = () =>
    router.push(`/dashboard/todo-add?path=${encodeURIComponent(path ?? '')}` as never);
  return (
    <>
      <Stack.Screen
        options={{
          title: tile && !(tile instanceof Error) ? TILE_META[tile.kind].title : 'Tile',
          headerRight: isTodos
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="New todo"
                  onPress={addTodo}
                >
                  <Icon name="add" size={22} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <Screen keyboard>
        {path && tile && content !== null ? (
          tile instanceof Error ? (
            <InlineError what="this tile" message={tile.message} />
          ) : tile.kind === 'todos' ? (
            <TodosDetailView
              path={path}
              content={content}
              now={now}
              onWrite={write}
              onAdd={addTodo}
            />
          ) : (
            <Tile
              path={path}
              tile={tile}
              content={content}
              now={now}
              onWrite={write}
              onCreateFile={(file, text) => githubContentFiles.create(file, text)}
              onOpenFile={(file) => router.push(`/files/${file}` as never)}
            />
          )
        ) : failed || !path ? (
          <EmptyState
            icon="warning"
            title="Couldn't open this tile"
            message="Check the file still exists."
          />
        ) : null}
      </Screen>
    </>
  );
}

function safePresent(path: string, content: string, now: Date) {
  try {
    return presentTile(path, content, now);
  } catch (e) {
    return new Error(errorMessage(e));
  }
}
