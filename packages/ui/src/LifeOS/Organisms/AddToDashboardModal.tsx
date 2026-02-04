import { h } from 'preact';
import { useState } from 'preact/hooks';
import { DashboardWorkspace } from '../types';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { X, Plus, LayoutGrid } from 'lucide-preact';
import { cn } from '../../utils';

interface AddToDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  dashboards: DashboardWorkspace[];
  onAddToDashboard: (dashboardId: string) => void;
  fileName: string;
}

export const AddToDashboardModal = ({ isOpen, onClose, dashboards, onAddToDashboard, fileName }: AddToDashboardModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[var(--los-bg)] border border-[var(--los-accent)] shadow-2xl rounded-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--los-border)]">
          <MonoHeader className="text-sm">ADD TO DASHBOARD</MonoHeader>
          <button onClick={onClose} className="text-[var(--los-muted)] hover:text-[var(--los-fg)]">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <MonoText className="text-xs text-[var(--los-muted)]">
            Select a dashboard (workspace) for <span className="text-[var(--los-fg)]">{fileName}</span>:
          </MonoText>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {dashboards.map(ws => (
              <button
                key={ws.id}
                onClick={() => {
                  onAddToDashboard(ws.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-3 text-left border border-[var(--los-border)] rounded hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)] hover:border-[var(--los-accent)] transition-all group"
              >
                <LayoutGrid size={16} className="shrink-0 text-[var(--los-muted)] group-hover:text-[var(--los-bg)]" />
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-bold">{ws.name}</span>
                  <span className="font-mono text-[10px] opacity-60">ID: {ws.id}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
