import type { WidgetTodoSnapshot } from '@kaihuman/core';
import { describe, expect, it, vi } from 'vitest';
import {
  InMemorySharedContainer,
  PENDING_WIDGET_MUTATIONS_FILE,
} from '../adapters/widget-bridge.js';
import { notificationSignature, type PlannedNotification } from './planner.js';
import { handleResponse, type ResponseDeps } from './responses.js';
import {
  cancelAllOwned,
  type NotificationsApi,
  type ScheduledEntry,
  type ScheduleRequest,
  snoozeRequest,
  syncScheduled,
} from './scheduler.js';
import {
  loadNotificationSettings,
  NOTIFICATION_SETTINGS_FILE,
  notificationSettings,
  saveNotificationSettings,
} from './settings.js';
import { todosFromSnapshot } from './sources.js';

const planned = (id: string, over: Partial<PlannedNotification> = {}): PlannedNotification => ({
  id,
  kind: 'due-today',
  fireAt: 1_000,
  title: 'T',
  body: 'B',
  url: 'kaihuman://board',
  ...over,
});

function fakeApi(initial: ScheduledEntry[] = []) {
  const store = new Map(initial.map((e) => [e.identifier, e]));
  const scheduled: ScheduleRequest[] = [];
  const cancelled: string[] = [];
  const api: NotificationsApi = {
    getAllScheduledNotificationsAsync: async () => [...store.values()],
    scheduleNotificationAsync: async (r) => {
      scheduled.push(r);
      store.set(r.identifier, { identifier: r.identifier, content: { data: r.content.data } });
      return r.identifier;
    },
    cancelScheduledNotificationAsync: async (id) => {
      cancelled.push(id);
      store.delete(id);
    },
  };
  return { api, scheduled, cancelled, store };
}

const entry = (n: PlannedNotification): ScheduledEntry => ({
  identifier: n.id,
  content: { data: { sig: notificationSignature(n) } },
});

describe('syncScheduled', () => {
  it('schedules new notifications with the full request shape', async () => {
    const f = fakeApi();
    const n = planned('kh:a', { todoId: 't1' });
    const r = await syncScheduled(f.api, [n], new Set());
    expect(r).toEqual({ scheduled: 1, cancelled: 0, kept: 0 });
    expect(f.scheduled[0]).toEqual({
      identifier: 'kh:a',
      content: {
        title: 'T',
        body: 'B',
        data: { sig: notificationSignature(n), url: n.url, todoId: 't1', kind: 'due-today' },
        categoryIdentifier: 'kh-todo',
        sound: 'default',
      },
      trigger: { type: 'date', date: 1_000, channelId: 'reminders' },
    });
  });

  it('omits the action category when there is no todo', async () => {
    const f = fakeApi();
    await syncScheduled(f.api, [planned('kh:a')], new Set());
    expect(f.scheduled[0]?.content.categoryIdentifier).toBeUndefined();
  });

  it('keeps unchanged notifications', async () => {
    const n = planned('kh:a');
    const f = fakeApi([entry(n)]);
    const r = await syncScheduled(f.api, [n], new Set());
    expect(r).toEqual({ scheduled: 0, cancelled: 0, kept: 1 });
    expect(f.scheduled).toEqual([]);
    expect(f.cancelled).toEqual([]);
  });

  it('replaces changed notifications under the same identifier', async () => {
    const f = fakeApi([entry(planned('kh:a'))]);
    const r = await syncScheduled(f.api, [planned('kh:a', { fireAt: 2_000 })], new Set());
    expect(r).toEqual({ scheduled: 1, cancelled: 0, kept: 0 });
    expect(f.cancelled).toEqual(['kh:a']);
    expect(f.scheduled[0]?.trigger.date).toBe(2_000);
  });

  it('cancels kh: notifications that left the plan and ignores foreign ids', async () => {
    const f = fakeApi([entry(planned('kh:old')), { identifier: 'other:1', content: {} }]);
    const r = await syncScheduled(f.api, [], new Set());
    expect(r.cancelled).toBe(1);
    expect(f.cancelled).toEqual(['kh:old']);
  });

  it('keeps snoozes for open todos and cancels them once the todo is closed', async () => {
    const snoozes: ScheduledEntry[] = [
      { identifier: 'kh-snooze:open', content: {} },
      { identifier: 'kh-snooze:gone', content: {} },
    ];
    const f = fakeApi(snoozes);
    const r = await syncScheduled(f.api, [], new Set(['open']));
    expect(f.cancelled).toEqual(['kh-snooze:gone']);
    expect(r).toEqual({ scheduled: 0, cancelled: 1, kept: 0 });
  });

  it('cancelAllOwned removes plan and snooze ids only', async () => {
    const f = fakeApi([
      { identifier: 'kh:a', content: {} },
      { identifier: 'kh-snooze:x', content: {} },
      { identifier: 'other', content: {} },
    ]);
    expect(await cancelAllOwned(f.api)).toBe(2);
    expect([...f.store.keys()]).toEqual(['other']);
  });
});

describe('snoozeRequest', () => {
  it('fires one hour later under a snooze id and keeps the url', () => {
    const r = snoozeRequest(
      { title: 'T', body: 'B', data: { url: 'kaihuman://board' } },
      'x#1',
      5_000,
    );
    expect(r.identifier).toBe('kh-snooze:x#1');
    expect(r.trigger).toEqual({ type: 'date', date: 5_000 + 3_600_000, channelId: 'reminders' });
    expect(r.content.data).toEqual({ url: 'kaihuman://board', todoId: 'x#1' });
    expect(r.content.categoryIdentifier).toBe('kh-todo');
  });
});

describe('todosFromSnapshot', () => {
  it('uses the milestone due date as the todo due date', () => {
    const snapshot = {
      items: [
        { id: 'f#0', text: 'a', status: 'backlog', milestoneDueDate: '2026-11-09' },
        { id: 'f#1', text: 'b', status: 'in-progress' },
      ],
      milestones: [{ id: 'm', name: 'M', dueDate: '2026-11-09', open: 1, done: 3 }],
    } as unknown as WidgetTodoSnapshot;
    expect(todosFromSnapshot(snapshot)).toEqual({
      todos: [
        { id: 'f#0', text: 'a', status: 'backlog', dueDate: '2026-11-09' },
        { id: 'f#1', text: 'b', status: 'in-progress', dueDate: undefined },
      ],
      milestones: [{ id: 'm', name: 'M', dueDate: '2026-11-09', open: 1 }],
    });
  });
});

describe('notification settings', () => {
  it('round-trips through the shared container', async () => {
    const c = new InMemorySharedContainer();
    const next = { ...notificationSettings.value, enabled: true, minutesBefore: 30 };
    await saveNotificationSettings(c, next);
    notificationSettings.value = { ...next, enabled: false };
    expect(await loadNotificationSettings(c)).toEqual(next);
    expect(notificationSettings.value).toEqual(next);
  });

  it('merges partial JSON and ignores invalid fields', async () => {
    const c = new InMemorySharedContainer();
    c.files.set(
      NOTIFICATION_SETTINGS_FILE,
      JSON.stringify({
        digest: false,
        morningTime: '25:99',
        minutesBefore: 'x',
        kinds: { overdue: false },
      }),
    );
    const s = await loadNotificationSettings(c);
    expect(s.digest).toBe(false);
    expect(s.kinds.overdue).toBe(false);
    expect(s.morningTime).toMatch(/^\d\d:\d\d$/);
    expect(s.morningTime).not.toBe('25:99');
    expect(typeof s.minutesBefore).toBe('number');
  });

  it('falls back to defaults on bad JSON', async () => {
    const c = new InMemorySharedContainer();
    c.files.set(NOTIFICATION_SETTINGS_FILE, '{nope');
    const s = await loadNotificationSettings(c);
    expect(typeof s.enabled).toBe('boolean');
  });
});

describe('handleResponse', () => {
  const deps = () => {
    const container = new InMemorySharedContainer();
    const d: ResponseDeps = {
      container,
      bridge: { reconcile: vi.fn(async () => 1) },
      navigate: vi.fn(),
      schedule: vi.fn(async () => undefined),
      reschedule: vi.fn(async () => undefined),
      now: () => 42,
    };
    return { d, container };
  };
  const content = { title: 'T', body: 'B', data: { todoId: 'f#0', url: 'kaihuman://board' } };

  it('done queues a toggle after existing mutations, reconciles, then reschedules', async () => {
    const { d, container } = deps();
    container.files.set(
      PENDING_WIDGET_MUTATIONS_FILE,
      JSON.stringify([{ kind: 'capture', text: 'x', timestamp: 1 }]),
    );
    await handleResponse('done', content, d);
    expect(JSON.parse(container.files.get(PENDING_WIDGET_MUTATIONS_FILE) ?? '')).toEqual([
      { kind: 'capture', text: 'x', timestamp: 1 },
      { kind: 'toggle', itemId: 'f#0', timestamp: 42 },
    ]);
    expect(d.bridge.reconcile).toHaveBeenCalledOnce();
    expect(d.reschedule).toHaveBeenCalledOnce();
  });

  it('done survives a corrupt queue file', async () => {
    const { d, container } = deps();
    container.files.set(PENDING_WIDGET_MUTATIONS_FILE, 'garbage');
    await handleResponse('done', content, d);
    expect(JSON.parse(container.files.get(PENDING_WIDGET_MUTATIONS_FILE) ?? '')).toHaveLength(1);
  });

  it('snooze schedules a one-hour request', async () => {
    const { d } = deps();
    await handleResponse('snooze', content, d);
    expect(d.schedule).toHaveBeenCalledWith(snoozeRequest(content, 'f#0', 42));
    expect(d.bridge.reconcile).not.toHaveBeenCalled();
  });

  it('a tap navigates to the notification url', async () => {
    const { d } = deps();
    await handleResponse('expo.modules.notifications.actions.DEFAULT', content, d);
    expect(d.navigate).toHaveBeenCalledWith('/board');
  });

  it('done without a todo id does nothing', async () => {
    const { d } = deps();
    await handleResponse('done', { data: {} }, d);
    expect(d.bridge.reconcile).not.toHaveBeenCalled();
  });
});
