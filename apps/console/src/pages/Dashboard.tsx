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
  const openFiles = githubFileStore.openFiles.value; // Subscribe to file content updates

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

    return items.map(item => {
      const isTimeTracking = item.path.endsWith('.timetracking.csv');

      const tile: TileDef = {
        id: item.path, // Use path as ID for simplicity
        title: item.path.split('/').pop() || item.path,
        type: item.type === 'tree' ? 'FOLDER' : 'FILE',
        content: item.type === 'blob'
          ? <FileViewer path={item.path} />
          : <div className="p-8 text-nexus-muted">Select a file from this folder.</div>
      };

      if (isTimeTracking) {
        tile.extension = '.timetracking.csv';
        // Inject content if loaded
        if (openFiles[item.path]) {
          tile.rawContent = openFiles[item.path].content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          // Save immediately for widget interactions (Start/Stop)
          // Debouncing might be better but for button clicks immediate is native
          githubFileStore.saveFile(item.path);
        };
      }

      return tile;
    });
  };

  // 4. Update ROOT column when tree OR openFiles changes (to re-render widgets)
  useEffect(() => {
    if (tree.length > 0) {
      setColumns(prev => {
        // Re-calculate the items for the existing columns to update content
        // But wait, setColumns replaces state.
        // If we just want to update content of *visible* columns...
        // Actually simpler to just rebuild the current view structure if we can.
        // But we store 'activeId' in state.

        // If this is the FIRST load:
        if (prev.length === 0) {
          return [{ items: getChildren(""), activeId: null }];
        }

        // If we have previous columns, we want to Refresh the items in them
        // preserving the navigation path.
        return prev.map((col, idx) => {
          // Re-fetch children for this column based on the activeId of the PREVIOUS column?
          // Or we rely on the fact that `col.items` came from a parent.
          // We need to know the 'path' of this column. 
          // Root is ""
          // Next is `col[i-1].activeId`

          let prefix = "";
          if (idx > 0) {
            const parentCol = prev[idx - 1];
            if (parentCol.activeId) prefix = `${parentCol.activeId}/`;
            else return col; // Should not happen for deeper cols
          }

          return {
            ...col,
            items: getChildren(prefix)
          };
        });
      });
    } else {
      setColumns([]);
    }
  }, [tree, openFiles]); // Re-run when content updates

  // 5. Auto-load TimeTracking files when they appear in the tree
  useEffect(() => {
    tree.forEach(item => {
      if (item.path.endsWith('.timetracking.csv')) {
        // If not loaded, load it.
        if (!openFiles[item.path]) {
          // Request load (background)
          // Avoid infinite loop if load fails? openFile handles cache/dedupe?
          // openFile checks "if (this.openFiles.value[path])" but we are reacting to that value.
          // It should be safe as long as openFile is idempotent-ish.
          // Call wrapped in timeout to avoid flicker or react loop issues?
          // console.log('Auto-loading widget:', item.path);
          githubFileStore.openFile(item.path);
        }
      }
    });
  }, [tree]); // Running on tree change is enough. If we run on openFiles we strictly loop.


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

