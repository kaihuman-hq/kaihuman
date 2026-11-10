import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { nextDashboardId, saveDashboardEdits } from '../../../src/screens/dashboard-edit.js';
import { type DashboardPage, loadDashboards, takeLatest } from '../../../src/screens/dashboards.js';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../../../src/sync/hooks.js';
import type { DashboardEditor } from '../../../src/views/dashboard-editor.js';
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

  // Edits re-read the config and save through the sync engine's normal write path.
  const editor: DashboardEditor = {
    tree: githubContentFiles
      .tree()
      .filter((i) => i.type !== 'tree')
      .map((i) => i.path),
    onEdit: async (edits) => {
      const fallback = defaulted ? { shown: pages[0]?.files.map((f) => f.path) ?? [] } : undefined;
      await saveDashboardEdits(githubContentFiles, edits, fallback);
      await load();
    },
    onCreateFile: (path, content) => githubContentFiles.create(path, content),
    newDashboardId: () => nextDashboardId(githubContentFiles),
  };

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
        editor={editor}
        onNavigate={(href) => router.push(href as never)}
        onCreateFile={(path, content) => githubContentFiles.create(path, content)}
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
