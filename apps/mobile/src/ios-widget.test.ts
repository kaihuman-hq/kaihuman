import { readdirSync, readFileSync } from 'node:fs';
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
  priority: 'high',
  pending: false,
};
const snapshot: Required<WidgetTodoSnapshot> = {
  schemaVersion: 2,
  updatedAt: 0,
  repoFullName: '',
  branch: '',
  appFolder: '.kh',
  upcomingMilestone: { id: '', name: '', dueDate: '' },
  counts: {
    inbox: 0,
    inProgress: 0,
    backlog: 0,
    doneToday: 0,
    knowledgeInbox: 0,
    doneThisWeek: 0,
  },
  stats: { doneByDay: [], streakDays: 0, weeklyGoal: 0 },
  milestones: [{ id: '', name: '', dueDate: '', open: 0, done: 0 }],
  tags: [],
  privacy: { lockScreenText: true },
  timeZone: '',
  items: [],
  files: {},
  ideas: { byStatus: {}, hot: [{ slug: '', title: '', level: 'hot' }] },
  cards: [{ path: '', title: '', excerpt: '', tags: [] }],
  habits: [{ path: '', name: '', doneToday: false, streakDays: 0, pending: false }],
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
      ...Object.keys(snapshot.stats),
      ...Object.keys(snapshot.milestones[0] ?? {}),
      ...Object.keys(snapshot.privacy),
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

  describe('widget set', () => {
    const widgetFiles = {
      InboxTodoWidget: widgets,
      QuickCaptureWidget: read('QuickCaptureWidget.swift'),
      WeeklyDoneWidget: read('WeeklyDoneWidget.swift'),
      InboxCountWidget: read('InboxCountWidget.swift'),
    };
    const families: Record<keyof typeof widgetFiles, string[]> = {
      InboxTodoWidget: [
        'systemSmall',
        'systemMedium',
        'systemLarge',
        'accessoryCircular',
        'accessoryRectangular',
        'accessoryInline',
      ],
      QuickCaptureWidget: ['systemSmall', 'systemMedium'],
      WeeklyDoneWidget: ['systemSmall', 'accessoryCircular', 'accessoryInline'],
      InboxCountWidget: ['systemSmall', 'accessoryCircular', 'accessoryInline'],
    };
    const kinds = Object.keys(widgetFiles) as Array<keyof typeof widgetFiles>;
    const familiesOf = (swift: string): string[] =>
      [...(/supportedFamilies\(\[([^\]]*)\]\)/.exec(swift)?.[1] ?? '').matchAll(/\.(\w+)/g)].map(
        (m) => m[1] ?? '',
      );

    it('registers every widget kind in the bundle, keeping the original kind string', () => {
      expect(widgets).toContain('@main');
      expect(widgets).toContain('struct KaihumanWidgets: WidgetBundle');
      for (const kind of kinds) {
        expect(widgetFiles[kind], kind).toContain(`let kind = "${kind}"`);
        expect(widgets, kind).toContain(`        ${kind}()`);
      }
      expect(widgets).toContain('AppIntentConfiguration');
      expect(widgets).toContain('NextUpConfigurationIntent');
    });

    it('supports the right families per widget', () => {
      for (const kind of kinds) expect(familiesOf(widgetFiles[kind]), kind).toEqual(families[kind]);
    });

    it('has a #Preview for every family of every widget', () => {
      for (const kind of kinds) {
        const swift = kind === 'InboxTodoWidget' ? views : widgetFiles[kind];
        for (const family of families[kind]) {
          const preview = new RegExp(
            `#Preview\\("[^"]*", as: \\.${family}\\) \\{\\s*${kind}\\(\\)`,
          );
          expect(swift, `${kind} ${family}`).toMatch(preview);
        }
      }
      expect(read('PreviewData.swift')).toContain('static var preview: SharedTodoSnapshot');
    });

    it('lets callers pass family, rendering mode and colour scheme explicitly', () => {
      for (const file of [
        'TodoWidgetViews.swift',
        'QuickCaptureWidget.swift',
        'WeeklyDoneWidget.swift',
        'InboxCountWidget.swift',
      ]) {
        const swift = read(file);
        expect(swift, file).toMatch(
          /init\(\s*entry: TodoEntry,\s*family: WidgetFamily,\s*renderingMode: WidgetRenderingMode = \.fullColor,\s*colorScheme: ColorScheme = \.dark/,
        );
        expect(swift, file).toContain('@Environment(\\.widgetFamily)');
      }
    });

    it('uses the Volt on Ink theme in light and dark', () => {
      const theme = read('Theme.swift');
      expect(theme).toContain('#E6FF4A');
      for (const hex of ['0xE6FF4A', '0x1B1C19', '0x4F5E00', '0x0C0D0C', '0xF4F5EF']) {
        expect(theme, hex).toContain(hex);
      }
      expect(theme).toContain('ColorScheme');
      expect(theme).toContain('containerBackground(for: .widget)');
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.swift'))) {
        expect(read(file), file).not.toMatch(/0A0A0F|00FF00|KAIHUMAN \/\/ TODOS/);
      }
    });

    it('handles tinted rendering without relying on colour', () => {
      const theme = read('Theme.swift');
      expect(theme).toContain('@Environment(\\.widgetRenderingMode)');
      expect(theme).toContain('renderingMode != .fullColor');
      expect(theme).toContain('background: .clear');
      for (const file of [
        'TodoWidgetViews.swift',
        'WidgetComponents.swift',
        'WeeklyDoneWidget.swift',
        'InboxCountWidget.swift',
        'QuickCaptureWidget.swift',
      ]) {
        expect(read(file), file).toContain('.widgetAccentable(');
      }
      // Shape, not hue, tells the states apart.
      const components = read('WidgetComponents.swift');
      for (const symbol of ['circle.inset.filled', '"circle"', '"clock"']) {
        expect(components).toContain(symbol);
      }
    });

    it('marks todo text privacy sensitive and honours the lock screen setting', () => {
      expect(read('WidgetComponents.swift')).toContain('.privacySensitive()');
      expect(views).toContain('.privacySensitive()');
      expect(views).toContain('snapshot.showsLockScreenText');
      expect(read('SnapshotQueries.swift')).toContain('privacy?.lockScreenText ?? true');
    });

    it('shows signed-out, stale, dim and empty states', () => {
      const components = read('WidgetComponents.swift');
      expect(components).toContain('Open kaihuman to sign in');
      expect(components).toContain('.widgetURL(DeepLink.app)');
      expect(components).toContain('"kaihuman://"');
      expect(components).toContain('Synced \\(freshness.hours)h ago');
      expect(components).toContain('? 0.5 : 1');
      const queries = read('SnapshotQueries.swift');
      expect(queries).toContain('48 * 3600');
      expect(queries).toContain('6 * 3600');
      expect(views).toContain('Inbox zero');
      expect(views).toContain('Nothing in progress — pick from backlog');
      expect(read('InboxCountWidget.swift')).toContain('Inbox zero');
    });

    it('builds timelines at now and the next local midnight in the snapshot time zone', () => {
      const providers = read('WidgetProviders.swift');
      expect(providers).toContain('policy: .atEnd');
      expect(providers).toContain('nextMidnight');
      expect(providers).toContain('TimelineProvider');
      expect(providers).toContain('AppIntentTimelineProvider');
      expect(read('SnapshotQueries.swift')).toContain('TimeZone(identifier: identifier)');
    });

    it('makes the rows toggle todos and link to the board', () => {
      const components = read('WidgetComponents.swift');
      expect(components).toContain('Button(intent: ToggleTodoIntent(itemId: item.id))');
      expect(components).toContain('kaihuman://board');
      expect(components).toContain('kaihuman://inbox');
      expect(read('InboxCountWidget.swift')).toContain('DeepLink.inbox');
      expect(read('InboxCountWidget.swift')).toContain('Process');
    });

    it('builds the source picker from the snapshot', () => {
      const intent = read('NextUpConfigurationIntent.swift');
      expect(intent).toContain('WidgetConfigurationIntent');
      expect(intent).toContain('struct TodoSourceEntity: AppEntity');
      expect(intent).toContain('EntityQuery');
      for (const id of [
        'column:inbox',
        'column:in-progress',
        'column:backlog',
        'tag:',
        'milestone:',
      ]) {
        expect(intent + read('SnapshotQueries.swift'), id).toContain(id);
      }
    });
  });

  describe('quick capture', () => {
    it('opens the capture sheet for every kind through the pending url', () => {
      const intent = read('OpenQuickCaptureIntent.swift');
      for (const kind of ['todo', 'note', 'log', 'idea', 'knowledge']) {
        expect(intent).toContain(`"kaihuman://quick-${kind}"`);
      }
      expect(intent).toContain('openAppWhenRun = true');
      expect(intent).toContain('"pending-url"');
      const legacy = read('QuickCaptureTodoIntent.swift');
      expect(legacy).toContain('struct QuickCaptureTodoIntent');
      expect(legacy).toContain('kaihuman://quick-todo');
      expect(legacy).toContain('openAppWhenRun = true');
    });

    it('has four capture buttons in the widget', () => {
      const swift = read('QuickCaptureWidget.swift');
      for (const kind of ['.todo', '.note', '.log', '.idea']) {
        expect(swift).toContain(`kind: ${kind}`);
      }
      expect(swift).toContain('Button(intent: OpenQuickCaptureIntent(kind: capture.kind))');
    });

    it('offers four iOS 18 controls behind an availability guard', () => {
      const controls = read('ControlWidgets.swift');
      const controlKinds = ['NewTodoControl', 'NewNoteControl', 'NewLogControl', 'NewIdeaControl'];
      for (const kind of controlKinds) {
        expect(controls).toContain(`static let kind = "${kind}"`);
        expect(controls).toMatch(
          new RegExp(`@available\\(iOS 18\\.0, \\*\\)\\s+struct ${kind}: ControlWidget`),
        );
      }
      expect(controls).toContain('ControlWidgetButton(action: OpenQuickCaptureIntent(');
      // A nested WidgetBundle is not a Widget, so the controls sit in the bundle's iOS 18 branch.
      const guarded = /if #available\(iOS(ApplicationExtension)? 18\.0, \*\) \{([^}]*)\}/.exec(
        widgets,
      )?.[2];
      for (const kind of controlKinds) expect(guarded, kind).toContain(`${kind}()`);
    });
  });

  describe('app shortcuts', () => {
    const intentsDir = join(dir, '..', 'ios-app-intents');
    const intents = readFileSync(join(intentsDir, 'TodoIntents.swift'), 'utf8');
    const shortcuts = readFileSync(join(intentsDir, 'AppShortcuts.swift'), 'utf8');

    it('provides Siri phrases that all name the app', () => {
      expect(shortcuts).toContain('AppShortcutsProvider');
      const blocks = [...shortcuts.matchAll(/phrases:\s*\[([^\]]*)\]/g)].map((m) => m[1] ?? '');
      expect(blocks).toHaveLength(3);
      for (const block of blocks) {
        const phrases = block.match(/"[^"]*"/g) ?? [];
        expect(phrases.length).toBeGreaterThan(0);
        for (const phrase of phrases) expect(phrase).toContain('\\(.applicationName)');
      }
      for (const intent of ['AddTodoIntent()', 'WhatsNextIntent()', 'CompleteTodoIntent()']) {
        expect(shortcuts).toContain(intent);
      }
    });

    it('answers and completes from the cached snapshot', () => {
      expect(intents).toContain('struct WhatsNextIntent: AppIntent');
      expect(intents).toContain('ProvidesDialog');
      expect(intents).toContain('struct TodoEntity: AppEntity');
      expect(intents).toContain('EntityStringQuery');
      expect(intents).toContain('store.toggle(itemId: todo.id)');
      expect(intents.indexOf('reloadAllTimelines')).toBeLessThan(intents.indexOf('store.push'));
      expect(intents).toContain('QuickCaptureKind.todo.url');
    });

    it('stays out of the widget extension and has no second @main', () => {
      for (const swift of [intents, shortcuts]) expect(swift).not.toMatch(/@main|WidgetBundle/);
    });
  });
});
