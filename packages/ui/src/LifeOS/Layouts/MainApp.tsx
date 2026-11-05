import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { githubFileStore, githubProfileStore, Logger, layoutStore } from '@kaihuman/core';
import type { ReadItLaterItem } from '@kaihuman/formats';
import {
  addEventEntry,
  addTodoEntry,
  parseTimezones,
  parseTodos,
  serializeTimezones,
} from '@kaihuman/formats';
import {
  Edit,
  FileText,
  GitCommit,
  History,
  Maximize2,
  Minimize2,
  MoreVertical,
  Move,
  Plus,
  Trash,
  X,
} from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { createPortal, memo } from 'preact/compat';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { EncryptedTileWrapper } from '../Molecules/EncryptedTileWrapper';
import { MillerColumn } from '../Molecules/MillerColumn';
import { Tile } from '../Molecules/Tile';
import { AddToDashboardModal } from '../Organisms/AddToDashboardModal';
// 3.12, 3.11 Views
import { CommitsView } from '../Organisms/CommitsView';
import { DumpView } from '../Organisms/DumpView';
import { Editor } from '../Organisms/Editor';
import { FileHistoryView } from '../Organisms/FileHistoryView';
import { GraphView } from '../Organisms/GraphView';
import { SettingsView } from '../Organisms/SettingsView';
import { StatusBar } from '../Organisms/StatusBar';
import { ActionLogWidget } from '../Organisms/Widgets/ActionLogWidget';
import { BoardOverviewWidget } from '../Organisms/Widgets/BoardOverviewWidget';
import { BookmarkAddForm } from '../Organisms/Widgets/BookmarkAddForm';
import {
  addBookmark,
  collectTags as collectBookmarkTags,
  parseBookmarks,
  serializeBookmarks,
} from '../Organisms/Widgets/BookmarksLogic';
import { BookmarksWidget } from '../Organisms/Widgets/BookmarksWidget';
import { BudgetWidget } from '../Organisms/Widgets/BudgetWidget';
import { CommandPaletteSettingsWidget } from '../Organisms/Widgets/CommandPaletteSettingsWidget';
import { CommandsWidget } from '../Organisms/Widgets/CommandsWidget';
import { ConsumptionWidget } from '../Organisms/Widgets/ConsumptionWidget';
import { CsvTableView } from '../Organisms/Widgets/CsvTableView';
import { DataCollectionAddForm } from '../Organisms/Widgets/DataCollectionAddForm';
import { DataCollectionColumnManager } from '../Organisms/Widgets/DataCollectionColumnManager';
import {
  parseDataCollection,
  serializeDataCollection,
} from '../Organisms/Widgets/DataCollectionLogic';
import { DataCollectionWidget } from '../Organisms/Widgets/DataCollectionWidget';
import { EventAddForm } from '../Organisms/Widgets/EventAddForm';
import { EventsWidget } from '../Organisms/Widgets/EventsWidget';
import { HabitTrackerWidget } from '../Organisms/Widgets/HabitTrackerWidget';
import { PromptsWidget } from '../Organisms/Widgets/PromptsWidget';
import { ReadItLaterWidget } from '../Organisms/Widgets/ReadItLaterWidget';
import { RssFeedManager, RssWidget } from '../Organisms/Widgets/RssWidget';
import { StocksWidget } from '../Organisms/Widgets/StocksWidget';
import { TimeTrackingCharts } from '../Organisms/Widgets/TimeTrackingCharts';
import { TimeTrackingWidget } from '../Organisms/Widgets/TimeTrackingWidget';
import { TimezoneAddForm } from '../Organisms/Widgets/TimezoneAddForm';
import { TimezoneWidget } from '../Organisms/Widgets/TimezoneWidget';
import { TodoAddForm } from '../Organisms/Widgets/TodoAddForm';
import { TodoWidget } from '../Organisms/Widgets/TodoWidget';
import { TravelAddForm } from '../Organisms/Widgets/TravelAddForm';
import { TravelEditForm } from '../Organisms/Widgets/TravelEditForm';
import { TravelWidget } from '../Organisms/Widgets/TravelWidget';
import { AIPanel } from '../Templates/AIPanel';
import type { DashboardConfig, DashboardEntry } from '../types';
import { MainGrid } from './MainGrid';

const logger = new Logger('MainApp');

import { CSS } from '@dnd-kit/utilities';
import type { TileDef as CoreTileDef } from '@kaihuman/core';
import { setupPushNotifications } from '@kaihuman/core';
import { ConflictModal } from '../Organisms/ConflictModal';
import { MoveFileModal } from '../Organisms/MoveFileModal';
import { NewFileWizard } from '../Organisms/NewFileWizard';
import { NotFound } from '../Organisms/NotFound';
import { SearchModal } from '../Organisms/SearchModal';
import { WikiView } from '../Organisms/WikiView';

export interface TileDef extends CoreTileDef {
  /** Component or element to render when this tile is focused */
  content?: ComponentChildren;
}

export interface FileSystemState {
  columns: { items: TileDef[]; activeId: string | null }[];
}

export interface MainAppProps {
  tiles?: TileDef[]; // Legacy/Single-level prop
  config?: DashboardConfig;
  fileContents?: Record<string, string>; // Map path -> content
  onConfigChange?: (newConfig: DashboardConfig) => void;
  fileSystem?: FileSystemState;
  onNavigate?: (path: string[]) => void;
  onItemClick?: (item: TileDef) => void;
  renderFile?: (path: string) => ComponentChildren;
  onFileChange?: (path: string, newContent: string) => void;

  currentRepository?: import('../Organisms/StatusBar').Repository;
  repositories?: import('../Organisms/StatusBar').Repository[];
  onSelectRepository?: (repo: import('../Organisms/StatusBar').Repository) => void;
  /** Client slugs and handler for business capture lines in the palette. */
  businessClients?: string[];
  /** Business is set up: its link joins the default navbar. */
  businessEnabled?: boolean;
  onBusinessCapture?: (capture: import('@kaihuman/formats/business').Capture) => void;

  renderEditor?: (
    path: string,
    zenMode?: boolean,
    contentOverride?: string,
    onSaveOverride?: (val: string) => void,
  ) => ComponentChildren;
  onAddToReadItLater?: (item: ReadItLaterItem) => void;
  onCreateFile?: (path: string, content: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (path: string, newPath: string) => void;
  onRenameFolder?: (path: string, newPath: string) => void;
  onMoveFile?: (path: string, newPath: string) => void;
  existingFiles?: string[];
  onLoadFolder?: (path: string) => Promise<TileDef[]>;
  githubToken?: string;
  onCheckPath?: (path: string) => Promise<'FILE' | 'FOLDER' | null> | 'FILE' | 'FOLDER' | null;

  onBoardClick?: () => void;
  onActionLogClick?: () => void;
  onShortcutsClick?: () => void;
  onKnowledgeClick?: () => void;
  onIdeasClick?: () => void;
  onBusinessClick?: () => void;
  onWikiClick?: () => void;
  onCheatsheetClick?: () => void;
  onKBCommandsClick?: () => void;
  shortcutItems?: import('../Organisms/StatusBar').MenuItem[];

  // Version info
  version?: {
    version: string;
    buildTime: string;
    gitHash?: string;
    full?: string;
  };
}

// Helper to parse URL into state
const parseUrlState = () => {
  if (typeof window === 'undefined')
    return { showFiles: false, activeTileId: null, showNewFileWizard: false };
  const path = window.location.pathname;
  if (path === '/new/save') {
    // Wizard opened while dump mode is active — preserve both flags so that
    // closing the wizard without saving returns to dump mode, not file view.
    return { showFiles: false, activeTileId: null, showNewFileWizard: true, showDumpMode: true };
  }
  if (path === '/files/new') {
    return { showFiles: true, activeTileId: null, showNewFileWizard: true };
  }
  if (path.startsWith('/files/') && path.length > 7) {
    const filePath = decodeURIComponent(path.replace('/files/', ''));
    return { showFiles: true, activeTileId: filePath, showNewFileWizard: false };
  }
  if (path === '/files') {
    return { showFiles: true, activeTileId: null, showNewFileWizard: false, showDumpMode: false };
  }
  if (path === '/new' || path === '/new/') {
    return { showFiles: false, activeTileId: null, showNewFileWizard: false, showDumpMode: true };
  }
  return { showFiles: false, activeTileId: null, showNewFileWizard: false, showDumpMode: false };
};

import { StackedNavigation } from '../Molecules/StackedNavigation';
import { defaultNavbar, NAVBAR_ITEMS } from '../navbar-items';
import type { NavItemId } from '../types';

// Helper hook for mobile detection
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    let timer: ReturnType<typeof setTimeout>;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(check, 100);
    };
    window.addEventListener('resize', debounced);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', debounced);
    };
  }, []);
  return isMobile;
};

export const MainApp = ({
  tiles = [],
  config,
  fileContents = {},
  onConfigChange,
  fileSystem,
  onItemClick,
  onNavigate,
  renderFile,
  onFileChange,
  renderEditor,
  onAddToReadItLater,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onRenameFolder,
  onMoveFile,
  existingFiles,
  onLoadFolder,
  githubToken,
  onCheckPath,
  onBoardClick,
  onActionLogClick,
  onShortcutsClick,
  onKnowledgeClick,
  onIdeasClick,
  onBusinessClick,
  onWikiClick,
  onCheatsheetClick,
  onKBCommandsClick,
  shortcutItems,
  ...props
}: MainAppProps) => {
  const isMobile = useIsMobile();

  // FIX: Reset view when switching repositories
  const prevRepoName = useRef(props.currentRepository?.name);

  useEffect(() => {
    logger.info('[MainApp] Repo Name Changed Check:', {
      prev: prevRepoName.current,
      curr: props.currentRepository?.name,
    });
    // Only reset if repo name ACTUALLY changed (skip on mount)
    if (prevRepoName.current !== props.currentRepository?.name) {
      if (prevRepoName.current) {
        // Only if we had a previous repo (not initial load)
        logger.info('[MainApp] Switching Repo - Resetting View');
        layoutStore.setFocus(null);
        if (layoutStore.view.value === 'FILES') layoutStore.view.value = 'DASHBOARD';
      }
    }
    prevRepoName.current = props.currentRepository?.name;
  }, [props.currentRepository?.name]);

  // THEME MANAGEMENT
  useEffect(() => {
    // 1. Determine effective theme
    // Priority: Config Prop -> LocalStorage -> Default 'nexus'
    // Actually, config prop IS the source of truth if available.
    // Dashboard.tsx loads config. If config has theme, we use it.

    let themeToUse: 'nexus' | 'light' | 'amethyst' = 'nexus';

    if (config?.theme) {
      themeToUse = config.theme;
    } else {
      // Fallback to localStorage if not in config (e.g. first load before config patch)
      // or if config is not yet loaded? config is usually loaded by Dashboard before MainApp.
      try {
        const stored = localStorage.getItem('lifeos-theme');
        if (stored === 'light' || stored === 'amethyst' || stored === 'nexus') {
          themeToUse = stored;
        }
      } catch (_e) {
        // Ignore
      }
    }

    // 2. Apply Theme
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeToUse);
      // Also set on body for safety, or just root (html) as per styles.css [data-theme] selector which usually applies to children if on root.
      // My styles.css uses [data-theme="..."] which matches any element with that attribute.
      // If I put it on html, variables cascade.
    }

    // 3. Persist to LocalStorage (Cache)
    try {
      localStorage.setItem('lifeos-theme', themeToUse);
    } catch (_e) {
      // Ignore
    }
  }, [config?.theme]);

  // --- STORE ACCESSORS ---
  const activeTileId = layoutStore.activeTileId.value;
  const showFiles = layoutStore.view.value === 'FILES';

  // LOG RENDER
  // logger.debug('[MainApp] Render', { showFiles, view: layoutStore.view.value, activeTileId, pathname: typeof window !== 'undefined' ? window.location.pathname : 'N/A' });
  const showSettings = layoutStore.view.value === 'SETTINGS';
  const showGraph = layoutStore.view.value === 'GRAPH';
  const showCommits = layoutStore.view.value === 'COMMITS';
  const _activeDashboardId = layoutStore.activeDashboardId.value;
  const currentDashboardId = layoutStore.currentDashboardId.value;
  const userEntries = layoutStore.userEntries.value;
  const zenMode = layoutStore.zenMode.value;
  const showNewFileWizard = layoutStore.showNewFileWizard.value;
  const showDumpMode = layoutStore.showDumpMode.value;
  const fileToMove = layoutStore.fileToMove.value;
  const showAddToDashboard = layoutStore.showAddToDashboard.value;
  const fileToAddToDashboard = layoutStore.fileToAddToDashboard.value;
  // const showSearch = layoutStore.showSearch.value; // Handled separately? No, let's use check

  const dumpContent = layoutStore.dumpContent.value;
  const dumpSaveProps = layoutStore.dumpSaveProps.value;
  const expandedTiles = layoutStore.expandedTiles.value;

  // --- LOCAL STATE (Transient/Component-Specific) ---
  const notFound = layoutStore.notFound.value;
  const [checkingPath, setCheckingPath] = useState(false);
  const dragEnabled = layoutStore.dragEnabled.value;
  /* REMOVED COMPONENT_STATE: localConfig, moved to layoutStore.remoteConfig */
  // Original config backup for cancel
  const originalConfig = useRef<DashboardConfig | undefined>(undefined);
  const [focusedViewMode, setFocusedViewMode] = useState<string>('WIDGET');

  // Store current drag id for drag overlay
  const activeId = layoutStore.activeDragId.value;

  // --- SETTERS / ACTIONS ADAPTERS ---
  const setActiveTileId = (id: string | number | null) =>
    layoutStore.setFocus(id ? String(id) : null);

  const setShowFiles = (show: boolean) => {
    if (show) layoutStore.view.value = 'FILES';
    // Fix: Ensure we switch back to DASHBOARD from ANY view (including WIKI) when hiding files
    else layoutStore.view.value = 'DASHBOARD';
  };
  const setShowSettings = (show: boolean) => {
    if (show) layoutStore.view.value = 'SETTINGS';
    else if (layoutStore.view.value === 'SETTINGS') layoutStore.view.value = 'DASHBOARD';
  };
  const setShowGraph = (show: boolean) => {
    if (show) layoutStore.view.value = 'GRAPH';
    else if (layoutStore.view.value === 'GRAPH') layoutStore.view.value = 'DASHBOARD';
  };
  const setShowCommits = (show: boolean) => {
    if (show) layoutStore.view.value = 'COMMITS';
    else if (layoutStore.view.value === 'COMMITS') layoutStore.view.value = 'DASHBOARD';
  };

  const setShowNewFileWizard = (show: boolean) => {
    layoutStore.showNewFileWizard.value = show;
  };
  const setShowDumpMode = (show: boolean) => {
    layoutStore.showDumpMode.value = show;
  };
  const setZenMode = (val: boolean | ((prev: boolean) => boolean)) => {
    if (typeof val === 'function') layoutStore.zenMode.value = !!val(layoutStore.zenMode.value);
    else layoutStore.zenMode.value = !!val;
  };
  const setActiveDashboardId = (id: string | null) => {
    layoutStore.activeDashboardId.value = id;
  };
  const setFileToMove = (path: string | null) => {
    layoutStore.fileToMove.value = path;
  };
  const setDumpContent = (content: string) => {
    layoutStore.dumpContent.value = content;
  };
  const setDumpSaveProps = (props: any) => {
    layoutStore.dumpSaveProps.value = props;
  };

  const setShowAddToDashboard = (show: boolean) => {
    layoutStore.showAddToDashboard.value = show;
  };
  const setFileToAddToDashboard = (path: string | null) => {
    layoutStore.fileToAddToDashboard.value = path;
  };

  const handleQuickNote = async () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const filename = `quicknote-${timestamp}.md`;
    const path = `${githubFileStore.appFolder.peek()}/quicknotes/${filename}`;
    const content = `---
type: generic
created: ${now.toISOString()}
description: A generic markdown document template for general note-taking and documentation.
abbreviations: undefined
---

`;
    if (onCreateFile) await onCreateFile(path, content);
    setShowFiles(true);
    setActiveTileId(path);
    if (showDumpMode) setShowDumpMode(false);
  };
  const setDragEnabled = (enabled: boolean) => {
    layoutStore.dragEnabled.value = enabled;
  };
  const setActiveId = (id: string | number | null) => {
    layoutStore.activeDragId.value = id;
  };
  const setNotFound = (val: boolean) => {
    layoutStore.notFound.value = val;
  };

  const handleToggleDashboard = (dashboardId: string) => {
    if (!fileToAddToDashboard || !config || !onConfigChange) return;

    // Check if already exists in that dashboard
    const exists = config.entries.some(
      (e) => e.path === fileToAddToDashboard && e.dashboard === dashboardId,
    );

    if (exists) {
      // Remove it
      onConfigChange({
        ...config,
        entries: config.entries.filter(
          (e) => !(e.path === fileToAddToDashboard && e.dashboard === dashboardId),
        ),
      });
    } else {
      // Add it
      const newEntry: DashboardEntry = {
        path: fileToAddToDashboard,
        dashboard: dashboardId,
        skipOnMobile: false,
      };

      onConfigChange({
        ...config,
        entries: [...config.entries, newEntry],
      });
    }
    // We intentionally do not close the modal so users can toggle multiple dashboards
  };

  const toggleTileSize = (id: string | number) => {
    layoutStore.toggleExpanded(String(id));
  };

  const handleDumpSave = (content: string) => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const filename = `quicknote-${timestamp}`;

    const targetFolder = `${githubFileStore.appFolder.peek()}/quicknotes`;

    setDumpSaveProps({
      initialContent: content,
      initialFilename: filename,
      initialFolder: targetFolder,
      initialStep: 'LOCATION',
    });
    // Trigger New File Wizard
    setShowNewFileWizard(true);
  };

  // Store original config when entering Drag Mode for cancellation

  // Store current drag id for drag overlay

  // Nav Overlay Hover State
  const [hoverNav, setHoverNav] = useState<'prev' | 'next' | null>(null);

  // ROUTING LOGIC (Feature 3.10.1)
  // Sync State -> URL
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      logger.debug('[MainApp] Skipping initial State -> URL sync to allow URL -> State to win');
      isInitialMount.current = false;
      return;
    }

    let url = '/';
    if (showNewFileWizard && showDumpMode) {
      // Wizard opened from dump mode: encode both flags in the URL so the
      // URL→State round-trip keeps dump mode alive and returns here on close.
      url = '/new/save';
    } else if (showNewFileWizard) {
      url = '/files/new';
    } else if (showDumpMode) {
      url = '/new';
    } else if (activeTileId && typeof activeTileId === 'string') {
      // Split by slash and encode each segment to preserve structure
      const cleanPath = activeTileId
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      url = `/files/${cleanPath}`;
    } else if (showFiles) {
      url = '/files';
    } else {
      url = '/';
    }

    if (window.location.pathname !== url) {
      logger.info(`[MainApp] Syncing State -> URL: ${url}`, { from: window.location.pathname });
      window.history.pushState({}, '', url);
    }
  }, [activeTileId, showFiles, showNewFileWizard, showDumpMode]);

  // Sync URL -> State (Popstate) & Resolve Path (Deep Liking)
  // We need to resolve against fileSystem to know if it's a folder or file
  useEffect(() => {
    const resolvePath = () => {
      const state = parseUrlState();
      // logger.debug('[MainApp] resolvePath', { path: window.location.pathname, state });

      if (state.activeTileId && typeof state.activeTileId === 'string') {
        const path = state.activeTileId;

        // NEW LOGIC: Use onCheckPath if available (Source of Truth)
        if (onCheckPath) {
          // Fix: Prevent redundant checks if we are already viewing this file/folder
          // This prevents unmounting/remounting (and losing state) when fileSystem/props change during edits
          if (activeTileId === path && !notFound) {
            // logger.debug('[MainApp] Skipping onCheckPath - already focused', path);
            return;
          }

          setCheckingPath(true);
          Promise.resolve(onCheckPath(path)).then((type) => {
            setCheckingPath(false);
            if (type === 'FOLDER') {
              logger.info('[MainApp] Path is FOLDER -> Showing Files');
              setShowFiles(true);
              setActiveTileId(null);
              setNotFound(false);
              const parts = path.split('/');
              onNavigate?.(parts);
            } else if (type === 'FILE') {
              logger.info('[MainApp] Path is FILE -> Showing Files & Focus');
              setShowFiles(true);
              setActiveTileId(path);
              setNotFound(false);
              const parts = path.split('/');
              onNavigate?.(parts);
            } else {
              // Check dashboard entries as fallback
              const dashEntry = layoutStore.remoteConfig.value?.entries.find(
                (e) => e.path === path,
              );
              if (dashEntry) {
                logger.info('[MainApp] Path is Dashboard Entry -> Switch Dashboard');
                setActiveTileId(path);
                setShowFiles(false);
                setNotFound(false);
                return;
              }
              logger.warn(`Path not found (via onCheckPath): ${path}`);
              setNotFound(true);
            }
          });
          return;
        }

        // Fallback to existing logic if no onCheckPath logic
        if (fileSystem) {
          // ... (existing fallback logic)
          // Simplistic check: If path exists as a Tile of type FOLDER -> navigate there
          const dashEntry = layoutStore.remoteConfig.value?.entries.find((e) => e.path === path);
          if (dashEntry) {
            setActiveTileId(path);
            setShowFiles(false);
            setNotFound(false);
            return;
          }

          // Priority 2: Check FileSystem
          const allItems = fileSystem.columns.flatMap((c) => c.items);
          const item = allItems.find((i) => i.id === path);

          if (item) {
            if (item.type === 'FOLDER') {
              setShowFiles(true);
              setActiveTileId(null);
              setNotFound(false);
              const parts = path.split('/');
              onNavigate?.(parts);
            } else {
              setActiveTileId(path);
              setShowFiles(true);
              setNotFound(false);
              const parts = path.split('/');
              onNavigate?.(parts);
            }
            return;
          }
          setNotFound(true);
        }
      } else {
        setNotFound(false);
        setActiveTileId(state.activeTileId);

        // This is the critical part for /files
        const currentIsFiles = layoutStore.view.value === 'FILES';
        if (state.showFiles !== currentIsFiles) {
          logger.info(`[MainApp] Resolving State: showFiles=${state.showFiles}`, {
            currentView: layoutStore.view.value,
          });
          setShowFiles(state.showFiles);
        }
        setShowNewFileWizard(!!state.showNewFileWizard);
        setShowDumpMode(!!state.showDumpMode);
      }
    };

    resolvePath();
    window.addEventListener('popstate', resolvePath);
    return () => window.removeEventListener('popstate', resolvePath);
  }, [
    fileSystem,
    onCheckPath,
    onNavigate,
    activeTileId,
    notFound,
    // biome-ignore lint/correctness/useExhaustiveDependencies: signals handle reactivity
    setActiveTileId,
    // biome-ignore lint/correctness/useExhaustiveDependencies: signals handle reactivity
    setNotFound,
    // biome-ignore lint/correctness/useExhaustiveDependencies: signals handle reactivity
    setShowDumpMode,
    // biome-ignore lint/correctness/useExhaustiveDependencies: signals handle reactivity
    setShowFiles,
    // biome-ignore lint/correctness/useExhaustiveDependencies: signals handle reactivity
    setShowNewFileWizard,
  ]); // Re-run when FS loads or props change

  /* REMOVED useEffect syncing config prop to localConfig as we use layoutStore directly */
  // If config prop is provided (e.g. initial load from Dashboard), ensure store matches?
  // Dashboard already syncs store from file. MainApp should just observe store.

  const handleDragStartLogic = () => {
    // Deep copy current config to originalConfig ref for cancel
    const current = layoutStore.remoteConfig.value;
    if (current) originalConfig.current = JSON.parse(JSON.stringify(current));
    setDragEnabled(true);
  };

  const handleDragSave = () => {
    setDragEnabled(false);
    originalConfig.current = undefined;
    // Persist changes - user callback already called during reorder
    const current = layoutStore.remoteConfig.value;
    if (current) onConfigChange?.(current);
  };

  const handleDragCancel = () => {
    if (originalConfig.current) {
      layoutStore.remoteConfig.value = originalConfig.current;
      onConfigChange?.(originalConfig.current);
    }
    setDragEnabled(false);
    originalConfig.current = undefined;
  };

  const handlePrevDashboard = () => {
    const config = layoutStore.remoteConfig.value;
    if (!config || !config.dashboards.length) return;
    const currentIndex = config.dashboards.findIndex((d) => d.id === currentDashboardId);
    // Find prev index, wrap around
    const prevIndex = (currentIndex - 1 + config.dashboards.length) % config.dashboards.length;
    setActiveDashboardId(config.dashboards[prevIndex]?.id || null);
  };

  const handleNextDashboard = () => {
    const config = layoutStore.remoteConfig.value;
    if (!config || !config.dashboards.length) return;
    const currentIndex = config.dashboards.findIndex((d) => d.id === currentDashboardId);
    // Find next index, wrap around
    const nextIndex = (currentIndex + 1) % config.dashboards.length;
    setActiveDashboardId(config.dashboards[nextIndex]?.id || null);
  };

  const handleToggleQuickNote = (path: string) => {
    const config = layoutStore.remoteConfig.value;
    if (!config || !onConfigChange) return;
    const currentQuickNotes = config.files?.quickNotes || [];
    let newQuickNotes: string[];
    if (currentQuickNotes.includes(path)) {
      newQuickNotes = currentQuickNotes.filter((p) => p !== path);
    } else {
      newQuickNotes = [...currentQuickNotes, path];
    }
    const newConfig = {
      ...config,
      files: {
        ...(config.files || {}),
        quickNotes: newQuickNotes,
      },
    };
    onConfigChange({ ...newConfig });
  };

  // Read remoteConfig.value here so Preact tracks the subscription — the Set is
  // derived inline so it's always current without a stale useMemo.
  const quickNoteSet = new Set(layoutStore.remoteConfig.value?.files?.quickNotes || []);
  const isQuickNote = useCallback((path: string) => quickNoteSet.has(path), [quickNoteSet]);

  // Filter entries for current dashboard
  // Convert config entries to tiles
  const dashboardTiles = useMemo(() => {
    const config = layoutStore.remoteConfig.value;
    if (!config) return tiles; // Fallback to legacy tiles

    return userEntries.map((entry, _index) => {
      const _extension = entry.path.split('.').slice(1).join('.'); // .events.csv etc. leads to events.csv
      // Better extension extraction:
      let ext = '';
      const lowerPath = entry.path?.toLowerCase() || '';
      if (lowerPath.endsWith('.readitlater.json')) ext = '.readitlater.json';
      else if (lowerPath.endsWith('.timetracking.csv')) ext = '.timetracking.csv';
      else if (lowerPath.endsWith('.events.csv')) ext = '.events.csv';
      else if (lowerPath.endsWith('.habit.csv')) ext = '.habit.csv';
      else if (lowerPath.endsWith('.todos.md')) ext = '.todos.md';
      else if (lowerPath.endsWith('.prompts.md')) ext = '.prompts.md';
      else if (lowerPath.endsWith('.commands.md')) ext = '.commands.md';
      else if (lowerPath.endsWith('.timezones.json')) ext = '.timezones.json';
      else if (lowerPath.endsWith('.rss.json')) ext = '.rss.json';
      else if (lowerPath.endsWith('.data-collection.csv')) ext = '.data-collection.csv';
      else if (lowerPath.endsWith('.budget.csv')) ext = '.budget.csv';
      else if (lowerPath.endsWith('.actionlog.md')) ext = '.actionlog.md';
      else if (lowerPath.endsWith('.stocks.csv')) ext = '.stocks.csv';
      else if (lowerPath.endsWith('.consumption.csv')) ext = '.consumption.csv';
      else if (lowerPath.endsWith('.board-overview.json')) ext = '.board-overview.json';
      else if (lowerPath.endsWith('.bookmarks.json')) ext = '.bookmarks.json';
      else if (lowerPath.endsWith('.travel.json')) ext = '.travel.json';
      else if (lowerPath.endsWith('command-palette.settings.json'))
        ext = 'command-palette.settings.json';
      else {
        const parts = entry.path.split('.');
        if (lowerPath.endsWith('.enc') && parts.length > 2) {
          ext = `.${parts.slice(-2).join('.').toLowerCase()}`; // e.g., .md.enc
        } else {
          ext = parts.length > 1 ? `.${parts.slice(1).join('.').toLowerCase()}` : '';
        }
      }

      return {
        id: entry.path, // Use path as ID
        title: entry.path,
        type: 'FILE',
        extension: ext,
        rawContent: fileContents[entry.path],
        onContentChange: (newContent: string) => {
          onFileChange?.(entry.path, newContent);
        },
        content: renderFile ? renderFile(entry.path) : undefined,
      } as TileDef;
    });
  }, [userEntries, fileContents, tiles, onFileChange, renderFile]);

  const displayTiles = dashboardTiles;

  // Helper to render tile content (Widget vs Default)
  const renderTileContent = (
    tile: TileDef,
    mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED',
  ) => {
    // Encrypted wrapper handling
    if (tile.id.toString().endsWith('.enc')) {
      // Create a duplicate tile without .enc for the inner widget's extension matching
      const innerExt = tile.extension?.replace('.enc', '');
      const innerTile = { ...tile, extension: innerExt };

      return (
        <EncryptedTileWrapper
          tile={tile}
          mode={mode}
          onUnlocked={() => {
            // Unlocked callback (state is internally managed)
          }}
        >
          {(decryptedContent: string, handleSave: (newDecryptedContent: string) => void) => {
            const tempTile = {
              ...innerTile,
              rawContent: decryptedContent,
              onContentChange: handleSave,
            };
            return renderRawTileContent(tempTile, mode);
          }}
        </EncryptedTileWrapper>
      );
    }

    return renderRawTileContent(tile, mode);
  };

  const renderRawTileContent = (
    tile: TileDef,
    mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED',
  ) => {
    if (tile.extension === '.timetracking.csv' && tile.rawContent) {
      return (
        <TimeTrackingWidget
          content={tile.rawContent}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
          mode={mode as any}
        />
      );
    }
    if (tile.extension === '.events.csv' && tile.rawContent) {
      return <EventsWidget content={tile.rawContent} mode={mode as any} />;
    }
    if (tile.extension === '.habit.csv' && tile.rawContent) {
      return (
        <HabitTrackerWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.todos.md' && tile.rawContent) {
      return (
        <TodoWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
          onOpenAdd={() => {
            setFocusedViewMode('ADD');
            setActiveTileId(tile.id);
          }}
        />
      );
    }
    if (tile.extension === '.timezones.json' && tile.rawContent) {
      return (
        <TimezoneWidget
          content={tile.rawContent}
          mode={mode as any}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension?.toLowerCase() === '.rss.json' && tile.rawContent) {
      return (
        <RssWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
          onReadItLater={(item) => {
            const newItem: ReadItLaterItem = {
              id: crypto.randomUUID(),
              url: item.link,
              status: 'new',
              name: item.title,
              tags: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            if (onAddToReadItLater && newItem) {
              logger.debug(
                `RssWidget onReadItLater triggered. Calling onAddToReadItLater prop... ${newItem.name}`,
              );
              onAddToReadItLater(newItem);
            } else {
              logger.error('onAddToReadItLater prop is UNDEFINED');
            }
          }}
        />
      );
    }
    if (tile.extension?.toLowerCase() === '.bookmarks.json' && tile.rawContent) {
      return (
        <BookmarksWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension?.toLowerCase() === '.travel.json') {
      // Empty file is valid: parseTravel turns it into an empty doc.
      return <TravelWidget content={tile.rawContent ?? ''} mode={mode} />;
    }
    if (tile.extension?.toLowerCase() === '.readitlater.json' && tile.rawContent) {
      return (
        <ReadItLaterWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.data-collection.csv' && tile.rawContent) {
      return (
        <DataCollectionWidget
          content={tile.rawContent}
          mode={mode as any}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.budget.csv' && tile.rawContent) {
      return (
        <BudgetWidget
          content={tile.rawContent}
          mode={
            mode === 'FOCUS'
              ? 'FOCUS'
              : mode === 'MOBILE_EXPANDED'
                ? 'MOBILE_EXPANDED'
                : mode === 'MOBILE_COLLAPSED'
                  ? 'MOBILE_COLLAPSED'
                  : 'SMALL'
          }
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.actionlog.md' && tile.rawContent) {
      return (
        <ActionLogWidget
          content={tile.rawContent}
          mode={
            mode === 'FOCUS'
              ? 'FOCUS'
              : mode === 'MOBILE_EXPANDED'
                ? 'MOBILE_EXPANDED'
                : mode === 'MOBILE_COLLAPSED'
                  ? 'MOBILE_COLLAPSED'
                  : 'SMALL'
          }
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }

    if (tile.extension === '.prompts.md' && tile.rawContent) {
      return (
        <PromptsWidget
          content={tile.rawContent}
          mode={
            mode === 'FOCUS'
              ? 'FOCUS'
              : mode === 'MOBILE_EXPANDED'
                ? 'MOBILE_EXPANDED'
                : mode === 'MOBILE_COLLAPSED'
                  ? 'MOBILE_COLLAPSED'
                  : 'SMALL'
          }
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }

    if (tile.extension === 'command-palette.settings.json' && tile.rawContent) {
      return (
        <CommandPaletteSettingsWidget
          content={tile.rawContent}
          mode={
            mode === 'MOBILE_EXPANDED'
              ? 'MOBILE_EXPANDED'
              : mode === 'MOBILE_COLLAPSED'
                ? 'MOBILE_COLLAPSED'
                : 'SMALL'
          }
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }

    if (tile.extension === '.commands.md' && tile.rawContent) {
      return (
        <CommandsWidget
          content={tile.rawContent}
          mode={
            mode === 'FOCUS'
              ? 'FOCUS'
              : mode === 'MOBILE_EXPANDED'
                ? 'MOBILE_EXPANDED'
                : mode === 'MOBILE_COLLAPSED'
                  ? 'MOBILE_COLLAPSED'
                  : 'SMALL'
          }
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }

    if (tile.extension === '.stocks.csv' && tile.rawContent) {
      return (
        <StocksWidget
          content={tile.rawContent}
          mode="SMALL"
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.consumption.csv' && tile.rawContent) {
      return (
        <ConsumptionWidget
          content={tile.rawContent}
          mode="SMALL"
          onChange={(newContent) => tile.onContentChange?.(newContent)}
          onOpenAdd={() => {
            setFocusedViewMode('ADD');
            setActiveTileId(tile.id);
          }}
        />
      );
    }

    if (tile.extension === '.board-overview.json') {
      return (
        <BoardOverviewWidget
          content={tile.rawContent ?? '{}'}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
          onNavigate={onBoardClick}
        />
      );
    }

    // Fix 1.25: If mode is FOCUS and we have no content for a file, prefer renderEditor over renderFile
    // renderEditor typically triggers a data fetch, whereas renderFile might be a static preview or lightweight view.
    // This ensures that deep-linked widgets (which start with no content) trigger a load.
    if (mode === 'FOCUS' && renderEditor && tile.type === 'FILE' && !tile.content) {
      return renderEditor(String(tile.id), false, tile.rawContent, tile.onContentChange);
    }

    if (
      tile.type === 'FILE' &&
      renderEditor &&
      tile.rawContent !== undefined &&
      tile.extension?.match(/\.(md|txt|json|csv|enc)$/)
    ) {
      // If we have actual rawContent (e.g. from decryption), FORCE the use of renderEditor so it consumes it
      return renderEditor(String(tile.id), mode === 'FOCUS', tile.rawContent, tile.onContentChange);
    }

    return (
      tile.content || (renderFile && tile.type === 'FILE' ? renderFile(String(tile.id)) : undefined)
    );
  };

  // If fileSystem is provided, we use the Miller Column Layout (or Stack on Mobile)
  // Override: If showFiles is true, we force Miller Mode if fileSystem exists
  // If localConfig exists AND !showFiles, we use Grid Mode (isMillerMode = false)
  // If localConfig missing, we default to Miller Mode if fileSystem exists
  const isMillerMode = !!fileSystem && (showFiles || !layoutStore.remoteConfig.value);

  // Constants
  const lastActiveTile = useRef<TileDef | null>(null);

  // Available folders for new file wizard (derived from dashboard config)
  const availableFolders = useMemo(() => {
    const config = layoutStore.remoteConfig.value;
    if (!config) return [];
    const folders = new Set<string>();
    config.entries.forEach((entry) => {
      const parts = entry.path.split('/');
      if (parts.length > 1) {
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath += (i > 0 ? '/' : '') + parts[i];
          folders.add(currentPath);
        }
      }
    });
    return Array.from(folders).sort();
  }, []);

  // Memoize the base active tile from source to avoid unnecessary re-calculations
  const baseActiveTile = useMemo(() => {
    return activeTileId !== null
      ? isMillerMode
        ? fileSystem?.columns.flatMap((c) => c.items).find((t) => t.id === activeTileId)
        : displayTiles.find((t) => t.id === activeTileId)
      : null;
  }, [activeTileId, isMillerMode, fileSystem, displayTiles]);

  // Fix: Enhance activeTile from fileSystem with content props if missing
  // This ensures 'Files View' behaves exactly like 'Dashboard View' in Focus Mode
  // We use useMemo here to ensure STABLE object identity if content string hasn't changed
  // Fix: Enhance activeTile from fileSystem with content props if missing
  // This ensures 'Files View' behaves exactly like 'Dashboard View' in Focus Mode
  // We use useMemo here to ensure STABLE object identity if content string hasn't changed
  const computedActiveTile = useMemo(() => {
    if (baseActiveTile && isMillerMode) {
      const entryPath = String(baseActiveTile.id);

      // 1. Calculate the CORRECT extension based on the ID (filename)
      let ext = '';
      const lowerPath = entryPath.toLowerCase();
      if (lowerPath.endsWith('.readitlater.json')) ext = '.readitlater.json';
      else if (lowerPath.endsWith('.timetracking.csv')) ext = '.timetracking.csv';
      else if (lowerPath.endsWith('.events.csv')) ext = '.events.csv';
      else if (lowerPath.endsWith('.habit.csv')) ext = '.habit.csv';
      else if (lowerPath.endsWith('.todos.md')) ext = '.todos.md';
      else if (lowerPath.endsWith('.prompts.md')) ext = '.prompts.md';
      else if (lowerPath.endsWith('.commands.md')) ext = '.commands.md';
      else if (lowerPath.endsWith('.timezones.json')) ext = '.timezones.json';
      else if (lowerPath.endsWith('.rss.json')) ext = '.rss.json';
      else if (lowerPath.endsWith('.data-collection.csv')) ext = '.data-collection.csv';
      else if (lowerPath.endsWith('.budget.csv')) ext = '.budget.csv';
      else if (lowerPath.endsWith('.actionlog.md')) ext = '.actionlog.md';
      else if (lowerPath.endsWith('.stocks.csv')) ext = '.stocks.csv';
      else if (lowerPath.endsWith('.consumption.csv')) ext = '.consumption.csv';
      else if (lowerPath.endsWith('.bookmarks.json')) ext = '.bookmarks.json';
      else if (lowerPath.endsWith('.travel.json')) ext = '.travel.json';
      else if (lowerPath.endsWith('command-palette.settings.json'))
        ext = 'command-palette.settings.json';
      else {
        const parts = entryPath.split('.');
        ext = parts.length > 1 ? `.${parts.slice(1).join('.').toLowerCase()}` : '';
      }

      // 2. Determine if we need to update the tile
      const currentContent =
        fileContents[entryPath] !== undefined ? fileContents[entryPath] : baseActiveTile.rawContent;

      // Update if extension mismatch OR content missing OR content changed
      const needsUpdate =
        ext !== baseActiveTile.extension ||
        !baseActiveTile.rawContent ||
        (fileContents[entryPath] !== undefined &&
          fileContents[entryPath] !== baseActiveTile.rawContent);

      if (needsUpdate) {
        return {
          ...baseActiveTile,
          extension: ext,
          rawContent: currentContent,
          onContentChange: (newContent: string) => {
            onFileChange?.(entryPath, newContent);
          },
        };
      }
    }
    return baseActiveTile;
  }, [baseActiveTile, isMillerMode, fileContents, onFileChange]);

  // Persist Active Tile: If we had a tile, but now it's gone, but ID persists -> use old one
  // Check if activeTile is null but we have an ID and a cached tile
  const finalActiveTile =
    computedActiveTile ||
    (activeTileId !== null && lastActiveTile.current && lastActiveTile.current.id === activeTileId
      ? lastActiveTile.current
      : null);

  // Update persisted reference
  useEffect(() => {
    if (finalActiveTile) {
      lastActiveTile.current = finalActiveTile;
    }
  }, [finalActiveTile]);

  // Use finalActiveTile for rendering
  // We need to update the variable name usage below or assign it back to activeTile?
  // Since 'activeTile' is const now, we can't reassign.
  // Let's use 'finalActiveTile' in the render or rename 'activeTile' -> 'resolvedActiveTile' activeTile -> finalActiveTile.
  // Actually, I can just rename the variable in the render section.
  // BUT I need to be careful with the text replacement range.
  // The downstream code uses `activeTile`.
  // I should name my computed result `activeTile` to minimize changes, but I can't because of the `let` vs `const` and scope.
  // Step 1: `let activeTile` was the original.
  // I will output `const resolvedActiveTile = ...` then `const activeTile = resolvedActiveTile ...` logic?
  // No, I'll just name the result `activeTile` and change the intermediate names.

  // Calculate Breadcrumbs Logic
  const breadcrumbs = useMemo(() => {
    if (activeTileId !== null && !isMillerMode) return ['root', 'focus', `tile_${activeTileId}`];

    if (isMillerMode && fileSystem) {
      const path: string[] = ['~'];
      fileSystem.columns.forEach((col) => {
        if (col.activeId) {
          const activeItem = col.items.find((i) => i.id === col.activeId);
          if (activeItem) path.push(String(activeItem.title));
        }
      });
      return path;
    }
    return ['~'];
  }, [activeTileId, isMillerMode, fileSystem]);

  const activeTile = finalActiveTile;

  const handleDashboardClick = () => {
    setActiveTileId(null);
    setShowFiles(false); // Fix: Explicitly exit files view
    if (onNavigate) {
      onNavigate([]); // Signal root navigation to parent
    }
  };

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require movement before drag starts to allow clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (active.id !== over?.id) {
      const config = layoutStore.remoteConfig.value;
      if (!config || !currentDashboardId) return;
      // Find indices
      const oldIndex = userEntries.findIndex((e) => e.path === active.id);
      const newIndex = userEntries.findIndex((e) => e.path === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(userEntries, oldIndex, newIndex);
        const otherEntries = config.entries.filter((e) => e.dashboard !== currentDashboardId);
        const newConfig = { ...config, entries: [...otherEntries, ...newOrder] };
        layoutStore.remoteConfig.value = newConfig;
        onConfigChange?.(newConfig);
      }
    }
  };

  // To allow cross-column drag, use rectSortingStrategy which supports grids
  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  // Swipe Logic
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: any) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: any) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;

    // Fix 1.18: Disable swipe if a tile is focused (activeTileId is not null)
    if (activeTileId !== null) return;

    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      handleNextDashboard();
    }
    if (isRightSwipe) {
      handlePrevDashboard();
    }
  };

  const getResponsiveGridClass = (_count: number) => {
    return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  };

  // Search State
  // const [showSearch, setShowSearch] = useState(false); // REMOVED local state
  const showSearch = layoutStore.showSearch.value;
  const setShowSearch = (val: boolean) => {
    layoutStore.showSearch.value = val;
  };

  // Keyboard Shortcuts (Global)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Search (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation(); // Stop propagation
        layoutStore.showSearch.value = !layoutStore.showSearch.value;
      }
      // Toggle Zen Mode (Ctrl+Shift+Z or Cmd+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setZenMode((prev) => !prev);
      }
    };

    // Use capture phase to ensure we get the event before CodeMirror or other inputs
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: signals handle reactivity
    setZenMode,
  ]);

  // Fix 1.5 & 1.6: Dynamic Theme Color for Mobile Safari and Zen Mode
  useEffect(() => {
    // Get all theme-color meta tags (including those with media queries)
    const metaThemeColors = document.querySelectorAll('meta[name="theme-color"]');
    // Using --los-bg variable value would require getComputedStyle, but we know it maps to #0a0a0f usually.
    // However, to be precise, let's hardcode the dark theme color which seems to be intended.
    const darkThemeColor = '#0a0a0f';

    if (metaThemeColors.length > 0) {
      // Update all existing theme-color meta tags to dark theme
      metaThemeColors.forEach((meta) => {
        meta.setAttribute('content', darkThemeColor);
      });
    } else {
      // Create if missing
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = darkThemeColor;
      document.head.appendChild(meta);
    }
  }, []);

  const showWiki = layoutStore.view.value === 'WIKI';

  // Resolve the configurable desktop navbar: map each enabled item id to its
  // navigation handler, skipping any item whose destination isn't wired up.
  const navHandlers: Partial<Record<NavItemId, () => void>> = {
    dashboard: () => {
      if (dragEnabled) return;
      if (showDumpMode) setShowDumpMode(false);
      handleDashboardClick();
    },
    files: () => {
      if (showDumpMode) setShowDumpMode(false);
      setActiveTileId(null);
      setShowFiles(true);
    },
    board: onBoardClick,
    shortcuts: onShortcutsClick,
    wiki: onWikiClick,
    knowledge: onKnowledgeClick,
    actionLog: onActionLogClick,
    ideas: onIdeasClick,
    business: onBusinessClick,
    graph: () => {
      setShowGraph(true);
      if (showDumpMode) setShowDumpMode(false);
    },
    commits: () => {
      setShowCommits(true);
      if (showDumpMode) setShowDumpMode(false);
    },
  };

  const navbarLinks = (
    layoutStore.remoteConfig.value?.navbar ?? defaultNavbar(props.businessEnabled === true)
  )
    .map((id) => {
      const def = NAVBAR_ITEMS.find((n) => n.id === id);
      const onClick = navHandlers[id];
      if (!def || !onClick) return null;
      return { id, label: def.label, icon: def.icon, onClick };
    })
    .filter((link): link is NonNullable<typeof link> => link !== null);

  return (
    <div
      className="h-screen w-full max-w-[100vw] bg-[var(--los-bg)] overflow-hidden relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {showCommits && (
        <div className="fixed inset-0 z-50 bg-[var(--los-bg)] animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-[var(--los-border)]">
            <div className="flex items-center gap-2">
              <GitCommit className="text-[var(--los-accent)]" size={20} />
              <MonoHeader>REPOSITORY HISTORY</MonoHeader>
            </div>
            <button
              type="button"
              onClick={() => setShowCommits(false)}
              className="p-2 hover:bg-white/10 rounded-sm"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <CommitsView />
          </div>
        </div>
      )}

      {showGraph && (
        <div className="fixed inset-0 z-50 bg-[var(--los-bg)] animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          <div className="absolute top-4 right-4 z-50">
            <button
              type="button"
              onClick={() => setShowGraph(false)}
              className="p-2 bg-[var(--los-bg)] border border-[var(--los-border)] hover:bg-[var(--los-accent)] hover://text-[var(--los-bg)] rounded-sm transition-colors shadow-lg"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <GraphView
              onNavigate={(path) => {
                setShowGraph(false);
                setShowFiles(true);
                setActiveTileId(path);
              }}
            />
          </div>
        </div>
      )}

      {/* Wiki View Overlay */}
      {showWiki && (
        <div className="fixed inset-0 z-50 bg-[var(--los-bg)] animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          <WikiView rootPath={layoutStore.activeWikiRoot.value || ''} />
          <div className="absolute top-3 right-4 z-50">
            <button
              type="button"
              className="p-2 bg-black/50 hover:bg-black/70 rounded text-white backdrop-blur-sm"
              onClick={() => {
                layoutStore.view.value = 'DASHBOARD';
                layoutStore.activeWikiRoot.value = null;
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <ConflictModal />

      {/* Settings Overlay */}
      {showSettings && layoutStore.remoteConfig.value && onConfigChange && (
        <SettingsView
          config={layoutStore.remoteConfig.value}
          onConfigChange={onConfigChange}
          onClose={() => setShowSettings(false)}
          onSetupNotifications={(() => {
            const repo = githubProfileStore.currentRepo.value;
            if (!repo) return undefined;
            return () => setupPushNotifications(repo.owner.login, repo.name);
          })()}
        />
      )}

      {showAddToDashboard && config && (
        <AddToDashboardModal
          isOpen={showAddToDashboard}
          onClose={() => {
            setShowAddToDashboard(false);
            setFileToAddToDashboard(null);
          }}
          dashboards={config.dashboards}
          fileName={fileToAddToDashboard || ''}
          currentDashboards={config.entries
            .filter((e) => e.path === fileToAddToDashboard)
            .map((e) => e.dashboard)}
          onToggleDashboard={handleToggleDashboard}
        />
      )}

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        currentRepository={props.currentRepository?.name}
        githubToken={githubToken}
        repositories={props.repositories || []}
        workspaces={config ? config.dashboards.map((d) => ({ id: d.id, name: d.name })) : []}
        onSelectRepository={(repoId) => {
          const repo = props.repositories?.find((r) => r.id === repoId);
          if (repo && props.onSelectRepository) {
            props.onSelectRepository(repo);
          }
        }}
        onSelectWorkspace={(wsId) => {
          setActiveDashboardId(wsId);
          setShowFiles(false);
        }}
        onNavigateToFiles={() => {
          setShowFiles(true);
          setActiveTileId(null);
        }}
        onCreateNewFile={() => {
          setShowNewFileWizard(true);
        }}
        onOpenShortcuts={onShortcutsClick}
        onOpenActionLog={onActionLogClick}
        onOpenKnowledge={onKnowledgeClick}
        onOpenKBCommands={onKBCommandsClick}
        businessClients={props.businessClients}
        onBusinessCapture={props.onBusinessCapture}
        onSelect={(item) => {
          if (item.type === 'FILE') {
            logger.debug(`Opening file from search: ${item.path}`);
            // Check if it's in userEntries to switch dashboard?
            const entry = layoutStore.remoteConfig.value?.entries.find((e) => e.path === item.path);
            if (entry) {
              // Switch dashboard
              setActiveDashboardId(entry.dashboard);
              setActiveTileId(entry.path);
              setShowFiles(false);
            } else {
              // Open in Files View
              setShowFiles(true);
              if (onItemClick) {
                onItemClick({
                  id: item.path,
                  title: item.name,
                  type: 'FILE',
                  // content... we might not have it yet
                });
              }
              setActiveTileId(item.path);
            }
          }
          setShowSearch(false);
        }}
      />
      {/* CENTER STAGE: The Matrix OR The Active Tile */}
      <MainGrid viewState={zenMode ? 'ZEN' : activeTileId !== null ? 'FOCUS' : 'DASHBOARD'}>
        {/* Not Found State or Loading State */}
        {checkingPath ? (
          <Tile column="center" title="Loading...">
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--los-accent)]"></div>
            </div>
          </Tile>
        ) : notFound ? (
          <Tile column="center" title="404">
            <NotFound
              onGoHome={() => {
                window.history.pushState({}, '', '/');
                setNotFound(false);
                setActiveTileId(null);
                setShowFiles(false);
              }}
            />
          </Tile>
        ) : (
          <Tile
            title={activeTileId !== null ? `FOCUS: ${activeTileId}` : undefined}
            column="center"
          >
            {activeTileId === null ? (
              isMillerMode ? (
                // MILLER COLUMNS LAYOUT (Centered & Max-Width)
                isMobile ? (
                  <StackedNavigation
                    fileSystem={fileSystem as FileSystemState}
                    onNavigate={(path) => onNavigate?.(path)}
                    onItemClick={(item) => {
                      if (onItemClick) onItemClick(item);
                      if (item.type === 'FILE') setActiveTileId(item.id);
                    }}
                    renderTileContent={(tile, mode) => renderTileContent(tile, mode)}
                    onDeleteFile={onDeleteFile}
                    onRenameFile={async (path, newPath) => {
                      if (onRenameFile) await onRenameFile(path, newPath);
                      if (activeTileId === path) setActiveTileId(newPath);
                    }}
                    onRenameFolder={onRenameFolder}
                    onRequestMove={(path) => setFileToMove(path)}
                  />
                ) : (
                  <div className="absolute top-0 left-0 right-0 bottom-14 md:bottom-8 flex flex-row overflow-x-auto mx-auto w-full max-w-screen-2xl">
                    {fileSystem?.columns.map((col, index) => {
                      const isLast = index === fileSystem?.columns.length - 1;
                      return (
                        <MillerColumn
                          // biome-ignore lint/suspicious/noArrayIndexKey: column index is stable
                          key={index}
                          items={col.items.map((t) => ({
                            ...t,
                            content: renderTileContent(t, 'SMALL'),
                          }))}
                          activeId={col.activeId}
                          variant={isLast ? 'GRID' : 'LIST'}
                          onItemClick={(item) => {
                            if (onItemClick) onItemClick(item);
                            if (item.type === 'FILE') setActiveTileId(item.id);
                          }}
                          onDeleteFile={onDeleteFile}
                          onRenameFile={async (path, newPath) => {
                            if (onRenameFile) await onRenameFile(path, newPath);
                            if (activeTileId === path) setActiveTileId(newPath); // Keep active
                          }}
                          onRenameFolder={onRenameFolder}
                          onRequestMove={(path) => setFileToMove(path)}
                          onNewFileClick={() => setShowNewFileWizard(true)}
                          onToggleQuickNote={handleToggleQuickNote}
                          isQuickNote={isQuickNote}
                        />
                      );
                    })}
                  </div>
                )
              ) : (
                // LEGACY SINGLE GRID LAYOUT OR DASHBOARD
                <div
                  className={cn(
                    'absolute top-0 left-0 right-0 bottom-14 md:bottom-8 overflow-y-auto overflow-x-hidden',
                    !layoutStore.remoteConfig.value || showFiles
                      ? 'block'
                      : getResponsiveGridClass(displayTiles.length),
                  )}
                  key="matrix"
                >
                  {layoutStore.remoteConfig.value && !showFiles ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      {
                        (
                          <>
                            <SortableContext
                              items={userEntries.map((e) => e.path)}
                              strategy={rectSortingStrategy}
                            >
                              {
                                (
                                  <div
                                    className={cn(
                                      'grid gap-px bg-[var(--los-bg)] content-start w-full p-4 md:p-0',
                                      'max-w-screen-2xl mx-auto', // Center content
                                      getResponsiveGridClass(displayTiles.length),
                                    )}
                                  >
                                    {displayTiles.map((tile) => (
                                      <SortableTileItem
                                        key={tile.id}
                                        tile={tile}
                                        renderTileContent={renderTileContent}
                                        setActiveTileId={setActiveTileId}
                                        handleDragStart={handleDragStartLogic}
                                        handleDragSave={handleDragSave}
                                        dragEnabled={dragEnabled}
                                        isExpanded={expandedTiles.has(String(tile.id))}
                                        onToggleSize={() => toggleTileSize(tile.id)}
                                        onDeleteFile={onDeleteFile}
                                        onRenameFile={onRenameFile}
                                        onRequestMove={(path: string) => setFileToMove(path)}
                                        isMobile={isMobile}
                                        onToggleQuickNote={handleToggleQuickNote}
                                        isQuickNote={isQuickNote}
                                      />
                                    ))}
                                  </div>
                                ) as any
                              }
                            </SortableContext>

                            <DragOverlay dropAnimation={dropAnimation}>
                              {
                                (activeId ? (
                                  <div className="bg-[var(--los-bg)] ring-2 ring-[var(--los-accent)] opacity-90 scale-95 w-full h-full pb-[100%]">
                                    <TileContentStructure
                                      tile={displayTiles.find((t) => t.id === activeId) as TileDef}
                                      renderTileContent={renderTileContent}
                                      onToggleQuickNote={handleToggleQuickNote}
                                      isQuickNote={isQuickNote}
                                    />
                                  </div>
                                ) : null) as any
                              }
                            </DragOverlay>
                          </>
                        ) as any
                      }
                    </DndContext>
                  ) : (
                    displayTiles.map((tile) => (
                      // biome-ignore lint/a11y/noStaticElementInteractions: tile grid click handler
                      // biome-ignore lint/a11y/useKeyWithClickEvents: tile grid click handler
                      <div
                        key={tile.id}
                        onClick={() => setActiveTileId(tile.id)}
                        className="bg-[var(--los-bg)] ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full pb-[100%]"
                      >
                        <TileContentStructure
                          tile={tile}
                          renderTileContent={renderTileContent}
                          onDeleteFile={onDeleteFile}
                          onRenameFile={onRenameFile}
                          onRequestMove={(path: string) => setFileToMove(path)}
                          onToggleQuickNote={handleToggleQuickNote}
                          isQuickNote={isQuickNote}
                        />
                      </div>
                    ))
                  )}
                </div>
              )
            ) : activeTile ? (
              // STATE B: FOCUSED TILE
              <FocusedTileMemo
                tile={activeTile}
                onClose={() => {
                  // Fix 1.35: Navigation Return Flow - Check if tile is in Dashboard
                  // If so, strictly enforce Dashboard View (setShowFiles(false))
                  /* REMOVED: This logic forces Dashboard view even if user came from Files.
                     Preserving existing `showFiles` state (which persists in background) is correct.
                  const isDashboardTile = layoutStore.remoteConfig.value?.entries.some(e => e.path === activeTile!.id);
                  if (isDashboardTile) {
                    setShowFiles(false);
                  }
                  */
                  setActiveTileId(null);
                  setFocusedViewMode('WIDGET');
                }}
                renderEditor={renderEditor}
                zenMode={zenMode}
                onToggleZenMode={() => setZenMode((prev) => !prev)}
                onAddToReadItLater={onAddToReadItLater}
                onCreateFile={onCreateFile}
                initialViewMode={focusedViewMode}
                onAddToDashboard={
                  config
                    ? (path) => {
                        setFileToAddToDashboard(path);
                        setShowAddToDashboard(true);
                      }
                    : undefined
                }
                onBoardClick={onBoardClick}
              />
            ) : (
              // Should not happen, but safe fallback
              <div className="flex items-center justify-center h-full text-red-500">
                Error: Tile not found
                {(() => {
                  setActiveTileId(null);
                  return null;
                })()}
              </div>
            )}
          </Tile>
        )}
      </MainGrid>

      {/* Desktop Navigation Overlays (Fix: JS-based hover state for guaranteed visibility) */}
      {(() => {
        const config = layoutStore.remoteConfig.value;
        const shouldRender =
          !activeTileId &&
          !showFiles &&
          !showWiki &&
          !showGraph &&
          !showCommits &&
          !zenMode &&
          !showDumpMode &&
          config &&
          config.dashboards.length > 1;
        if (config) {
          // logger.debug('[MainApp] Nav Overlay Check:', { activeTileId, dashCount: config.dashboards.length, shouldRender, hoverNav });
        }
        return shouldRender;
      })() && (
        <>
          {/* Left Overlay - Previous */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: nav overlay uses title for accessibility */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: nav overlay uses title for accessibility */}
          <div
            onMouseEnter={() => setHoverNav('prev')}
            onMouseLeave={() => setHoverNav(null)}
            onClick={(e) => {
              e.stopPropagation();
              handlePrevDashboard();
            }}
            title="Previous Workspace"
            className="hidden md:flex absolute top-0 left-0 bottom-8 w-24 z-[50] pointer-events-auto items-center justify-start pl-4 cursor-pointer select-none"
          >
            {/* Visual Container (Gradient & Icon) */}
            <div
              className={cn(
                'absolute inset-0 bg-gradient-to-r from-black/60 to-transparent transition-opacity duration-300',
                hoverNav === 'prev' ? 'opacity-100' : 'opacity-0',
              )}
            />

            <div
              className={cn(
                'relative z-10 text-white transition-all duration-300 transform',
                hoverNav === 'prev' ? 'opacity-100 translate-x-4' : 'opacity-0 translate-x-0',
              )}
            >
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon */}
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
          </div>

          {/* Right Overlay - Next */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: nav overlay uses title for accessibility */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: nav overlay uses title for accessibility */}
          <div
            onMouseEnter={() => setHoverNav('next')}
            onMouseLeave={() => setHoverNav(null)}
            onClick={(e) => {
              e.stopPropagation();
              handleNextDashboard();
            }}
            title="Next Workspace"
            className="hidden md:flex absolute top-0 right-0 bottom-8 w-24 z-[50] pointer-events-auto items-center justify-end pr-4 cursor-pointer select-none"
          >
            {/* Visual Container (Gradient & Icon) */}
            <div
              className={cn(
                'absolute inset-0 bg-gradient-to-l from-black/60 to-transparent transition-opacity duration-300',
                hoverNav === 'next' ? 'opacity-100' : 'opacity-0',
              )}
            />

            <div
              className={cn(
                'relative z-10 text-white transition-all duration-300 transform',
                hoverNav === 'next' ? 'opacity-100 -translate-x-4' : 'opacity-0 translate-x-0',
              )}
            >
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon */}
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </div>
        </>
      )}

      {/* Dump Mode Overlay */}
      {showDumpMode && (
        <div className="fixed inset-0 z-50 bg-[var(--los-bg)] animate-in fade-in zoom-in-95 duration-200 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-[var(--los-border)]">
            <div className="flex items-center gap-2">
              <FileText className="text-[var(--los-accent)]" size={20} />
              <MonoHeader>QUICK DUMP</MonoHeader>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDumpSave(dumpContent)}
                disabled={!dumpContent.trim()}
                className="px-3 py-1.5 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                SAVE
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDumpMode(false);
                  window.history.pushState({}, '', '/');
                }}
                className="p-2 hover:bg-white/10 rounded-sm"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <DumpView content={dumpContent} onChange={setDumpContent} onSave={handleDumpSave} />
          </div>
        </div>
      )}

      {/* New File Wizard Overlay */}
      {showNewFileWizard && (
        <NewFileWizard
          onClose={() => {
            setShowNewFileWizard(false);
            setDumpSaveProps(null); // Reset dump props
          }}
          initialFolder={(() => {
            // Logic to deduce current folder from FileSystem state (columns)
            // If we are in Miller Mode, the last "active" text from previous columns + activeId of last column?
            // Actually, `fileSystem.columns` has the state.
            // If we are viewing a folder in GRID view (last column), that is the target.
            if (fileSystem && fileSystem.columns.length > 0) {
              // Try to find the path of the last column that isn't the file itself?
              // The activeId in column N-1 points to the folder content in column N.
              // So we want the activeId of the *second to last* column to get the folder path of the *last* column?
              // Wait, if we are seeing a GRID in column N, it means column N-1 has an activeId which IS the folder path.
              // If column N is the Grid view (items), then the folder path is the activeId of column N-1.

              const columns = fileSystem.columns;
              // Find the last column that has items (the current view)
              // The folder path is derived from the activeId of the *previous* column.

              // However, we want the current folder we are *looking at*.
              // In MillerColumn logic, the LAST column is the one we are interacting with (Grid or List).
              // Its parent is the activeId of the column before it.

              if (columns.length > 1) {
                const parentCol = columns[columns.length - 2];
                if (parentCol?.activeId) return parentCol.activeId;
              } else {
                // Root column?
                return ''; // Root
              }

              // Fallback: helper?
              // If we have activeTileId (file), use its parent.
              if (activeTileId && typeof activeTileId === 'string') {
                const parts = activeTileId.split('/');
                if (parts.length > 1) {
                  parts.pop();
                  return parts.join('/');
                }
                return '';
              }
            }
            return '';
          })()}
          onCreate={async (path, content) => {
            if (onCreateFile) await onCreateFile(path, content);
            setShowNewFileWizard(false); // Close wizard first
            setDumpSaveProps(null);
            // Auto-open: switch to file view (navigate to folder)
            setShowFiles(true);
            // Focus the tile immediately (simulate click)
            setActiveTileId(path);

            if (showDumpMode) {
              setShowDumpMode(false);
            }
          }}
          {...(dumpSaveProps as any)}
          fileSystem={fileSystem as any}
          availableFolders={availableFolders}
          existingFiles={existingFiles}
          onLoadFolder={onLoadFolder}
        />
      )}

      {/* Move File Modal */}
      {fileToMove && (
        <MoveFileModal
          fileToMove={fileToMove}
          onClose={() => setFileToMove(null)}
          onMove={async (oldPath, newPath) => {
            if (onMoveFile) await onMoveFile(oldPath, newPath);
            if (activeTileId === oldPath) setActiveTileId(newPath);
            setFileToMove(null);
          }}
          fileSystem={fileSystem as any}
          onLoadFolder={onLoadFolder}
        />
      )}

      {/* Sticky Status Bar */}
      {!zenMode && (
        <StatusBar
          mode={
            activeTileId !== null ? 'FOCUS' : showFiles ? 'FILES' : dragEnabled ? 'DND' : 'NORMAL'
          }
          breadcrumbs={breadcrumbs}
          stats={[]}
          onDashboardClick={() => {
            if (dragEnabled) {
              // Show cancellation menu or just cancel?
            } else {
              if (showDumpMode) setShowDumpMode(false);
              handleDashboardClick();
            }
          }}
          onFilesClick={() => {
            if (showDumpMode) setShowDumpMode(false);
            setActiveTileId(null);
            setShowFiles(true);
          }}
          onBoardClick={onBoardClick}
          onShortcutsClick={onShortcutsClick}
          navbar={navbarLinks}
          onSearchClick={() => {
            layoutStore.showSearch.value = true;
          }}
          // Repository Switcher (Always available if props provided)
          currentRepository={props.currentRepository}
          repositories={props.repositories}
          onSelectRepository={props.onSelectRepository}
          // Workspace Switcher (Only if config exists)
          currentWorkspace={
            layoutStore.remoteConfig.value
              ? {
                  id: currentDashboardId || '',
                  name:
                    layoutStore.remoteConfig.value.dashboards?.find(
                      (d) => d.id === currentDashboardId,
                    )?.name || 'Unknown',
                }
              : undefined
          }
          workspaces={
            layoutStore.remoteConfig.value
              ? layoutStore.remoteConfig.value.dashboards.map((d) => ({ id: d.id, name: d.name }))
              : undefined
          }
          onSelectWorkspace={(ws) => {
            if (!dragEnabled && layoutStore.remoteConfig.value) {
              setActiveDashboardId(ws.id);
              setShowFiles(false); // Switch back to dashboard view
              if (showDumpMode) setShowDumpMode(false);
            }
          }}
          onNextWorkspace={
            !dragEnabled && layoutStore.remoteConfig.value
              ? () => {
                  if (showDumpMode) setShowDumpMode(false);
                  handleNextDashboard();
                }
              : undefined
          }
          menuItems={
            dragEnabled
              ? [
                  { label: 'Save Order', onClick: handleDragSave },
                  { label: 'Cancel Reorder', onClick: handleDragCancel },
                ]
              : [
                  ...(layoutStore.remoteConfig.value
                    ? [
                        {
                          label: 'Dashboard',
                          onClick: () => {
                            setShowFiles(false);
                            setActiveTileId(null);
                            if (showDumpMode) setShowDumpMode(false);
                          },
                        },
                      ]
                    : []),
                  {
                    label: 'Files',
                    onClick: () => {
                      setShowFiles(true);
                      setActiveTileId(null);
                      setNotFound(false);
                      if (showDumpMode) setShowDumpMode(false);
                    },
                  },
                  { label: 'New File', onClick: () => setShowNewFileWizard(true) },
                  { label: 'Quick Note', onClick: handleQuickNote },
                  {
                    label: 'Search',
                    // Fix 1.21: Add Search to Magic Menu (works on mobile)
                    onClick: () => setShowSearch(true),
                  },
                  ...(onShortcutsClick ? [{ label: 'Shortcuts', onClick: onShortcutsClick }] : []),
                  ...(onBoardClick ? [{ label: 'Stream', onClick: onBoardClick }] : []),
                  ...(onActionLogClick ? [{ label: 'Action Log', onClick: onActionLogClick }] : []),
                  ...(onKnowledgeClick
                    ? [{ label: 'Knowledge Base', onClick: onKnowledgeClick }]
                    : []),
                  ...(onIdeasClick ? [{ label: 'Ideas', onClick: onIdeasClick }] : []),
                  ...(onBusinessClick ? [{ label: 'Business', onClick: onBusinessClick }] : []),
                  ...(onWikiClick ? [{ label: 'Wiki', onClick: onWikiClick }] : []),
                  ...(onCheatsheetClick
                    ? [{ label: 'Cheatsheet', onClick: onCheatsheetClick }]
                    : []),
                  {
                    label: 'Graph',
                    onClick: () => {
                      setShowGraph(true);
                      if (showDumpMode) setShowDumpMode(false);
                    },
                  },
                  {
                    label: 'Commits',
                    onClick: () => {
                      setShowCommits(true);
                      if (showDumpMode) setShowDumpMode(false);
                    },
                  },
                  // Expanded Menu Items (Repositories, Workspaces)
                  { label: 'Repositories', type: 'REPOS' },
                  { label: 'Workspaces', type: 'WORKSPACES' },
                  {
                    label: 'Settings',
                    onClick: () => {
                      setShowSettings(true);
                      if (showDumpMode) setShowDumpMode(false);
                    },
                  },
                  ...(layoutStore.remoteConfig.value && !showFiles && activeTileId === null
                    ? [{ label: 'Edit Layout', onClick: handleDragStartLogic }]
                    : []),
                ]
          }
          recentFiles={
            !dragEnabled && layoutStore.remoteConfig.value
              ? (layoutStore.remoteConfig.value.files?.recentlyOpened || []).map(
                  (path: string) => ({
                    label: path,
                    onClick: () => {
                      const conf = layoutStore.remoteConfig.value;
                      if (conf) {
                        const entry = conf.entries.find((e) => e.path === path);
                        const isFoundInDashboard = !!entry;

                        if (isFoundInDashboard) {
                          // Scenario 1: File is pinned to a Dashboard
                          setShowFiles(false); // Switch to dashboard view
                          setActiveDashboardId(entry?.dashboard);
                          setActiveTileId(entry?.path);
                          if (showDumpMode) setShowDumpMode(false);
                        } else {
                          // Scenario 2: File is NOT on any dashboard (accessed via File Tree)
                          // We switch to "Files" mode (Miller Columns) and try to navigate to it.
                          logger.debug(
                            `File not found in dashboard, switching to File View: ${path}`,
                          );
                          setShowFiles(true);
                          // Trigger navigation in parent (Dashboard.tsx) to update columns
                          if (onItemClick) {
                            onItemClick({
                              id: path,
                              title: path.split('/').pop() || path,
                              type: 'FILE',
                            });
                          }
                          // Also set active tile locally so it focuses if rendered
                          setActiveTileId(path);
                          if (showDumpMode) setShowDumpMode(false);
                        }
                      }
                    },
                  }),
                )
              : []
          }
          shortcutItems={shortcutItems}
          version={props.version}
        />
      )}

      {/* Local AI Server Panel */}
      <AIPanel />
    </div>
  );
};

const FocusedTileInternal = ({
  tile,
  onClose,
  renderEditor,
  zenMode,
  onToggleZenMode,
  onAddToReadItLater,
  onAddToDashboard,
  onCreateFile,
  onBoardClick,
  initialViewMode = 'WIDGET',
}: {
  tile: TileDef;
  onClose: () => void;
  renderEditor?: (
    path: string,
    zenMode?: boolean,
    contentOverride?: string,
    onSaveOverride?: (val: string) => void,
  ) => ComponentChildren;
  zenMode?: boolean;
  onToggleZenMode?: () => void;
  onAddToReadItLater?: (item: ReadItLaterItem) => void;
  onAddToDashboard?: (path: string) => void;
  onCreateFile?: (path: string, content: string) => Promise<void> | void;
  onBoardClick?: () => void;
  initialViewMode?: string;
}) => {
  if (!tile) return null;

  const isTimeTracking = tile.extension?.toLowerCase() === '.timetracking.csv';
  const isEvents = tile.extension?.toLowerCase() === '.events.csv';
  const isHabit = tile.extension?.toLowerCase() === '.habit.csv';
  const isTodos = tile.extension?.toLowerCase() === '.todos.md';
  const isTimezones = tile.extension?.toLowerCase() === '.timezones.json';
  const isRss = tile.extension?.toLowerCase() === '.rss.json';
  const isReadItLater = tile.extension?.toLowerCase() === '.readitlater.json';
  const isDataCollection = tile.extension === '.data-collection.csv';
  const isBudget = tile.extension === '.budget.csv';
  const isActionLog = tile.extension === '.actionlog.md';
  const isPrompts = tile.extension === '.prompts.md';
  const isCommands = tile.extension === '.commands.md';
  const isPaletteSettings = tile.extension === 'command-palette.settings.json';
  const isStocks = tile.extension === '.stocks.csv';
  const isConsumption = tile.extension === '.consumption.csv';
  const isBoardOverview = tile.extension === '.board-overview.json';
  const isBookmarks = tile.extension?.toLowerCase() === '.bookmarks.json';
  const isTravel = tile.extension?.toLowerCase() === '.travel.json';

  const isGenericCsv =
    tile.extension === '.csv' &&
    !isTimeTracking &&
    !isEvents &&
    !isHabit &&
    !isDataCollection &&
    !isBudget &&
    !isStocks &&
    !isConsumption;
  const isAnyCsv = tile.extension?.toLowerCase()?.replace('.enc', '').endsWith('.csv'); // For enabling TABLE view on all CSVs

  const hasWidget =
    isTimeTracking ||
    isEvents ||
    isHabit ||
    isTodos ||
    isTimezones ||
    isRss ||
    isReadItLater ||
    isDataCollection ||
    isBudget ||
    isActionLog ||
    isPrompts ||
    isCommands ||
    isPaletteSettings ||
    isStocks ||
    isConsumption ||
    isAnyCsv || // && !!tile.rawContent;
    isBoardOverview ||
    isBookmarks ||
    isTravel;

  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is safe, tile is always defined here
  const [viewMode, setViewMode] = useState<string>(
    initialViewMode || (hasWidget ? 'WIDGET' : 'CODE'),
  );
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is safe, tile is always defined here
  const [editTripId, setEditTripId] = useState<string | null>(null);
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is safe, tile is always defined here
  const [showHistory, setShowHistory] = useState(false);

  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is safe, tile is always defined here
  const parsedTodoData = useMemo(() => parseTodos(tile.rawContent || ''), [tile.rawContent]);
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is safe, tile is always defined here
  const todoTags = useMemo(() => {
    const tags = new Set<string>();
    parsedTodoData.items.forEach((item) => {
      item.tags.forEach((t) => {
        tags.add(t);
      });
    });
    return Array.from(tags);
  }, [parsedTodoData]);
  const todoMilestones = parsedTodoData.milestones;

  // Encrypted Wrapper Interception
  // We use a custom __isDecrypted flag on the tile to prevent infinite recursive interception
  if (tile.id.toString().endsWith('.enc') && !(tile as any).__isDecrypted) {
    const innerExt = tile.extension?.replace('.enc', '');
    const innerTile = { ...tile, extension: innerExt };

    return (
      <EncryptedTileWrapper
        tile={tile}
        mode={'FOCUS'}
        onUnlocked={() => {
          // Unlocked callback
        }}
      >
        {(decryptedContent: string, handleSave: (newDecryptedContent: string) => void) => {
          const tempTile = {
            ...innerTile,
            rawContent: decryptedContent,
            onContentChange: handleSave,
            __isDecrypted: true,
          } as any;
          return (
            <FocusedTileInternal
              tile={tempTile}
              onClose={onClose}
              renderEditor={renderEditor}
              zenMode={zenMode}
              onToggleZenMode={onToggleZenMode}
              onAddToReadItLater={onAddToReadItLater}
              onAddToDashboard={onAddToDashboard}
              onCreateFile={onCreateFile}
              initialViewMode={initialViewMode}
            />
          );
        }}
      </EncryptedTileWrapper>
    );
  }

  // Fix 1.24: Deep Linking - Switch to WIDGET view when content loads if currently in CODE/empty state
  // biome-ignore lint/correctness/useHookAtTopLevel: early return above is safe, tile is always defined here
  useEffect(() => {
    // Re-evaluate hasWidget logic here because props update
    const _isTimeTracking = tile.extension?.toLowerCase() === '.timetracking.csv';
    const _isEvents = tile.extension?.toLowerCase() === '.events.csv';
    const _isHabit = tile.extension?.toLowerCase() === '.habit.csv';
    const _isTodos = tile.extension?.toLowerCase() === '.todos.md';
    const _isTimezones = tile.extension?.toLowerCase() === '.timezones.json';
    const _isRss = tile.extension?.toLowerCase() === '.rss.json';
    const _isReadItLater = tile.extension?.toLowerCase() === '.readitlater.json';
    const _isDataCollection = tile.extension === '.data-collection.csv';
    const _isBudget = tile.extension === '.budget.csv';
    const _isActionLog = tile.extension === '.actionlog.md';
    const _isPrompts = tile.extension === '.prompts.md';
    const _isCommands = tile.extension === '.commands.md';
    const _isStocks = tile.extension === '.stocks.csv';
    const _isConsumption = tile.extension === '.consumption.csv';
    const _isAnyCsv = tile.extension?.toLowerCase()?.replace('.enc', '').endsWith('.csv');
    const _isBookmarks = tile.extension?.toLowerCase() === '.bookmarks.json';
    const _isTravel = tile.extension?.toLowerCase() === '.travel.json';

    const _hasWidget =
      _isTimeTracking ||
      _isEvents ||
      _isHabit ||
      _isTodos ||
      _isTimezones ||
      _isRss ||
      _isReadItLater ||
      _isDataCollection ||
      _isBudget ||
      _isActionLog ||
      _isPrompts ||
      _isCommands ||
      _isStocks ||
      _isConsumption ||
      _isAnyCsv ||
      _isBookmarks ||
      _isTravel;

    if (viewMode === 'CODE') {
      // console.log('[FocusedTileInternal] ViewMode is CODE. HasWidget:', _hasWidget, 'RawContent length:', tile.rawContent?.length);
    }

    /* REMOVED: Auto-switch to WIDGET view on content change.
       This was causing the editor to close when saving.
    if (_hasWidget && viewMode === 'CODE') {
      setViewMode('WIDGET');
    }
    */
  }, [tile.extension, viewMode]);

  return (
    <div
      className={cn(
        'absolute top-0 bottom-14 md:bottom-8 z-10 p-8 flex flex-col',
        zenMode ? 'bg-stone-950' : 'bg-[var(--los-bg)]', // Darker background in Zen Mode
        'left-0 right-0 mx-auto w-full max-w-screen-2xl', // Center & Constrain
      )}
      key={`focused-${tile.id}`}
      id={`focused-modal-container-${tile.id}`}
    >
      <div
        id="focused-modal-inner"
        className={cn(
          'flex-1 min-h-0 overflow-hidden border border-[var(--los-border)] flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-300',
          zenMode ? 'bg-transparent' : 'bg-[var(--los-bg)]',
        )}
      >
        {/* Fix 1.17: Responsive Layout for Mobile - 3 rows: Actions, Title, Content Toggles */}
        <div
          className={cn(
            'min-h-12 border-b border-[var(--los-border)] flex flex-col px-4 py-2 shrink-0 gap-2 transition-opacity duration-500',
            zenMode ? 'opacity-10 hover:opacity-100' : 'opacity-100',
          )}
          id="focused-modal-header"
        >
          {' '}
          {/* Mobile: Row 1 - Actions (Right Aligned) - Strictly hidden on Desktop */}
          <div className="md:hidden">
            <div className="flex w-full justify-end gap-2 mb-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory(!showHistory);
                }}
                className={cn(
                  'flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors',
                  showHistory
                    ? 'text-[var(--los-accent)]'
                    : zenMode
                      ? 'text-[var(--los-accent)]'
                      : 'text-[var(--los-muted)]',
                )}
                title="Toggle History"
              >
                <History
                  size={14}
                  className={cn('transition-colors', showHistory && 'text-[var(--los-accent)]')}
                />
              </button>

              {onAddToDashboard && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToDashboard(String(tile.id));
                  }}
                  className={cn(
                    'flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors',
                    zenMode ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
                  )}
                  title="Add to Dashboard"
                >
                  {/* Fix 1.23: "Add to Dashboard" icon ambiguity */}
                  <Plus
                    size={14}
                    className={cn(
                      'transition-colors',
                      zenMode
                        ? 'text-[var(--los-accent)]'
                        : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)]',
                    )}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleZenMode?.();
                }}
                className={cn(
                  'flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors',
                  zenMode ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
                )}
                title="Toggle Zen Mode (Ctrl+Shift+Z)"
              >
                <div
                  className={cn(
                    'w-2 h-2 border transition-colors',
                    zenMode
                      ? 'bg-[var(--los-accent)] border-[var(--los-accent)]'
                      : 'border-[var(--los-muted)] group-hover:bg-[var(--los-muted)]',
                  )}
                />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="flex items-center gap-2 group px-2 py-1 hover:bg-red-500/10 rounded-sm transition-colors"
                title="Close Tile"
              >
                <div className="w-2 h-2 rounded-full border border-[var(--los-muted)] group-hover:border-red-500 group-hover:bg-red-500 transition-colors" />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between w-full gap-4">
            {/* Fix 1.16: Truncate Title */}
            <MonoHeader className="text-[var(--los-accent)] text-lg truncate flex-1 md:flex-none">
              {tile.id.toString().split('/').pop()}
            </MonoHeader>

            {/* Desktop: Actions (Normal Layout) */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory(!showHistory);
                }}
                className={cn(
                  'flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors',
                  showHistory
                    ? 'text-[var(--los-accent)]'
                    : zenMode
                      ? 'text-[var(--los-accent)]'
                      : 'text-[var(--los-muted)]',
                )}
                title="Toggle History"
              >
                <span className="text-[10px] hidden md:inline">
                  {showHistory ? 'HISTORY ON' : 'HISTORY'}
                </span>
                <History
                  size={14}
                  className={cn('transition-colors', showHistory && 'text-[var(--los-accent)]')}
                />
              </button>

              {onAddToDashboard && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToDashboard(String(tile.id));
                  }}
                  className={cn(
                    'flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors',
                    zenMode ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
                  )}
                  title="Add to Dashboard"
                >
                  <span className="text-[10px] hidden md:inline">[+ DASHBOARD]</span>
                  {/* Fix 1.23: "Add to Dashboard" icon ambiguity */}
                  <Plus
                    size={14}
                    className={cn(
                      'transition-colors',
                      zenMode
                        ? 'text-[var(--los-accent)]'
                        : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)]',
                    )}
                  />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleZenMode?.();
                }}
                className={cn(
                  'flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors',
                  zenMode ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
                )}
                title="Toggle Zen Mode (Ctrl+Shift+Z)"
              >
                {zenMode ? (
                  <span className="text-[10px] hidden md:inline">EXIT ZEN</span>
                ) : (
                  <span className="text-[10px] hidden md:inline">ZEN MODE</span>
                )}
                <div
                  className={cn(
                    'w-2 h-2 border transition-colors',
                    zenMode
                      ? 'bg-[var(--los-accent)] border-[var(--los-accent)]'
                      : 'border-[var(--los-muted)] group-hover:bg-[var(--los-muted)]',
                  )}
                />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="flex items-center gap-2 group px-2 py-1 hover:bg-red-500/10 rounded-sm transition-colors"
                title="Close Tile"
              >
                <span className="text-[10px] text-[var(--los-muted)] group-hover:text-red-500 hidden md:inline">
                  [CLOSE]
                </span>
                <div className="w-2 h-2 rounded-full border border-[var(--los-muted)] group-hover:border-red-500 group-hover:bg-red-500 transition-colors" />
              </button>
            </div>
          </div>
          <div className="w-full overflow-x-auto scrollbar-hide pb-1">
            {hasWidget && (
              <div
                id="focused-modal-tabs"
                className="flex bg-[var(--los-border)] rounded-sm p-0.5 overflow-x-auto w-full md:w-auto md:max-w-none scrollbar-hide shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('WIDGET')}
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                    viewMode === 'WIDGET' || viewMode === 'EDIT'
                      ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                      : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                  )}
                >
                  WIDGET
                </button>

                {isTimeTracking && (
                  <button
                    type="button"
                    onClick={() => setViewMode('CHARTS')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'CHARTS'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    CHARTS
                  </button>
                )}

                {isBookmarks && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ADD BOOKMARK
                  </button>
                )}

                {isTravel && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ADD TRIP
                  </button>
                )}

                {(isEvents || isTodos || isTimezones || isDataCollection) && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    {isEvents
                      ? 'ADD EVENT'
                      : isTodos
                        ? 'ADD TASK'
                        : isTimezones
                          ? 'ADD TIMEZONE'
                          : isActionLog
                            ? 'ADD ACTION'
                            : 'ADD ENTRY'}
                  </button>
                )}

                {isActionLog && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ADD ACTION
                  </button>
                )}

                {isPrompts && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ADD PROMPT
                  </button>
                )}

                {isCommands && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ADD COMMAND
                  </button>
                )}

                {isStocks && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ADD'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ADD ENTRY
                  </button>
                )}

                {isBudget && (
                  <>
                    <button
                      type="button"
                      onClick={() => setViewMode('ACCOUNTS')}
                      className={cn(
                        'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                        viewMode === 'ACCOUNTS'
                          ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                          : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                      )}
                    >
                      ACCOUNTS
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('ADD')}
                      className={cn(
                        'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                        viewMode === 'ADD'
                          ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                          : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                      )}
                    >
                      ADD TRANSACTION
                    </button>
                  </>
                )}

                {isAnyCsv && (
                  <button
                    type="button"
                    onClick={() => setViewMode('TABLE')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'TABLE'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    TABLE
                  </button>
                )}

                {isDataCollection && (
                  <button
                    type="button"
                    onClick={() => setViewMode('COLUMNS')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'COLUMNS'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    COLUMNS
                  </button>
                )}

                {isRss && (
                  <button
                    type="button"
                    onClick={() => setViewMode('FEEDS')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'FEEDS'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    MANAGE FEEDS
                  </button>
                )}

                {isReadItLater && (
                  <button
                    type="button"
                    onClick={() => setViewMode('ARCHIVE')}
                    className={cn(
                      'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                      viewMode === 'ARCHIVE'
                        ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                    )}
                  >
                    ARCHIVE
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewMode('CODE')}
                  className={cn(
                    'px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center',
                    viewMode === 'CODE'
                      ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                      : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                  )}
                >
                  CODE
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div
          id="focused-modal-content-scroller"
          className={cn(
            'flex-1 min-h-0 relative',
            viewMode === 'CODE' ? 'overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {showHistory && (
            <FileHistoryView path={String(tile.id)} onClose={() => setShowHistory(false)} />
          )}

          {/* Content Area */}
          {/* Content Area */}
          {isAnyCsv && viewMode === 'TABLE' ? (
            <div className="min-h-full w-full p-8">
              <CsvTableView content={tile.rawContent || ''} />
            </div>
          ) : isBudget &&
            (viewMode === 'WIDGET' || viewMode === 'ACCOUNTS' || viewMode === 'ADD') ? (
            <div className="min-h-full w-full p-8">
              <BudgetWidget
                content={tile.rawContent || ''}
                mode={viewMode as any}
                onChange={(c) => {
                  tile.onContentChange?.(c);
                  // Fix: Keep in ADD mode to allow multiple additions
                  // if (viewMode === 'ADD') setViewMode('WIDGET');
                }}
              />
            </div>
          ) : isActionLog && (viewMode === 'WIDGET' || viewMode === 'ADD') ? (
            <div className="flex flex-col min-h-full w-full p-8">
              <ActionLogWidget
                content={tile.rawContent || ''}
                mode={viewMode as any}
                onChange={(c) => {
                  tile.onContentChange?.(c);
                  // Fixed: Keep in ADD mode to allow multiple additions
                  // if (viewMode === 'ADD') setViewMode('WIDGET');
                }}
              />
            </div>
          ) : isPrompts && (viewMode === 'WIDGET' || viewMode === 'ADD') ? (
            <div className="flex flex-col min-h-full w-full p-8">
              <PromptsWidget
                content={tile.rawContent || ''}
                mode={viewMode as any}
                onChange={(c) => tile.onContentChange?.(c)}
              />
            </div>
          ) : isPaletteSettings && viewMode === 'WIDGET' ? (
            <div className="flex flex-col min-h-full w-full">
              <CommandPaletteSettingsWidget
                content={tile.rawContent || ''}
                mode="FOCUS"
                onChange={(c) => tile.onContentChange?.(c)}
              />
            </div>
          ) : isCommands && (viewMode === 'WIDGET' || viewMode === 'ADD') ? (
            <div className="flex flex-col min-h-full w-full p-8">
              <CommandsWidget
                content={tile.rawContent || ''}
                mode={viewMode === 'ADD' ? 'ADD' : 'FOCUS'}
                onChange={(c) => tile.onContentChange?.(c)}
              />
            </div>
          ) : isStocks && (viewMode === 'WIDGET' || viewMode === 'ADD') ? (
            <div className="flex flex-col min-h-full w-full">
              <StocksWidget
                content={tile.rawContent || ''}
                mode={viewMode === 'ADD' ? 'ADD' : 'FOCUS'}
                onChange={(c) => {
                  tile.onContentChange?.(c);
                  if (viewMode === 'ADD') setViewMode('WIDGET');
                }}
              />
            </div>
          ) : isConsumption && (viewMode === 'WIDGET' || viewMode === 'ADD') ? (
            <div className="flex flex-col min-h-full w-full">
              <ConsumptionWidget
                content={tile.rawContent || ''}
                mode="FOCUS"
                onChange={(c) => tile.onContentChange?.(c)}
                initialTab={viewMode === 'ADD' ? 'ADD' : undefined}
              />
            </div>
          ) : viewMode === 'WIDGET' && hasWidget ? (
            <div className="flex flex-col min-h-full w-full p-8">
              {isTimeTracking && (
                <TimeTrackingWidget
                  content={tile.rawContent as string}
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                  mode="FOCUS"
                />
              )}
              {isEvents && <EventsWidget content={tile.rawContent as string} mode="FOCUS" />}
              {isHabit && (
                <HabitTrackerWidget
                  content={tile.rawContent as string}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isTodos && (
                <TodoWidget
                  content={tile.rawContent as string}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isTimezones && (
                <TimezoneWidget
                  content={tile.rawContent as string}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isRss && (
                <RssWidget
                  content={tile.rawContent}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                  onReadItLater={(item) => {
                    const newItem: ReadItLaterItem = {
                      id: crypto.randomUUID(),
                      url: item.link,
                      status: 'new',
                      name: item.title,
                      tags: [],
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    };
                    if (onAddToReadItLater) {
                      logger.debug(`(Focused) RssWidget onReadItLater triggered. ${newItem.name}`);
                      onAddToReadItLater(newItem);
                    } else {
                      logger.error('(Focused) onAddToReadItLater prop is UNDEFINED in FocusedTile');
                    }
                  }}
                />
              )}
              {isReadItLater && (
                <ReadItLaterWidget
                  content={tile.rawContent as string}
                  mode="FOCUS"
                  focusMode="WIDGET"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isDataCollection && (
                <DataCollectionWidget
                  content={tile.rawContent as string}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isBookmarks && (
                <BookmarksWidget
                  content={tile.rawContent || ''}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isTravel && (
                <TravelWidget
                  content={tile.rawContent || ''}
                  mode="FOCUS"
                  onEditTrip={(tripId) => {
                    setEditTripId(tripId);
                    setViewMode('EDIT');
                  }}
                />
              )}
              {isGenericCsv && <CsvTableView content={tile.rawContent || ''} />}
              {isBoardOverview && (
                <BoardOverviewWidget
                  content={tile.rawContent ?? '{}'}
                  mode="FOCUS"
                  onChange={(c) => tile.onContentChange?.(c)}
                  onNavigate={onBoardClick}
                />
              )}
            </div>
          ) : viewMode === 'CHARTS' && isTimeTracking ? (
            <div className="flex flex-col min-h-full w-full p-8">
              <TimeTrackingCharts data={tile.rawContent as string} />
            </div>
          ) : viewMode === 'EDIT' && isTravel && editTripId ? (
            <div className="min-h-full w-full p-8 flex justify-center items-start">
              <TravelEditForm
                key={editTripId}
                content={tile.rawContent || ''}
                tripId={editTripId}
                onChange={(newContent) => tile.onContentChange?.(newContent)}
                onDone={() => setViewMode('WIDGET')}
              />
            </div>
          ) : viewMode === 'ADD' && isTravel ? (
            <div className="min-h-full w-full p-8 flex justify-center items-start">
              <TravelAddForm
                content={tile.rawContent || ''}
                onChange={(newContent) => tile.onContentChange?.(newContent)}
                onDone={() => setViewMode('WIDGET')}
              />
            </div>
          ) : viewMode === 'ADD' && isBookmarks ? (
            <div className="min-h-full w-full p-8 flex justify-center items-start">
              <BookmarkAddForm
                existingTags={collectBookmarkTags(parseBookmarks(tile.rawContent || '').bookmarks)}
                onCancel={() => setViewMode('WIDGET')}
                onAdd={(draft) => {
                  try {
                    const config = parseBookmarks(tile.rawContent || '');
                    tile.onContentChange?.(serializeBookmarks(addBookmark(config, draft)));
                    setViewMode('WIDGET');
                    return undefined;
                  } catch (e: any) {
                    return e.message || 'Could not add the bookmark';
                  }
                }}
              />
            </div>
          ) : viewMode === 'ADD' && (isEvents || isTodos || isTimezones || isDataCollection) ? (
            <div className="min-h-full w-full p-8 flex justify-center items-start">
              {isEvents && (
                <EventAddForm
                  onCancel={() => setViewMode('WIDGET')}
                  onAdd={(entry) => {
                    tile.onContentChange?.(addEventEntry(tile.rawContent || '', entry));
                    setViewMode('WIDGET');
                  }}
                />
              )}
              {isTodos && (
                <TodoAddForm
                  existingTags={todoTags}
                  milestones={todoMilestones}
                  todosFilePath={String(tile.id)}
                  onCancel={() => setViewMode('WIDGET')}
                  onAdd={async (text, tags, milestoneId, promptRef) => {
                    const newContent = addTodoEntry(tile.rawContent || '', {
                      text,
                      tags,
                      milestoneId,
                      prompt: promptRef?.prompt,
                    });
                    // Update store directly and await save before creating the prompt
                    // file — running both concurrently causes a 409 Conflict on GitHub.
                    githubFileStore.updateFileContent(String(tile.id), newContent);
                    await githubFileStore.saveFile(String(tile.id));
                    setViewMode('WIDGET');
                    if (promptRef) {
                      const filePath = promptRef.prompt.refFile;
                      if (filePath && onCreateFile) await onCreateFile(filePath, '');
                      if (filePath && promptRef.openAfter) {
                        layoutStore.view.value = 'FILES';
                        layoutStore.navigate(filePath);
                      }
                    }
                  }}
                />
              )}
              {isTimezones && (
                <TimezoneAddForm
                  onCancel={() => setViewMode('WIDGET')}
                  onAdd={(entry) => {
                    const data = parseTimezones(tile.rawContent || '');
                    data.timezones.push(entry);
                    const newContent = serializeTimezones(data);
                    tile.onContentChange?.(newContent);
                    setViewMode('WIDGET');
                  }}
                />
              )}
              {isDataCollection && (
                <DataCollectionAddForm
                  data={parseDataCollection(tile.rawContent || '')}
                  onAdd={(entry) => {
                    const data = parseDataCollection(tile.rawContent || '');
                    data.rows.push(entry);
                    const newContent = serializeDataCollection(data);
                    tile.onContentChange?.(newContent);
                    setViewMode('WIDGET');
                  }}
                />
              )}
            </div>
          ) : viewMode === 'COLUMNS' && isDataCollection ? (
            <div className="min-h-full w-full">
              <DataCollectionColumnManager
                content={tile.rawContent || ''}
                onChange={(newContent) => {
                  tile.onContentChange?.(newContent);
                  // Don't switch view, let them continue managing
                }}
              />
            </div>
          ) : viewMode === 'FEEDS' && isRss ? (
            <div className="min-h-full w-full">
              <RssFeedManager
                content={tile.rawContent || ''}
                onChange={(newContent) => {
                  tile.onContentChange?.(newContent);
                }}
              />
            </div>
          ) : viewMode === 'ARCHIVE' && isReadItLater ? (
            <div className="min-h-full w-full">
              <ReadItLaterWidget
                content={tile.rawContent as string}
                mode="FOCUS"
                focusMode="ARCHIVE"
                onChange={(newContent) => tile.onContentChange?.(newContent)}
              />
            </div>
          ) : viewMode === 'CODE' || (viewMode === 'WIDGET' && !hasWidget) ? (
            <div className="h-full w-full">
              {renderEditor ? (
                renderEditor(String(tile.id), zenMode, tile.rawContent, tile.onContentChange)
              ) : tile.rawContent !== undefined ? (
                <textarea
                  className="w-full h-full bg-[var(--los-bg)] text-[var(--los-fg)] font-mono text-xs p-4 resize-none focus:outline-none border-none"
                  value={tile.rawContent}
                  onInput={(e) => tile.onContentChange?.(e.currentTarget.value)}
                  spellcheck={false}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-[var(--los-muted)]">
                  <MonoText>No Editor Available</MonoText>
                </div>
              )}
            </div>
          ) : tile.content ? (
            tile.content
          ) : (
            <div className="p-8 flex items-center justify-center text-[var(--los-muted)]">
              <MonoText>No content defined for this tile.</MonoText>
            </div>
          )}

          {/* Fix 1.25: Ensure data is fetched even if we are in WIDGET mode and content is missing */}
          {/* We render the Editor hidden so it mounts and triggers the data fetch */}
          {hasWidget && viewMode !== 'CODE' && !tile.rawContent && renderEditor && (
            <div style={{ display: 'none' }}>{renderEditor(String(tile.id), false)}</div>
          )}
        </div>
      </div>
    </div>
  );
};

// Memoize FocusedTile to prevent re-renders when MainApp updates but Tile content hasn't changed
const FocusedTileMemo = memo(FocusedTileInternal, (prev, next) => {
  // We only re-render if:
  // 1. ID changes (different tile)
  // 2. Content changes (data update)
  // 3. Zen Mode changes (layout update)
  const idEqual = prev.tile.id === next.tile.id;
  const contentEqual = prev.tile.rawContent === next.tile.rawContent;
  const zenEqual = prev.zenMode === next.zenMode;

  return idEqual && contentEqual && zenEqual;
});

const TileContentStructure = ({
  tile,
  renderTileContent,
  onToggleSize,
  isExpanded,
  onDeleteFile,
  onRenameFile,
  onRequestMove,
  onToggleQuickNote,
  isQuickNote,
}: {
  tile: TileDef;
  renderTileContent: any;
  onToggleSize?: () => void;
  isExpanded?: boolean;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (path: string, newPath: string) => void;
  onRequestMove?: (path: string) => void;
  onToggleQuickNote?: (path: string) => void;
  isQuickNote?: (path: string) => boolean;
}) => {
  const [activeMenu, setActiveMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const handleClick = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleClick);
    }
    return () => window.removeEventListener('click', handleClick);
  }, [activeMenu]);

  const handleMenuTrigger = (e: any) => {
    e.stopPropagation();
    if (activeMenu) {
      setActiveMenu(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Position menu slightly to the left to avoid overflow
    setActiveMenu({ id: String(tile.id), x: rect.right - 120, y: rect.bottom + 5 });
  };

  const renderContextMenu = () => {
    if (!activeMenu) return null;

    const ext = tile.extension?.toLowerCase();
    const isMd = ext === '.md';

    return createPortal(
      // biome-ignore lint/a11y/noStaticElementInteractions: context menu container
      // biome-ignore lint/a11y/useKeyWithClickEvents: context menu container
      <div
        className="fixed z-[9999] bg-[#1a1a1f] border border-[var(--los-border)] shadow-xl rounded flex flex-col min-w-[120px] py-1 animate-in fade-in zoom-in-95 duration-100 text-white"
        style={{ top: activeMenu.y, left: activeMenu.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: context menu item */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: context menu item */}
        <div
          className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            const newName = prompt('Rename to:', tile.title);
            if (newName && newName !== tile.title && onRenameFile) {
              const parts = String(tile.id).split('/');
              parts.pop();
              const newPath = [...parts, newName].join('/');
              onRenameFile(String(tile.id), newPath);
            }
          }}
        >
          <Edit size={12} /> Rename
        </div>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: context menu item */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: context menu item */}
        <div
          className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            if (onRequestMove) onRequestMove(String(tile.id));
          }}
        >
          <Move size={12} /> Move
        </div>
        {isMd && onToggleQuickNote && isQuickNote && (
          // biome-ignore lint/a11y/noStaticElementInteractions: context menu item
          // biome-ignore lint/a11y/useKeyWithClickEvents: context menu item
          <div
            className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(null);
              onToggleQuickNote(String(tile.id));
            }}
          >
            <FileText size={12} />{' '}
            {isQuickNote(String(tile.id)) ? 'Remove Quick Note' : 'Add Quick Note'}
          </div>
        )}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: context menu item */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: context menu item */}
        <div
          className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 cursor-pointer text-xs text-red-400 hover:text-red-300"
          onClick={(e) => {
            e.stopPropagation();
            setActiveMenu(null);
            if (onDeleteFile) onDeleteFile(String(tile.id));
          }}
        >
          <Trash size={12} /> Delete
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <div className="absolute inset-0 overflow-hidden p-4 flex flex-col pointer-events-none">
      <div className="flex justify-between items-start shrink-0 mb-2 pointer-events-auto">
        <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity flex-1 mr-2 flex truncate">
          {(() => {
            if (!tile.title) return null;
            const lastSlashIdx = tile.title.lastIndexOf('/');
            const dirPart = lastSlashIdx !== -1 ? tile.title.slice(0, lastSlashIdx + 1) : '';
            const baseWithExt =
              lastSlashIdx !== -1 ? tile.title.slice(lastSlashIdx + 1) : tile.title;

            const firstDotIdx = baseWithExt.indexOf('.');
            const namePart = firstDotIdx !== -1 ? baseWithExt.slice(0, firstDotIdx) : baseWithExt;
            const extPart = firstDotIdx !== -1 ? baseWithExt.slice(firstDotIdx) : '';

            return (
              <span className="truncate">
                {dirPart && <span className="text-[var(--los-muted)]">{dirPart}</span>}
                <span className="text-[var(--los-fg)] font-bold">{namePart}</span>
                {extPart && <span className="text-[var(--los-muted)]">{extPart}</span>}
              </span>
            );
          })()}
        </MonoText>{' '}
        <div className="flex items-center gap-2">
          {onToggleSize && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSize();
              }}
              className="text-[var(--los-muted)] hover:text-[var(--los-accent)] transition-colors p-1"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}

          {tile.type === 'FILE' && onDeleteFile && (
            <button
              type="button"
              onClick={handleMenuTrigger}
              className={cn(
                'p-1 rounded cursor-pointer transition-colors',
                activeMenu ? 'text-white bg-white/10' : 'text-[var(--los-muted)] hover:text-white',
              )}
            >
              <MoreVertical size={14} />
            </button>
          )}

          {tile.type === 'FOLDER' ? (
            <div className="w-2 h-2 border border-[var(--los-muted)] rotate-45 shrink-0" />
          ) : (
            <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors shrink-0" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 w-full pointer-events-auto">
        {renderTileContent(tile, 'SMALL')}
      </div>

      {renderContextMenu()}
    </div>
  );
};

const SortableTileItem = ({
  tile,
  setActiveTileId,
  renderTileContent,
  handleDragStart,
  handleDragSave,
  dragEnabled,
  isExpanded,
  onToggleSize,
  onDeleteFile,
  onRenameFile,
  onRequestMove,
  isMobile,
  onToggleQuickNote,
  isQuickNote,
}: any) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tile.id,
    disabled: !dragEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // Hide orig element while dragging overlay
    zIndex: isDragging ? 999 : 'auto',
  };

  const [pressing, setPressing] = useState(false);

  const lastUpTime = useRef(0);

  useEffect(() => {
    let timer: any;
    if (pressing) {
      timer = setTimeout(() => {
        if (dragEnabled) {
          handleDragSave();
        } else {
          handleDragStart();
        }
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [pressing, handleDragStart, handleDragSave, dragEnabled]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: sortable tile handles drag and click
    // biome-ignore lint/a11y/useKeyWithClickEvents: sortable tile handles drag and click
    <div
      ref={setNodeRef}
      {...(attributes as any)}
      {...(listeners as any)}
      onMouseDown={() => {
        // Disable completely on mobile (width check)
        if (window.innerWidth < 768) return;

        if (dragEnabled) {
          // Already enabled, allow simple hold to save
          setPressing(true);
        } else {
          // Not enabled: Require double-click-hold
          const now = Date.now();
          if (now - lastUpTime.current < 400) {
            setPressing(true);
          }
        }
      }}
      onMouseUp={() => {
        setPressing(false);
        lastUpTime.current = Date.now();
      }}
      onMouseLeave={() => setPressing(false)}
      // Touch handlers removed to disable on mobile touch interactions
      onClick={() => {
        if (!dragEnabled) setActiveTileId(tile.id);
      }}
      className={cn(
        'bg-[var(--los-bg)] ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full',
        !isExpanded && (isMobile ? 'h-44 pb-0' : 'pb-[100%]'), // Mobile: Compact Fixed Height (h-44), Desktop: Square
        isExpanded && 'min-h-[60dvh] md:min-h-auto md:h-auto md:row-span-2 md:col-span-2 pb-0', // Mobile: Compact Expanded (60dvh > width), Desktop: 2x2 grid
        dragEnabled && 'touch-none cursor-move ring-[var(--los-accent)] ring-2 opacity-90 scale-95',
      )}
      style={{
        ...style,
        paddingBottom: isExpanded || isMobile ? '0' : undefined,
      }}
    >
      <TileContentStructure
        tile={tile}
        renderTileContent={(t: TileDef, _m: any) =>
          renderTileContent(
            t,
            isMobile ? (isExpanded ? 'MOBILE_EXPANDED' : 'MOBILE_COLLAPSED') : 'SMALL',
          )
        }
        isExpanded={isExpanded}
        onToggleSize={onToggleSize}
        onDeleteFile={onDeleteFile}
        onRenameFile={onRenameFile}
        onRequestMove={onRequestMove}
        onToggleQuickNote={onToggleQuickNote}
        isQuickNote={isQuickNote}
      />
    </div>
  );
};

// Default dummy data if none provided
const _defaultTiles: TileDef[] = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  title: `Tile 0${i + 1}`,
  content: (
    <div className="p-8">
      <Editor />
    </div>
  ),
}));
