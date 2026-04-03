import { aiStore, navigationStore } from '@lifosy/core';
import {
  Archive,
  ChevronUp,
  GitBranch,
  GitCommit,
  Home,
  Kanban,
  Keyboard,
  LayoutGrid,
  MoreHorizontal,
} from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { Logo } from '../Atoms/Logo';
import { MonoLabel, MonoText } from '../Atoms/Typography';

export interface Repository {
  id: string;
  name: string;
  url?: string;
  branch?: string;
}

export interface MenuItem {
  label: string;
  onClick?: () => void;
  icon?: any;
  type?: 'REPOS' | 'WORKSPACES' | 'ACTION';
}

export interface StatusBarProps {
  mode?: string;
  breadcrumbs?: string[];
  stats?: {
    label: string;
    value: string;
    options?: string[];
    onOptionSelect?: (option: string) => void;
  }[];

  // Repository (Global Context)
  currentRepository?: Repository;
  repositories?: Repository[];
  onSelectRepository?: (repo: Repository) => void;
  repositoryLabel?: string;

  // Workspace (Local Context)
  currentWorkspace?: Repository;
  workspaces?: Repository[];
  onSelectWorkspace?: (ws: Repository) => void;
  onNextWorkspace?: () => void;

  // Navigation
  onDashboardClick?: () => void;
  onFilesClick?: () => void;
  onBoardClick?: () => void;
  onShortcutsClick?: () => void;
  onSearchClick?: () => void;

  menuItems?: MenuItem[];
  shortcutItems?: MenuItem[];
  recentFiles?: MenuItem[];

  // Version info
  version?: {
    version: string;
    buildTime: string;
    gitHash?: string;
    full?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

interface SubViewProps {
  onClose: () => void;
  onBack: () => void;
}

interface RepoSubViewProps extends SubViewProps {
  repositories: Repository[];
  currentRepository?: Repository;
  onSelectRepository?: (repo: Repository) => void;
}

const RepoSubView = ({
  repositories,
  currentRepository,
  onSelectRepository,
  onClose,
  onBack,
}: RepoSubViewProps) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 mb-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: back button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: back button */}
      <div
        onClick={onBack}
        className="cursor-pointer hover:text-[var(--los-accent)] flex items-center gap-1"
      >
        <ChevronUp className="rotate-[-90deg]" size={16} />
        <MonoLabel>BACK</MonoLabel>
      </div>
      <MonoLabel className="text-[var(--los-accent)] uppercase ml-auto">REPOSITORIES</MonoLabel>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {repositories.map((repo) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: repo selection
        // biome-ignore lint/a11y/useKeyWithClickEvents: repo selection
        <div
          key={repo.id}
          onClick={(e) => {
            e.stopPropagation();
            onSelectRepository?.(repo);
            onClose();
          }}
          className={cn(
            'border p-4 cursor-pointer transition-colors flex items-center justify-between group',
            currentRepository?.id === repo.id
              ? 'border-[var(--los-accent)] bg-[var(--los-accent-dim)]'
              : 'border-[var(--los-border)] hover:border-[var(--los-fg)] hover:bg-white/5',
          )}
        >
          <div className="flex items-center gap-3">
            <GitBranch
              size={16}
              className={
                currentRepository?.id === repo.id
                  ? 'text-[var(--los-accent)]'
                  : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)]'
              }
            />
            <div className="flex flex-col">
              <MonoText
                className={
                  currentRepository?.id === repo.id
                    ? 'text-[var(--los-accent)]'
                    : 'text-[var(--los-fg)]'
                }
              >
                {repo.name}
              </MonoText>
              {repo.branch && (
                <MonoText className="text-[10px] text-[var(--los-muted)]">{repo.branch}</MonoText>
              )}
            </div>
          </div>
          {currentRepository?.id === repo.id && (
            <div className="w-2 h-2 rounded-full bg-[var(--los-accent)]" />
          )}
        </div>
      ))}
    </div>
  </div>
);

interface WorkspaceSubViewProps extends SubViewProps {
  workspaces: Repository[];
  currentWorkspace?: Repository;
  onSelectWorkspace?: (ws: Repository) => void;
}

const WorkspaceSubView = ({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  onClose,
  onBack,
}: WorkspaceSubViewProps) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 mb-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: back button */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: back button */}
      <div
        onClick={onBack}
        className="cursor-pointer hover:text-[var(--los-accent)] flex items-center gap-1"
      >
        <ChevronUp className="rotate-[-90deg]" size={16} />
        <MonoLabel>BACK</MonoLabel>
      </div>
      <MonoLabel className="text-[var(--los-accent)] uppercase ml-auto">WORKSPACES</MonoLabel>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workspaces.map((ws) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: workspace selection
        // biome-ignore lint/a11y/useKeyWithClickEvents: workspace selection
        <div
          key={ws.id}
          onClick={(e) => {
            e.stopPropagation();
            onSelectWorkspace?.(ws);
            onClose();
          }}
          className={cn(
            'border p-4 cursor-pointer transition-colors flex items-center justify-between group',
            currentWorkspace?.id === ws.id
              ? 'border-[var(--los-accent)] bg-[var(--los-accent-dim)]'
              : 'border-[var(--los-border)] hover:border-[var(--los-fg)] hover:bg-white/5',
          )}
        >
          <div className="flex items-center gap-3">
            <LayoutGrid
              size={16}
              className={
                currentWorkspace?.id === ws.id
                  ? 'text-[var(--los-accent)]'
                  : 'text-[var(--los-muted)] group-hover:text-[var(--los-fg)]'
              }
            />
            <MonoText
              className={
                currentWorkspace?.id === ws.id ? 'text-[var(--los-accent)]' : 'text-[var(--los-fg)]'
              }
            >
              {ws.name}
            </MonoText>
          </div>
          {currentWorkspace?.id === ws.id && (
            <div className="w-2 h-2 rounded-full bg-[var(--los-accent)]" />
          )}
        </div>
      ))}
    </div>
  </div>
);

// Items excluded from the mobile More sheet — handled by tabs
const SHEET_EXCLUDED = new Set(['Dashboard', 'Board', 'Quick Note', 'Shortcuts']);

// ---------------------------------------------------------------------------
// RecentFilesSubView
// ---------------------------------------------------------------------------

interface RecentFilesSubViewProps {
  recentFiles: MenuItem[];
  onClose: () => void;
  onBack: () => void;
}

const RecentFilesSubView = ({ recentFiles, onClose, onBack }: RecentFilesSubViewProps) => (
  <div className="flex flex-col">
    <div className="flex items-center gap-3 px-2 py-3 border-b border-[var(--los-border)]">
      <button
        type="button"
        onClick={onBack}
        className="text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
      >
        <ChevronUp className="-rotate-90" size={16} />
      </button>
      <MonoLabel className="text-xs text-[var(--los-muted)]">RECENT FILES</MonoLabel>
    </div>
    {recentFiles.length === 0 ? (
      <div className="px-6 py-4">
        <MonoText className="text-sm text-[var(--los-muted)]">No recent files</MonoText>
      </div>
    ) : (
      recentFiles.map((item) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: list item
        // biome-ignore lint/a11y/useKeyWithClickEvents: list item
        <div
          key={item.label}
          onClick={() => {
            item.onClick?.();
            onClose();
          }}
          className="flex items-center px-6 h-12 cursor-pointer hover:bg-[var(--los-accent)]/5 hover:text-[var(--los-accent)] transition-colors overflow-hidden"
        >
          <MonoText className="text-sm truncate">{item.label}</MonoText>
        </div>
      ))
    )}
  </div>
);

interface ShortcutsSubViewProps {
  items: MenuItem[];
  onClose: () => void;
}

const ShortcutsSubView = ({ items, onClose }: ShortcutsSubViewProps) => (
  <div className="flex flex-col">
    {items.length === 0 ? (
      <div className="px-6 py-4">
        <MonoText className="text-sm text-[var(--los-muted)]">No shortcuts</MonoText>
      </div>
    ) : (
      items.map((item) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: list item
        // biome-ignore lint/a11y/useKeyWithClickEvents: list item
        <div
          key={item.label}
          onClick={() => {
            item.onClick?.();
            onClose();
          }}
          className="flex items-center px-6 h-12 cursor-pointer hover:bg-[var(--los-accent)]/5 hover:text-[var(--los-accent)] transition-colors"
        >
          <MonoText className="text-sm uppercase">{item.label}</MonoText>
        </div>
      ))
    )}
  </div>
);

interface MobileMoreSheetProps {
  menuItems?: MenuItem[];
  shortcutItems?: MenuItem[];
  recentFiles?: MenuItem[];
  repositories: Repository[];
  workspaces: Repository[];
  currentRepository?: Repository;
  currentWorkspace?: Repository;
  onSelectRepository?: (repo: Repository) => void;
  onSelectWorkspace?: (ws: Repository) => void;
}

const MobileMoreSheet = ({
  menuItems,
  shortcutItems,
  recentFiles,
  repositories,
  workspaces,
  currentRepository,
  currentWorkspace,
  onSelectRepository,
  onSelectWorkspace,
}: MobileMoreSheetProps) => {
  const open = navigationStore.moreSheetOpen.value;
  const sheetMode = navigationStore.sheetMode.value;

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);

  const close = () => {
    navigationStore.moreSheetOpen.value = false;
    navigationStore.sheetMode.value = 'MENU';
  };

  const handlePointerDown = (e: PointerEvent) => {
    dragStartY.current = e.clientY;
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (dragStartY.current === null || !panelRef.current) return;
    const delta = Math.max(0, e.clientY - dragStartY.current);
    panelRef.current.style.transform = `translateY(${delta}px)`;
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (dragStartY.current === null || !panelRef.current) return;
    const delta = e.clientY - dragStartY.current;
    if (delta > 80) {
      panelRef.current.style.transform = '';
      close();
    } else {
      panelRef.current.style.transform = '';
    }
    dragStartY.current = null;
  };

  const sheetItems = (menuItems ?? []).filter((item) => !SHEET_EXCLUDED.has(item.label));
  const firstContextIdx = sheetItems.findIndex(
    (item) => item.type === 'REPOS' || item.type === 'WORKSPACES',
  );

  return (
    // Entire sheet is md:hidden — desktop uses the inline drawer
    <div className="md:hidden">
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      <div
        className={cn(
          'fixed inset-0 z-[990] bg-black/50 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={close}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'fixed bottom-14 left-0 right-0 z-[995] bg-[var(--los-bg)] border-t border-[var(--los-border)] max-h-[60vh] overflow-y-auto transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-2 touch-none"
          onPointerDown={handlePointerDown as any}
          onPointerMove={handlePointerMove as any}
          onPointerUp={handlePointerUp as any}
        >
          <div className="w-10 h-1 rounded-full bg-[var(--los-border)]" />
        </div>

        <div className="pb-safe pb-4">
          {sheetMode === 'REPOS' && (
            <div className="px-4">
              <RepoSubView
                repositories={repositories}
                currentRepository={currentRepository}
                onSelectRepository={onSelectRepository}
                onClose={close}
                onBack={() => {
                  navigationStore.sheetMode.value = 'MENU';
                }}
              />
            </div>
          )}

          {sheetMode === 'WORKSPACES' && (
            <div className="px-4">
              <WorkspaceSubView
                workspaces={workspaces}
                currentWorkspace={currentWorkspace}
                onSelectWorkspace={onSelectWorkspace}
                onClose={close}
                onBack={() => {
                  navigationStore.sheetMode.value = 'MENU';
                }}
              />
            </div>
          )}

          {sheetMode === 'RECENT' && (
            <RecentFilesSubView
              recentFiles={recentFiles ?? []}
              onClose={close}
              onBack={() => {
                navigationStore.sheetMode.value = 'MENU';
              }}
            />
          )}

          {sheetMode === 'SHORTCUTS' && (
            <ShortcutsSubView items={shortcutItems ?? []} onClose={close} />
          )}

          {sheetMode === 'MENU' && (
            <div className="flex flex-col">
              {recentFiles && recentFiles.length > 0 && (
                <>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: menu item */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: menu item */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      navigationStore.sheetMode.value = 'RECENT';
                    }}
                    className="flex items-center justify-between px-6 h-12 cursor-pointer hover:bg-[var(--los-accent)]/5 hover:text-[var(--los-accent)] transition-colors"
                  >
                    <MonoText className="text-sm uppercase">Recent Files</MonoText>
                    <ChevronUp className="rotate-90" size={14} />
                  </div>
                  <div className="h-px bg-[var(--los-border)] my-1 mx-4" />
                </>
              )}
              {sheetItems.map((item, idx) => {
                const showSeparator = idx === firstContextIdx && firstContextIdx > 0;
                return (
                  <div key={item.label}>
                    {showSeparator && <div className="h-px bg-[var(--los-border)] my-1 mx-4" />}
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: menu item */}
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: menu item */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.type === 'REPOS') {
                          navigationStore.sheetMode.value = 'REPOS';
                        } else if (item.type === 'WORKSPACES') {
                          navigationStore.sheetMode.value = 'WORKSPACES';
                        } else {
                          item.onClick?.();
                          close();
                        }
                      }}
                      className="flex items-center justify-between px-6 h-12 cursor-pointer hover:bg-[var(--los-accent)]/5 hover:text-[var(--los-accent)] transition-colors"
                    >
                      <MonoText className="text-sm uppercase">{item.label}</MonoText>
                      {(item.type === 'REPOS' || item.type === 'WORKSPACES') && (
                        <ChevronUp className="rotate-90" size={14} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const StatusBar = ({
  mode = 'NORMAL',
  breadcrumbs = ['~'],
  stats = [],
  currentRepository,
  repositories = [],
  onSelectRepository,
  repositoryLabel: _repositoryLabel = 'REPOSITORY',

  currentWorkspace,
  workspaces = [],
  onSelectWorkspace,
  onNextWorkspace: _onNextWorkspace,

  onDashboardClick,
  onFilesClick,
  onBoardClick,
  onShortcutsClick,
  onSearchClick,

  menuItems,
  shortcutItems,
  recentFiles,
  version,
}: StatusBarProps) => {
  // Ephemeral desktop hover state — no cross-component sharing needed
  const [isHovered, setIsHovered] = useState(false);

  // Read navigation store signals (Preact auto-subscribes on .value read in render)
  const expanded = navigationStore.desktopDrawerOpen.value;
  const expandedMode = navigationStore.desktopDrawerMode.value;
  const activeTab = navigationStore.activeTab.value;
  const sheetOpen = navigationStore.moreSheetOpen.value;
  const sheetMode = navigationStore.sheetMode.value;

  // Clean up stale localStorage key from old nav mode toggle
  useEffect(() => {
    localStorage.removeItem('lifeos-statusbar-nav-mode');
  }, []);

  // Initialise activeTab from the current URL on mount
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/board') navigationStore.activeTab.value = 'BOARD';
    else navigationStore.activeTab.value = 'HOME';
  }, []);

  const handleToggleExpand = (mode: 'MENU' | 'REPOS' | 'WORKSPACES') => {
    if (expanded && expandedMode === mode) {
      navigationStore.desktopDrawerOpen.value = false;
    } else {
      navigationStore.desktopDrawerMode.value = mode;
      navigationStore.desktopDrawerOpen.value = true;
    }
  };

  const tabClass = (tab: typeof activeTab) =>
    cn(
      'flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
      activeTab === tab ? 'text-[var(--los-accent)]' : 'text-[var(--los-muted)]',
    );

  return (
    <>
      {/* ── Desktop drawer backdrop (hidden on mobile) ─────────────────── */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      <div
        className={cn(
          'hidden md:block fixed inset-0 bg-black/50 backdrop-blur-sm z-[990] transition-opacity duration-300',
          expanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => {
          navigationStore.desktopDrawerOpen.value = false;
        }}
      />

      {/* ── Mobile More sheet (hidden on desktop) ──────────────────────── */}
      <MobileMoreSheet
        menuItems={menuItems}
        shortcutItems={shortcutItems}
        recentFiles={recentFiles}
        repositories={repositories}
        workspaces={workspaces}
        currentRepository={currentRepository}
        currentWorkspace={currentWorkspace}
        onSelectRepository={onSelectRepository}
        onSelectWorkspace={onSelectWorkspace}
      />

      {/* ── Status Bar Container ────────────────────────────────────────── */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse enter/leave for desktop hover animation only */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-[1000] bg-[var(--los-bg)] border-t border-[var(--los-border)] transition-all duration-300 ease-spring shadow-2xl overflow-hidden',
          // Mobile: always h-14 (tab bar height). Desktop: expands on hover/open.
          'h-14',
          expanded ? 'md:h-[40vh]' : isHovered ? 'md:h-16' : 'md:h-8',
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* ── Desktop drawer content (hidden on mobile) ───────────────── */}
        <div
          className={cn(
            'hidden md:block absolute inset-0 top-16 p-6 transition-opacity duration-200 overflow-y-auto',
            expanded ? 'opacity-100 delay-100' : 'opacity-0 pointer-events-none',
          )}
        >
          {expandedMode === 'MENU' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {menuItems
                  ? menuItems.map((item) => {
                      if (item.type === 'REPOS' && repositories.length > 0) {
                        return (
                          // biome-ignore lint/a11y/noStaticElementInteractions: menu item
                          // biome-ignore lint/a11y/useKeyWithClickEvents: menu item
                          <div
                            key={item.label}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigationStore.desktopDrawerMode.value = 'REPOS';
                            }}
                            className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                          >
                            <MonoLabel className="group-hover:text-[var(--los-accent)] uppercase text-center truncate w-full">
                              {item.label || 'Repositories'}
                            </MonoLabel>
                          </div>
                        );
                      }
                      if (item.type === 'WORKSPACES' && workspaces.length > 0) {
                        return (
                          // biome-ignore lint/a11y/noStaticElementInteractions: menu item
                          // biome-ignore lint/a11y/useKeyWithClickEvents: menu item
                          <div
                            key={item.label}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigationStore.desktopDrawerMode.value = 'WORKSPACES';
                            }}
                            className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                          >
                            <MonoLabel className="group-hover:text-[var(--los-accent)] uppercase text-center truncate w-full">
                              {item.label || 'Workspaces'}
                            </MonoLabel>
                          </div>
                        );
                      }
                      return (
                        // biome-ignore lint/a11y/noStaticElementInteractions: menu item
                        // biome-ignore lint/a11y/useKeyWithClickEvents: menu item
                        <div
                          key={item.label}
                          onClick={(e) => {
                            e.stopPropagation();
                            item.onClick?.();
                            navigationStore.desktopDrawerOpen.value = false;
                          }}
                          className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                        >
                          <MonoLabel
                            className="group-hover:text-[var(--los-accent)] uppercase text-center truncate w-full"
                            title={item.label}
                          >
                            {item.label}
                          </MonoLabel>
                        </div>
                      );
                    })
                  : ['New File', 'Search', 'Settings', 'Git', 'Terminal', 'Zen Mode'].map(
                      (action) => (
                        <div
                          key={action}
                          className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                        >
                          <MonoLabel
                            className="group-hover:text-[var(--los-accent)] truncate w-full text-center"
                            title={action}
                          >
                            {action}
                          </MonoLabel>
                        </div>
                      ),
                    )}
              </div>

              {recentFiles && recentFiles.length > 0 && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
                  <div className="flex items-center gap-4">
                    <div className="h-px bg-[var(--los-border)] flex-1" />
                    <MonoLabel className="text-[var(--los-muted)]">RECENT FILES</MonoLabel>
                    <div className="h-px bg-[var(--los-border)] flex-1" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {recentFiles.map((item) => (
                      // biome-ignore lint/a11y/noStaticElementInteractions: recent file
                      // biome-ignore lint/a11y/useKeyWithClickEvents: recent file
                      <div
                        key={item.label}
                        onClick={(e) => {
                          e.stopPropagation();
                          item.onClick?.();
                          navigationStore.desktopDrawerOpen.value = false;
                        }}
                        className="border border-[var(--los-border)] p-3 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                      >
                        <MonoLabel
                          className="group-hover:text-[var(--los-accent)] text-xs truncate w-full text-center"
                          title={item.label}
                        >
                          {item.label.split('/').pop()}
                        </MonoLabel>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {version && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
                  <div className="flex items-center gap-4">
                    <div className="h-px bg-[var(--los-border)] flex-1" />
                    <MonoLabel className="text-[var(--los-muted)]">VERSION</MonoLabel>
                    <div className="h-px bg-[var(--los-border)] flex-1" />
                  </div>
                  <div className="border border-[var(--los-border)] p-4 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <MonoLabel className="text-xs">Version:</MonoLabel>
                      <MonoText className="text-sm text-[var(--los-fg)]">
                        {version.version}
                      </MonoText>
                    </div>
                    <div className="flex items-center justify-between">
                      <MonoLabel className="text-xs">Build:</MonoLabel>
                      <MonoText className="text-[10px] text-[var(--los-muted)]">
                        {new Date(version.buildTime).toLocaleString()}
                      </MonoText>
                    </div>
                    {version.gitHash && (
                      <div className="flex items-center justify-between">
                        <MonoLabel className="text-xs">Commit:</MonoLabel>
                        <MonoText className="text-[10px] font-mono text-[var(--los-muted)]">
                          {version.gitHash}
                        </MonoText>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {expandedMode === 'REPOS' && (
            <RepoSubView
              repositories={repositories}
              currentRepository={currentRepository}
              onSelectRepository={onSelectRepository}
              onClose={() => {
                navigationStore.desktopDrawerOpen.value = false;
              }}
              onBack={() => {
                navigationStore.desktopDrawerMode.value = 'MENU';
              }}
            />
          )}

          {expandedMode === 'WORKSPACES' && (
            <WorkspaceSubView
              workspaces={workspaces}
              currentWorkspace={currentWorkspace}
              onSelectWorkspace={onSelectWorkspace}
              onClose={() => {
                navigationStore.desktopDrawerOpen.value = false;
              }}
              onBack={() => {
                navigationStore.desktopDrawerMode.value = 'MENU';
              }}
            />
          )}
        </div>

        {/* ── Desktop bar (hidden on mobile) ──────────────────────────── */}
        <div className="hidden md:flex absolute top-0 left-0 right-0 h-full max-h-16 items-stretch justify-between w-full">
          {/* LEFT COLUMN */}
          <div className="flex-1 flex items-center gap-4 min-w-0 pl-4">
            <div
              className={cn(
                'bg-[var(--los-accent)] text-black font-bold text-[10px] px-2 py-0.5 rounded-sm shrink-0 uppercase transition-all',
                isHovered ? 'scale-110' : 'scale-100',
              )}
            >
              {mode}
            </div>

            {/* Nav Links — always visible on desktop */}
            <div className="hidden md:flex h-full items-stretch gap-px">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDashboardClick?.();
                }}
                className="h-full px-3 flex items-center gap-2 hover:text-[var(--los-accent)] hover:bg-[var(--los-accent)]/5 transition-colors group cursor-pointer"
              >
                <LayoutGrid size={12} className="group-hover:animate-pulse" />
                <MonoText className="text-xs font-bold uppercase">Dashboard</MonoText>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFilesClick?.();
                }}
                className="h-full px-3 flex items-center gap-2 hover:text-[var(--los-accent)] hover:bg-[var(--los-accent)]/5 transition-colors group cursor-pointer"
              >
                <Archive size={12} className="group-hover:animate-pulse" />
                <MonoText className="text-xs font-bold uppercase">Files</MonoText>
              </button>
              {onBoardClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBoardClick();
                  }}
                  className="h-full px-3 flex items-center gap-2 hover:text-[var(--los-accent)] hover:bg-[var(--los-accent)]/5 transition-colors group cursor-pointer"
                >
                  <Kanban size={12} className="group-hover:animate-pulse" />
                  <MonoText className="text-xs font-bold uppercase">Board</MonoText>
                </button>
              )}
              {onShortcutsClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShortcutsClick();
                  }}
                  className="h-full px-3 flex items-center gap-2 hover:text-[var(--los-accent)] hover:bg-[var(--los-accent)]/5 transition-colors group cursor-pointer"
                >
                  <MonoText className="text-xs font-bold uppercase">Shortcuts</MonoText>
                </button>
              )}
            </div>

            {/* Breadcrumbs */}
            <div className="hidden lg:flex items-center gap-2 transition-all duration-500 transform origin-left whitespace-nowrap overflow-hidden ml-2 opacity-100 translate-x-0 max-w-[500px]">
              <span className="text-[var(--los-muted)]">/</span>
              {breadcrumbs.map((crumb, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: breadcrumbs have no stable id
                <span key={i} className="flex items-center gap-1">
                  <MonoText
                    className={cn(
                      'text-xs',
                      i === breadcrumbs.length - 1
                        ? 'text-[var(--los-fg)]'
                        : 'text-[var(--los-muted)]',
                    )}
                  >
                    {crumb}
                  </MonoText>
                  {i < breadcrumbs.length - 1 && (
                    <span className="text-[var(--los-muted)] text-[10px]">/</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* CENTER COLUMN — magic button (overflow menu for secondary destinations) */}
          <div className="flex-[2] flex items-center justify-center relative h-full pointer-events-none">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand('MENU');
              }}
              className={cn(
                'absolute pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] flex items-center gap-2 rounded-full border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black shadow-[0_0_15px_rgba(0,255,0,0.3)]',
                isHovered || expanded
                  ? 'px-6 py-2 scale-100 translate-y-0'
                  : 'px-2 py-0.5 scale-90 translate-y-0 opacity-80 hover:opacity-100',
              )}
            >
              <Logo size={isHovered || expanded ? 18 : 14} className="transition-all" />
              <span
                className={cn(
                  'font-bold uppercase tracking-widest hidden md:inline transition-all',
                  isHovered || expanded ? 'text-sm' : 'text-[10px]',
                )}
              >
                kaihuman
              </span>
            </button>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex-1 flex items-center justify-end gap-6 min-w-0 pr-4">
            {(currentRepository || repositories.length > 0) && (
              /* biome-ignore lint/a11y/noStaticElementInteractions: context selector */
              /* biome-ignore lint/a11y/useKeyWithClickEvents: context selector */
              <div
                className={cn(
                  'hidden md:flex items-center gap-2 cursor-pointer group transition-all duration-300',
                  expanded && expandedMode === 'REPOS'
                    ? 'text-[var(--los-accent)]'
                    : 'text-[var(--los-fg)] hover:text-[var(--los-accent)]',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleExpand('REPOS');
                }}
                title="Change Repository"
              >
                <GitCommit size={12} className="group-hover:animate-pulse shrink-0" />
                <div className="flex items-center whitespace-nowrap">
                  <MonoText className="text-xs font-bold ml-2">
                    {currentRepository ? currentRepository.name : 'SELECT REPO'}
                  </MonoText>
                  <ChevronUp
                    size={10}
                    className="ml-1 text-[var(--los-muted)] group-hover:text-[var(--los-accent)]"
                  />
                </div>
              </div>
            )}

            {version && (
              <div
                className="hidden md:flex items-center gap-2 whitespace-nowrap opacity-100"
                title={`Build: ${version.buildTime}${version.gitHash ? `\nCommit: ${version.gitHash}` : ''}`}
              >
                <MonoLabel className="text-[9px]">VERSION</MonoLabel>
                <MonoText className="text-[10px] text-[var(--los-muted)]">
                  {version.version}
                </MonoText>
              </div>
            )}

            {stats.map((stat) => (
              <div
                key={stat.label}
                className="hidden md:flex items-center gap-2 whitespace-nowrap relative group/stat"
              >
                <MonoLabel className="text-[9px]">{stat.label}</MonoLabel>
                {stat.options ? (
                  <div className="relative">
                    <MonoText className="text-[10px] cursor-pointer hover:text-[var(--los-accent)] transition-colors">
                      {stat.value}
                    </MonoText>
                    <div className="absolute bottom-full right-0 mb-2 w-32 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-xl rounded-sm opacity-0 invisible group-hover/stat:opacity-100 group-hover/stat:visible transition-all duration-200 flex flex-col z-[150]">
                      {stat.options.map((opt) => (
                        // biome-ignore lint/a11y/noStaticElementInteractions: stat option
                        // biome-ignore lint/a11y/useKeyWithClickEvents: stat option
                        <div
                          key={opt}
                          onClick={(e) => {
                            e.stopPropagation();
                            stat.onOptionSelect?.(opt);
                          }}
                          className={cn(
                            'px-3 py-2 text-[10px] cursor-pointer hover:bg-[var(--los-accent)] hover:text-black transition-colors font-mono uppercase',
                            stat.value === opt
                              ? 'text-[var(--los-accent)]'
                              : 'text-[var(--los-muted)]',
                          )}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <MonoText className="text-[10px]">{stat.value}</MonoText>
                )}
              </div>
            ))}

            {/* biome-ignore lint/a11y/noStaticElementInteractions: AI toggle */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: AI toggle */}
            <div
              className="flex items-center gap-2 cursor-pointer group hover:bg-[var(--los-accent)]/10 px-2 py-1 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                aiStore.togglePanel();
              }}
              title={
                aiStore.isConnected.value
                  ? 'Local AI Connected (Click to close)'
                  : 'Local AI Disconnected (Click to connect)'
              }
            >
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  aiStore.isConnected.value
                    ? 'bg-[var(--los-accent)] animate-pulse'
                    : 'bg-[var(--los-muted)]',
                )}
              />
              <MonoText
                className={cn(
                  'text-[10px] hidden sm:block font-bold',
                  aiStore.isConnected.value
                    ? 'text-[var(--los-accent)]'
                    : 'text-[var(--los-muted)]',
                )}
              >
                AI
              </MonoText>
            </div>
          </div>
        </div>

        {/* ── Mobile tab bar (hidden on desktop) ──────────────────────── */}
        <div className="flex md:hidden absolute bottom-0 left-0 right-0 h-14">
          {/* Home */}
          <button
            type="button"
            className={tabClass('HOME')}
            onClick={(e) => {
              e.stopPropagation();
              navigationStore.activeTab.value = 'HOME';
              onDashboardClick?.();
            }}
          >
            <Home size={18} />
            <MonoText className="text-[9px] uppercase">Home</MonoText>
          </button>

          {/* Board */}
          <button
            type="button"
            className={tabClass('BOARD')}
            onClick={(e) => {
              e.stopPropagation();
              if (onBoardClick) {
                navigationStore.activeTab.value = 'BOARD';
                onBoardClick();
              }
            }}
            disabled={!onBoardClick}
          >
            <Kanban size={18} />
            <MonoText className="text-[9px] uppercase">Board</MonoText>
          </button>

          {/* Shortcuts */}
          <button
            type="button"
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
              sheetOpen && sheetMode === 'SHORTCUTS'
                ? 'text-[var(--los-accent)]'
                : 'text-[var(--los-muted)]',
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (sheetOpen && sheetMode === 'SHORTCUTS') {
                navigationStore.moreSheetOpen.value = false;
              } else {
                navigationStore.activeTab.value = 'MORE';
                navigationStore.sheetMode.value = 'SHORTCUTS';
                navigationStore.moreSheetOpen.value = true;
              }
            }}
          >
            <Keyboard size={18} />
            <MonoText className="text-[9px] uppercase">Shortcuts</MonoText>
          </button>

          {/* More */}
          <button
            type="button"
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors',
              sheetOpen && sheetMode !== 'SHORTCUTS'
                ? 'text-[var(--los-accent)]'
                : 'text-[var(--los-muted)]',
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (sheetOpen && sheetMode !== 'SHORTCUTS') {
                navigationStore.moreSheetOpen.value = false;
              } else {
                navigationStore.activeTab.value = 'MORE';
                navigationStore.sheetMode.value = 'MENU';
                navigationStore.moreSheetOpen.value = true;
              }
            }}
          >
            <MoreHorizontal size={18} />
            <MonoText className="text-[9px] uppercase">More</MonoText>
          </button>
        </div>
      </div>
    </>
  );
};
