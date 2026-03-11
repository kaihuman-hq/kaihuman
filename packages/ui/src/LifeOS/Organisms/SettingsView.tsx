import { ArrowDown, ArrowUp, Check, Edit2, Plus, Trash2, X } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import type { DashboardConfig, DashboardWorkspace } from '../types';

interface SettingsViewProps {
  config: DashboardConfig;
  onConfigChange: (newConfig: DashboardConfig) => void;
  onClose: () => void;
}

export const SettingsView = ({ config, onConfigChange, onClose }: SettingsViewProps) => {
  const [newDashboardName, setNewDashboardName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddWorkspace = () => {
    if (!newDashboardName.trim()) return;

    const newId = `d${Date.now()}`; // Simple ID generation
    const newWorkspace: DashboardWorkspace = {
      id: newId,
      name: newDashboardName.trim(),
    };

    onConfigChange({
      ...config,
      dashboards: [...config.dashboards, newWorkspace],
    });
    setNewDashboardName('');
  };

  const handleDeleteWorkspace = (id: string) => {
    if (config.dashboards.length <= 1) {
      setError('Cannot delete the last dashboard.');
      return;
    }
    if (
      !confirm(
        'Are you sure you want to delete this dashboard? Entries associated with it will be hidden.',
      )
    )
      return;

    onConfigChange({
      ...config,
      dashboards: config.dashboards.filter((d) => d.id !== id),
    });
  };

  const startEdit = (ws: DashboardWorkspace) => {
    setEditingId(ws.id);
    setEditName(ws.name);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) return;

    onConfigChange({
      ...config,
      dashboards: config.dashboards.map((d) =>
        d.id === editingId ? { ...d, name: editName.trim() } : d,
      ),
    });
    setEditingId(null);
    setEditName('');
  };

  const moveWorkspace = (index: number, direction: 'up' | 'down') => {
    const newDashboards = [...config.dashboards];
    if (direction === 'up') {
      if (index === 0) return;
      const item = newDashboards[index] as DashboardWorkspace;
      newDashboards.splice(index, 1);
      newDashboards.splice(index - 1, 0, item);
    } else {
      if (index === newDashboards.length - 1) return;
      const item = newDashboards[index] as DashboardWorkspace;
      newDashboards.splice(index, 1);
      newDashboards.splice(index + 1, 0, item);
    }
    onConfigChange({
      ...config,
      dashboards: newDashboards,
    });
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="w-full max-w-2xl bg-[var(--los-bg)] border border-[var(--los-accent)] shadow-2xl rounded-md overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--los-border)]">
          <MonoHeader>SETTINGS</MonoHeader>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--los-muted)] hover:text-[var(--los-fg)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Workspaces Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--los-border)] pb-2">
              <MonoText className="text-[var(--los-muted)] text-xs">APPEARANCE</MonoText>
            </div>

            <div className="flex items-center gap-4">
              {['nexus', 'light', 'amethyst'].map((theme) => (
                <button
                  type="button"
                  key={theme}
                  onClick={() => onConfigChange({ ...config, theme: theme as any })} // Cast because types might lag? No, types are updated.
                  className={cn(
                    'flex flex-col items-center gap-2 p-2 rounded border transition-all',
                    config.theme === theme || (!config.theme && theme === 'nexus')
                      ? 'border-[var(--los-accent)] bg-[var(--los-accent-dim)]'
                      : 'border-[var(--los-border)] hover:border-[var(--los-fg)]',
                  )}
                >
                  <div
                    className={cn(
                      'w-12 h-12 rounded-full border shadow-sm',
                      theme === 'nexus' && 'bg-[#000000] border-[#333333]',
                      theme === 'light' && 'bg-[#ffffff] border-[#e2e8f0]',
                      theme === 'amethyst' && 'bg-[#0f0518] border-[#3b0764]',
                    )}
                  ></div>
                  <MonoText className="text-[10px] uppercase">{theme}</MonoText>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-b border-[var(--los-border)] pb-2 pt-4">
              <MonoText className="text-[var(--los-muted)] text-xs">
                DASHBOARDS (WORKSPACES)
              </MonoText>
            </div>

            {/* List */}
            <div className="space-y-2">
              {config.dashboards.map((ws, index) => (
                <div
                  key={ws.id}
                  className="flex items-center justify-between p-3 bg-[var(--los-bg)] border border-[var(--los-border)] rounded hover:bg-white/5 transition-colors group"
                >
                  {editingId === ws.id ? (
                    <div className="flex items-center gap-2 flex-1 mr-4">
                      <input
                        className="flex-1 bg-black/20 border border-[var(--los-accent)] p-1 text-sm text-[var(--los-fg)] outline-none"
                        value={editName}
                        onInput={(e) => setEditName(e.currentTarget.value)}
                      />
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="text-green-500 hover:text-green-400"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-red-500 hover:text-red-400"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <MonoText className="text-[var(--los-fg)] font-bold">{ws.name}</MonoText>
                      <MonoText className="text-[var(--los-muted)] text-[10px]">
                        ID: {ws.id}
                      </MonoText>
                    </div>
                  )}

                  <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex flex-col gap-1 mr-2">
                      <button
                        type="button"
                        onClick={() => moveWorkspace(index, 'up')}
                        disabled={index === 0}
                        className="text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveWorkspace(index, 'down')}
                        disabled={index === config.dashboards.length - 1}
                        className="text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => startEdit(ws)}
                      className="p-1.5 border border-[var(--los-border)] rounded hover:bg-[var(--los-fg)] hover:text-[var(--los-bg)] transition-colors"
                      title="Rename"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkspace(ws.id)}
                      className="p-1.5 border border-red-900/50 text-red-500 rounded hover:bg-red-900/20 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add New */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-dashed border-[var(--los-border)]">
              <input
                className="flex-1 bg-transparent border border-[var(--los-border)] p-2 text-sm text-[var(--los-fg)] placeholder-[var(--los-muted)] outline-none focus:border-[var(--los-accent)]"
                placeholder="New Dashboard Name..."
                value={newDashboardName}
                onInput={(e) => setNewDashboardName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWorkspace()}
              />
              <button
                type="button"
                onClick={handleAddWorkspace}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--los-fg)] text-[var(--los-bg)] font-bold text-sm rounded hover:opacity-90 transition-opacity"
              >
                <Plus size={16} /> ADD
              </button>
            </div>

            {error && <MonoText className="text-red-500 text-xs mt-2">{error}</MonoText>}
          </section>
        </div>
      </div>
    </div>
  );
};
