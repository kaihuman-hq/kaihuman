import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WidgetTodoItem, WidgetTodoSnapshot } from '@kaihuman/core';
import { describe, expect, it } from 'vitest';
import { PENDING_WIDGET_MUTATIONS_FILE, WIDGET_TODOS_FILE } from './adapters/widget-bridge.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'targets', 'ios-widget');
const read = (name: string): string => readFileSync(join(dir, name), 'utf8');

// Fully populated so tsc fails when a TS field is added without updating this list.
const item: Required<WidgetTodoItem> = {
  id: '',
  filePath: '',
  indexInFile: 0,
  text: '',
  status: 'backlog',
  tags: [],
  milestoneId: '',
  milestoneName: '',
  milestoneDueDate: '',
  updatedAt: 0,
};
const snapshot: Required<WidgetTodoSnapshot> = {
  updatedAt: 0,
  repoFullName: '',
  branch: '',
  appFolder: '.kh',
  upcomingMilestone: { id: '', name: '', dueDate: '' },
  counts: { inbox: 0, inProgress: 0, backlog: 0, doneToday: 0 },
  items: [],
  files: {},
};
const statuses: WidgetTodoItem['status'][] = ['backlog', 'in-progress', 'done', 'rejected'];

const hasProperty = (swift: string, key: string): boolean =>
  new RegExp(`\\bvar ${key}\\s*:`).test(swift);

describe('ios widget target', () => {
  const models = read('SharedTodoModels.swift');
  const store = read('SharedTodoStore.swift');
  const views = read('TodoWidgetViews.swift');
  const widgets = read('KaihumanWidgets.swift');

  it('declares every snapshot, item, counts and milestone key', () => {
    const keys = [
      ...Object.keys(item),
      ...Object.keys(snapshot),
      ...Object.keys(snapshot.counts),
      ...Object.keys(snapshot.upcomingMilestone),
      ...Object.keys({ sha: '', content: '' }),
    ];
    for (const key of keys) expect(hasProperty(models, key), key).toBe(true);
  });

  it('mirrors the status raw values and pending mutation shape', () => {
    for (const status of statuses) expect(models).toContain(`"${status}"`);
    expect(models).toMatch(/struct PendingWidgetMutation: Codable/);
    expect(hasProperty(models, 'itemId')).toBe(true);
    expect(hasProperty(models, 'timestamp')).toBe(true);
  });

  it('uses the same container id and file names as the JS bridge', () => {
    expect(store).toContain('group.com.kaihuman.app');
    expect(store).toContain(`"${WIDGET_TODOS_FILE}"`);
    expect(store).toContain(`"${PENDING_WIDGET_MUTATIONS_FILE}"`);
  });

  it('pushes to the GitHub contents endpoint and queues failures', () => {
    expect(store).toContain('https://api.github.com/repos/');
    expect(store).toContain('/contents/');
    expect(store).toContain('"PUT"');
    expect(store).toContain('base64EncodedString');
    expect(store).toContain('::updated::');
    expect(store).toContain('kSecClassGenericPassword');
    expect(store).toContain('queuePending');
  });

  it('supports all five families', () => {
    for (const family of [
      'systemSmall',
      'systemMedium',
      'systemLarge',
      'accessoryCircular',
      'accessoryRectangular',
    ]) {
      expect(widgets).toContain(`.${family}`);
      expect(views).toContain(`.${family}`);
    }
    expect(widgets).toContain('@main');
    expect(widgets).toContain('containerBackground');
  });

  it('uses the Nexus theme and quick-capture url', () => {
    expect(views).toContain('#0A0A0F');
    expect(views).toContain('#00FF00');
    expect(views).toContain('.monospaced');
    expect(views).toContain('KAIHUMAN // TODOS');
    expect(views).toContain('kaihuman://quick-todo');
    expect(read('QuickCaptureTodoIntent.swift')).toContain('openAppWhenRun = true');
  });

  it('wires the toggle intent to the store and timelines', () => {
    const intent = read('ToggleTodoIntent.swift');
    expect(intent).toContain('AppIntent');
    expect(intent).toContain('@Parameter');
    expect(intent).toContain('reloadAllTimelines()');
    expect(intent.indexOf('reloadAllTimelines')).toBeLessThan(intent.indexOf('store.push'));
  });

  it('declares the widget extension plist and entitlements', () => {
    expect(read('Info.plist')).toContain('com.apple.widgetkit-extension');
    const entitlements = read('KaihumanWidgets.entitlements');
    expect(entitlements).toContain('com.apple.security.application-groups');
    expect(entitlements).toContain('group.com.kaihuman.app');
    expect(entitlements).toContain('keychain-access-groups');
  });
});
