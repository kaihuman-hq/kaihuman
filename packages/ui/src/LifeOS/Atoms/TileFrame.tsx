import { ComponentChildren, h } from 'preact';
import { cn } from '../../utils';

export interface TileFrameProps {
  children: ComponentChildren;
  className?: string;
  variant?: 'default' | 'active' | 'zen';
  onClick?: () => void;
}

export const TileFrame = ({
  children,
  className,
  variant = 'default',
  onClick
}: TileFrameProps) => {
  return (
    <div
      className={cn(
        "life-os-root relative border border-transparent transition-all duration-300 overflow-hidden",
        "border-[var(--los-border)] bg-[var(--los-bg)]",
        variant === 'active' && "border-[var(--los-accent)] shadow-[0_0_15px_var(--los-accent-dim)]",
        variant === 'zen' && "border-none",
        className
      )}
      onClick={onClick}
    >
      {/* Micro-grid overlay or scanlines could go here */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))]" />
      <div className="relative h-full w-full">
        {children}
      </div>
    </div>
  );
};
