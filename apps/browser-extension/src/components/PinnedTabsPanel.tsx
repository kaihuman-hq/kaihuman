import { useEffect, useState } from 'preact/hooks';
import { PINNED_TABS_PATH } from '../background/pinned-tabs';

interface GroupSummary {
  id: string;
  name: string;
  createdAt: string;
  tabCount: number;
}

interface PinnedTabsPanelProps {
  repo: string;
}

const formatCreatedAt = (createdAt: string) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? 'unknown date'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const plural = (count: number) => `${count} tab${count === 1 ? '' : 's'}`;

export function PinnedTabsPanel({ repo }: PinnedTabsPanelProps) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; mode: 'rename' | 'delete' } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = (message: Record<string, unknown>): Promise<any> =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const failure = chrome.runtime.lastError?.message || response?.error;
        if (failure) reject(new Error(failure));
        else resolve(response);
      });
    });

  const refresh = async () => {
    const response = await send({ type: 'LIST_PINNED_TAB_GROUPS' });
    setGroups(response.groups);
    setActiveId(response.activeId);
  };

  // The popup is short-lived, so the group list is fetched once when it opens. The port is
  // held for as long as the popup lives: MV3 collects an idle service worker after ~30s, and
  // without this a request sent after a pause (typing a new group name) races its teardown and
  // fails with "The message port closed before a response was received".
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'pinned-tabs-popup' });
    refresh().catch((e: Error) => setError(e.message));
    return () => port.disconnect();
  }, []);

  const run = async (label: string, action: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await refresh();
    } catch (e: any) {
      setError(e.message || 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const load = (group: GroupSummary) =>
    run(`load:${group.id}`, async () => {
      const { opened, unpinned } = await send({
        type: 'LOAD_PINNED_TAB_GROUP',
        groupId: group.id,
      });
      if (opened === 0 && unpinned === 0) return `${group.name} is already loaded`;
      const parts = [opened && `pinned ${plural(opened)}`, unpinned && `unpinned ${unpinned}`];
      return `${group.name}: ${parts.filter(Boolean).join(', ')}`;
    });

  const update = (group: GroupSummary) =>
    run(`save:${group.id}`, async () => {
      const { count } = await send({ type: 'SAVE_PINNED_TAB_GROUP', groupId: group.id });
      return `Updated ${group.name} with ${plural(count)}`;
    });

  const rename = (group: GroupSummary) =>
    run(`rename:${group.id}`, async () => {
      const { name } = await send({
        type: 'RENAME_PINNED_TAB_GROUP',
        groupId: group.id,
        name: draftName,
      });
      setEditing(null);
      return `Renamed to ${name}`;
    });

  const remove = (group: GroupSummary) =>
    run(`delete:${group.id}`, async () => {
      const { name } = await send({ type: 'DELETE_PINNED_TAB_GROUP', groupId: group.id });
      setEditing(null);
      return `Deleted ${name}`;
    });

  const move = (group: GroupSummary, offset: -1 | 1) =>
    run(`move:${group.id}`, async () => {
      await send({ type: 'MOVE_PINNED_TAB_GROUP', groupId: group.id, offset });
      return `Moved ${group.name} ${offset < 0 ? 'up' : 'down'}`;
    });

  const startRename = (group: GroupSummary) => {
    setDraftName(group.name);
    setEditing({ id: group.id, mode: 'rename' });
  };

  const saveAsNew = () =>
    run('save:new', async () => {
      const { count, name } = await send({ type: 'SAVE_PINNED_TAB_GROUP', name: newName });
      setNewName('');
      return `Saved ${name} with ${plural(count)}`;
    });

  return (
    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Pinned Tabs</h2>
        <span
          class="text-[10px] text-[var(--los-fg-dim)] line-clamp-1 break-all px-2 py-0.5 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)]"
          title={`${repo}/${PINNED_TABS_PATH}`}
        >
          {PINNED_TABS_PATH}
        </span>
      </div>

      <div class="space-y-1">
        {groups.length === 0 && !error && (
          <p class="text-[10px] text-[var(--los-fg-dim)] px-1">
            No tab groups yet — pin some tabs and save them below.
          </p>
        )}
        {groups.map((group, index) => {
          const active = group.id === activeId;
          const edit = editing?.id === group.id ? editing.mode : null;
          return (
            <div
              key={group.id}
              class={`p-2 rounded border bg-[var(--los-bg-hover)] ${active ? 'border-[var(--los-accent)]' : 'border-[var(--los-border)]'}`}
            >
              {edit === 'rename' ? (
                <div class="flex gap-1">
                  <input
                    type="text"
                    value={draftName}
                    onInput={(e) => setDraftName((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && draftName.trim()) rename(group);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    disabled={!!busy}
                    autofocus
                    class="flex-1 min-w-0 bg-[var(--los-bg)] border border-[var(--los-accent)] rounded px-2 py-1 text-[10px] text-[var(--los-fg)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => rename(group)}
                    disabled={!!busy || !draftName.trim()}
                    class="py-1 px-2 bg-[var(--los-accent)] text-black font-bold text-[10px] rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === `rename:${group.id}` ? '...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    disabled={!!busy}
                    class="py-1 px-2 text-[var(--los-fg-dim)] hover:text-[var(--los-fg)] text-[10px] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-xs text-[var(--los-fg)] truncate min-w-0">
                      {active && <span class="text-[var(--los-accent)]">● </span>}
                      {group.name}
                    </div>
                    {active ? (
                      <button
                        type="button"
                        onClick={() => update(group)}
                        disabled={!!busy}
                        class="shrink-0 py-2 px-4 bg-[var(--los-accent)] text-black font-bold text-xs rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy === `save:${group.id}` ? 'Saving...' : 'Update'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => load(group)}
                        disabled={!!busy}
                        class="shrink-0 py-2 px-4 bg-[var(--los-bg)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] font-bold text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy === `load:${group.id}` ? 'Loading...' : 'Load'}
                      </button>
                    )}
                  </div>
                  <div class="flex items-center justify-between gap-2 mt-0.5">
                    {edit === 'delete' ? (
                      <>
                        <span class="text-[10px] text-red-400">Delete this group?</span>
                        <div class="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => remove(group)}
                            disabled={!!busy}
                            class="text-[10px] text-red-400 hover:text-red-300 font-bold transition-colors disabled:opacity-50"
                          >
                            {busy === `delete:${group.id}` ? 'Deleting...' : 'Delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            disabled={!!busy}
                            class="text-[10px] text-[var(--los-fg-dim)] hover:text-[var(--los-fg)] transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span class="text-[10px] text-[var(--los-fg-dim)] truncate">
                          {plural(group.tabCount)} · {formatCreatedAt(group.createdAt)}
                        </span>
                        <div class="flex gap-2 shrink-0 items-center">
                          <button
                            type="button"
                            onClick={() => move(group, -1)}
                            disabled={!!busy || index === 0}
                            title="Move group up"
                            class="text-[10px] text-[var(--los-fg-dim)] hover:text-[var(--los-accent)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => move(group, 1)}
                            disabled={!!busy || index === groups.length - 1}
                            title="Move group down"
                            class="text-[10px] text-[var(--los-fg-dim)] hover:text-[var(--los-accent)] transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => startRename(group)}
                            disabled={!!busy}
                            title="Rename group"
                            class="text-[10px] text-[var(--los-fg-dim)] hover:text-[var(--los-accent)] transition-colors disabled:opacity-50"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing({ id: group.id, mode: 'delete' })}
                            disabled={!!busy}
                            title="Delete group"
                            class="text-[10px] text-[var(--los-fg-dim)] hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div class="flex gap-1">
        <input
          type="text"
          value={newName}
          onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
          placeholder="New group name..."
          disabled={!!busy}
          class="flex-1 min-w-0 bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded px-2 py-1 text-[10px] text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={saveAsNew}
          disabled={!!busy || !newName.trim()}
          class="py-1 px-2 bg-[var(--los-bg)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-[10px] rounded transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy === 'save:new' ? 'Saving...' : 'Save current'}
        </button>
      </div>

      {error ? (
        <div class="text-[10px] text-red-400 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
          {error}
        </div>
      ) : (
        message && <div class="text-[10px] text-[var(--los-success)]">{message}</div>
      )}
    </section>
  );
}
