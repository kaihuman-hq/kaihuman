import { authStore, githubFileStore, githubProfileStore, layoutStore, Logger } from '@lifosy/core';
import { useCallback, useEffect, useMemo } from 'preact/hooks';

const logger = new Logger('Dashboard');

import {
  DEFAULT_CONFIG as DEFAULT_RIL_CONFIG,
  MainApp,
  WikiView, // Added import
  parseReadItLater,
  RepositorySelector,
  serializeReadItLater,
  type TileDef,
} from '@lifosy/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FileViewer } from '../components/FileViewer';

import { VERSION } from '../version';

export const Dashboard = () => {
  /* original repo/repos declarations removed for mock */
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;

  // Miller Columns State
  // We store the FULL definition of columns here
  interface Column {
    items: TileDef[];
    activeId: string | null;
  }
  // --- STORE ACCESS ---
  // --- STORE ACCESS ---
  // Using layoutStore directly for everything
  const columns = layoutStore.columns.value;
  const remoteConfig = layoutStore.remoteConfig.value;

  /* original repo/repos declarations removed for mock */
  const repo = githubProfileStore.currentRepo.value;
  const repos = githubProfileStore.repos.value;

  // 1. Fetch Repos on Mount
  useEffect(() => {
    githubProfileStore.fetchRepos();
  }, []);

  // 2. Refresh Tree when Repo changes
  useEffect(() => {
    if (repo) {
      logger.info(`Loading tree for ${repo.full_name}`);
      githubFileStore.loadTree();
    }
  }, [repo?.full_name]);

  // 3. Load Remote Config
  useEffect(() => {
    // Only run if we have a tree and no config (or repo changed)
    if (!tree || tree.length === 0) return;

    const CONFIG_PATH = '.lifeos/.dashboard.config.json';
    const configItem = tree.find(t => t.path === CONFIG_PATH);

    const loadConfig = async () => {
      logger.info('Checking for remote config...');
      if (configItem) {
        try {
          // Check if already open
          let content = openFiles[CONFIG_PATH]?.content;
          if (!content) {
            const fileData = await githubFileStore.openFile(CONFIG_PATH);
            // fileData in openFile doesn't return, it updates store.
            // We wait for store update or grab from store now?
            // openFile is async, so after await, it should be in openFiles
            content = githubFileStore.openFiles.peek()[CONFIG_PATH]?.content;
          }

          if (content) {
            const parsed = JSON.parse(content);
            logger.info('Config loaded successfully');
            layoutStore.remoteConfig.value = parsed;
            return;
          }
        } catch (e) {
          logger.error('Failed to load config', e);
        }
      }

      // Fallback: Default Config
      logger.info('No config found, using default.');
      const DEFAULT_DASHBOARD_CONFIG = {
        version: 1,
        dashboards: [
          { id: 'default', name: 'Main' }
        ],
        entries: [],
        files: {
          recentlyOpened: []
        }
      };

      layoutStore.remoteConfig.value = DEFAULT_DASHBOARD_CONFIG;
    };

    loadConfig();
  }, [tree.length, repo?.full_name]); // Re-run when tree loads or repo changes

  // Helper to update recent files
  const addToRecentFiles = useCallback((path: string) => {
    const config = layoutStore.remoteConfig.value;
    if (!config) return;

    const recent = config.files?.recentlyOpened || [];
    // Remove if exists, add to front
    const newRecent = [path, ...recent.filter(p => p !== path)].slice(0, 10); // Limit to 10

    // Only update if changed
    if (JSON.stringify(newRecent) !== JSON.stringify(recent)) {
      const newConfig = {
        ...config,
        files: {
          ...config.files,
          recentlyOpened: newRecent
        }
      };

      // 1. Optimistic Update
      layoutStore.remoteConfig.value = newConfig;

      // 2. Persist
      // Debounce this? For now, direct save is safer for correctness.
      const CONFIG_PATH = '.lifeos/.dashboard.config.json';
      const content = JSON.stringify(newConfig, null, 2);
      githubFileStore.updateFileContent(CONFIG_PATH, content);
      githubFileStore.saveFile(CONFIG_PATH);
    }
  }, []);

  // Navigate Handler adapter
  const handleNavigate = useCallback((item: TileDef) => {
    if (item.type === 'FILE') {
      addToRecentFiles(String(item.id));
    }
    layoutStore.navigate(item.id as string);
  }, [addToRecentFiles]);

  // File contents map for grid mode — memoized to avoid object churn on every render
  const gridFileContents = useMemo(() => {
    const result: Record<string, string> = {};
    if (openFiles) {
      for (const path of Object.keys(openFiles)) {
        result[path] = openFiles[path]?.content || '';
      }
    }
    return result;
  }, [openFiles]);



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

  // Blocking Load: Wait for Config
  if (!remoteConfig) {
    return (
      <div className="h-screen flex items-center justify-center text-nexus-muted flex-col gap-4">
        <div className="w-8 h-8 border-2 border-nexus-accent border-t-transparent rounded-full animate-spin"></div>
        <div>Loading Dashboard Configuration...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative overflow-hidden">
      <ErrorBoundary componentName="MainApp">
        <MainApp
          // File System Props
          fileSystem={{ columns }}
          onItemClick={handleNavigate}
          onNavigate={(path) => {
            if (path.length === 0) {
              layoutStore.resetToRoot();
            } else {
              layoutStore.navigate(path.join('/'));
            }
          }}

          // Remote Config Props
          config={remoteConfig || undefined}
          fileContents={gridFileContents}
          onConfigChange={(newConfig) => {
            // 1. Optimistic Update
            layoutStore.remoteConfig.value = newConfig;

            // 2. Persist
            const CONFIG_PATH = '.lifeos/.dashboard.config.json';
            const content = JSON.stringify(newConfig, null, 2);
            githubFileStore.updateFileContent(CONFIG_PATH, content);
            githubFileStore.saveFile(CONFIG_PATH);
          }}

          // Repo Props
          currentRepository={repo ? { id: String(repo.id), name: repo.full_name, branch: repo.default_branch } : undefined}
          repositories={repos.map((r) => ({ id: String(r.id), name: r.full_name, branch: r.default_branch }))}
          onSelectRepository={(r) => {
            const found = repos.find((x) => String(x.id) === r.id);
            if (found) githubProfileStore.selectRepo(found);
          }}

          // Rendering Props
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
              lowerPath.endsWith('.data-collection.csv') ||
              lowerPath.endsWith('.enc');

            if (isWidget) {
              return (
                <ErrorBoundary componentName={`FileViewer (${path})`}>
                  <FileViewer key={path} path={path} />
                </ErrorBoundary>
              );
            }

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
            (path: string, zenMode?: boolean, contentOverride?: string, onSaveOverride?: (val: string) => void) => (
              <ErrorBoundary componentName={`Editor (${path})`}>
                <FileViewer key={path} path={path} zenMode={zenMode} contentOverride={contentOverride} onSaveOverride={onSaveOverride} />
              </ErrorBoundary>
            ),
            [],
          )}

          onAddToReadItLater={async (item) => {
            const rilPath = '.lifeos/.readitlater.json';
            logger.debug('ReadItLater Handler triggered for:', item);
            try {
              let fileExists = githubFileStore.tree.value.some((t) => t.path === rilPath);
              if (fileExists) {
                if (!githubFileStore.openFiles.value[rilPath]) {
                  try {
                    await githubFileStore.openFile(rilPath);
                  } catch (e) {
                    fileExists = false;
                  }
                }
              }

              const file = githubFileStore.openFiles.value[rilPath];
              const content = file?.content || '';

              let config;
              try {
                config = content ? parseReadItLater(content) : DEFAULT_RIL_CONFIG;
                if (!config || !config.items) config = DEFAULT_RIL_CONFIG;
              } catch (e) {
                config = DEFAULT_RIL_CONFIG;
              }

              const isDuplicate = config.items && config.items.some((i) => i.url === item.url);
              if (isDuplicate) return;

              const newItems = [item, ...(config.items || [])];
              const newConfig = { ...config, items: newItems };
              const newContent = serializeReadItLater(newConfig);

              if (fileExists && file) {
                githubFileStore.updateFileContent(rilPath, newContent);
                await githubFileStore.saveFile(rilPath);
              } else {
                try {
                  await githubFileStore.createFile(rilPath, newContent);
                } catch (e: any) {
                  if (e.message && e.message.includes('already exists')) {
                    if (!githubFileStore.openFiles.value[rilPath]) {
                      githubFileStore.openFiles.value = {
                        ...githubFileStore.openFiles.value,
                        [rilPath]: { content: newContent, sha: '' },
                      };
                    }
                    githubFileStore.updateFileContent(rilPath, newContent);
                    await githubFileStore.saveFile(rilPath);
                  }
                }
              }
              // Force UI Update via local cache if needed, but store update should trigger reactivity
            } catch (error) {
              logger.error('Failed to add to ReadItLater:', error);
            }
          }}

          // Handlers
          onCreateFile={useCallback(async (path: string, content: string) => {
            try {
              await githubFileStore.createFile(path, content);
              await githubFileStore.openFile(path);
              addToRecentFiles(path); // Update recent files on create
              layoutStore.navigate(path);
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

          // Data Props
          existingFiles={tree ? tree.map((t) => t.path) : []}
          onLoadFolder={async (path: string) => {
            const prefix = path ? (path.endsWith('/') ? path : `${path}/`) : '';
            return layoutStore.getChildren(prefix);
          }}
          githubToken={authStore.token.value || undefined}
          onCheckPath={async (path: string) => {
            const currentTree = githubFileStore.tree.value;
            if (!currentTree) return null;
            const found = currentTree.find((item) => item.path === path);
            if (found) {
              return found.type === 'tree' ? 'FOLDER' : 'FILE';
            }
            return null;
          }}
          version={VERSION}
        />
      </ErrorBoundary>
    </div>
  );
};
