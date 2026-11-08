import { signal } from '@preact/signals';
import type { SharedContainer } from '../adapters/widget-bridge.js';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from './planner.js';

export const NOTIFICATION_SETTINGS_FILE = 'notification-settings.json';

export const notificationSettings = signal<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/** Merges stored JSON over `base`, keeping the default for any field of the wrong type. */
export function mergeSettings(base: NotificationSettings, raw: unknown): NotificationSettings {
  if (typeof raw !== 'object' || raw === null) return base;
  const o = raw as Record<string, unknown>;
  const k =
    typeof o.kinds === 'object' && o.kinds !== null ? (o.kinds as Record<string, unknown>) : {};
  return {
    enabled: isBool(o.enabled) ? o.enabled : base.enabled,
    digest: isBool(o.digest) ? o.digest : base.digest,
    morningTime:
      typeof o.morningTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.morningTime)
        ? o.morningTime
        : base.morningTime,
    minutesBefore:
      typeof o.minutesBefore === 'number' &&
      Number.isFinite(o.minutesBefore) &&
      o.minutesBefore >= 0
        ? o.minutesBefore
        : base.minutesBefore,
    kinds: {
      dueToday: isBool(k.dueToday) ? k.dueToday : base.kinds.dueToday,
      dueSoon: isBool(k.dueSoon) ? k.dueSoon : base.kinds.dueSoon,
      overdue: isBool(k.overdue) ? k.overdue : base.kinds.overdue,
      milestoneTomorrow: isBool(k.milestoneTomorrow)
        ? k.milestoneTomorrow
        : base.kinds.milestoneTomorrow,
    },
  };
}

export async function loadNotificationSettings(
  container: SharedContainer,
): Promise<NotificationSettings> {
  let next = DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = await container.read(NOTIFICATION_SETTINGS_FILE);
    if (raw) next = mergeSettings(DEFAULT_NOTIFICATION_SETTINGS, JSON.parse(raw));
  } catch {
    // Unreadable or corrupt file: fall back to defaults.
  }
  notificationSettings.value = next;
  return next;
}

export async function saveNotificationSettings(
  container: SharedContainer,
  settings: NotificationSettings,
): Promise<void> {
  notificationSettings.value = settings;
  await container.write(NOTIFICATION_SETTINGS_FILE, JSON.stringify(settings));
}
