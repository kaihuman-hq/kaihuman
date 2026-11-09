import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { type DashboardPage, loadDashboards } from '../../../src/screens/dashboards.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../../../src/sync/hooks.js';
import { DashboardPager } from '../../../src/views/dashboard-pager.js';

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

  const load = useCallback(async () => {
    await githubContentFiles.refresh();
    const result = await loadDashboards(githubContentFiles);
    setPages(result.pages);
    setDefaulted(result.defaulted);
    setNow(new Date());
  }, []);

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
        onWrite={async (path, content) => {
          await githubContentFiles.write(path, content);
          const patch = (p: DashboardPage): DashboardPage => ({
            ...p,
            files: p.files.map((f) => (f.path === path ? { path, content } : f)),
          });
          setPages((prev) => prev.map(patch));
          setNow(new Date());
        }}
      />
    </>
  );
}
