import { h } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';
import { Sparkles, Archive, Search, Settings, GitBranch, GitCommit } from 'lucide-preact';

export interface Repository {
  id: string;
  name: string;
  url?: string;
  branch?: string;
}

export interface StatusBarProps {
  mode?: string;
  breadcrumbs?: string[];
  stats?: { label: string; value: string }[];
  currentRepository?: Repository;
  repositories?: Repository[];
  onSelectRepository?: (repo: Repository) => void;
  onDashboardClick?: () => void;
}

export const StatusBar = ({
  mode = "NORMAL",
  breadcrumbs = ["~"],
  stats = [],
  currentRepository,
  repositories = [],
  onSelectRepository,
  onDashboardClick
}: StatusBarProps) => {
  const [expanded, setExpanded] = useState(false);
  const [expandedMode, setExpandedMode] = useState<'MENU' | 'REPOS'>('MENU');
  const [isHovered, setIsHovered] = useState(false);

  const handleToggleExpand = (mode: 'MENU' | 'REPOS') => {
    if (expanded && expandedMode === mode) {
      setExpanded(false);
    } else {
      setExpandedMode(mode);
      setExpanded(true);
    }
  };

  return (
    <>
      {/* Expanded Magic Drawer Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] transition-opacity duration-300",
          expanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setExpanded(false)}
      />

      {/* The Status Bar Container */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[100] bg-[var(--los-bg)] border-t border-[var(--los-border)] transition-all duration-300 ease-spring",
          expanded ? "h-[40vh]" : (isHovered ? "h-16" : "h-8"),
          "shadow-2xl overflow-hidden"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >

        {/* Expanded Drawer Content */}
        <div className={cn(
          "absolute inset-0 top-16 p-6 transition-opacity duration-200 overflow-y-auto",
          expanded ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
        )}>
          {expandedMode === 'MENU' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div
                onClick={() => { onDashboardClick?.(); setExpanded(false); }}
                className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2"
              >
                <MonoLabel className="group-hover:text-[var(--los-accent)]">DASHBOARD</MonoLabel>
              </div>
              {['New File', 'Search', 'Settings', 'Git', 'Terminal', 'Zen Mode'].map((action, i) => (
                <div key={i} className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2">
                  <MonoLabel className="group-hover:text-[var(--los-accent)]">{action}</MonoLabel>
                </div>
              ))}
            </div>
          )}

          {expandedMode === 'REPOS' && (
            <div className="flex flex-col gap-2">
              <MonoLabel className="mb-4 text-[var(--los-accent)]">SELECT REPOSITORY</MonoLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {repositories.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => {
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

            {currentRepository && (
              <div
                className={cn(
                  "hidden md:flex items-center gap-2 cursor-pointer group transtion-all duration-300",
                  expanded && expandedMode === 'REPOS' ? "text-[var(--los-accent)]" : "text-[var(--los-fg)] hover:text-[var(--los-accent)]"
                )}
                onClick={() => handleToggleExpand('REPOS')}
                title="Change Repository"
              >
                <GitCommit size={12} className="group-hover:animate-pulse" />
                <MonoText className="text-xs font-bold">{currentRepository.name}</MonoText>
              </div>
            )}
          </div>


          {/* CENTER COLUMN */}
          <div className="flex-[2] flex items-center justify-center relative h-full gap-4">
            {/* Always visible Breadcrumbs */}
            <div className="flex items-center gap-2 transition-all duration-300">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  <MonoText className={cn("text-xs", i === breadcrumbs.length - 1 ? "text-[var(--los-fg)]" : "text-[var(--los-muted)]")}>
                    {crumb}
                  </MonoText>
                  {i < breadcrumbs.length - 1 && <span className="text-[var(--los-muted)] text-[10px]">/</span>}
                </span>
              ))}
            </div>

            {/* Magic Button - Now inline/adjacent, or icon only */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleExpand('MENU');
              }}
              className={cn(
                "transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black",
                isHovered ? "visible opacity-100 scale-100" : "invisible opacity-0 scale-50 w-0 px-0 border-0"
              )}>
              <Sparkles size={12} />
            </button>
          </div>


          {/* RIGHT COLUMN */}
          <div className="flex-1 flex items-center justify-end gap-6 min-w-0">
            {stats.map((stat, i) => (
              <div key={i} className="flex items-center gap-2 whitespace-nowrap hidden sm:flex">
                <MonoLabel className="text-[9px]">{stat.label}</MonoLabel>
                <MonoText className="text-[10px]">{stat.value}</MonoText>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <MonoText className="text-[10px]">ONLINE</MonoText>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
