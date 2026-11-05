import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { tileKindForPath } from '../src/components/widgets/tile-controllers.js';
import { githubContentFiles } from '../src/screens/file-editor-screen.js';
import { DashboardView, type TileFile } from '../src/views/dashboard-view.js';

export default function Dashboard() {
  const router = useRouter();
  const [tiles, setTiles] = useState<TileFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    await githubContentFiles.refresh();
    const paths = githubContentFiles
      .tree()
      .filter((i) => i.type !== 'tree' && tileKindForPath(i.path))
      .map((i) => i.path)
      .sort();
    const files = await Promise.all(
      paths.map(async (path): Promise<TileFile | null> => {
        try {
          return { path, content: await githubContentFiles.read(path) };
        } catch {
          return null;
        }
      }),
    );
    setTiles(files.filter((f): f is TileFile => f !== null));
    setNow(new Date());
  }, []);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <DashboardView
        tiles={tiles}
        now={now}
        loading={loading}
        onNavigate={(href) => router.push(href)}
        onWrite={async (path, content) => {
          await githubContentFiles.write(path, content);
          setTiles((prev) => prev.map((t) => (t.path === path ? { path, content } : t)));
          setNow(new Date());
        }}
      />
    </>
  );
}
