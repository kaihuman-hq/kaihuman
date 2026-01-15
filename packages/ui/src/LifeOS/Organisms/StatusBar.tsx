import { h } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';

export interface StatusBarProps {
  mode?: string;
  breadcrumbs?: string[];
  stats?: { label: string; value: string }[];
}

export const StatusBar = ({ mode = "NORMAL", breadcrumbs = ["~"], stats = [] }: StatusBarProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Expanded Magic Drawer Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300",
          expanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setExpanded(false)}
      />

      {/* Expanded Magic Drawer Content */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-[var(--los-bg)] border-t border-[var(--los-border)] transition-all duration-300 ease-out flex flex-col shadow-2xl overflow-hidden",
          expanded ? "h-[40vh]" : "h-[var(--los-status-height)]"
        )}
      >

        {/* Expanded Content Area */}
        <div className={cn(
          "flex-1 p-6 grid grid-cols-4 gap-4 opacity-0 transition-opacity duration-200 delay-100",
          expanded && "opacity-100"
        )}>
          <div className="col-span-1 border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] cursor-pointer group">
            <MonoLabel className="block mb-2 group-hover:text-[var(--los-accent)]">Quick Action</MonoLabel>
            <MonoText>New File...</MonoText>
          </div>
          <div className="col-span-1 border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] cursor-pointer group">
            <MonoLabel className="block mb-2 group-hover:text-[var(--los-accent)]">Quick Action</MonoLabel>
            <MonoText>Search...</MonoText>
          </div>
          {/* More grid items... */}
        </div>

        {/* The Bar Itself (Always visible at bottom) */}
        <div
          className="h-[var(--los-status-height)] flex items-center justify-between px-4 border-t border-[var(--los-border)] bg-[var(--los-bg)] cursor-pointer hover:bg-white/5 select-none shrink-0"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-4">
            <div className="bg-[var(--los-accent)] text-black font-bold text-xs px-2 py-0.5 rounded-sm">
              {mode}
            </div>
            <div className="flex items-center gap-2">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-2">
                  <MonoText className={cn(i === breadcrumbs.length - 1 ? "text-[var(--los-fg)]" : "")}>
                    {crumb}
                  </MonoText>
                  {i < breadcrumbs.length - 1 && <span className="text-[var(--los-muted)]">/</span>}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="flex items-center gap-2">
                <MonoLabel>{stat.label}</MonoLabel>
                <MonoText>{stat.value}</MonoText>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
