import { ComponentChildren, h } from 'preact';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import { cn } from '../../utils';
import { Tile } from '../Molecules/Tile';
import { StatusBar } from '../Organisms/StatusBar';
import { Editor } from '../Organisms/Editor';
import { MonoText, MonoHeader } from '../Atoms/Typography';
import { MainGrid } from './MainGrid';
import { MillerColumn } from '../Molecules/MillerColumn';
import { TimeTrackingWidget } from '../Organisms/Widgets/TimeTrackingWidget';
import { TimeTrackingCharts } from '../Organisms/Widgets/TimeTrackingCharts';
import { EventsWidget } from '../Organisms/Widgets/EventsWidget';
import { HabitTrackerWidget } from '../Organisms/Widgets/HabitTrackerWidget';
import { TodoWidget } from '../Organisms/Widgets/TodoWidget';
import { TimezoneWidget } from '../Organisms/Widgets/TimezoneWidget';
import { EventAddForm } from '../Organisms/Widgets/EventAddForm';
import { TodoAddForm } from '../Organisms/Widgets/TodoAddForm';
import { TimezoneAddForm } from '../Organisms/Widgets/TimezoneAddForm';
import { RssWidget, RssFeedManager } from '../Organisms/Widgets/RssWidget';
import { ReadItLaterWidget } from '../Organisms/Widgets/ReadItLaterWidget';
import { ReadItLaterItem } from '../Organisms/Widgets/ReadItLaterLogic';
import * as EventsLogic from '../Organisms/Widgets/EventsLogic';
import * as TodoLogic from '../Organisms/Widgets/TodoLogic';
import * as TimezoneLogic from '../Organisms/Widgets/TimezoneLogic';
import { ActionLogWidget } from '../Organisms/Widgets/ActionLogWidget';
import { DataCollectionWidget } from '../Organisms/Widgets/DataCollectionWidget';
import { DataCollectionAddForm } from '../Organisms/Widgets/DataCollectionAddForm';
import { DataCollectionColumnManager } from '../Organisms/Widgets/DataCollectionColumnManager';
import { DataCollectionData, parseDataCollection, serializeDataCollection, calculateAutoValues } from '../Organisms/Widgets/DataCollectionLogic';
import { BudgetWidget } from '../Organisms/Widgets/BudgetWidget';
import { DashboardConfig, DashboardEntry } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NewFileWizard } from '../Organisms/NewFileWizard';
import { MoveFileModal } from '../Organisms/MoveFileModal';
import { SearchModal } from '../Organisms/SearchModal';

export interface TileDef {
  id: string | number;
  title: string;
  /** Component or element to render when this tile is focused */
  /** Component or element to render when this tile is focused */
  content?: ComponentChildren;
  /** Raw text content for file-based widgets */
  rawContent?: string;
  /** File extension to determine widget type */
  extension?: string;
  /** Callback to update raw content */
  onContentChange?: (newContent: string) => void;
  type?: 'FILE' | 'FOLDER';
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

  renderEditor?: (path: string, zenMode?: boolean) => ComponentChildren;
  onAddToReadItLater?: (item: ReadItLaterItem) => void;
  onCreateFile?: (path: string, content: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (path: string, newPath: string) => void;
  onMoveFile?: (path: string, newPath: string) => void;
  existingFiles?: string[];
  onLoadFolder?: (path: string) => Promise<TileDef[]>;
  githubToken?: string;
}

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
  onMoveFile,
  existingFiles,
  onLoadFolder,
  githubToken,
  ...props
}: MainAppProps) => {
  // State for legacy/single-level mode or Dashboard mode
  const [activeTileId, setActiveTileId] = useState<string | number | null>(null);

  // Dashboard State
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [localConfig, setLocalConfig] = useState<DashboardConfig | undefined>(config);
  const [showFiles, setShowFiles] = useState(false); // Toggle for "Files" view
  const [showNewFileWizard, setShowNewFileWizard] = useState(false);
  const [fileToMove, setFileToMove] = useState<string | null>(null);
  const [zenMode, setZenMode] = useState(false); // Zen Mode state

  // Store original config when entering Drag Mode for cancellation
  const [originalConfig, setOriginalConfig] = useState<DashboardConfig | undefined>(undefined);

  // Store current drag id for drag overlay
  const [activeId, setActiveId] = useState<string | number | null>(null);

  // Nav Overlay Hover State
  const [hoverNav, setHoverNav] = useState<'prev' | 'next' | null>(null);

  useEffect(() => {
    if (config) {
      setLocalConfig(config);
      // setShowFiles(false); // Removed to prevent view reset on config update (e.g. rename/move)
    }
  }, [config]);

  const handleDragStartLogic = () => {
    setOriginalConfig(JSON.parse(JSON.stringify(localConfig))); // Deep copy
    setDragEnabled(true);
  };

  const handleDragSave = () => {
    setDragEnabled(false);
    setOriginalConfig(undefined);
    // Persist changes - user callback already called during reorder
    if (localConfig) onConfigChange?.(localConfig);
  };

  const handleDragCancel = () => {
    if (originalConfig) {
      setLocalConfig(originalConfig);
      onConfigChange?.(originalConfig);
    }
    setDragEnabled(false);
    setOriginalConfig(undefined);
  };

  const currentDashboardId = activeDashboardId || localConfig?.dashboards[0]?.id;

  const handleNextDashboard = () => {
    const config = localConfig;
    if (!config || !config.dashboards.length) return;
    const currentIndex = config.dashboards.findIndex(d => d.id === currentDashboardId);
    // Find next index, wrap around
    const nextIndex = (currentIndex + 1) % config.dashboards.length;
    setActiveDashboardId(config.dashboards[nextIndex]?.id || null);
  };

  // Filter entries for current dashboard
  const userEntries = useMemo(() => {
    if (!localConfig || !currentDashboardId) return [];
    return localConfig.entries.filter(e => e.dashboard === currentDashboardId);
  }, [localConfig, currentDashboardId]);

  // Convert config entries to tiles
  const dashboardTiles = useMemo(() => {
    if (!localConfig) return tiles; // Fallback to legacy tiles

    return userEntries.map((entry, index) => {
      const extension = entry.path.split('.').slice(1).join('.'); // .events.csv etc. leads to events.csv
      // Better extension extraction:
      let ext = '';
      const lowerPath = entry.path.toLowerCase();
      if (lowerPath.endsWith('.readitlater.json')) ext = '.readitlater.json';
      else if (lowerPath.endsWith('.timetracking.csv')) ext = '.timetracking.csv';
      else if (lowerPath.endsWith('.events.csv')) ext = '.events.csv';
      else if (lowerPath.endsWith('.habit.csv')) ext = '.habit.csv';
      else if (lowerPath.endsWith('.todos.md')) ext = '.todos.md';
      else if (lowerPath.endsWith('.timezones.json')) ext = '.timezones.json';
      else if (lowerPath.endsWith('.rss.json')) ext = '.rss.json';
      else if (lowerPath.endsWith('.data-collection.csv')) ext = '.data-collection.csv';
      else if (lowerPath.endsWith('.data-collection.csv')) ext = '.data-collection.csv';
      else if (lowerPath.endsWith('.data-collection.csv')) ext = '.data-collection.csv';
      else if (lowerPath.endsWith('.budget.csv')) ext = '.budget.csv';
      else if (lowerPath.endsWith('.actionlog.md')) ext = '.actionlog.md';
      else {
        const parts = entry.path.split('.');
        ext = parts.length > 1 ? '.' + parts.slice(1).join('.').toLowerCase() : '';
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
        content: renderFile ? renderFile(entry.path) : undefined
      } as TileDef;
    });
  }, [localConfig, userEntries, fileContents, tiles]);

  const displayTiles = dashboardTiles;

  // Helper to render tile content (Widget vs Default)
  const renderTileContent = (tile: TileDef, mode: 'SMALL' | 'FOCUS') => {
    if (tile.extension === '.timetracking.csv' && tile.rawContent) {
      return (
        <TimeTrackingWidget
          content={tile.rawContent}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
          mode={mode}
        />
      );
    }
    if (tile.extension === '.events.csv' && tile.rawContent) {
      return (
        <EventsWidget
          content={tile.rawContent}
          mode={mode}
        />
      );
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
        />
      )
    }
    if (tile.extension === '.timezones.json' && tile.rawContent) {
      return (
        <TimezoneWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      )
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
              updatedAt: Date.now()
            };
            console.log('[MainApp] RssWidget onReadItLater triggered. Calling onAddToReadItLater prop...', newItem);
            if (!onAddToReadItLater) {
              console.error('[MainApp] onAddToReadItLater prop is UNDEFINED');
            }
            onAddToReadItLater?.(newItem);
          }
          }
        />
      );
    }
    if (tile.extension?.toLowerCase() === '.readitlater.json' && tile.rawContent) {
      // setRilState('LOADING'); // This state is not defined in MainApp
      console.log('[MainApp] Read Later clicked for item:', tile.title); // Log the item title from the tile
      if (!onAddToReadItLater) { // Check the correct prop for adding to read later
        console.warn('[MainApp] onAddToReadItLater prop is missing!');
      }
      // onAddToReadItLater(); // This call needs an item, not a direct call
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
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.data-collection.csv' && tile.rawContent) {
      return (
        <DataCollectionWidget
          content={tile.rawContent}
          mode={mode}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.budget.csv' && tile.rawContent) {
      return (
        <BudgetWidget
          content={tile.rawContent}
          mode={mode === 'FOCUS' ? 'FOCUS' : 'SMALL'}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    if (tile.extension === '.actionlog.md' && tile.rawContent) {
      return (
        <ActionLogWidget
          content={tile.rawContent}
          mode={mode === 'FOCUS' ? 'FOCUS' : 'SMALL'}
          onChange={(newContent) => tile.onContentChange?.(newContent)}
        />
      );
    }
    return tile.content || (renderFile && tile.type === 'FILE' ? renderFile(String(tile.id)) : undefined);
  };

  // If fileSystem is provided, we use the Miller Column Layout
  // Override: If showFiles is true, we force Miller Mode if fileSystem exists
  // If localConfig exists AND !showFiles, we use Grid Mode (isMillerMode = false)
  // If localConfig missing, we default to Miller Mode if fileSystem exists
  const isMillerMode = !!fileSystem && (showFiles || !localConfig);

  // Constants
  const activeTile = activeTileId !== null ? (
    isMillerMode
      ? fileSystem?.columns.flatMap(c => c.items).find(t => t.id === activeTileId)
      : displayTiles.find(t => t.id === activeTileId)
  ) : null;

  // Calculate Breadcrumbs Logic
  const getBreadcrumbs = () => {
    if (activeTileId !== null && !isMillerMode) return ["root", "focus", `tile_${activeTileId}`];

    if (isMillerMode && fileSystem) {
      // Traverse simple path
      const path: string[] = ['~'];
      fileSystem.columns.forEach(col => {
        if (col.activeId) {
          const activeItem = col.items.find(i => i.id === col.activeId);
          if (activeItem) path.push(String(activeItem.title));
        }
      });
      return path;
    }
    return ["~"];
  };

  const handleDashboardClick = () => {
    setActiveTileId(null);
    if (onNavigate) {
      onNavigate([]); // Signal root navigation to parent
    }
  };

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require movement before drag starts to allow clicks
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (active.id !== over?.id) {
      if (!localConfig || !currentDashboardId) return;
      // Find indices
      const oldIndex = userEntries.findIndex(e => e.path === active.id);
      const newIndex = userEntries.findIndex(e => e.path === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(userEntries, oldIndex, newIndex);
        const otherEntries = localConfig.entries.filter(e => e.dashboard !== currentDashboardId);
        const newConfig = { ...localConfig, entries: [...otherEntries, ...newOrder] };
        setLocalConfig(newConfig);
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

  const handlePrevDashboard = () => {
    const config = localConfig;
    if (!config || !config.dashboards.length) return;
    const currentIndex = config.dashboards.findIndex(d => d.id === currentDashboardId);
    // Find prev index, wrap around
    const prevIndex = (currentIndex - 1 + config.dashboards.length) % config.dashboards.length;
    setActiveDashboardId(config.dashboards[prevIndex]?.id || null);
  };

  const getResponsiveGridClass = (count: number) => {
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  };

  // Search State
  const [showSearch, setShowSearch] = useState(false);

  // Keyboard Shortcuts (Global)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle Search (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
      // Toggle Zen Mode (Ctrl+Shift+Z or Cmd+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setZenMode(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fix 1.5 & 1.6: Dynamic Theme Color for Mobile Safari and Zen Mode
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      if (zenMode) {
        metaThemeColor.setAttribute('content', '#0a0a0f'); // Dark background
      } else {
        metaThemeColor.setAttribute('content', '#0a0a0f'); // Ensure it stays dark even if something else changes it or default
      }
    } else {
      // Create if missing?
      const meta = document.createElement('meta');
      meta.name = "theme-color";
      meta.content = "#0a0a0f";
      document.head.appendChild(meta);
    }
  }, [zenMode]);

  return (
    <div
      className="h-screen w-full max-w-[100vw] bg-[var(--los-bg)] overflow-hidden relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Search Modal */}
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        currentRepository={props.currentRepository?.name || "Lifosy/monorepo"}
        githubToken={githubToken}
        onSelect={(item) => {
          // If item is in current dashboard, focus it
          const tile = displayTiles.find(t => t.id === item.path);
          if (tile) {
            setActiveTileId(tile.id);
          } else {
            // If not in dashboard, switch to File View and try to navigate
            // Or at least open it if we have a way to open arbitrary files
            console.log("Opening file from search:", item.path);

            // Check if it's in userEntries to switch dashboard?
            const entry = localConfig?.entries.find(e => e.path === item.path);
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
      <MainGrid viewState={zenMode ? 'ZEN' : (activeTileId !== null ? 'FOCUS' : 'DASHBOARD')}>
        <Tile title={activeTileId !== null ? `FOCUS: ${activeTileId}` : undefined} column="center">
          {activeTileId === null ? (
            isMillerMode ? (
              // MILLER COLUMNS LAYOUT (Centered & Max-Width)
              <div className="absolute top-0 left-0 right-0 bottom-8 flex flex-row overflow-x-auto mx-auto w-full max-w-screen-2xl">
                {fileSystem!.columns.map((col, index) => {
                  const isLast = index === fileSystem!.columns.length - 1;
                  return (
                    <MillerColumn
                      key={index}
                      items={col.items.map(t => ({
                        ...t,
                        content: renderTileContent(t, 'SMALL')
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
                      onRequestMove={(path) => setFileToMove(path)}
                    />
                  )
                })}
              </div>
            ) : (
              // LEGACY SINGLE GRID LAYOUT OR DASHBOARD
              <div
                className={cn(
                  "absolute top-0 left-0 right-0 bottom-8 overflow-y-auto overflow-x-hidden",
                  !localConfig || showFiles ? "block" : getResponsiveGridClass(displayTiles.length)
                )}
                key="matrix"
              >
                {localConfig && !showFiles ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  >
                    {(
                      <>
                        <SortableContext
                          items={userEntries.map(e => e.path)}
                          strategy={rectSortingStrategy}
                        >
                          {(
                            <div className={cn(
                              "grid gap-px bg-[var(--los-bg)] content-start w-full p-4 md:p-0",
                              "max-w-screen-2xl mx-auto", // Center content
                              getResponsiveGridClass(displayTiles.length)
                            )}>
                              {displayTiles.map((tile) => (
                                <SortableTileItem
                                  key={tile.id}
                                  tile={tile}
                                  renderTileContent={renderTileContent}
                                  setActiveTileId={setActiveTileId}
                                  handleDragStart={handleDragStartLogic}
                                  handleDragSave={handleDragSave}
                                  dragEnabled={dragEnabled}
                                />
                              ))}
                            </div>
                          ) as any}
                        </SortableContext>

                        <DragOverlay dropAnimation={dropAnimation}>
                          {(activeId ? (
                            <div className="bg-[var(--los-bg)] ring-2 ring-[var(--los-accent)] opacity-90 scale-95 w-full h-full pb-[100%]">
                              <TileContentStructure
                                tile={displayTiles.find(t => t.id === activeId)!}
                                renderTileContent={renderTileContent}
                              />
                            </div>
                          ) : null) as any}
                        </DragOverlay>
                      </>
                    ) as any}
                  </DndContext>
                ) : (
                  displayTiles.map((tile) => (
                    <div
                      key={tile.id}
                      onClick={() => setActiveTileId(tile.id)}
                      className="bg-[var(--los-bg)] ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full pb-[100%]"
                    >
                      <TileContentStructure tile={tile} renderTileContent={renderTileContent} />
                    </div>
                  ))
                )}
              </div>
            )
          ) : (
            // STATE B: FOCUSED TILE
            <FocusedTile
              tile={activeTile!}
              onClose={() => setActiveTileId(null)}
              renderEditor={renderEditor}
              zenMode={zenMode}
              onToggleZenMode={() => setZenMode(prev => !prev)}
              onAddToReadItLater={onAddToReadItLater}
            />
          )}
        </Tile>
      </MainGrid>

      {/* Desktop Navigation Overlays (Fix: JS-based hover state for guaranteed visibility) */}
      {(() => {
        const shouldRender = !activeTileId && localConfig && localConfig.dashboards.length > 1;
        if (localConfig) {
          console.log('[MainApp] Nav Overlay Check:', { activeTileId, dashCount: localConfig.dashboards.length, shouldRender, hoverNav });
        }
        return shouldRender;
      })() && (
          <>
            {/* Left Overlay - Previous */}
            <div
              onMouseEnter={() => setHoverNav('prev')}
              onMouseLeave={() => setHoverNav(null)}
              onClick={(e) => {
                e.stopPropagation();
                handlePrevDashboard();
              }}
              title="Previous Workspace"
              className="hidden md:flex absolute top-0 left-0 bottom-8 w-24 z-[999] pointer-events-auto items-center justify-start pl-4 cursor-pointer select-none"
            >
              {/* Visual Container (Gradient & Icon) */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-r from-black/60 to-transparent transition-opacity duration-300",
                hoverNav === 'prev' ? "opacity-100" : "opacity-0"
              )} />

              <div className={cn(
                "relative z-10 text-white transition-all duration-300 transform",
                hoverNav === 'prev' ? "opacity-100 translate-x-4" : "opacity-0 translate-x-0"
              )}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </div>
            </div>

            {/* Right Overlay - Next */}
            <div
              onMouseEnter={() => setHoverNav('next')}
              onMouseLeave={() => setHoverNav(null)}
              onClick={(e) => {
                e.stopPropagation();
                handleNextDashboard();
              }}
              title="Next Workspace"
              className="hidden md:flex absolute top-0 right-0 bottom-8 w-24 z-[999] pointer-events-auto items-center justify-end pr-4 cursor-pointer select-none"
            >
              {/* Visual Container (Gradient & Icon) */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-l from-black/60 to-transparent transition-opacity duration-300",
                hoverNav === 'next' ? "opacity-100" : "opacity-0"
              )} />

              <div className={cn(
                "relative z-10 text-white transition-all duration-300 transform",
                hoverNav === 'next' ? "opacity-100 -translate-x-4" : "opacity-0 translate-x-0"
              )}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>
          </>
        )}

      {/* New File Wizard Overlay */}
      {showNewFileWizard && (
        <NewFileWizard
          onClose={() => setShowNewFileWizard(false)}
          onCreate={async (path, content) => {
            if (onCreateFile) await onCreateFile(path, content);
            setShowNewFileWizard(false); // Close wizard first
            // Auto-open: switch to file view (navigate to folder)
            setShowFiles(true);
            // Focus the tile immediately (simulate click)
            setActiveTileId(path);
          }}
          fileSystem={fileSystem as any}
          availableFolders={useMemo(() => {
            if (!localConfig) return [];
            const folders = new Set<string>();
            localConfig.entries.forEach(entry => {
              const parts = entry.path.split('/');
              if (parts.length > 1) {
                // Has parent folder
                // Add each valid parent path logic
                // e.g. "a/b/c.txt" -> "a", "a/b"
                let currentPath = '';
                for (let i = 0; i < parts.length - 1; i++) {
                  currentPath += (i > 0 ? '/' : '') + parts[i];
                  folders.add(currentPath);
                }
              }
            });
            return Array.from(folders).sort();
          }, [localConfig])}
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
          mode={activeTileId !== null ? "FOCUS" : (showFiles ? "FILES" : (dragEnabled ? "DND" : "NORMAL"))}
          breadcrumbs={getBreadcrumbs()}
          stats={[
            { label: "TILES", value: displayTiles.length.toString() },
            ...(localConfig ? [{ label: "WORKSPACE", value: localConfig.dashboards.find(d => d.id === currentDashboardId)?.name || "UNKNOWN" }] : [])
          ]}
          onDashboardClick={() => {
            if (dragEnabled) {
              // Show cancellation menu or just cancel?
            } else {
              handleDashboardClick();
            }
          }}

          // Repository Switcher (Always available if props provided)
          currentRepository={props.currentRepository}
          repositories={props.repositories}
          onSelectRepository={props.onSelectRepository}

          // Workspace Switcher (Only if config exists)
          currentWorkspace={localConfig ? { id: currentDashboardId || '', name: localConfig.dashboards?.find(d => d.id === currentDashboardId)?.name || 'Unknown' } : undefined}
          workspaces={localConfig ? localConfig.dashboards.map(d => ({ id: d.id, name: d.name })) : undefined}
          onSelectWorkspace={(ws) => {
            if (!dragEnabled && localConfig) {
              setActiveDashboardId(ws.id);
              setShowFiles(false); // Switch back to dashboard view
            }
          }}
          onNextWorkspace={!dragEnabled && localConfig ? handleNextDashboard : undefined}

          menuItems={dragEnabled ? [
            { label: "Save Order", onClick: handleDragSave },
            { label: "Cancel Reorder", onClick: handleDragCancel }
          ] : [
            { label: "New File", onClick: () => setShowNewFileWizard(true) },
            {
              label: "Quick Note",
              onClick: async () => {
                const now = new Date();
                const pad = (n: number) => n.toString().padStart(2, '0');
                // Format: quicknote-YYYY-MM-DD-HH:mm:ss.md
                const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
                const filename = `quicknote-${timestamp}.md`;
                const path = `.lifeos/quicknotes/${filename}`;

                const content = `---
type: generic
created: ${now.toISOString()}
description: A generic markdown document template for general note-taking and documentation.
abbreviations: undefined
---

`;
                if (onCreateFile) {
                  await onCreateFile(path, content);
                }
                // Open file view
                setShowFiles(true);
                // Navigate to it
                setActiveTileId(path);
              }
            },
            { label: "Files", onClick: () => { setShowFiles(true); setActiveTileId(null); } },
            ...(localConfig ? [{ label: "Dashboard", onClick: () => { setShowFiles(false); setActiveTileId(null); } }] : []),
            ...((localConfig && !showFiles && activeTileId === null) ? [{ label: "Edit Layout", onClick: handleDragStartLogic }] : []),
          ]}
          recentFiles={!dragEnabled && localConfig ? (localConfig.files?.recentlyOpened || []).map(path => ({
            label: path,
            onClick: () => {
              const conf = localConfig;
              if (conf) {
                const entry = conf.entries.find(e => e.path === path);
                if (entry) {
                  // Scenario 1: File is pinned to a Dashboard
                  setShowFiles(false); // Switch to dashboard view
                  setActiveDashboardId(entry.dashboard);
                  setActiveTileId(entry.path);
                } else {
                  // Scenario 2: File is NOT on any dashboard (accessed via File Tree)
                  // We switch to "Files" mode (Miller Columns) and try to navigate to it.
                  console.log("File not found in dashboard, switching to File View:", path);
                  setShowFiles(true);
                  // Trigger navigation in parent (Dashboard.tsx) to update columns
                  if (onItemClick) {
                    onItemClick({
                      id: path,
                      title: path.split('/').pop() || path,
                      type: 'FILE'
                    });
                  }
                  // Also set active tile locally so it focuses if rendered
                  setActiveTileId(path);
                }
              }
            }
          })) : []
          }
        />
      )}
    </div>
  );
};

const FocusedTile = ({ tile, onClose, renderEditor, zenMode, onToggleZenMode, onAddToReadItLater }: { tile: TileDef; onClose: () => void; renderEditor?: (path: string, zenMode?: boolean) => ComponentChildren, zenMode?: boolean, onToggleZenMode?: () => void, onAddToReadItLater?: (item: ReadItLaterItem) => void }) => {
  if (!tile) return null; // Guard against undefined tile

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

  const hasWidget = (isTimeTracking || isEvents || isHabit || isTodos || isTimezones || isRss || isReadItLater || isDataCollection || isBudget || isActionLog) && !!tile.rawContent;

  const [viewMode, setViewMode] = useState<string>(hasWidget ? 'WIDGET' : 'CODE');

  return (
    <div
      className={cn(
        "absolute top-0 bottom-8 z-10 p-8 flex flex-col",
        zenMode ? "bg-stone-950" : "bg-[var(--los-bg)]", // Darker background in Zen Mode
        "left-0 right-0 mx-auto w-full max-w-screen-2xl" // Center & Constrain
      )}
      key={`focused-${tile.id}`}
    >
      <div
        className={cn(
          "flex-1 border border-[var(--los-border)] flex flex-col relative animate-in fade-in slide-in-from-bottom-4 duration-300",
          zenMode ? "bg-transparent" : "bg-[var(--los-bg)]"
        )}
      >
        {/* Header / Controls - Dim in Zen Mode */}
        <div className={cn(
          "min-h-12 border-b border-[var(--los-border)] flex flex-col px-4 py-2 shrink-0 gap-2 transition-opacity duration-500",
          zenMode ? "opacity-10 hover:opacity-100" : "opacity-100"
        )}>
          <div className="flex items-center justify-between w-full gap-4">
            <MonoHeader className="text-[var(--los-accent)] text-lg">
              {tile.id.toString().split('/').pop()}
            </MonoHeader>

            {/* Close Button (Desktop & Mobile) */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggleZenMode?.(); }}
                className={cn(
                  "flex items-center gap-2 group px-2 py-1 hover:bg-white/10 rounded-sm transition-colors",
                  zenMode ? "text-[var(--los-accent)]" : "text-[var(--los-muted)]"
                )}
                title="Toggle Zen Mode (Ctrl+Shift+Z)"
              >
                {zenMode ? <span className="text-[10px] hidden md:inline">EXIT ZEN</span> : <span className="text-[10px] hidden md:inline">ZEN MODE</span>}
                <div className={cn("w-2 h-2 border transition-colors", zenMode ? "bg-[var(--los-accent)] border-[var(--los-accent)]" : "border-[var(--los-muted)] group-hover:bg-[var(--los-muted)]")} />
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="flex items-center gap-2 group px-2 py-1 hover:bg-red-500/10 rounded-sm transition-colors"
                title="Close Tile"
              >
                <span className="text-[10px] text-[var(--los-muted)] group-hover:text-red-500 hidden md:inline">[CLOSE]</span>
                <div className="w-2 h-2 rounded-full border border-[var(--los-muted)] group-hover:border-red-500 group-hover:bg-red-500 transition-colors" />
              </button>
            </div>
          </div>

          <div className="w-full overflow-x-auto scrollbar-hide pb-1">
            {hasWidget && (
              <div className="flex bg-[var(--los-border)] rounded-sm p-0.5 overflow-x-auto w-full md:w-auto md:max-w-none scrollbar-hide shrink-0">
                <button
                  onClick={() => setViewMode('WIDGET')}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                    viewMode === 'WIDGET' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                  )}
                >
                  WIDGET
                </button>

                {isTimeTracking && (
                  <button
                    onClick={() => setViewMode('CHARTS')}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                      viewMode === 'CHARTS' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    CHARTS
                  </button>
                )}

                {(isEvents || isTodos || isTimezones || isDataCollection) && (
                  <button
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                      viewMode === 'ADD' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    {isEvents ? 'ADD EVENT' : isTodos ? 'ADD TASK' : isTimezones ? 'ADD TIMEZONE' : isActionLog ? 'ADD ACTION' : 'ADD ENTRY'}
                  </button>
                )}

                {isActionLog && (
                  <button
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                      viewMode === 'ADD' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    ADD ACTION
                  </button>
                )}

                {isBudget && (
                  <>
                    <button
                      onClick={() => setViewMode('ACCOUNTS')}
                      className={cn(
                        "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                        viewMode === 'ACCOUNTS' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                      )}
                    >
                      ACCOUNTS
                    </button>
                    <button
                      onClick={() => setViewMode('ADD')}
                      className={cn(
                        "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                        viewMode === 'ADD' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                      )}
                    >
                      ADD TRANSACTION
                    </button>
                  </>
                )}

                {isDataCollection && (
                  <button
                    onClick={() => setViewMode('COLUMNS')}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                      viewMode === 'COLUMNS' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    COLUMNS
                  </button>
                )}

                {isRss && (
                  <button
                    onClick={() => setViewMode('FEEDS')}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                      viewMode === 'FEEDS' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    MANAGE FEEDS
                  </button>
                )}

                {isReadItLater && (
                  <button
                    onClick={() => setViewMode('ARCHIVE')}
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                      viewMode === 'ARCHIVE' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    ARCHIVE
                  </button>
                )}

                <button
                  onClick={() => setViewMode('CODE')}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-mono transition-colors rounded-sm whitespace-nowrap flex-1 md:flex-none text-center",
                    viewMode === 'CODE' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                  )}
                >
                  CODE
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-0 relative">
          {isBudget && (viewMode === 'WIDGET' || viewMode === 'ACCOUNTS' || viewMode === 'ADD') ? (
            <div className="h-full w-full p-8">
              <BudgetWidget
                content={tile.rawContent || ''}
                mode={viewMode as any}
                onChange={(c) => {
                  tile.onContentChange?.(c);
                  if (viewMode === 'ADD') setViewMode('WIDGET');
                }}
              />
            </div>
          ) : isActionLog && (viewMode === 'WIDGET' || viewMode === 'ADD') ? (
            <div className="h-full w-full p-8">
              <ActionLogWidget
                content={tile.rawContent || ''}
                mode={viewMode as any}
                onChange={(c) => {
                  tile.onContentChange?.(c);
                  if (viewMode === 'ADD') setViewMode('WIDGET');
                }}
              />
            </div>
          ) : viewMode === 'WIDGET' && hasWidget ? (
            <div className="h-full w-full p-8">
              {isTimeTracking && (
                <TimeTrackingWidget
                  content={tile.rawContent!}
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                  mode="FOCUS"
                />
              )}
              {isEvents && (
                <EventsWidget
                  content={tile.rawContent!}
                  mode="FOCUS"
                />
              )}
              {isHabit && (
                <HabitTrackerWidget
                  content={tile.rawContent!}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isTodos && (
                <TodoWidget
                  content={tile.rawContent!}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isTimezones && (
                <TimezoneWidget
                  content={tile.rawContent!}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isRss && (
                <RssWidget
                  content={tile.rawContent!}
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
                      updatedAt: Date.now()
                    };
                    console.log('[MainApp] (Focused) RssWidget onReadItLater triggered.', newItem);
                    if (!onAddToReadItLater) {
                      console.error('[MainApp] onAddToReadItLater prop is UNDEFINED in FocusedTile');
                    }
                    onAddToReadItLater?.(newItem);
                  }}
                />
              )}
              {isReadItLater && (
                <ReadItLaterWidget
                  content={tile.rawContent!}
                  mode="FOCUS"
                  focusMode="WIDGET"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
              {isDataCollection && (
                <DataCollectionWidget
                  content={tile.rawContent!}
                  mode="FOCUS"
                  onChange={(newContent) => tile.onContentChange?.(newContent)}
                />
              )}
            </div>
          ) : viewMode === 'CHARTS' && isTimeTracking ? (
            <div className="h-full w-full p-8">
              <TimeTrackingCharts
                data={tile.rawContent!}
              />
            </div>
          ) : viewMode === 'ADD' && (isEvents || isTodos || isTimezones || isDataCollection) ? (
            <div className="h-full w-full p-8 flex justify-center items-start">
              {isEvents && (
                <EventAddForm
                  onCancel={() => setViewMode('WIDGET')}
                  onAdd={(entry) => {
                    const data = EventsLogic.parseEvents(tile.rawContent || '');
                    data.entries.push(entry);
                    const newContent = EventsLogic.serializeEvents(data);
                    tile.onContentChange?.(newContent);
                    setViewMode('WIDGET');
                  }}
                />
              )}
              {isTodos && (
                <TodoAddForm
                  groups={useMemo(() => TodoLogic.parseTodos(tile.rawContent || '').groups.map(g => g.name), [tile.rawContent])}
                  onCancel={() => setViewMode('WIDGET')}
                  onAdd={(group, text) => {
                    const data = TodoLogic.parseTodos(tile.rawContent || '');
                    const newData = TodoLogic.addTodo(data, group, text);
                    const newContent = TodoLogic.serializeTodos(newData);
                    tile.onContentChange?.(newContent);
                    setViewMode('WIDGET');
                  }}
                />
              )}
              {isTimezones && (
                <TimezoneAddForm
                  onCancel={() => setViewMode('WIDGET')}
                  onAdd={(entry) => {
                    const data = TimezoneLogic.parseTimezones(tile.rawContent || '');
                    data.timezones.push(entry);
                    const newContent = TimezoneLogic.serializeTimezones(data);
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
            <DataCollectionColumnManager
              content={tile.rawContent || ''}
              onChange={(newContent) => {
                tile.onContentChange?.(newContent);
                // Don't switch view, let them continue managing
              }}
            />
          ) : viewMode === 'FEEDS' && isRss ? (
            <div className="h-full w-full">
              <RssFeedManager
                content={tile.rawContent || ''}
                onChange={(newContent) => {
                  tile.onContentChange?.(newContent);
                }}
              />
            </div>
          ) : viewMode === 'ARCHIVE' && isReadItLater ? (
            <div className="h-full w-full">
              <ReadItLaterWidget
                content={tile.rawContent!}
                mode="FOCUS"
                focusMode="ARCHIVE"
                onChange={(newContent) => tile.onContentChange?.(newContent)}
              />
            </div>
          ) : viewMode === 'CODE' ? (
            <div className="h-full w-full">
              {renderEditor ? renderEditor(String(tile.id), zenMode) : (
                tile.rawContent !== undefined ? (
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
                )
              )}
            </div>
          ) : (
            tile.content ? tile.content : (
              <div className="p-8 flex items-center justify-center text-[var(--los-muted)]">
                <MonoText>No content defined for this tile.</MonoText>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const TileContentStructure = ({ tile, renderTileContent }: { tile: TileDef, renderTileContent: any }) => (
  <div className="absolute inset-0 overflow-hidden p-4 flex flex-col pointer-events-none">
    <div className="flex justify-between items-start shrink-0 mb-2 pointer-events-auto">
      <MonoText className="text-xs opacity-50 group-hover:opacity-100 transition-opacity flex-1 mr-2 truncate">
        {tile.title}
      </MonoText>
      {tile.type === 'FOLDER' ? (
        <div className="w-2 h-2 border border-[var(--los-muted)] rotate-45 shrink-0" />
      ) : (
        <div className="w-2 h-2 rounded-full border border-[var(--los-border)] group-hover:bg-[var(--los-accent)] transition-colors shrink-0" />
      )}
    </div>

    <div className="flex-1 overflow-y-auto min-h-0 w-full mb-2 pointer-events-auto">
      {renderTileContent(tile, 'SMALL')}
    </div>

    <div className="text-right shrink-0 mt-auto">
      <MonoText className="text-[10px] text-[var(--los-muted)]">
        {`ID: ${tile.id.toString().toUpperCase().slice(0, 4)}`}
      </MonoText>
    </div>
  </div>
);

const SortableTileItem = ({ tile, setActiveTileId, renderTileContent, handleDragStart, handleDragSave, dragEnabled }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: tile.id, disabled: !dragEnabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1, // Hide orig element while dragging overlay
    zIndex: isDragging ? 999 : 'auto'
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
    <div
      ref={setNodeRef}
      style={style}
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
        "bg-[var(--los-bg)] ring-1 ring-inset ring-[var(--los-border)] hover:bg-white/5 transition-colors group relative cursor-pointer w-full pb-[100%]",
        dragEnabled && "touch-none cursor-move ring-[var(--los-accent)] ring-2 opacity-90 scale-95"
      )}
    >
      <TileContentStructure tile={tile} renderTileContent={renderTileContent} />
    </div>
  );
};

// Default dummy data if none provided
const defaultTiles: TileDef[] = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  title: `Tile 0${i + 1}`,
  content: <div className="p-8"><Editor /></div>
}));
