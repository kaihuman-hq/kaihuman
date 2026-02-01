import { h } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { githubFileStore, githubProfileStore } from '@lifosy/core';
import {
  MainApp,
  TileDef,
  RepositorySelector,
  parseReadItLater,
  serializeReadItLater,
  DEFAULT_CONFIG as DEFAULT_RIL_CONFIG
} from '@lifosy/ui';
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
      const isTimeTracking = item.path.toLowerCase().endsWith('.timetracking.csv');
      const isEvents = item.path.toLowerCase().endsWith('.events.csv');
      const isHabit = item.path.toLowerCase().endsWith('.habit.csv');
      const isTimezones = item.path.toLowerCase().endsWith('.timezones.json');
      const isRss = item.path.toLowerCase().endsWith('.rss.json');
      const isReadItLater = item.path.toLowerCase().endsWith('.readitlater.json');

      const tile: TileDef = {
        id: item.path, // Use path as ID for simplicity
        title: item.path.split('/').pop() || item.path,
        type: item.type === 'tree' ? 'FOLDER' : 'FILE',
        content: null // Will be set below
      };

      // Widget Handling Logic
      const isWidget = isTimeTracking || isEvents || isHabit || isTimezones || isRss || isReadItLater;

      if (item.type === 'tree') {
        tile.content = <div className="p-8 text-nexus-muted">Select a file from this folder.</div>;
      } else if (isWidget) {
        // For widgets, we rely on MainApp to call renderFile() which returns FileViewer
        // setting tile.content explicitly here causes infinite re-renders/loading loops
        tile.content = undefined;
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

      if (isTimezones) {
        tile.extension = '.timezones.json';
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      if (isRss) {
        tile.extension = '.rss.json';
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      if (isReadItLater) {
        tile.extension = '.readitlater.json';
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

  // 0. Welcome Screen / Initial Repo Selection
  if (!repo && repos.length > 0) {
    return (
      <RepositorySelector
        repositories={repos.map(r => ({ ...r, id: String(r.id) }))}
        onSelect={(r) => {
          const found = repos.find(x => String(x.id) === r.id);
          if (found) githubProfileStore.selectRepo(found);
        }}
        isLoading={false}
      />
    );
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
          const lowerPath = path.toLowerCase();
          const isWidget = lowerPath.endsWith('.timetracking.csv') || lowerPath.endsWith('.events.csv') || lowerPath.endsWith('.habit.csv') || lowerPath.endsWith('.todos.md') || lowerPath.endsWith('.timezones.json') || lowerPath.endsWith('.rss.json') || lowerPath.endsWith('.readitlater.json');
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
        onAddToReadItLater={async (item) => {
          const rilPath = '.lifeos/.readitlater.json';
          try {
            // Ensure loaded
            if (!githubFileStore.openFiles.value[rilPath]) {
              await githubFileStore.openFile(rilPath);
            }

            const file = githubFileStore.openFiles.value[rilPath];
            const content = file?.content || '';

            let config;
            try {
              config = content ? parseReadItLater(content) : DEFAULT_RIL_CONFIG;
            } catch (e) {
              config = DEFAULT_RIL_CONFIG;
            }

            // Check duplicates
            if (config.items.some(i => i.url === item.url)) return;

            const newConfig = { ...config, items: [item, ...config.items] };
            const newContent = serializeReadItLater(newConfig);

            // Update and Save - calling updateFileContent handles DB update/state update
            githubFileStore.updateFileContent(rilPath, newContent);
            await githubFileStore.saveFile(rilPath);

          } catch (error) {
            console.error('Failed to add to ReadItLater:', error);
          }
        }}
        onCreateFile={useCallback(async (path: string, content: string) => {
          try {
            await githubFileStore.createFile(path, content);

            // Optimistic Update: Manually add to columns
            const parts = path.split('/');
            const fileName = parts.pop() || path;
            const parentPath = parts.join('/'); // "folder" or ""

            setColumns(prev => {
              return prev.map(col => {
                // Determine if this column matches the parent path
                // Simplified check:
                // If parentPath is empty, look for root column
                if (parentPath === "") {
                  const isRoot = col.items.some(i => !String(i.id).includes('/'));
                  if (isRoot || col.items.length === 0) {
                    if (col.items.some(i => i.id === path)) return col;
                    return {
                      ...col,
                      items: [...col.items, {
                        id: path,
                        title: fileName,
                        type: 'FILE' as const,
                        content: <div className="p-8 text-nexus-muted flex items-center justify-center h-full text-center">Loading...</div>
                      }].sort((a, b) => {
                        if (a.type === 'FOLDER' && b.type !== 'FOLDER') return -1;
                        if (a.type !== 'FOLDER' && b.type === 'FOLDER') return 1;
                        return String(a.id).localeCompare(String(b.id));
                      })
                    };
                  }
                } else {
                  // Subfolder
                  const sample = col.items[0];
                  if (sample) {
                    const sampleParent = String(sample.id).split('/').slice(0, -1).join('/');
                    if (sampleParent === parentPath) {
                      if (col.items.some(i => i.id === path)) return col;
                      return {
                        ...col,
                        items: [...col.items, {
                          id: path,
                          title: fileName,
                          type: 'FILE' as const,
                          content: <div className="p-8 text-nexus-muted flex items-center justify-center h-full text-center">Loading...</div>
                        }].sort((a, b) => a.title.localeCompare(b.title))
                      };
                    }
                  }
                }
                return col;
              });
            });

            await githubFileStore.loadTree();
            await githubFileStore.openFile(path);
          } catch (e) {
            console.error('Failed to create file:', e);
          }
        }, [])}
        existingFiles={tree ? tree.map(t => t.path) : []}
        onLoadFolder={async (path: string) => {
          const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : '';
          return getChildren(prefix);
        }}
      />
    </div>
  );
};

