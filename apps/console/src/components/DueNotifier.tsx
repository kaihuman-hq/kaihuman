import { githubFileStore } from '@kaihuman/core';
import { parseTodos } from '@kaihuman/formats';
import { Bell, BellOff } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import {
  type DueRow,
  disableDueNotifications,
  dueNotificationsEnabled,
  enableDueNotifications,
  notificationsSupported,
  notifyDueTodos,
} from '../lib/due-notifications';

const CHECK_MS = 60_000;

const loadedRows = (): DueRow[] =>
  Object.entries(githubFileStore.openFiles.peek()).flatMap(([path, f]) =>
    path.endsWith('.todos.md') && f.content !== undefined
      ? parseTodos(f.content).items.map((item) => ({ path, item }))
      : [],
  );

/** Headless watcher: checks on mount, on tab becoming visible, and every minute. */
export const DueNotifierWatcher = () => {
  useEffect(() => {
    const check = () => {
      notifyDueTodos(loadedRows()).catch(() => {});
    };
    check();
    const timer = setInterval(check, CHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
};

/** User-initiated opt-in; permission prompts need a gesture. */
export const DueNotifyToggle = () => {
  const [on, setOn] = useState(dueNotificationsEnabled);
  if (!notificationsSupported()) return null;
  const Icon = on ? Bell : BellOff;
  return (
    <button
      type="button"
      aria-pressed={on}
      title={on ? 'Due notifications on (while app is open)' : 'Notify when todos are due'}
      onClick={async () => {
        if (on) {
          disableDueNotifications();
          setOn(false);
        } else {
          setOn(await enableDueNotifications());
        }
      }}
      class="flex items-center gap-1 text-xs text-[var(--los-muted)] hover:text-[var(--los-fg)]"
    >
      <Icon size={14} />
      {on ? 'Notify' : 'Notify off'}
    </button>
  );
};
