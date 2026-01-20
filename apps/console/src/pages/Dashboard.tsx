import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { githubFileStore, githubProfileStore } from '@lifosy/core';
import { MainApp, TileDef } from '@lifosy/ui';
import { FileViewer } from '../components/FileViewer';

export const Dashboard = () => {
  const repo = githubProfileStore.currentRepo.value;
  const repos = githubProfileStore.repos.value;
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;

  // Miller Columns State
  // We store the FULL definition of columns here
  interface Column {
    items: TileDef[];
    activeId: string | null;
  }
  const [columns, setColumns] = useState<Column[]>([]);

  // Remote Dashboard Config State
  const [remoteConfig, setRemoteConfig] = useState<any | null>(null);

  // 1. Fetch Repos on Mount
  useEffect(() => {
    githubProfileStore.fetchRepos();
  }, []);

  // 2. Refresh Tree when Repo changes
  useEffect(() => {
    if (repo) {
      console.log('[Dashboard] Loading tree for', repo.full_name);
      setColumns([]); // Clear columns immediately on repo switch to prevent stale content
      githubFileStore.loadTree();
      setRemoteConfig(null); // Reset config on repo change
    }
  }, [repo?.full_name]);

  // 3. Helper to update local columns state immediately
  const updateLocalTileContent = (path: string, content: string) => {
    setColumns(prev => prev.map(col => ({
      ...col,
      items: col.items.map(item => item.id === path ? { ...item, rawContent: content } : item)
    })));
  };

  // 4. Helper to get children for a given path prefix
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
      const isEvents = item.path.endsWith('.events.csv');
      const isHabit = item.path.endsWith('.habit.csv');

      const tile: TileDef = {
        id: item.path, // Use path as ID for simplicity
        title: item.path.split('/').pop() || item.path,
        type: item.type === 'tree' ? 'FOLDER' : 'FILE',
        content: null // Will be set below
      };

      // Widget Handling Logic
      const isWidget = isTimeTracking || isEvents || isHabit;

      if (item.type === 'tree') {
        tile.content = <div className="p-8 text-nexus-muted">Select a file from this folder.</div>;
      } else if (isWidget) {
        // For widgets, we render FileViewer to ensure content is loaded.
        // MainApp will switch to the actual widget once content is available.
        tile.content = <FileViewer key={item.path} path={item.path} />;
      } else {
        // For non-widgets, show the fallback message
        tile.content = <div className="p-8 text-nexus-muted flex items-center justify-center h-full text-center">
          No widget available for this file extension
        </div>;
      }

      if (isTimeTracking) {
        tile.extension = '.timetracking.csv';
        // Inject content if loaded
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          // Save immediately for widget interactions (Start/Stop)
          // Debouncing might be better but for button clicks immediate is native
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      if (isEvents) {
        tile.extension = '.events.csv';
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      if (isHabit) {
        tile.extension = '.habit.csv';
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      return tile;
    });
  };

  // 4. Update ROOT column when tree OR openFiles changes (to re-render widgets)
  useEffect(() => {
    if (tree.length > 0) {
      setColumns(prev => {
        // If this is the FIRST load:
        if (prev.length === 0) {
          return [{ items: getChildren(""), activeId: null }];
        }

        // If we have previous columns, we want to Refresh the items in them
        // preserving the navigation path.
        return prev.map((col, idx) => {
          let prefix = "";
          if (idx > 0) {
            const parentCol = prev[idx - 1];
            if (parentCol?.activeId) prefix = `${parentCol.activeId}/`;
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

  // 5. DETECT AND MONITOR DASHBOARD CONFIG
  const CONFIG_PATH = '.lifeos/.dashboard.config.json';

  useEffect(() => {
    // Check if config exists in tree
    const configItem = tree.find(item => item.path === CONFIG_PATH);
    if (configItem) {
      console.log('[Dashboard] Found config:', CONFIG_PATH);
      if (!openFiles || !openFiles[CONFIG_PATH]) {
        if (openFiles) // ensure openFiles loaded
          githubFileStore.openFile(CONFIG_PATH);
      } else {
        // Parse it
        try {
          const content = openFiles[CONFIG_PATH].content;
          if (content) { // Ensure content is loaded
            const parsed = JSON.parse(content);
            setRemoteConfig(parsed);
          }
        } catch (e) {
          console.error('[Dashboard] Failed to parse config:', e);
        }
      }
    } else {
      setRemoteConfig(null);
    }
  }, [tree, openFiles && openFiles[CONFIG_PATH]?.content]); // React to tree finding it, or content loading

  // 6. Pre-load files referenced in Config
  useEffect(() => {
    if (remoteConfig && remoteConfig.entries) {
      remoteConfig.entries.forEach((entry: any) => {
        if (openFiles && !openFiles[entry.path]) {
          // Preload
          githubFileStore.openFile(entry.path);
        }
      });
    }
  }, [remoteConfig, openFiles]);

  // 7. Navigation Handler (Miller Mode)
  const handleNavigate = (item: TileDef) => {
    if (item.type === 'FOLDER') {
      // Find which column this item belongs to
      const colIndex = columns.findIndex(col => col.items.some(i => i.id === item.id));
      if (colIndex === -1) return;

      // Slice columns up to this point
      const newColumns = [...columns].slice(0, colIndex + 1);

      // Update active state of current column
      const activeCol = newColumns[colIndex];
      if (activeCol) {
        newColumns[colIndex] = { ...activeCol, items: activeCol.items, activeId: String(item.id) };
      }

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

      // Just focus it
      const newColumns = [...columns].slice(0, colIndex + 1);
      const activeCol = newColumns[colIndex];
      if (activeCol) {
        newColumns[colIndex] = { ...activeCol, items: activeCol.items, activeId: String(item.id) };
      }
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

  // Preapare File Contents Map for Grid Mode
  const gridFileContents: Record<string, string> = {};
  if (remoteConfig && openFiles) {
    Object.keys(openFiles).forEach(path => {
      gridFileContents[path] = openFiles[path]?.content || "";
    });
  }

  return (
    <div className="h-full w-full">
      <MainApp
        // File System Props (Always pass so we can switch to "Files" view)
        fileSystem={{ columns }}
        onItemClick={handleNavigate}
        onNavigate={(path) => { if (path.length === 0) handleDashboardClick(); }}

        // Remote Config Props
        config={remoteConfig || undefined}
        fileContents={gridFileContents}
        onConfigChange={(newConfig) => {
          const content = JSON.stringify(newConfig, null, 2);
          githubFileStore.updateFileContent(CONFIG_PATH, content);
          githubFileStore.saveFile(CONFIG_PATH);
        }}

        // Repo Props
        currentRepository={repo ? { id: String(repo.id), name: repo.full_name, branch: repo.default_branch } : undefined}
        repositories={repos.map(r => ({ id: String(r.id), name: r.full_name, branch: r.default_branch }))}
        onSelectRepository={(r) => {
          const found = repos.find(x => String(x.id) === r.id);
          if (found) githubProfileStore.selectRepo(found);
        }}

        // Grid Mode Editors / Content
        renderFile={useCallback((path: string) => {
          const isWidget = path.endsWith('.timetracking.csv') || path.endsWith('.events.csv') || path.endsWith('.habit.csv') || path.endsWith('.todos.md');
          if (isWidget) return <FileViewer key={path} path={path} />;

          return (
            <div className="p-8 text-nexus-muted flex items-center justify-center h-full text-center">
              No widget available for this file extension
            </div>
          );
        }, [])}
        onFileChange={useCallback((path: string, newContent: string) => {
          githubFileStore.updateFileContent(path, newContent);
          githubFileStore.saveFile(path);
        }, [])}
        renderEditor={useCallback((path: string) => <FileViewer key={path} path={path} />, [])}
      />
    </div>
  );
};

