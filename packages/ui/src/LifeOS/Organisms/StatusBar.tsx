import { h } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoLabel, MonoText } from '../Atoms/Typography';
import { Sparkles, Archive, Search, Settings } from 'lucide-preact';

export interface StatusBarProps {
  mode?: string;
  breadcrumbs?: string[];
  stats?: { label: string; value: string }[];
}

export const StatusBar = ({ mode = "NORMAL", breadcrumbs = ["~"], stats = [] }: StatusBarProps) => {
  const [expanded, setExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false); // Track hover state for desktop (and touch for mobile simulation)

  // Combined interaction handler: expand logic remains for the full drawer (on click of Magic Button maybe?)
  // For now, the user request says "Hovering over it... lets the bar grow". 
  // And "on mobile clicking on it".
  // Let's treat "Hover" as the "Grow" state.
  // And "Click" as the "Open Magic Drawer" state?
  // The user prompt says: "Hovering over it ... shows a magic button". 

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
          // Height logic
          expanded ? "h-[40vh]" : (isHovered ? "h-16" : "h-8"),
          "shadow-2xl overflow-hidden"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      // Mobile tap to simulate hover/grow, second tap to expand? 
      // For simplicity let's just let hover handle desktop. Mobile might need explicit "click" logic.
      >

        {/* Expanded Drawer Content (Only visible when fully expanded) */}
        <div className={cn(
          "absolute inset-0 top-16 p-6 grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity duration-200",
          expanded ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
        )}>
          {/* Drawer items... */}
          {['New File', 'Search', 'Settings', 'Git', 'Terminal', 'Zen Mode'].map((action, i) => (
            <div key={i} className="border border-[var(--los-border)] p-4 hover:border-[var(--los-accent)] hover:bg-[var(--los-accent-dim)] cursor-pointer group flex flex-col justify-center items-center gap-2">
              <MonoLabel className="group-hover:text-[var(--los-accent)]">{action}</MonoLabel>
            </div>
          ))}
        </div>

        {/* The Bar Itself */}
        <div className="absolute top-0 left-0 right-0 h-full max-h-16 flex items-center justify-between px-4 w-full">

          {/* LEFT COLUMN */}
          <div className="flex-1 flex items-center gap-4 min-w-0">
            {/* Mode Indicator */}
            <div className={cn(
              "bg-[var(--los-accent)] text-black font-bold text-[10px] px-2 py-0.5 rounded-sm shrink-0 uppercase transition-all",
              isHovered ? "scale-110" : "scale-100"
            )}>
              {mode}
            </div>

            {/* Context (Shifted Version) - Visible only on Hover */}
            <div className={cn(
              "flex items-center gap-2 transition-all duration-300 transform origin-left whitespace-nowrap overflow-hidden",
              isHovered ? "opacity-100 translate-x-0 w-auto" : "opacity-0 -translate-x-4 w-0"
            )}>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  <MonoText className={cn("text-xs", i === breadcrumbs.length - 1 ? "text-[var(--los-fg)]" : "")}>
                    {crumb}
                  </MonoText>
                  {i < breadcrumbs.length - 1 && <span className="text-[var(--los-muted)] text-[10px]">/</span>}
                </span>
              ))}
            </div>
          </div>


          {/* CENTER COLUMN */}
          <div className="flex-[2] flex items-center justify-center relative h-full">

            {/* Context (Centered Version) - Visible only when NOT Hovered */}
            <div className={cn(
              "absolute transition-all duration-300 flex items-center gap-2",
              isHovered ? "opacity-0 translate-y-4 scale-90 pointer-events-none" : "opacity-100 translate-y-0 scale-100"
            )}>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  <MonoText className={cn("text-xs", i === breadcrumbs.length - 1 ? "text-[var(--los-fg)]" : "")}>
                    {crumb}
                  </MonoText>
                  {i < breadcrumbs.length - 1 && <span className="text-[var(--los-muted)] text-[10px]">/</span>}
                </span>
              ))}
            </div>

            {/* Magic Button - Visible only ON Hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className={cn(
                "absolute transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] flex items-center gap-2 px-6 py-2 rounded-full border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black",
                isHovered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-4 scale-50 pointer-events-none"
              )}>
              <Sparkles size={14} />
              <span className="text-xs font-bold uppercase tracking-widest">Life OS</span>
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

            {/* Always visible Clock or Indicator */}
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
