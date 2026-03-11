import { LayoutGrid, Plus, X } from 'lucide-preact';
import { cn } from '../../utils';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import type { DashboardWorkspace } from '../types';

interface AddToDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  dashboards: DashboardWorkspace[];
  onToggleDashboard: (dashboardId: string) => void;
  fileName: string;
  currentDashboards: string[];
}

export const AddToDashboardModal = ({
  isOpen,
  onClose,
  dashboards,
  onToggleDashboard,
  fileName,
  currentDashboards,
}: AddToDashboardModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Backdrop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[var(--los-bg)] text-[var(--los-fg)] border border-[var(--los-accent)] shadow-2xl rounded-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--los-border)]">
          <MonoHeader className="text-sm">ADD TO DASHBOARD</MonoHeader>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--los-muted)] hover:text-[var(--los-fg)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <MonoText className="text-xs text-[var(--los-muted)]">
            Add or remove <span className="text-[var(--los-fg)]">{fileName}</span> from dashboards:
          </MonoText>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {dashboards.map((ws) => {
              const isAdded = currentDashboards.includes(ws.id);
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => onToggleDashboard(ws.id)}
                  className={cn(
                    'w-full flex items-center justify-between p-3 text-left border rounded transition-all group',
                    isAdded
                      ? 'bg-[var(--los-accent)] text-[var(--los-bg)] border-[var(--los-accent)] hover:opacity-80'
                      : 'border-[var(--los-border)] hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] hover:border-[var(--los-accent)]',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <LayoutGrid
                      size={16}
                      className={cn(
                        'shrink-0',
                        isAdded
                          ? 'text-[var(--los-bg)]'
                          : 'text-[var(--los-muted)] group-hover:text-[var(--los-bg)]',
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-mono text-sm font-bold">{ws.name}</span>
                      <span
                        className={cn(
                          'font-mono text-[10px]',
                          isAdded ? 'opacity-90' : 'opacity-60',
                        )}
                      >
                        ID: {ws.id}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    {isAdded ? (
                      <X size={16} className="text-[var(--los-bg)]" />
                    ) : (
                      <Plus
                        size={16}
                        className="text-[var(--los-muted)] group-hover:text-[var(--los-bg)]"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
