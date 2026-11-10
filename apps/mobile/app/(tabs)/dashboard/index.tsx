import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type DashboardPage, loadDashboards, takeLatest } from '../../../src/screens/dashboards.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { setLoadedTiles, tileWrite } from '../../../src/screens/loaded-tiles.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../../../src/sync/hooks.js';
import { DashboardPager } from '../../../src/views/dashboard-pager.js';
import { useSignalValue } from '../../../src/views/use-signal.js';

const patchFile =
  (path: string, content: string) =>
  (p: DashboardPage): DashboardPage => ({
    ...p,
    files: p.files.map((f) => (f.path === path ? { path, content } : f)),
  });

export default function Dashboard() {
  const router = useRouter();
  const [pages, setPages] = useState<DashboardPage[]>([]);
  const [defaulted, setDefaulted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  // Pull-to-refresh on every page goes through the sync engine; `rev` re-reads after a sync.
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  useFocusRefresh();
  const [error, setError] = useState<string | null>(null);

  const loadLatest = useMemo(
    () =>
      takeLatest(async () => {
        await githubContentFiles.refresh();
        return loadDashboards(githubContentFiles);
      }),
    [],
  );

  const load = useCallback(async () => {
    const result = await loadLatest();
    if (!result) return;
    setPages(result.pages);
    // The ＋ menu builds its Track entries from these.
    setLoadedTiles(result.pages.flatMap((p) => p.files));
    setDefaulted(result.defaulted);
    setNow(new Date());
  }, [loadLatest]);

  const run = useCallback(async () => {
    try {
      await load();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check your connection and try again.');
    }
  }, [load]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    run().finally(() => setLoading(false));
  }, [run, rev]);

  // A ＋ menu or quick-entry write shows on the tiles without waiting for a sync.
  const written = useSignalValue(tileWrite);
  useEffect(() => {
    if (!written) return;
    setPages((prev) => prev.map(patchFile(written.path, written.content)));
    setNow(new Date());
  }, [written]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <DashboardPager
        pages={pages}
        defaulted={defaulted}
        now={now}
        loading={loading}
        refreshing={refreshing}
        error={error}
        onRefresh={onRefresh}
        onNavigate={(href) => router.push(href as never)}
        onCreateFile={(path, content) => githubContentFiles.create(path, content)}
        onWrite={async (path, content) => {
          await githubContentFiles.write(path, content);
          setPages((prev) => prev.map(patchFile(path, content)));
          setNow(new Date());
        }}
      />
    </>
  );
}
