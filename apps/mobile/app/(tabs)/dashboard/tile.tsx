import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { presentTile } from '../../../src/components/widgets/tile-controllers.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { EmptyState, Screen } from '../../../src/ui/index.js';
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

  const tile = path && content !== null ? presentTile(path, content, now) : undefined;
  return (
    <>
      <Stack.Screen options={{ title: tile ? TILE_META[tile.kind].title : 'Tile' }} />
      <Screen keyboard>
        {path && tile && content !== null ? (
          <Tile path={path} tile={tile} content={content} now={now} onWrite={write} />
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
