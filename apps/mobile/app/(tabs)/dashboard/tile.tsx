import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { presentTile } from '../../../src/components/widgets/tile-controllers.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { EmptyState, errorMessage, InlineError, Screen } from '../../../src/ui/index.js';
import { TILE_META, Tile } from '../../../src/views/tile-view.js';

export default function TileDetail() {
  const { path } = useLocalSearchParams<{ path: string }>();
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!path) return;
    githubContentFiles
      .read(path)
      .then((text) => setContent(text))
      .catch(() => setFailed(true));
  }, [path]);

  const write = useCallback(async (file: string, next: string) => {
    await githubContentFiles.write(file, next);
    setContent(next);
    setNow(new Date());
  }, []);

  // A file the controller chokes on shows an inline error instead of closing the app.
  const tile = path && content !== null ? safePresent(path, content, now) : undefined;
  return (
    <>
      <Stack.Screen
        options={{ title: tile && !(tile instanceof Error) ? TILE_META[tile.kind].title : 'Tile' }}
      />
      <Screen keyboard>
        {path && tile && content !== null ? (
          tile instanceof Error ? (
            <InlineError what="this tile" message={tile.message} />
          ) : (
            <Tile path={path} tile={tile} content={content} now={now} onWrite={write} />
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
