import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { githubFileStore, githubProfileStore } from '@lifosy/core';
import { MainApp, TileDef } from '@lifosy/ui';
import { FileViewer } from '../components/FileViewer';

export const Dashboard = () => {
  const repo = githubProfileStore.currentRepo.value;
  const repos = githubProfileStore.repos.value;
  const tree = githubFileStore.tree.value;

  // Miller Columns State
  // We store the FULL definition of columns here
  interface Column {
    items: TileDef[];
    activeId: string | null;
  }
  const [columns, setColumns] = useState<Column[]>([]);

  // 1. Fetch Repos on Mount
  useEffect(() => {
    githubProfileStore.fetchRepos();
  }, []);

  // 2. Refresh Tree when Repo changes
  useEffect(() => {
    if (repo) {
      console.log('[Dashboard] Loading tree for', repo.full_name);
      githubFileStore.loadTree();
    }
  }, [repo?.full_name]);

  // 3. Helper to get children for a given path prefix
  // If prefix is empty, returns root items.
  const getChildren = (prefix: string): TileDef[] => {
    if (!tree) return [];

    // Normalize prefix to match GitHub paths (no leading slash, optional trailing slash handling)
    // Root = ""
    // Sub = "folder/"

    const items = tree.filter(item => {
      if (!prefix) {
        // Root items: no slashes in path
        return !item.path.includes('/');
      }
      // Children: must start with prefix, and have NO extra slashes after the prefix
      return item.path.startsWith(prefix) &&
        item.path.slice(prefix.length).split('/').length === 1 &&
        item.path !== prefix; // Should not include self if listed
    });

    // Sort: Folders first
    items.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });

    return items.map(item => ({
      id: item.path, // Use path as ID for simplicity
      title: item.path.split('/').pop() || item.path,
      type: item.type === 'tree' ? 'FOLDER' : 'FILE',
      content: item.type === 'blob'
        ? <FileViewer path={item.path} />
        : <div className="p-8 text-nexus-muted">Select a file from this folder.</div>
    }));
  };

  // 4. Update ROOT column when tree changes
  useEffect(() => {
    if (tree.length > 0) {
      setColumns([{ items: getChildren(""), activeId: null }]);
    } else {
      setColumns([]);
    }
  }, [tree]);


  // 5. Navigation Handler
  const handleNavigate = (item: TileDef) => {
    if (item.type === 'FOLDER') {
      // Find which column this item belongs to
      const colIndex = columns.findIndex(col => col.items.some(i => i.id === item.id));
      if (colIndex === -1) return;

      // Slice columns up to this point
      const newColumns = [...columns].slice(0, colIndex + 1);

      // Update active state of current column
      newColumns[colIndex] = { ...newColumns[colIndex], activeId: String(item.id) };

      // Find and push children
      const children = getChildren(`${item.id}/`);
      if (children.length > 0) {
        newColumns.push({ items: children, activeId: null });
      }

      setColumns(newColumns);
    } else {
      // It's a file
      const colIndex = columns.findIndex(col => col.items.some(i => i.id === item.id));
      if (colIndex === -1) return;

      // Just focus it (MainApp handles the activeTileId change via onItemClick wrapper if needed, 
      // but here we just update our column state to show it's selected in the list)
      const newColumns = [...columns].slice(0, colIndex + 1);
      newColumns[colIndex] = { ...newColumns[colIndex], activeId: String(item.id) };
      setColumns(newColumns);
    }
  };

  const handleDashboardClick = () => {
    // Reset to root
    setColumns([{ items: getChildren(""), activeId: null }]);
  };


  if (!repo && repos.length === 0) {
    // Loading state or critical error if no repos
    return <div className="h-screen flex items-center justify-center text-nexus-muted">Loading LifeOS...</div>;
  }

  return (
    <div className="h-full w-full">
      <MainApp
        // File System Props
        fileSystem={{ columns }}
        onItemClick={handleNavigate}
        onNavigate={(path) => { if (path.length === 0) handleDashboardClick(); }}

        // Repo Props
        currentRepository={repo ? { id: String(repo.id), name: repo.full_name, branch: repo.default_branch } : undefined}
        repositories={repos.map(r => ({ id: String(r.id), name: r.full_name, branch: r.default_branch }))}
        onSelectRepository={(r) => {
          const found = repos.find(x => String(x.id) === r.id);
          if (found) githubProfileStore.selectRepo(found);
        }}
      />
    </div>
  );
};

