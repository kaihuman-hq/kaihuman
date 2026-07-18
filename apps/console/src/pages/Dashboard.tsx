import { authStore, githubFileStore, githubProfileStore, Logger, layoutStore } from '@lifosy/core';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';

const logger = new Logger('Dashboard');

import {
  DEFAULT_CONFIG as DEFAULT_RIL_CONFIG,
  MainApp,
  parseReadItLater,
  RepositorySelector,
  serializeReadItLater,
  type TileDef,
} from '@lifosy/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FileViewer } from '../components/FileViewer';
import { KBCommandsModal } from '../components/KBCommandsModal';
import { VERSION } from '../version';
import { QUICK_ROUTES } from './ShortcutsPage';

export const Dashboard = () => {
  const [showKBCommands, setShowKBCommands] = useState(false);

  /* original repo/repos declarations removed for mock */
  const tree = githubFileStore.tree.value;
  const openFiles = githubFileStore.openFiles.value;

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
      // Reset config and active dashboard so the loading spinner shows while the
      // new repo's config and files are being fetched.
      layoutStore.remoteConfig.value = null;
      layoutStore.activeDashboardId.value = null;
      githubFileStore.loadTree();
    }
  }, [repo?.full_name]);

  // 3. Load Remote Config and pre-load dashboard files
  useEffect(() => {
    // Only run if we have a tree and no config (or repo changed)
    if (!tree || tree.length === 0) return;

    const loadConfig = async () => {
      // Migrate .lifeos → .kh if needed (idempotent, no-op if already migrated)
      await githubFileStore.migrateAppFolder();

      // Show spinner while reloading
      layoutStore.remoteConfig.value = null;

      logger.info('Checking for remote config...');
      let config: import('@lifosy/core').DashboardConfig | null = null;

      const folder = githubFileStore.appFolder.peek();
      const CONFIG_PATH = `${folder}/.dashboard.config.json`;
      const configItem = githubFileStore.tree.peek().find((t) => t.path === CONFIG_PATH);

      if (configItem) {
        try {
          // Always use peek() to get the freshest openFiles, not the closed-over snapshot
          let content = githubFileStore.openFiles.peek()[CONFIG_PATH]?.content;
          if (!content) {
            await githubFileStore.openFile(CONFIG_PATH);
            content = githubFileStore.openFiles.peek()[CONFIG_PATH]?.content;
          }

          if (content) {
            config = JSON.parse(content);
            logger.info('Config loaded successfully');
          }
        } catch (e) {
          logger.error('Failed to load config', e);
        }
      }

      if (!config) {
        // Fallback: Default Config
        logger.info('No config found, using default.');
        config = {
          version: 1,
          dashboards: [{ id: 'default', name: 'Main' }],
          entries: [],
          files: { recentlyOpened: [] },
        };
      }

      // Rewrite any residual .lifeos/ paths → .kh/ in the config
      // (handles the case where migration ran but config content wasn't updated yet)
      const rewrite = (p: string) => p.replace(/^\.lifeos\//, '.kh/');
      const rewrittenEntries = config.entries.map((e) => ({ ...e, path: rewrite(e.path) }));
      const rewrittenRecent = (config.files?.recentlyOpened ?? []).map(rewrite);
      const rewrittenQuickNotes = (config.files?.quickNotes ?? []).map(rewrite);
      const rewrittenSelected = config.files?.selected
        ? rewrite(config.files.selected)
        : config.files?.selected;
      const rewrittenOpened = (config.files?.opened ?? []).map(rewrite);
      const needsRewrite =
        JSON.stringify(rewrittenEntries) !== JSON.stringify(config.entries) ||
        JSON.stringify(rewrittenRecent) !== JSON.stringify(config.files?.recentlyOpened ?? []);
      if (needsRewrite) {
        logger.info('[Migration] Rewriting .lifeos/ → .kh/ path references in config');
        config = {
          ...config,
          entries: rewrittenEntries,
          files: {
            ...config.files,
            recentlyOpened: rewrittenRecent,
            quickNotes: rewrittenQuickNotes,
            selected: rewrittenSelected,
            opened: rewrittenOpened,
          },
        };
        if (configItem) {
          githubFileStore.updateFileContent(CONFIG_PATH, JSON.stringify(config, null, 2));
          githubFileStore.saveFile(CONFIG_PATH);
        }
      }

      // Validate config entries against the current tree.
      // Remove any references to files that no longer exist.
      const currentTree = githubFileStore.tree.peek();
      const validPaths = new Set(currentTree.map((t) => t.path));
      const cleanEntries = config.entries.filter((e) => validPaths.has(e.path));
      const cleanRecent = (config.files?.recentlyOpened ?? []).filter((p) => validPaths.has(p));

      const hasStale =
        cleanEntries.length !== config.entries.length ||
        cleanRecent.length !== (config.files?.recentlyOpened?.length ?? 0);

      if (hasStale) {
        logger.info(
          `Removed ${config.entries.length - cleanEntries.length} stale dashboard entries and ${(config.files?.recentlyOpened?.length ?? 0) - cleanRecent.length} stale recent files from config`,
        );
        config = {
          ...config,
          entries: cleanEntries,
          files: { ...config.files, recentlyOpened: cleanRecent },
        };
        if (configItem) {
          // Config file exists — update and save it
          githubFileStore.updateFileContent(CONFIG_PATH, JSON.stringify(config, null, 2));
          githubFileStore.saveFile(CONFIG_PATH);
        }
      }

      // Pre-load all files for the default dashboard so tiles render with content
      // immediately when remoteConfig is revealed (no empty-widget flash).
      const defaultDashboardId = config.dashboards?.[0]?.id;
      if (defaultDashboardId) {
        const entries = config.entries.filter(
          (e: { dashboard: string }) => e.dashboard === defaultDashboardId,
        );
        if (entries.length > 0) {
          logger.info(`Pre-loading ${entries.length} dashboard files…`);
          await Promise.allSettled(
            entries.map((e: { path: string }) => githubFileStore.openFile(e.path)),
          );
        }
      }

      layoutStore.remoteConfig.value = config;
    };

    loadConfig();
  }, [tree.length, repo?.full_name]); // Re-run when tree loads or repo changes

  // Helper to update recent files
  const addToRecentFiles = useCallback((path: string) => {
    const config = layoutStore.remoteConfig.value;
    if (!config) return;

    const recent = config.files?.recentlyOpened || [];
    // Remove if exists, add to front
    const newRecent = [path, ...recent.filter((p) => p !== path)].slice(0, 10); // Limit to 10

    // Only update if changed
    if (JSON.stringify(newRecent) !== JSON.stringify(recent)) {
      const newConfig = {
        ...config,
        files: {
          ...config.files,
          recentlyOpened: newRecent,
        },
      };

      // 1. Optimistic Update
      layoutStore.remoteConfig.value = newConfig;

      // 2. Persist
      // Debounce this? For now, direct save is safer for correctness.
      const CONFIG_PATH = `${githubFileStore.appFolder.peek()}/.dashboard.config.json`;
      const content = JSON.stringify(newConfig, null, 2);
      githubFileStore.updateFileContent(CONFIG_PATH, content);
      githubFileStore.saveFile(CONFIG_PATH);
    }
  }, []);

  // Navigate Handler adapter
  const handleNavigate = useCallback(
    (item: TileDef) => {
      if (item.type === 'FILE') {
        addToRecentFiles(String(item.id));
      }
      layoutStore.navigate(item.id as string);
    },
    [addToRecentFiles],
  );

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
        Loading kaihuman...
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
          onBoardClick={() => route('/board')}
          onActionLogClick={() => route('/action-log')}
          onShortcutsClick={() => route('/shortcuts')}
          onKnowledgeClick={() => route('/knowledge')}
          onWikiClick={() => route('/wiki')}
          onCheatsheetClick={() => route('/cheatsheet')}
          onKBCommandsClick={() => setShowKBCommands(true)}
          shortcutItems={QUICK_ROUTES.map((r) => ({ label: r.name, onClick: () => route(r.path) }))}
          // Remote Config Props
          config={remoteConfig || undefined}
          fileContents={gridFileContents}
          onConfigChange={(newConfig) => {
            // Pre-load any files that were just added to the dashboard
            const currentPaths = new Set(
              layoutStore.remoteConfig.value?.entries.map((e) => e.path) ?? [],
            );
            for (const entry of newConfig.entries) {
              if (!currentPaths.has(entry.path) && !githubFileStore.openFiles.peek()[entry.path]) {
                githubFileStore.openFile(entry.path);
              }
            }

            // 1. Optimistic Update
            layoutStore.remoteConfig.value = newConfig;

            // 2. Persist
            const CONFIG_PATH = `${githubFileStore.appFolder.peek()}/.dashboard.config.json`;
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
              lowerPath.endsWith('.stocks.csv') ||
              lowerPath.endsWith('.consumption.csv') ||
              lowerPath.endsWith('.board-overview.json') ||
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
            (
              path: string,
              zenMode?: boolean,
              contentOverride?: string,
              onSaveOverride?: (val: string) => void,
            ) => (
              <ErrorBoundary componentName={`Editor (${path})`}>
                <FileViewer
                  key={path}
                  path={path}
                  zenMode={zenMode}
                  contentOverride={contentOverride}
                  onSaveOverride={onSaveOverride}
                />
              </ErrorBoundary>
            ),
            [],
          )}
          onAddToReadItLater={async (item) => {
            const rilPath = `${githubFileStore.appFolder.peek()}/.readitlater.json`;
            logger.debug('ReadItLater Handler triggered for:', item);
            try {
              let fileExists = githubFileStore.tree.value.some((t) => t.path === rilPath);
              if (fileExists) {
                if (!githubFileStore.openFiles.value[rilPath]) {
                  try {
                    await githubFileStore.openFile(rilPath);
                  } catch (_e) {
                    fileExists = false;
                  }
                }
              }

              const file = githubFileStore.openFiles.value[rilPath];
              const content = file?.content || '';

              let config: ReturnType<typeof parseReadItLater> | undefined;
              try {
                config = content ? parseReadItLater(content) : DEFAULT_RIL_CONFIG;
                if (!config || !config.items) config = DEFAULT_RIL_CONFIG;
              } catch (_e) {
                config = DEFAULT_RIL_CONFIG;
              }

              const isDuplicate = config.items?.some((i) => i.url === item.url);
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
                  if (e.message?.includes('already exists')) {
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
            if (!confirm(`Are you sure you want to delete ${path}?`)) return;

            await githubFileStore.deleteFile(path);

            // Remove the deleted file from the dashboard config immediately
            const current = layoutStore.remoteConfig.value;
            if (!current) return;

            const CONFIG_PATH = `${githubFileStore.appFolder.peek()}/.dashboard.config.json`;
            const newConfig = {
              ...current,
              entries: current.entries.filter((e) => e.path !== path),
              files: {
                ...current.files,
                recentlyOpened: (current.files?.recentlyOpened ?? []).filter((p) => p !== path),
              },
            };

            layoutStore.remoteConfig.value = newConfig;
            githubFileStore.updateFileContent(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
            githubFileStore.saveFile(CONFIG_PATH);
          }, [])}
          onRenameFile={useCallback(async (path: string, newPath: string) => {
            await githubFileStore.renameFile(path, newPath);
          }, [])}
          onRenameFolder={useCallback(async (path: string, newPath: string) => {
            await githubFileStore.renameFolder(path, newPath);
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
      <KBCommandsModal isOpen={showKBCommands} onClose={() => setShowKBCommands(false)} />
    </div>
  );
};
