import { authStore, githubFileStore, githubProfileStore, Logger } from '@lifosy/core';
import { effect, useSignal } from '@preact/signals';
import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

const logger = new Logger('Dashboard');

import {
  DEFAULT_CONFIG as DEFAULT_RIL_CONFIG,
  MainApp,
  parseReadItLater,
  RepositorySelector,
  serializeReadItLater,
  type TileDef,
} from '@lifosy/ui';
import { FileViewer } from '../components/FileViewer';
import { VERSION } from '../version';

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
      logger.info(`Loading tree for ${repo.full_name}`);
      setColumns([]); // Clear columns immediately on repo switch to prevent stale content
      githubFileStore.loadTree();
      setRemoteConfig(null); // Reset config on repo change
    }
  }, [repo?.full_name]);

  // 3. Helper to update local columns state immediately
  const updateLocalTileContent = (path: string, content: string) => {
    setColumns((prev) =>
      prev.map((col) => ({
        ...col,
        items: col.items.map((item) =>
          item.id === path ? { ...item, rawContent: content } : item,
        ),
      })),
    );
  };

  // 4. Helper to get children for a given path prefix
  // If prefix is empty, returns root items.
  const getChildren = (prefix: string): TileDef[] => {
    // ALWAYS read fresh value from store to avoid stale closures in callbacks
    const currentTree = githubFileStore.tree.value;
    if (!currentTree) return [];

    // Normalize prefix to match GitHub paths (no leading slash, optional trailing slash handling)
    // Root = ""
    // Sub = "folder/"

    const items = currentTree.filter((item) => {
      if (!prefix) {
        // Root items: no slashes in path
        return !item.path.includes('/');
      }
      // Children: must start with prefix, and have NO extra slashes after the prefix
      return (
        item.path.startsWith(prefix) &&
        item.path.slice(prefix.length).split('/').length === 1 &&
        item.path !== prefix
      ); // Should not include self if listed
    });

    // Sort: Folders first
    items.sort((a, b) => {
      if (a.type === 'tree' && b.type !== 'tree') return -1;
      if (a.type !== 'tree' && b.type === 'tree') return 1;
      return a.path.localeCompare(b.path);
    });

    return items.map((item) => {
      const isTimeTracking = item.path.toLowerCase().endsWith('.timetracking.csv');
      const isEvents = item.path.toLowerCase().endsWith('.events.csv');
      const isHabit = item.path.toLowerCase().endsWith('.habit.csv');
      const isTimezones = item.path.toLowerCase().endsWith('.timezones.json');
      const isRss = item.path.toLowerCase().endsWith('.rss.json');
      const isReadItLater = item.path.toLowerCase().endsWith('.readitlater.json');

      const isBudget = item.path.toLowerCase().endsWith('.budget.csv');
      const isActionLog = item.path.toLowerCase().endsWith('.actionlog.md');
      const isDataCollection = item.path.toLowerCase().endsWith('.data-collection.csv');

      const tile: TileDef = {
        id: item.path, // Use path as ID for simplicity
        title: item.path.split('/').pop() || item.path,
        type: item.type === 'tree' ? 'FOLDER' : 'FILE',
        content: null, // Will be set below
      };

      // Widget Handling Logic
      const isWidget =
        isTimeTracking ||
        isEvents ||
        isHabit ||
        isTimezones ||
        isRss ||
        isReadItLater ||
        isBudget ||
        isActionLog ||
        isDataCollection;

      if (item.type === 'tree') {
        tile.content = <div className="p-8 text-nexus-muted">Select a file from this folder.</div>;
      } else if (isWidget) {
        // For widgets, we rely on MainApp to call renderFile() which returns FileViewer
        // setting tile.content explicitly here causes infinite re-renders/loading loops
        tile.content = undefined;
      } else {
        // For non-widgets, show the fallback message
        tile.content = (
          <div className="p-8 text-nexus-muted flex items-center justify-center h-full text-center">
            No widget available for this file extension
          </div>
        );
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

      if (isBudget) {
        tile.extension = '.budget.csv';
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      if (isActionLog) {
        tile.extension = '.actionlog.md';
        if (openFiles && openFiles[item.path]) {
          tile.rawContent = openFiles[item.path]?.content;
        }

        tile.onContentChange = (newContent: string) => {
          githubFileStore.updateFileContent(item.path, newContent);
          githubFileStore.saveFile(item.path);
          updateLocalTileContent(item.path, newContent);
        };
      }

      if (isDataCollection) {
        tile.extension = '.data-collection.csv';
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
      setColumns((prev) => {
        // If this is the FIRST load:
        if (prev.length === 0) {
          return [{ items: getChildren(''), activeId: null }];
        }

        // If we have previous columns, we want to Refresh the items in them
        // preserving the navigation path.
        return prev.map((col, idx) => {
          let prefix = '';
          if (idx > 0) {
            const parentCol = prev[idx - 1];
            if (parentCol?.activeId) prefix = `${parentCol.activeId}/`;
            else return col; // Should not happen for deeper cols
          }

          return {
            ...col,
            items: getChildren(prefix),
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
    const configItem = tree.find((item) => item.path === CONFIG_PATH);
    if (configItem) {
      logger.debug(`Found config: ${CONFIG_PATH}`);
      if (!openFiles || !openFiles[CONFIG_PATH]) {
        if (openFiles)
          // ensure openFiles loaded
          githubFileStore.openFile(CONFIG_PATH);
      } else {
        // Parse it
        try {
          const content = openFiles[CONFIG_PATH].content;
          if (content) {
            // Ensure content is loaded
            const parsed = JSON.parse(content);
            setRemoteConfig(parsed);
          }
        } catch (e) {
          logger.error('Failed to parse config:', e);
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

  // 9. Watch for Saved Files to update Config
  useEffect(() => {
    // Watch for successful saves to update recent files
    const dispose = effect(() => {
      const lastSaved = githubFileStore.lastSavedFile.value;

      // Ignore updates to the config file itself to prevent loops
      if (lastSaved && lastSaved !== CONFIG_PATH) {
        // Read current config directly from store to ensure freshness
        const configContent = githubFileStore.openFiles.value[CONFIG_PATH]?.content;

        let newConfig: any = { files: { recentlyOpened: [] } };

        if (configContent) {
          try {
            newConfig = JSON.parse(configContent);
          } catch (e) {
            logger.error('Failed to parse config for recent files update:', e);
            if (configContent.trim().length > 0) return; // Abort if invalid JSON
          }
        }

        const currentRecent = newConfig.files?.recentlyOpened || [];
        // Remove existing occurrence
        const filtered = currentRecent.filter((p: string) => p !== lastSaved);
        // Add to top and limit to 10
        const updatedRecent = [lastSaved, ...filtered].slice(0, 10);

        const updatedConfig = {
          ...newConfig,
          files: {
            ...newConfig.files,
            recentlyOpened: updatedRecent,
          },
        };

        const newContent = JSON.stringify(updatedConfig, null, 2);

        if (newContent !== configContent) {
          logger.debug(`Updating recent files with: ${lastSaved}`);
          githubFileStore.updateFileContent(CONFIG_PATH, newContent);
          githubFileStore.saveFile(CONFIG_PATH);
        }
      }
    });

    return () => dispose();
  }, []);

  // 7. Navigation Helper: Jump to any path
  const navigateToPath = (path: string) => {
    // Reconstruct Columns to Force Navigation to the new file
    const newColumns: Column[] = [];
    const parts = path.split('/'); // e.g. ["folder", "sub", "file.txt"] or ["file.txt"]

    // 1. Root Column
    const rootChildren = getChildren('');

    // Determine active ID for root
    const rootActiveId = (parts.length > 1 ? parts[0] : path) || '';
    const rootHasItem = rootChildren.some((i) => i.id === rootActiveId);

    // If root item doesn't exist (e.g. invalid path), fallback to just root
    if (!rootHasItem) {
      setColumns([{ items: rootChildren, activeId: null }]);
      return;
    }

    newColumns.push({ items: rootChildren, activeId: rootActiveId });

    // 2. Intermediate Columns
    let currentPath = parts[0];
    for (let i = 1; i < parts.length; i++) {
      // Get children of the container (currentPath)
      const children = getChildren(currentPath + '/');

      // Determine active ID for this column
      let activeId = '';
      if (i === parts.length - 1) {
        activeId = path;
      } else {
        activeId = currentPath + '/' + parts[i];
      }

      // Verify existence logic could be added here, but assuming path is valid for now
      newColumns.push({ items: children, activeId });
      currentPath += '/' + parts[i];
    }

    setColumns(newColumns);
  };

  // 8. Navigation Handler (Miller Mode)
  const handleNavigate = (item: TileDef) => {
    // Check if item is already in columns
    const colIndex = columns.findIndex((col) => col.items.some((i) => i.id === item.id));

    if (colIndex === -1) {
      // Item NOT found in current view (e.g. from Recent Files deep link)
      // We attempt to reconstruct the path
      navigateToPath(String(item.id));
      return;
    }

    if (item.type === 'FOLDER') {
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
      // It's a file, just focus it
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
    setColumns([{ items: getChildren(''), activeId: null }]);
  };

  if (!repo && repos.length === 0) {
    // Loading state or critical error if no repos
    return (
      <div className="h-screen flex items-center justify-center text-nexus-muted">
        Loading LifeOS...
      </div>
    );
  }

  // 0. Welcome Screen / Initial Repo Selection
  if (!repo && repos.length > 0) {
    return (
      <RepositorySelector
        repositories={repos.map((r) => ({ ...r, id: String(r.id) }))}
        onSelect={(r) => {
          const found = repos.find((x) => String(x.id) === r.id);
          if (found) githubProfileStore.selectRepo(found);
        }}
        isLoading={false}
      />
    );
  }

  // Preapare File Contents Map for Grid Mode
  const gridFileContents: Record<string, string> = {};
  if (remoteConfig && openFiles) {
    Object.keys(openFiles).forEach((path) => {
      gridFileContents[path] = openFiles[path]?.content || '';
    });
  }

  return (
    <div className="h-full w-full">
      <MainApp
        // File System Props (Always pass so we can switch to "Files" view)
        fileSystem={{ columns }}
        onItemClick={handleNavigate}
        onNavigate={(path) => {
          if (path.length === 0) handleDashboardClick();
        }}
        // Remote Config Props
        config={remoteConfig || undefined}
        fileContents={gridFileContents}
        onConfigChange={(newConfig) => {
          const content = JSON.stringify(newConfig, null, 2);
          githubFileStore.updateFileContent(CONFIG_PATH, content);
          githubFileStore.saveFile(CONFIG_PATH);
        }}
        // Repo Props
        currentRepository={
          repo
            ? { id: String(repo.id), name: repo.full_name, branch: repo.default_branch }
            : undefined
        }
        repositories={repos.map((r) => ({
          id: String(r.id),
          name: r.full_name,
          branch: r.default_branch,
        }))}
        onSelectRepository={(r) => {
          const found = repos.find((x) => String(x.id) === r.id);
          if (found) githubProfileStore.selectRepo(found);
        }}
        // Grid Mode Editors / Content
        renderFile={useCallback((path: string) => {
          const lowerPath = path.toLowerCase();
          const isWidget =
            lowerPath.endsWith('.timetracking.csv') ||
            lowerPath.endsWith('.events.csv') ||
            lowerPath.endsWith('.habit.csv') ||
            lowerPath.endsWith('.todos.md') ||
            lowerPath.endsWith('.timezones.json') ||
            lowerPath.endsWith('.rss.json') ||
            lowerPath.endsWith('.readitlater.json') ||
            lowerPath.endsWith('.budget.csv') ||
            lowerPath.endsWith('.actionlog.md') ||
            lowerPath.endsWith('.data-collection.csv');
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
        renderEditor={useCallback(
          (path: string, zenMode?: boolean) => (
            <FileViewer key={path} path={path} zenMode={zenMode} />
          ),
          [],
        )}
        onAddToReadItLater={async (item) => {
          const rilPath = '.lifeos/.readitlater.json';
          logger.debug('ReadItLater Handler triggered for:', item);
          try {
            // 1. Check existence in Tree (Source of Truth)
            let fileExists = githubFileStore.tree.value.some((t) => t.path === rilPath);
            logger.debug(`File exists in tree? ${fileExists}`);

            // 2. Load Content if it exists
            if (fileExists) {
              if (!githubFileStore.openFiles.value[rilPath]) {
                logger.debug('File not open, attempting to open...');
                try {
                  await githubFileStore.openFile(rilPath);
                  logger.debug('File opened successfully');
                } catch (e) {
                  logger.error('Failed to open existing file', e);
                  fileExists = false; // Fallback to create?
                }
              } else {
                logger.debug('File already open');
              }
            }

            const file = githubFileStore.openFiles.value[rilPath];
            const content = file?.content || '';
            logger.debug(`Current content length: ${content.length}`);

            // 3. Parse Config
            let config;
            try {
              config = content ? parseReadItLater(content) : DEFAULT_RIL_CONFIG;
              if (!config || !config.items) config = DEFAULT_RIL_CONFIG;
            } catch (e) {
              logger.error('Parse error:', e);
              config = DEFAULT_RIL_CONFIG;
            }

            // 4. Update Data
            const isDuplicate = config.items && config.items.some((i) => i.url === item.url);
            if (isDuplicate) {
              logger.info(`Item already exists (Duplicate): ${item.url}`);
              // Force UI update anyway just to be sure visual state matches
              // updateLocalTileContent(rilPath, serializeReadItLater(config));
              return;
            }

            const newItems = [item, ...(config.items || [])];
            const newConfig = { ...config, items: newItems };
            const newContent = serializeReadItLater(newConfig);
            logger.debug(`New config items count: ${newItems.length}`);

            // 5. Persist
            if (fileExists && file) {
              logger.debug('Updating existing file via updateFileContent');
              githubFileStore.updateFileContent(rilPath, newContent);
              await githubFileStore.saveFile(rilPath);
            } else {
              logger.info('Creating new file via createFile');
              try {
                await githubFileStore.createFile(rilPath, newContent);
                logger.info('createFile success');
              } catch (e: any) {
                logger.warn('createFile failed:', e);
                if (e.message && e.message.includes('already exists')) {
                  logger.warn('File actually exists, attempting fallback update.');

                  // Fallback: Ensure it is "open" locally so updateFileContent doesn't bail
                  if (!githubFileStore.openFiles.value[rilPath]) {
                    logger.debug('Fallback: Injecting into openFiles before update');
                    // Manually inject so updateFileContent doesn't bail
                    githubFileStore.openFiles.value = {
                      ...githubFileStore.openFiles.value,
                      [rilPath]: { content: newContent, sha: '' }, // Optimistic
                    };
                  }

                  githubFileStore.updateFileContent(rilPath, newContent);
                  await githubFileStore.saveFile(rilPath);
                } else {
                  throw e;
                }
              }
            }

            // 6. Force UI Update
            logger.debug('Triggering updateLocalTileContent');
            updateLocalTileContent(rilPath, newContent);
          } catch (error) {
            logger.error('CRITICAL failure:', error);
          }
        }}
        onCreateFile={useCallback(async (path: string, content: string) => {
          try {
            await githubFileStore.createFile(path, content);
            await githubFileStore.openFile(path);

            navigateToPath(path);
          } catch (e) {
            logger.error('Failed to create file:', e);
          }
        }, [])}
        onDeleteFile={useCallback(async (path: string) => {
          if (confirm(`Are you sure you want to delete ${path}?`)) {
            await githubFileStore.deleteFile(path);
          }
        }, [])}
        onRenameFile={useCallback(async (path: string, newPath: string) => {
          await githubFileStore.renameFile(path, newPath);
        }, [])}
        onMoveFile={useCallback(async (path: string, newPath: string) => {
          await githubFileStore.renameFile(path, newPath);
        }, [])}
        existingFiles={tree ? tree.map((t) => t.path) : []}
        onLoadFolder={async (path: string) => {
          const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : '';
          return getChildren(prefix);
        }}
        githubToken={authStore.token.value || undefined}
        onCheckPath={async (path: string) => {
          // Check against the full tree
          const currentTree = githubFileStore.tree.value;
          if (!currentTree) return null;

          const found = currentTree.find((item) => item.path === path);
          if (found) {
            return found.type === 'tree' ? 'FOLDER' : 'FILE';
          }

          // Also check if prefix is a folder (for potential folder paths that don't match exactly without slash)
          // Actually tree usually has folders without trailing slash.
          return null;
        }}
        version={VERSION}
      />
    </div>
  );
};
