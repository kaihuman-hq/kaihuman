import type { PushSetupResult } from '@kaihuman/core';
import { isPushEnabled } from '@kaihuman/core';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  Check,
  Copy,
  Edit2,
  Plus,
  Trash2,
  X,
} from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoText } from '../Atoms/Typography';
import { DEFAULT_NAVBAR, NAVBAR_ITEMS, type NavbarItemDef } from '../navbar-items';
import type { DashboardConfig, DashboardWorkspace, NavItemId } from '../types';

interface SettingsViewProps {
  config: DashboardConfig;
  onConfigChange: (newConfig: DashboardConfig) => void;
  onClose: () => void;
  /** Called when the user clicks "Enable notifications". Resolves with setup result, rejects with Error. */
  onSetupNotifications?: () => Promise<PushSetupResult>;
}

export const SettingsView = ({
  config,
  onConfigChange,
  onClose,
  onSetupNotifications,
}: SettingsViewProps) => {
  const [newDashboardName, setNewDashboardName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Notifications state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [notifError, setNotifError] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<PushSetupResult | null>(null);
  const [yamlCopied, setYamlCopied] = useState(false);

  useEffect(() => {
    isPushEnabled().then(setPushEnabled);
  }, []);

  const handleEnableNotifications = async () => {
    if (!onSetupNotifications) return;
    setNotifStatus('loading');
    setNotifError(null);
    try {
      const result = await onSetupNotifications();
      setSetupResult(result);
      setPushEnabled(true);
      setNotifStatus('done');
    } catch (e: unknown) {
      setNotifStatus('error');
      setNotifError(e instanceof Error ? e.message : 'Setup failed. Please try again.');
    }
  };

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

  // --- Bottom navbar configuration ---
  const navbar = config.navbar ?? DEFAULT_NAVBAR;
  const enabledNavItems = navbar
    .map((id) => NAVBAR_ITEMS.find((item) => item.id === id))
    .filter((item): item is NavbarItemDef => item !== undefined);
  const availableNavItems = NAVBAR_ITEMS.filter((item) => !navbar.includes(item.id));

  const toggleNavItem = (id: NavItemId) => {
    onConfigChange({
      ...config,
      navbar: navbar.includes(id) ? navbar.filter((n) => n !== id) : [...navbar, id],
    });
  };

  const moveNavItem = (index: number, direction: 'up' | 'down') => {
    const next = [...navbar];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    const item = next[index] as NavItemId;
    next.splice(index, 1);
    next.splice(target, 0, item);
    onConfigChange({ ...config, navbar: next });
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

          {/* Bottom Navbar Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--los-border)] pb-2">
              <MonoText className="text-[var(--los-muted)] text-xs">BOTTOM NAVBAR</MonoText>
            </div>
            <MonoText className="text-[10px] text-[var(--los-muted)] leading-relaxed">
              Choose which items appear in the desktop bottom navbar and use the arrows to reorder
              them.
            </MonoText>

            {/* Enabled items (ordered) */}
            <div className="space-y-2">
              {enabledNavItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-[var(--los-bg)] border border-[var(--los-border)] rounded hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={14} className="text-[var(--los-accent)]" />
                      <MonoText className="text-[var(--los-fg)] font-bold">{item.label}</MonoText>
                    </div>
                    <div className="flex items-center gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex flex-col gap-1 mr-2">
                        <button
                          type="button"
                          onClick={() => moveNavItem(index, 'up')}
                          disabled={index === 0}
                          className="text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveNavItem(index, 'down')}
                          disabled={index === enabledNavItems.length - 1}
                          className="text-[var(--los-muted)] hover:text-[var(--los-fg)] disabled:opacity-30"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNavItem(item.id)}
                        className="p-1.5 border border-[var(--los-border)] rounded hover:bg-[var(--los-fg)] hover:text-[var(--los-bg)] transition-colors"
                        title="Remove from navbar"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {enabledNavItems.length === 0 && (
                <MonoText className="text-[10px] text-[var(--los-muted)]">
                  No items selected — the navbar will be empty.
                </MonoText>
              )}
            </div>

            {/* Available items to add */}
            {availableNavItems.length > 0 && (
              <div className="space-y-2 pt-4 border-t border-dashed border-[var(--los-border)]">
                <MonoText className="text-[10px] text-[var(--los-muted)]">AVAILABLE</MonoText>
                {availableNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border border-[var(--los-border)] rounded opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={14} className="text-[var(--los-muted)]" />
                        <MonoText className="text-[var(--los-fg)]">{item.label}</MonoText>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNavItem(item.id)}
                        className="flex items-center gap-1 px-2 py-1 border border-[var(--los-border)] rounded text-xs hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] transition-colors"
                        title="Add to navbar"
                      >
                        <Plus size={12} /> ADD
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Notifications Section */}
          {onSetupNotifications && (
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--los-border)] pb-2 pt-4">
                <MonoText className="text-[var(--los-muted)] text-xs">NOTIFICATIONS</MonoText>
              </div>

              <div className="flex items-start justify-between gap-4 p-4 bg-black/10 border border-[var(--los-border)] rounded">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {pushEnabled ? (
                      <Bell size={14} className="text-[var(--los-accent)]" />
                    ) : (
                      <BellOff size={14} className="text-[var(--los-muted)]" />
                    )}
                    <MonoText className="text-sm">
                      {pushEnabled ? 'Enabled on this device' : 'Not enabled on this device'}
                    </MonoText>
                  </div>
                  <MonoText className="text-[10px] text-[var(--los-muted)] leading-relaxed">
                    {pushEnabled
                      ? 'You will receive notifications for overdue todo milestones via a GitHub Action in your repo.'
                      : 'Get notified about overdue todo milestones. A GitHub Action workflow and secret will be created in your repo automatically.'}
                  </MonoText>
                  {notifError && (
                    <MonoText className="text-red-400 text-[10px] mt-1">{notifError}</MonoText>
                  )}
                  {notifStatus === 'done' && setupResult?.workflowCreated && (
                    <MonoText className="text-green-400 text-[10px] mt-1">
                      ✓ Notifications enabled. The workflow runs at 07:00, 12:00 and 17:00 UTC.
                    </MonoText>
                  )}
                  {notifStatus === 'done' && setupResult && !setupResult.workflowCreated && (
                    <div className="mt-2 space-y-2">
                      <MonoText className="text-yellow-400 text-[10px]">
                        ✓ Device registered. The GitHub token lacks the{' '}
                        <code className="bg-white/10 px-1">workflow</code> scope, so the Actions
                        workflow could not be created automatically. Add it manually:
                      </MonoText>
                      <MonoText className="text-[var(--los-muted)] text-[10px]">
                        Path: <code className="bg-white/10 px-1">{setupResult.workflowPath}</code>
                      </MonoText>
                      <div className="relative">
                        <pre className="text-[9px] font-mono bg-black/30 border border-[var(--los-border)] p-2 overflow-x-auto leading-relaxed text-[var(--los-fg)] max-h-40">
                          {setupResult.workflowYaml}
                        </pre>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(setupResult.workflowYaml);
                            setYamlCopied(true);
                            setTimeout(() => setYamlCopied(false), 2000);
                          }}
                          className="absolute top-1 right-1 flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 bg-[var(--los-bg)] border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
                        >
                          {yamlCopied ? <Check size={9} /> : <Copy size={9} />}
                          {yamlCopied ? 'COPIED' : 'COPY'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleEnableNotifications}
                  disabled={notifStatus === 'loading'}
                  className={cn(
                    'shrink-0 flex items-center gap-2 px-3 py-1.5 text-xs font-bold border rounded transition-colors',
                    pushEnabled
                      ? 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]'
                      : 'border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-[var(--los-bg)]',
                    notifStatus === 'loading' && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <Bell size={12} />
                  {notifStatus === 'loading' ? 'Setting up…' : pushEnabled ? 'Re-enable' : 'Enable'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
