import { formatDue, type TodoItem } from '@kaihuman/formats';

/**
 * Due-todo system notifications.
 *
 * Limitation: there is no push server, so notifications only fire while the app (or its
 * service worker's page) is running — checked on load, on visibility change and on a timer.
 * Closed-app delivery would need Web Push (server) or the Notification Triggers API, which
 * Chrome shipped only as an abandoned origin trial.
 */

export interface DueRow {
  path: string;
  item: TodoItem;
}

/** All-day todos have no time; treat them as due at this local hour. */
const ALL_DAY_HOUR = 9;
/** Todos overdue longer than this are stale; don't flood the user on first enable. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_KEPT = 500;

const dueMoment = (item: TodoItem): number | undefined => {
  if (!item.dueDate) return undefined;
  const [y, mo, d] = item.dueDate.split('-').map(Number);
  const [h, mi] = item.dueTime ? item.dueTime.split(':').map(Number) : [ALL_DAY_HOUR, 0];
  return new Date(y ?? 0, (mo ?? 1) - 1, d, h, mi).getTime();
};

/** Stable per todo *and* due value, so rescheduling a todo notifies again. */
export const dueNotificationKey = ({ path, item }: DueRow): string =>
  `${path}#${item.todoId ?? item.id}#${formatDue(item)}`;

/** Open todos whose due moment has passed (within a day) and that were not notified yet. */
export const dueTodos = (rows: DueRow[], now: number, notified: ReadonlySet<string>): DueRow[] =>
  rows.filter((r) => {
    if (r.item.status === 'done' || r.item.status === 'rejected') return false;
    const due = dueMoment(r.item);
    if (due === undefined || due > now || now - due > MAX_AGE_MS) return false;
    return !notified.has(dueNotificationKey(r));
  });

export const pruneNotified = (keys: string[], max = MAX_KEPT): string[] => keys.slice(-max);

// --- browser side effects -------------------------------------------------------------------

const ENABLED_KEY = 'kh.dueNotifications.enabled';
const NOTIFIED_KEY = 'kh.dueNotifications.notified';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode): worst case we notify again
  }
};

export const notificationsSupported = (): boolean =>
  typeof Notification !== 'undefined' && 'serviceWorker' in navigator;

export const dueNotificationsEnabled = (): boolean =>
  notificationsSupported() && Notification.permission === 'granted' && read(ENABLED_KEY) === '1';

/** Must be called from a user gesture. Resolves to whether notifications are now on. */
export const enableDueNotifications = async (): Promise<boolean> => {
  if (!notificationsSupported()) return false;
  const perm =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  const on = perm === 'granted';
  write(ENABLED_KEY, on ? '1' : '0');
  return on;
};

export const disableDueNotifications = () => write(ENABLED_KEY, '0');

const loadNotified = (): string[] => {
  try {
    const v = JSON.parse(read(NOTIFIED_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
};

/** Show a notification for each newly due todo and remember it. Returns how many were shown. */
export const notifyDueTodos = async (rows: DueRow[], now = Date.now()): Promise<number> => {
  if (!dueNotificationsEnabled()) return 0;
  const known = loadNotified();
  const fresh = dueTodos(rows, now, new Set(known));
  if (fresh.length === 0) return 0;
  const reg = await navigator.serviceWorker.ready;
  for (const r of fresh) {
    await reg.showNotification('Todo due', {
      body: r.item.text,
      tag: dueNotificationKey(r), // replaces, never duplicates, across tabs
      icon: '/pwa-192x192.png',
      data: { url: '/tasks' },
    });
  }
  write(NOTIFIED_KEY, JSON.stringify(pruneNotified([...known, ...fresh.map(dueNotificationKey)])));
  return fresh.length;
};
