import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';
import { Sparkles, Archive, Search, Settings, GitBranch, GitCommit, LayoutGrid, ChevronUp, ArrowRight } from 'lucide-preact';

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
  currentWorkspace?: Repository; // Reusing Repository interface for Name/ID
  workspaces?: Repository[];
  onSelectWorkspace?: (ws: Repository) => void;
  onNextWorkspace?: () => void; // Replaces onNextRepository usage for workspaces

  onDashboardClick?: () => void;
  onFilesClick?: () => void; // New prop for Quick Links
  menuItems?: MenuItem[];
  recentFiles?: MenuItem[];

  // Version info
  version?: {
    version: string;
    buildTime: string;
    gitHash?: string;
    full?: string;
  };
}

export const StatusBar = ({
  mode = "NORMAL",
  breadcrumbs = ["~"],
  stats = [],
  currentRepository,
  repositories = [],
  onSelectRepository,
  repositoryLabel = "REPOSITORY",

  currentWorkspace,
  workspaces = [],
  onSelectWorkspace,
  onNextWorkspace,

  onDashboardClick,
  onFilesClick,
  menuItems,
  recentFiles,
  version
}: StatusBarProps) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedMode, setExpandedMode] = useState<'MENU' | 'REPOS' | 'WORKSPACES'>('MENU');
  const [isHovered, setIsHovered] = useState(false);

  // Quick Links Toggle State
  const [navMode, setNavMode] = useState<'QUICK' | 'CONTEXT'>(() => {
    // Initialize from localStorage, default to 'CONTEXT'
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('lifeos-statusbar-nav-mode');
      return (saved === 'QUICK' || saved === 'CONTEXT') ? saved : 'CONTEXT';
    }
    return 'CONTEXT';
  });

  const handleToggleNavMode = (e: MouseEvent) => {
    e.stopPropagation();
    const newMode = navMode === 'CONTEXT' ? 'QUICK' : 'CONTEXT';
    setNavMode(newMode);
    localStorage.setItem('lifeos-statusbar-nav-mode', newMode);
  };

  // Auto-collapse when mode changes (e.g. opening a file switches to FOCUS)
  useEffect(() => {
    setExpanded(false);
  }, [mode]);

  // Helper to handle expansion, toggling if already in that mode
  const handleToggleExpand = (mode: 'MENU' | 'REPOS' | 'WORKSPACES') => {
    if (expanded && expandedMode === mode) {
      setExpanded(false);
    } else {
      setExpandedMode(mode);
      setExpanded(true);
    }
  };

  // On Mobile, tapping the bar generally should wake it up / expand it
  const handleBarClick = (e: MouseEvent) => {
    // If not expanded and not clicking a specific interactive element (handled by stoppropagation below)
    // we expand to menu by default on mobile/touch logic
    if (!expanded) {
      // Logic: If on mobile (or just generally), clicking the empty space expands the menu
      setExpandedMode('MENU');
      setExpanded(true);
    }
  };

  return (
    <>
      {/* Expanded Magic Drawer Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-[990] transition-opacity duration-300",
          expanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setExpanded(false)}
      />

      {/* The Status Bar Container */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[1000] bg-[var(--los-bg)] border-t border-[var(--los-border)] transition-all duration-300 ease-spring",
          // On mobile, if not expanded, it might need to be slightly taller or just standard.
          // We keep h-8 (32px) standard, h-16 (64px) on hover/touch-intent
          expanded ? "h-[40vh]" : (isHovered ? "h-16" : "h-12 md:h-8"), // Increased base height for mobile touch targets
          "shadow-2xl overflow-hidden"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleBarClick as any}
      >

        {/* Expanded Drawer Content */}
        <div className={cn(
          "absolute inset-0 top-16 p-6 transition-opacity duration-200 overflow-y-auto",
          expanded ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
        )}>
          {expandedMode === 'MENU' && (
            <div className="flex flex-col gap-6">
              {/* Main Actions Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {menuItems ? menuItems.map((item, i) => {
                  if (item.type === 'REPOS' && repositories.length > 0) {
                    return (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setExpandedMode('REPOS'); }}
                        className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                      >
                        <MonoLabel className="group-hover:text-[var(--los-accent)] uppercase text-center truncate w-full">{item.label || 'Repositories'}</MonoLabel>
                      </div>
                    )
                  }
                  if (item.type === 'WORKSPACES' && workspaces.length > 0) {
                    return (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); setExpandedMode('WORKSPACES'); }}
                        className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                      >
                        <MonoLabel className="group-hover:text-[var(--los-accent)] uppercase text-center truncate w-full">{item.label || 'Workspaces'}</MonoLabel>
                      </div>
                    )
                  }

                  return (
                    <div key={i}
                      onClick={(e) => { e.stopPropagation(); item.onClick?.(); setExpanded(false); }}
                      className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                    >
                      <MonoLabel className="group-hover:text-[var(--los-accent)] uppercase text-center truncate w-full" title={item.label}>{item.label}</MonoLabel>
                    </div>
                  )
                }) : ['New File', 'Search', 'Settings', 'Git', 'Terminal', 'Zen Mode'].map((action, i) => (
                  <div key={i} className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden">
                    <MonoLabel className="group-hover:text-[var(--los-accent)] truncate w-full text-center" title={action}>{action}</MonoLabel>
                  </div>
                ))}
              </div>

              {/* Recent Files Section */}
              {recentFiles && recentFiles.length > 0 && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
                  <div className="flex items-center gap-4">
                    <div className="h-px bg-[var(--los-border)] flex-1" />
                    <MonoLabel className="text-[var(--los-muted)]">RECENT FILES</MonoLabel>
                    <div className="h-px bg-[var(--los-border)] flex-1" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {recentFiles.map((item, i) => (
                      <div key={`recent-${i}`}
                        onClick={(e) => { e.stopPropagation(); item.onClick?.(); setExpanded(false); }}
                        className="border border-[var(--los-border)] p-3 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2 overflow-hidden"
                      >
                        <div className="flex items-center justify-center w-full">
                          <MonoLabel className="group-hover:text-[var(--los-accent)] text-xs truncate w-full text-center" title={item.label}>
                            {item.label.split('/').pop()}
                          </MonoLabel>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Version Info for Mobile - Shows in Menu */}
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
                      <MonoText className="text-sm text-[var(--los-fg)]">{version.version}</MonoText>
                    </div>
                    <div className="flex items-center justify-between">
                      <MonoLabel className="text-xs">Build:</MonoLabel>
                      <MonoText className="text-[10px] text-[var(--los-muted)]">{new Date(version.buildTime).toLocaleString()}</MonoText>
                    </div>
                    {version.gitHash && (
                      <div className="flex items-center justify-between">
                        <MonoLabel className="text-xs">Commit:</MonoLabel>
                        <MonoText className="text-[10px] font-mono text-[var(--los-muted)]">{version.gitHash}</MonoText>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {expandedMode === 'REPOS' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-4">
                <div onClick={() => setExpandedMode('MENU')} className="cursor-pointer hover:text-[var(--los-accent)] flex items-center gap-1">
                  <ChevronUp className="rotate-[-90deg]" size={16} />
                  <MonoLabel>BACK</MonoLabel>
                </div>
                <MonoLabel className="text-[var(--los-accent)] uppercase ml-auto">REPOSITORIES</MonoLabel>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {repositories.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRepository?.(repo);
                      setExpanded(false);
                    }}
                    className={cn(
                      "border p-4 cursor-pointer transition-colors flex items-center justify-between group",
                      currentRepository?.id === repo.id
                        ? "border-[var(--los-accent)] bg-[var(--los-accent-dim)]"
                        : "border-[var(--los-border)] hover:border-[var(--los-fg)] hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <GitBranch size={16} className={currentRepository?.id === repo.id ? "text-[var(--los-accent)]" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"} />
                      <div className="flex flex-col">
                        <MonoText className={currentRepository?.id === repo.id ? "text-[var(--los-accent)]" : "text-[var(--los-fg)]"}>
                          {repo.name}
                        </MonoText>
                        {repo.branch && <MonoText className="text-[10px] text-[var(--los-muted)]">{repo.branch}</MonoText>}
                      </div>
                    </div>
                    {currentRepository?.id === repo.id && <div className="w-2 h-2 rounded-full bg-[var(--los-accent)]" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {expandedMode === 'WORKSPACES' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-4">
                <div onClick={() => setExpandedMode('MENU')} className="cursor-pointer hover:text-[var(--los-accent)] flex items-center gap-1">
                  <ChevronUp className="rotate-[-90deg]" size={16} />
                  <MonoLabel>BACK</MonoLabel>
                </div>
                <MonoLabel className="text-[var(--los-accent)] uppercase ml-auto">WORKSPACES</MonoLabel>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectWorkspace?.(ws);
                      setExpanded(false);
                    }}
                    className={cn(
                      "border p-4 cursor-pointer transition-colors flex items-center justify-between group",
                      currentWorkspace?.id === ws.id
                        ? "border-[var(--los-accent)] bg-[var(--los-accent-dim)]"
                        : "border-[var(--los-border)] hover:border-[var(--los-fg)] hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutGrid size={16} className={currentWorkspace?.id === ws.id ? "text-[var(--los-accent)]" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"} />
                      <div className="flex flex-col">
                        <MonoText className={currentWorkspace?.id === ws.id ? "text-[var(--los-accent)]" : "text-[var(--los-fg)]"}>
                          {ws.name}
                        </MonoText>
                      </div>
                    </div>
                    {currentWorkspace?.id === ws.id && <div className="w-2 h-2 rounded-full bg-[var(--los-accent)]" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The Bar Itself */}
        <div className="absolute top-0 left-0 right-0 h-full max-h-16 flex items-center justify-between px-4 w-full">

          {/* LEFT COLUMN */}
          <div className="flex-1 flex items-center gap-4 min-w-0">
            <div className={cn(
              "bg-[var(--los-accent)] text-black font-bold text-[10px] px-2 py-0.5 rounded-sm shrink-0 uppercase transition-all",
              isHovered ? "scale-110" : "scale-100"
            )}>
              {mode}
            </div>

            {/* Quick Links Toggle Button - Fix: Prevent Squeezing with shrink-0 */}
            <div
              onClick={handleToggleNavMode as any}
              className="hidden md:flex items-center justify-center w-5 h-5 min-w-[1.25rem] shrink-0 border border-[var(--los-border)] hover:border-[var(--los-accent)] rounded-sm cursor-pointer transition-colors text-[10px] font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              title={navMode === 'CONTEXT' ? "Switch to Quick Links" : "Switch to Context Selectors"}
            >
              {navMode === 'CONTEXT' ? '2' : '1'}
            </div>

            {/* QUICK LINKS MODE */}
            {navMode === 'QUICK' && (
              <div className="hidden md:flex items-center gap-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('[StatusBar] Dashboard button clicked'); // Debug log
                    if (onDashboardClick) {
                      onDashboardClick();
                    } else {
                      console.log('[StatusBar] onDashboardClick is undefined');
                    }
                  }}
                  className="flex items-center gap-2 hover:text-[var(--los-accent)] transition-colors group cursor-pointer"
                >
                  <LayoutGrid size={12} className="group-hover:animate-pulse" />
                  <MonoText className="text-xs font-bold uppercase">Dashboard</MonoText>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('[StatusBar] Files button clicked'); // Debug log
                    if (onFilesClick) {
                      onFilesClick();
                    } else {
                      console.log('[StatusBar] onFilesClick is undefined');
                    }
                  }}
                  className="flex items-center gap-2 hover:text-[var(--los-accent)] transition-colors group cursor-pointer"
                >
                  <Archive size={12} className="group-hover:animate-pulse" />
                  <MonoText className="text-xs font-bold uppercase">Files</MonoText>
                </button>
              </div>
            )}

            {/* CONTEXT SELECTORS MODE */}
            {navMode === 'CONTEXT' && (
              <>
                {(currentRepository || repositories.length > 0) && (
                  <div
                    className={cn(
                      "hidden md:flex items-center gap-2 cursor-pointer group transtion-all duration-300",
                      expanded && expandedMode === 'REPOS' ? "text-[var(--los-accent)]" : "text-[var(--los-fg)] hover:text-[var(--los-accent)]"
                    )}
                    onClick={(e) => { e.stopPropagation(); handleToggleExpand('REPOS'); }}
                    title={`Change Repository`}
                  >
                    <GitCommit size={12} className="group-hover:animate-pulse shrink-0" />
                    <div className="flex items-center whitespace-nowrap hidden md:flex">
                      <MonoText className="text-xs font-bold ml-2">{currentRepository ? currentRepository.name : "SELECT REPO"}</MonoText>
                      <ChevronUp size={10} className="ml-1 text-[var(--los-muted)] group-hover:text-[var(--los-accent)]" />
                    </div>
                  </div>
                )}

                {currentRepository && currentWorkspace && (
                  <div className="hidden md:block h-4 w-px bg-[var(--los-border)] mx-1" />
                )}

                {currentWorkspace && (
                  <div
                    className={cn(
                      "hidden md:flex items-center gap-2 cursor-pointer group transtion-all duration-300 relative z-20",
                      "text-[var(--los-fg)] hover:text-[var(--los-accent)]"
                    )}
                    onClick={(e) => { e.stopPropagation(); handleToggleExpand('WORKSPACES' as any); }}
                    title={`Change Workspace`}
                  >
                    {onNextWorkspace && (
                      <div
                        className="mr-1 p-1.5 hover:bg-[var(--los-accent)] hover:text-black rounded-sm transition-all opacity-0 group-hover:opacity-100 hidden md:block" // Hidden on mobile to avoid misclicks
                        onClick={(e) => {
                          e.stopPropagation();
                          onNextWorkspace();
                        }}
                        title="Next Workspace"
                      >
                        <ArrowRight size={14} />
                      </div>
                    )}

                    <LayoutGrid size={12} className="group-hover:animate-pulse shrink-0" />
                    <div className="flex items-center whitespace-nowrap hidden md:flex">
                      <MonoText className="text-xs font-bold ml-2">{currentWorkspace.name}</MonoText>
                      <ChevronUp size={10} className="ml-1 text-[var(--los-muted)] group-hover:text-[var(--los-accent)]" />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Breadcrumbs (Shifted to Left on Hover/Expand) - Hidden entirely on mobile when NOT expanded */}
            <div className={cn(
              "hidden lg:flex items-center gap-2 transition-all duration-500 transform origin-left whitespace-nowrap overflow-hidden ml-2",
              "opacity-100 translate-x-0 max-w-[500px]"
            )}>
              <span className="text-[var(--los-muted)]">/</span>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  <MonoText className={cn("text-xs", i === breadcrumbs.length - 1 ? "text-[var(--los-fg)]" : "text-[var(--los-muted)]")}>
                    {crumb}
                  </MonoText>
                  {i < breadcrumbs.length - 1 && <span className="text-[var(--los-muted)] text-[10px]">/</span>}
                </span>
              ))}
            </div>
          </div>


          {/* CENTER COLUMN */}
          <div className="flex-[2] flex items-center justify-center relative h-full">
            {/* Magic Button - Always interactable on mobile (opacity-100) or if hovered/expanded */}
            {/* On mobile, we make it smaller but visible? Or just the icon? */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand('MENU');
              }}
              className={cn(
                "absolute transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] flex items-center gap-2 rounded-full border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black shadow-[0_0_15px_rgba(var(--los-accent-rgb),0.3)]",
                // Show on mobile by default (opacity-100), show on desktop only when hovered/expanded
                (isHovered || expanded)
                  ? "px-6 py-2 scale-100 translate-y-0"
                  : "px-2 py-0.5 scale-90 translate-y-0 opacity-80 hover:opacity-100"
              )}>
              <Sparkles size={(isHovered || expanded) ? 18 : 14} fill="currentColor" className="animate-pulse transition-all" />
              <span className={cn(
                "font-bold uppercase tracking-widest hidden sm:inline transition-all",
                (isHovered || expanded) ? "text-sm" : "text-[10px]"
              )}>Life OS</span>
            </button>
          </div>


          {/* RIGHT COLUMN */}
          <div className="flex-1 flex items-center justify-end gap-6 min-w-0">
            {/* Version Info - Always visible on desktop */}
            {version && (
              <div
                className={cn(
                  "hidden md:flex items-center gap-2 whitespace-nowrap relative group/version transition-all duration-300",
                  "opacity-100"
                )}
                title={`Build: ${version.buildTime}${version.gitHash ? `\nCommit: ${version.gitHash}` : ''}`}
              >
                <MonoLabel className="text-[9px]">VERSION</MonoLabel>
                <MonoText className="text-[10px] text-[var(--los-muted)]">{version.version}</MonoText>
              </div>
            )}

            {/* Stats hidden on small screens */}
            {stats.map((stat, i) => (
              <div key={i} className="hidden md:flex items-center gap-2 whitespace-nowrap relative group/stat">
                <MonoLabel className="text-[9px]">{stat.label}</MonoLabel>

                {stat.options ? (
                  <div className="relative">
                    <MonoText className="text-[10px] cursor-pointer hover:text-[var(--los-accent)] transition-colors">
                      {stat.value}
                    </MonoText>

                    {/* Dropdown Menu */}
                    <div className="absolute bottom-full right-0 mb-2 w-32 bg-[var(--los-bg)] border border-[var(--los-border)] shadow-xl rounded-sm opacity-0 invisible group-hover/stat:opacity-100 group-hover/stat:visible transition-all duration-200 flex flex-col z-[150]">
                      {stat.options.map(opt => (
                        <div
                          key={opt}
                          onClick={(e) => {
                            e.stopPropagation();
                            stat.onOptionSelect?.(opt);
                          }}
                          className={cn(
                            "px-3 py-2 text-[10px] cursor-pointer hover:bg-[var(--los-accent)] hover:text-black transition-colors font-mono uppercase",
                            stat.value === opt ? "text-[var(--los-accent)]" : "text-[var(--los-muted)]"
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
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <MonoText className="text-[10px] hidden sm:block">ONLINE</MonoText>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
