import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { githubFileStore, githubProfileStore } from '@lifosy/core';
import { MainApp, TileDef } from '@lifosy/ui';
import { FileViewer } from '../components/FileViewer';

export const Dashboard = () => {
  const repo = githubProfileStore.currentRepo.value;

  // Use local signal for formatted tiles to avoid re-calc on every render
  // unless tree changes
  const tiles = useSignal<TileDef[]>([]);

  useEffect(() => {
    if (repo) {
      console.log('[Dashboard] Loading tree for', repo.full_name);
      githubFileStore.loadTree();
    }
  }, [repo?.full_name]);

  // Reactively map tree to tiles
  const tree = githubFileStore.tree.value;
  useEffect(() => {
    if (tree.length === 0) return;

    // Filter for root files/folders (no '/' in path)
    // Or maybe show top level folders as 'Folder' tiles?
    // For now, let's just show root items.
    const rootItems = tree.filter(item => !item.path.includes('/'));

    // Sort: Folders first, then files
    rootItems.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });

    const mappedTiles: TileDef[] = rootItems.map((item, index) => ({
      id: item.sha, // or item.path? item.path is more readable for ID if unique
      title: item.path,
      content: item.type === 'blob'
        ? <FileViewer path={item.path} />
        : <div className="p-8 text-nexus-muted">Folder View Not Implemented</div>
    }));

    console.log('[Dashboard] Mapped tiles:', mappedTiles.length);
    tiles.value = mappedTiles;

  }, [tree]);

  if (!repo) {
    return (
      <div className="h-screen flex items-center justify-center text-nexus-muted">
        Please select a repository.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {tiles.value.length > 0 ? (
        <MainApp tiles={tiles.value} />
      ) : (
        <div className="flex h-screen items-center justify-center text-nexus-muted">
          {githubFileStore.isLoading.value ? "Loading files..." : "No files in root directory."}
        </div>
      )}
    </div>
  );
};

