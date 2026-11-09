import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import { effect } from '@preact/signals';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import {
  currentSnapshot,
  type SharedContainer,
  type WidgetBridge,
} from '../adapters/widget-bridge.js';
import { type NotificationSettings, planNotifications } from './planner.js';
import { handleResponse } from './responses.js';
import {
  CHANNEL_ID,
  cancelAllOwned,
  type NotificationsApi,
  type ScheduleRequest,
  syncScheduled,
  TODO_CATEGORY,
} from './scheduler.js';
import {
  loadNotificationSettings,
  notificationSettings,
  saveNotificationSettings,
} from './settings.js';
import { todosFromSnapshot } from './sources.js';

export { notificationSettings } from './settings.js';

// Maps our literal 'date' trigger onto expo's enum; everything else already matches.
const api: NotificationsApi = {
  getAllScheduledNotificationsAsync: () => Notifications.getAllScheduledNotificationsAsync(),
  cancelScheduledNotificationAsync: (id) => Notifications.cancelScheduledNotificationAsync(id),
  scheduleNotificationAsync: (r: ScheduleRequest) =>
    Notifications.scheduleNotificationAsync({
      identifier: r.identifier,
      content: r.content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.trigger.date,
        channelId: r.trigger.channelId,
      },
    }),
};

let queue: Promise<unknown> = Promise.resolve();

async function reschedule(): Promise<void> {
  const settings = notificationSettings.value;
  if (!settings.enabled) {
    await cancelAllOwned(api);
    return;
  }
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  const { todos, milestones } = todosFromSnapshot(snapshot);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const planned = planNotifications(todos, milestones, settings, Date.now(), tz);
  await syncScheduled(api, planned, new Set(todos.map((t) => t.id)));
}

/** Replans and syncs the OS schedule. Calls are serialized; failures are logged, never thrown. */
export function rescheduleNotifications(): Promise<void> {
  const run = queue.then(reschedule).catch((e) => {
    console.warn('[notifications] reschedule failed', e);
  });
  queue = run;
  return run;
}

export interface NotificationDeps {
  container: SharedContainer;
  bridge: WidgetBridge;
  navigate: (href: string) => void;
}

let activeContainer: SharedContainer | null = null;

export function startNotifications(deps: NotificationDeps): () => void {
  // expo-notifications' response APIs throw on web, which blanked the whole web preview.
  if (Platform.OS === 'web') return () => {};
  activeContainer = deps.container;
  void loadNotificationSettings(deps.container).catch(() => undefined);
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => undefined);
  void Notifications.setNotificationCategoryAsync(TODO_CATEGORY, [
    { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: false } },
    { identifier: 'snooze', buttonTitle: 'Snooze 1h', options: { opensAppToForeground: false } },
  ]).catch(() => undefined);

  const respond = (response: Notifications.NotificationResponse) =>
    handleResponse(response.actionIdentifier, response.notification.request.content, {
      container: deps.container,
      bridge: deps.bridge,
      navigate: deps.navigate,
      schedule: (r) => api.scheduleNotificationAsync(r),
      reschedule: rescheduleNotifications,
      now: Date.now,
    }).catch((e) => console.warn('[notifications] response failed', e));

  const subscription = Notifications.addNotificationResponseReceivedListener((r) => {
    void respond(r);
  });
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    Notifications.clearLastNotificationResponse();
    void respond(last);
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopEffect = effect(() => {
    githubFileStore.openFiles.value;
    githubProfileStore.currentRepo.value;
    notificationSettings.value;
    clearTimeout(timer);
    timer = setTimeout(() => void rescheduleNotifications(), 500);
  });

  return () => {
    stopEffect();
    activeContainer = null;
    clearTimeout(timer);
    subscription.remove();
  };
}

/** Persists a settings change and replans. A no-op persistence-wise before `startNotifications`. */
export async function updateNotificationSettings(
  update: (s: NotificationSettings) => NotificationSettings,
): Promise<void> {
  const next = update(notificationSettings.value);
  if (activeContainer) await saveNotificationSettings(activeContainer, next);
  else notificationSettings.value = next;
  await rescheduleNotifications();
}

/** Turning on asks for permission in context; resolves `'denied'` (and stays off) otherwise. */
export async function setNotificationsEnabled(on: boolean): Promise<'granted' | 'denied'> {
  let result: 'granted' | 'denied' = 'granted';
  if (on) {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) result = 'denied';
  }
  await updateNotificationSettings((s) => ({ ...s, enabled: on && result === 'granted' }));
  return result;
}

export const openSystemSettings = (): Promise<void> => Linking.openSettings();
