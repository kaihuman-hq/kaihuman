import { appFolderFor } from '@kaihuman/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { presentTile } from '../../../src/components/widgets/tile-controllers.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { saveToReadLater } from '../../../src/screens/save-read-later.js';
import { optimisticWrite } from '../../../src/sync/optimistic.js';
import { EmptyState, errorMessage, Icon, InlineError, Screen } from '../../../src/ui/index.js';
import { TILE_META, Tile } from '../../../src/views/tile-view.js';
import { addEntryFor } from '../../../src/views/tiles/add-entry.js';
import { TodosDetailView } from '../../../src/views/todos-detail-view.js';

export default function TileDetail() {
  const { path, add } = useLocalSearchParams<{ path: string; add?: string }>();
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  // What is on screen now, so a rollback restores the text the optimistic write replaced.
  const shown = useRef<string | null>(null);
  shown.current = content;
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  // Opened from a dashboard tile's ＋: the add sheet is up as soon as the file loads.
  const [adding, setAdding] = useState(add === '1');

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
  const shownTile = tile && !(tile instanceof Error) ? tile : undefined;
  const isTodos = shownTile?.kind === 'todos';
  const addTodo = () =>
    router.push(`/dashboard/todo-add?path=${encodeURIComponent(path ?? '')}` as never);
  // One ＋ for every kind that adds entries; todos keep their own full-height add screen.
  const entry = shownTile && content !== null ? addEntryFor(shownTile.kind, content, now) : null;
  const onAdd = isTodos ? addTodo : entry ? () => setAdding(true) : undefined;
  return (
    <>
      <Stack.Screen
        options={{
          title: shownTile ? TILE_META[shownTile.kind].title : 'Tile',
          // Every tile is a view of one file, so the file itself is always one tap away.
          headerRight: path
            ? () => (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open file"
                    testID="tile-open-file"
                    onPress={() => router.push(`/files/${path}` as never)}
                  >
                    <Icon name="document" size={22} />
                  </Pressable>
                  {onAdd ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={entry?.label ?? 'New todo'}
                      testID="tile-add"
                      onPress={onAdd}
                    >
                      <Icon name="add" size={22} />
                    </Pressable>
                  ) : null}
                </View>
              )
            : undefined,
        }}
      />
      <Screen keyboard>
        {path && tile && content !== null ? (
          tile instanceof Error ? (
            <InlineError what="this tile" message={tile.message} />
          ) : tile.kind === 'todos' ? (
            <TodosDetailView path={path} content={content} now={now} onWrite={write} />
          ) : (
            <Tile
              path={path}
              tile={tile}
              content={content}
              now={now}
              onWrite={write}
              onCreateFile={(file, text) => githubContentFiles.create(file, text)}
              onOpenFile={(file) => router.push(`/files/${file}` as never)}
              onSaveReadLater={(draft) =>
                saveToReadLater(
                  githubContentFiles,
                  appFolderFor(githubContentFiles.tree().map((t) => t.path)),
                  draft,
                  new Date(),
                )
              }
              adding={adding}
              onAddingChange={setAdding}
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
