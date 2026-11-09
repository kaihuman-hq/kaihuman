import {
  type NotificationKind,
  notificationSignature,
  type PlannedNotification,
} from './planner.js';

export const CHANNEL_ID = 'reminders';
export const TODO_CATEGORY = 'kh-todo';
export const SNOOZE_PREFIX = 'kh-snooze:';
const PLAN_PREFIX = 'kh:';
const SNOOZE_MS = 3_600_000;

/** Request shape we hand to expo; the `'date'` literal is mapped to expo's enum in `index.ts`. */
export interface ScheduleRequest {
  identifier: string;
  content: {
    title: string;
    body: string;
    data: { sig?: string; url?: string; todoId?: string; kind?: NotificationKind };
    categoryIdentifier?: string;
    sound: 'default';
  };
  trigger: { type: 'date'; date: number; channelId: string };
}

export interface ScheduledEntry {
  identifier: string;
  content: { data?: Record<string, unknown> };
}

/** The subset of expo-notifications the scheduler needs, injected so tests need no native module. */
export interface NotificationsApi {
  getAllScheduledNotificationsAsync(): Promise<ScheduledEntry[]>;
  scheduleNotificationAsync(request: ScheduleRequest): Promise<unknown>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
}

export interface SyncResult {
  scheduled: number;
  cancelled: number;
  kept: number;
}

const toRequest = (n: PlannedNotification): ScheduleRequest => ({
  identifier: n.id,
  content: {
    title: n.title,
    body: n.body,
    data: { sig: notificationSignature(n), url: n.url, todoId: n.todoId, kind: n.kind },
    categoryIdentifier: n.todoId ? TODO_CATEGORY : undefined,
    sound: 'default',
  },
  trigger: { type: 'date', date: n.fireAt, channelId: CHANNEL_ID },
});

/**
 * Brings the OS schedule in line with `planned`. Only `kh:` ids are ours to manage; snoozes
 * (`kh-snooze:`, a different prefix on purpose) outlive replans and are dropped only once their
 * todo is no longer open.
 */
export async function syncScheduled(
  api: NotificationsApi,
  planned: readonly PlannedNotification[],
  openTodoIds: ReadonlySet<string>,
): Promise<SyncResult> {
  const existing = await api.getAllScheduledNotificationsAsync();
  const byId = new Map(existing.map((e) => [e.identifier, e]));
  const result: SyncResult = { scheduled: 0, cancelled: 0, kept: 0 };
  const wanted = new Set(planned.map((p) => p.id));

  for (const entry of existing) {
    if (entry.identifier.startsWith(SNOOZE_PREFIX)) {
      if (!openTodoIds.has(entry.identifier.slice(SNOOZE_PREFIX.length))) {
        await api.cancelScheduledNotificationAsync(entry.identifier);
        result.cancelled++;
      }
    } else if (entry.identifier.startsWith(PLAN_PREFIX) && !wanted.has(entry.identifier)) {
      await api.cancelScheduledNotificationAsync(entry.identifier);
      result.cancelled++;
    }
  }

  for (const n of planned) {
    const current = byId.get(n.id);
    if (current && current.content.data?.sig === notificationSignature(n)) {
      result.kept++;
      continue;
    }
    if (current) await api.cancelScheduledNotificationAsync(n.id);
    await api.scheduleNotificationAsync(toRequest(n));
    result.scheduled++;
  }
  return result;
}

/** Cancels every notification we own, snoozes included (notifications turned off). */
export async function cancelAllOwned(api: NotificationsApi): Promise<number> {
  const existing = await api.getAllScheduledNotificationsAsync();
  const mine = existing.filter(
    (e) => e.identifier.startsWith(PLAN_PREFIX) || e.identifier.startsWith(SNOOZE_PREFIX),
  );
  for (const e of mine) await api.cancelScheduledNotificationAsync(e.identifier);
  return mine.length;
}

export interface SnoozeSource {
  title?: string | null;
  body?: string | null;
  data?: Record<string, unknown>;
}

/** Re-delivers a notification one hour from `now`. */
export function snoozeRequest(content: SnoozeSource, todoId: string, now: number): ScheduleRequest {
  const url = content.data?.url;
  return {
    identifier: `${SNOOZE_PREFIX}${todoId}`,
    content: {
      title: content.title ?? 'Reminder',
      body: content.body ?? '',
      data: { url: typeof url === 'string' ? url : undefined, todoId },
      categoryIdentifier: TODO_CATEGORY,
      sound: 'default',
    },
    trigger: { type: 'date', date: now + SNOOZE_MS, channelId: CHANNEL_ID },
  };
}
