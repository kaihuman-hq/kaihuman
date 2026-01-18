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
import { EventAddForm } from '../Organisms/Widgets/EventAddForm';
import * as EventsLogic from '../Organisms/Widgets/EventsLogic';
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
  onNavigate?: (path: string[]) => void; // Path is list of IDs
  onItemClick?: (item: TileDef) => void;

  currentRepository?: import('../Organisms/StatusBar').Repository;
  repositories?: import('../Organisms/StatusBar').Repository[];
  onSelectRepository?: (repo: import('../Organisms/StatusBar').Repository) => void;
}

export const MainApp = ({ tiles = defaultTiles, config, fileContents = {}, onConfigChange, fileSystem, onItemClick, onNavigate, ...props }: MainAppProps) => {
  // State for legacy/single-level mode or Dashboard mode
  const [activeTileId, setActiveTileId] = useState<string | number | null>(null);

  // Dashboard State
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [localConfig, setLocalConfig] = useState<DashboardConfig | undefined>(config);

  // Store original config when entering Drag Mode for cancellation
  const [originalConfig, setOriginalConfig] = useState<DashboardConfig | undefined>(undefined);

  // Store current drag id for drag overlay
  const [activeId, setActiveId] = useState<string | number | null>(null);

  useEffect(() => {
    if (config) setLocalConfig(config);
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
      const parts = entry.path.split('.');
      const ext = parts.length > 1 ? '.' + parts.slice(1).join('.') : '';

      return {
        id: entry.path, // Use path as ID
        title: entry.path,
        type: 'FILE',
        extension: ext,
        rawContent: fileContents[entry.path],
        onContentChange: (newContent: string) => {
          // How to handle save? Ideally pass callback up.
          // For now, we update local state if needed?
        }
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
    return tile.content;
  };

  // If fileSystem is provided, we use the Miller Column Layout
  const isMillerMode = !!fileSystem;

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
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-1 sm:grid-cols-2";
    if (count === 3) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";
    if (count === 4) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
    if (count === 5) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
    if (count === 6) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
    if (count === 7) return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7";
    return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8";
  };

  return (
    <div
      className="h-screen w-full max-w-[100vw] bg-[var(--los-bg)] overflow-hidden relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >

      {/* CENTER STAGE: The Matrix OR The Active Tile */}
      <MainGrid viewState={activeTileId !== null ? 'FOCUS' : 'DASHBOARD'}>
        <Tile title={activeTileId !== null ? `FOCUS: ${activeTileId}` : undefined} column="center">
          {activeTileId === null ? (
            isMillerMode ? (
              // MILLER COLUMNS LAYOUT
              <div className="absolute top-0 left-0 right-0 bottom-8 flex flex-row overflow-x-auto">
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
                    />
                  )
                })}
              </div>
            ) : (
              // LEGACY SINGLE GRID LAYOUT OR DASHBOARD
              <div
                className={cn(
                  "absolute top-0 left-0 right-0 bottom-8 overflow-y-auto overflow-x-hidden",
                  !localConfig ? getResponsiveGridClass(displayTiles.length) : "block"
                )}
                key="matrix"
              >
                {localConfig ? (
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
            />
          )}
        </Tile>
      </MainGrid>

      {/* Sticky Status Bar */}
      <StatusBar
        mode={activeTileId !== null ? "FOCUS" : (dragEnabled ? "DND" : "NORMAL")}
        breadcrumbs={getBreadcrumbs()}
        stats={[
          { label: "TILES", value: displayTiles.length.toString() },
          { label: "GRID", value: activeTileId ? "OFF" : "AUTO" },
          ...(localConfig ? [{ label: "WORKSPACE", value: localConfig.dashboards.find(d => d.id === currentDashboardId)?.name || "UNKNOWN" }] : [])
        ]}
        onDashboardClick={() => {
          if (dragEnabled) {
            // Show cancellation menu or just cancel?
          } else {
            handleDashboardClick();
          }
        }}
        // Dashboard Integration
        repositoryLabel={localConfig ? "WORKSPACES" : "SELECT REPOSITORY"}
        repositories={localConfig ? localConfig.dashboards.map(d => ({ id: d.id, name: d.name })) : props.repositories}
        currentRepository={localConfig ? { id: currentDashboardId || '', name: localConfig.dashboards?.find(d => d.id === currentDashboardId)?.name || 'Unknown' } : props.currentRepository}
        onSelectRepository={(repo) => {
          if (!dragEnabled) {
            if (localConfig) {
              setActiveDashboardId(repo.id);
            } else {
              props.onSelectRepository?.(repo);
            }
          }
        }}
        onNextRepository={!dragEnabled && localConfig ? handleNextDashboard : undefined}
        menuItems={dragEnabled ? [
          { label: "Save Order", onClick: handleDragSave },
          { label: "Cancel Reorder", onClick: handleDragCancel }
        ] : (localConfig ? (localConfig.files?.recentlyOpened || []).map(path => ({
          label: path,
          onClick: () => {
            const conf = localConfig;
            if (conf) {
              const entry = conf.entries.find(e => e.path === path);
              if (entry) {
                setActiveDashboardId(entry.dashboard);
                setActiveTileId(entry.path);
              } else {
                console.warn("File not found in dashboard entries:", path);
              }
            }
          }
        })) : undefined)}
      />
    </div>
  );
};

const FocusedTile = ({ tile, onClose }: { tile: TileDef; onClose: () => void }) => {
  const isTimeTracking = tile.extension === '.timetracking.csv';
  const isEvents = tile.extension === '.events.csv';
  const hasWidget = (isTimeTracking || isEvents) && !!tile.rawContent;

  const [viewMode, setViewMode] = useState<string>(hasWidget ? 'WIDGET' : 'CODE');

  return (
    <div
      className="absolute top-0 left-0 right-0 bottom-8 bg-[var(--los-bg)] z-10 p-8 flex flex-col"
      key={`focused-${tile.id}`}
    >
      <div
        className="flex-1 border border-[var(--los-border)] flex flex-col relative bg-[var(--los-bg)] animate-in fade-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header / Controls */}
        <div className="h-12 border-b border-[var(--los-border)] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            <MonoHeader className="text-[var(--los-accent)]">{`TILE: ${tile.id.toString().toUpperCase().padStart(4, '0')}`}</MonoHeader>

            {hasWidget && (
              <div className="flex bg-[var(--los-border)] rounded-sm p-0.5 ml-4">
                <button
                  onClick={() => setViewMode('WIDGET')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                    viewMode === 'WIDGET' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                  )}
                >
                  WIDGET
                </button>

                {isTimeTracking && (
                  <button
                    onClick={() => setViewMode('CHARTS')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                      viewMode === 'CHARTS' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    CHARTS
                  </button>
                )}

                {isEvents && (
                  <button
                    onClick={() => setViewMode('ADD')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                      viewMode === 'ADD' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                    )}
                  >
                    ADD EVENT
                  </button>
                )}

                <button
                  onClick={() => setViewMode('CODE')}
                  className={cn(
                    "px-3 py-1 text-[10px] font-mono transition-colors rounded-sm",
                    viewMode === 'CODE' ? "bg-[var(--los-bg)] text-[var(--los-fg)]" : "text-[var(--los-muted)] hover:text-[var(--los-fg)]"
                  )}
                >
                  CODE
                </button>
              </div>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex items-center gap-2 group px-2 py-1 hover:bg-red-500/10 rounded-sm transition-colors"
          >
            <span className="text-[10px] text-[var(--los-muted)] group-hover:text-red-500">[CLOSE]</span>
            <div className="w-2 h-2 rounded-full border border-[var(--los-muted)] group-hover:border-red-500 group-hover:bg-red-500 transition-colors" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-0 relative">
          {viewMode === 'WIDGET' && hasWidget ? (
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
            </div>
          ) : viewMode === 'CHARTS' && isTimeTracking ? (
            <div className="h-full w-full p-8">
              <TimeTrackingCharts
                data={tile.rawContent!}
              />
            </div>
          ) : viewMode === 'ADD' && isEvents ? (
            <div className="h-full w-full p-8 flex justify-center items-start">
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
      onMouseDown={() => setPressing(true)}
      onMouseUp={() => setPressing(false)}
      onMouseLeave={() => setPressing(false)}
      onTouchStart={() => setPressing(true)}
      onTouchEnd={() => setPressing(false)}
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
