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
  dueDate: '',
  dueTime: '',
  repeatRule: '',
  repeatNextDate: '',
  pending: false,
};
const snapshot: Required<WidgetTodoSnapshot> = {
  schemaVersion: 2,
  updatedAt: 0,
  repoFullName: '',
  branch: '',
  appFolder: '.kh',
  upcomingMilestone: { id: '', name: '', dueDate: '' },
  nextDue: { itemId: '', text: '', dueDate: '', dueTime: '', repeatRule: '' },
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

const pendingKeys = ['kind', 'itemId', 'status', 'text', 'path', 'date', 'timestamp'];
const mutationKinds = ['toggle', 'move', 'capture', 'habit'];

const hasProperty = (swift: string, key: string): boolean =>
  new RegExp(`\\bvar ${key}\\s*:`).test(swift);

describe('ios widget target', () => {
  const models = read('SharedTodoModels.swift');
  const store = read('SharedTodoStore.swift');
  const views = read('TodoWidgetViews.swift');
  const widgets = read('KaihumanWidgets.swift');

  it('queues a recurring todo toggle for the app instead of marking it done', () => {
    const toggle = store.slice(store.indexOf('func toggle('), store.indexOf('func move('));
    expect(toggle).toMatch(/if item\.repeatRule != nil \{\s*queue\(\.toggle\(/);
    expect(toggle.indexOf('repeatRule')).toBeLessThan(toggle.indexOf('marker: .done'));
  });

  it('declares every snapshot, item, counts and milestone key', () => {
    const keys = [
      ...Object.keys(item),
      ...Object.keys(snapshot),
      ...Object.keys(snapshot.counts),
      ...Object.keys(snapshot.upcomingMilestone),
      ...Object.keys(snapshot.nextDue),
      ...Object.keys(snapshot.stats),
      ...Object.keys(snapshot.milestones[0] ?? {}),
      ...Object.keys(snapshot.privacy),
      ...Object.keys(snapshot.ideas),
      ...Object.keys(snapshot.ideas.hot[0] ?? {}),
      ...Object.keys(snapshot.cards[0] ?? {}),
      ...Object.keys(snapshot.habits[0] ?? {}),
      ...Object.keys({ sha: '', content: '' }),
    ];
    for (const key of keys) expect(hasProperty(models, key), key).toBe(true);
  });

  it('mirrors the status raw values and pending mutation shape', () => {
    for (const status of statuses) expect(models).toContain(`"${status}"`);
    expect(models).toMatch(/struct PendingWidgetMutation: Codable/);
    for (const key of pendingKeys) expect(hasProperty(models, key), key).toBe(true);
  });

  it('decodes v1 pending files and every v2 mutation kind', () => {
    // v1 wrote `{itemId, timestamp}` with no kind; the optional fields keep those files decoding.
    expect(models).toMatch(/var kind: String\?/);
    expect(models).toMatch(/var itemId: String\?/);
    for (const kind of mutationKinds) expect(models, kind).toContain(`kind: "${kind}"`);
    // Same shape as the TS union (PendingWidgetMutation in widget-sync.ts).
    const kindsInTs = readFileSync(
      join(dir, '..', '..', '..', '..', 'packages/core/src/widget-sync.ts'),
      'utf8',
    );
    for (const kind of mutationKinds) expect(kindsInTs, kind).toContain(`'${kind}'`);
  });

  it('rewrites checkboxes with the markers of packages/formats todos', () => {
    expect(store).toMatch(/case backlog = "\[ \]"/);
    expect(store).toMatch(/case inProgress = "\[>\]"/);
    expect(store).toMatch(/case done = "\[x\]"/);
    expect(store).toContain('static func setMarker(');
    expect(store).toMatch(/static func markDone\([^)]*\) -> String\? \{\s*setMarker\(/);
    for (const fn of [
      'func move(itemId: String',
      'func appendCapture(text',
      'func checkInHabit(path',
      'func queue(_ mutation',
    ]) {
      expect(store, fn).toContain(fn);
    }
    expect(store).toContain('- [ ] \\(text)');
    expect(store).toContain('::created:: ');
    expect(store).toContain('queueing mutation: PendingWidgetMutation');
    expect(store).toContain('message: String');
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
    expect(entitlements).toContain('$(KH_APP_GROUP)');
    expect(entitlements).toContain('keychain-access-groups');
  });

  describe('widget set', () => {
    const widgetFiles = {
      InboxTodoWidget: widgets,
      QuickCaptureWidget: read('QuickCaptureWidget.swift'),
      WeeklyDoneWidget: read('WeeklyDoneWidget.swift'),
      InboxCountWidget: read('InboxCountWidget.swift'),
      BoardColumnWidget: read('BoardColumnWidget.swift'),
      MilestoneCountdownWidget: read('MilestoneCountdownWidget.swift'),
      IdeaPipelineWidget: read('IdeaPipelineWidget.swift'),
      KnowledgeCardWidget: read('KnowledgeCardWidget.swift'),
      HabitsWidget: read('HabitsWidget.swift'),
      QuickAddWidget: read('QuickAddWidget.swift'),
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
      BoardColumnWidget: ['systemMedium', 'systemLarge'],
      MilestoneCountdownWidget: ['systemSmall', 'accessoryRectangular', 'accessoryCircular'],
      IdeaPipelineWidget: ['systemSmall', 'systemMedium'],
      KnowledgeCardWidget: ['systemMedium', 'systemLarge'],
      HabitsWidget: ['systemSmall', 'accessoryRectangular'],
      QuickAddWidget: ['systemSmall', 'accessoryCircular', 'accessoryRectangular'],
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
      expect(widgets).toContain('        FocusLiveActivity()');
    });

    it('configures the board column and milestone widgets from the snapshot', () => {
      const board = widgetFiles.BoardColumnWidget;
      expect(board).toContain('BoardColumnConfigurationIntent: WidgetConfigurationIntent');
      expect(board).toContain('AppIntentConfiguration(kind: kind');
      expect(board).toContain('EntityQuery');
      for (const column of ['inbox', 'inProgress', 'backlog'])
        expect(board).toContain(`case ${column}`);
      expect(board).toContain('showsStart: true');
      const milestone = widgetFiles.MilestoneCountdownWidget;
      expect(milestone).toContain('MilestoneConfigurationIntent: WidgetConfigurationIntent');
      expect(milestone).toContain('struct MilestoneEntity: AppEntity');
      expect(milestone).toContain('EntityQuery');
      expect(milestone).toContain('KaihumanTimeline.daily');
      expect(milestone).toContain('DeepLink.board(milestone:');
    });

    it('uses only deep links the app routes, plus query parameters it ignores today', () => {
      const components = read('WidgetComponents.swift');
      for (const host of ['board', 'ideas', 'quick-log'])
        expect(components).toContain(`host: "${host}"`);
      expect(components).toContain('kaihuman://files/');
      expect(widgetFiles.KnowledgeCardWidget).toContain('DeepLink.file(path:');
      expect(widgetFiles.IdeaPipelineWidget).toContain('DeepLink.ideas(status:');
      expect(widgetFiles.IdeaPipelineWidget).toContain('OpenIdeaLogIntent(slug:');
      expect(read('OpenQuickCaptureIntent.swift')).toContain('kaihuman://quick-log?idea=');
    });

    it('rotates the knowledge card every 3 h and nexts without the network', () => {
      const queries = read('SnapshotQueries.swift');
      expect(queries).toContain('3 * 3600');
      expect(read('WidgetProviders.swift')).toContain('static func rotating(');
      expect(widgetFiles.KnowledgeCardWidget).toContain(
        'Button(intent: NextKnowledgeCardIntent())',
      );
      const next = read('NextKnowledgeCardIntent.swift');
      expect(next).toContain('advanceCardOffset()');
      expect(next).toContain('reloadTimelines(ofKind: Self.widgetKind)');
      expect(next).not.toContain('URLSession');
      expect(next).toContain('"KnowledgeCardWidget"');
    });

    it('starts todos and logs habits in process', () => {
      const start = read('StartTodoIntent.swift');
      expect(start).toContain('store.move(itemId: itemId, to: .inProgress)');
      expect(start.indexOf('reloadAllTimelines')).toBeLessThan(start.indexOf('store.push'));
      expect(start).toContain('queueing: .move(');
      const habit = read('LogHabitIntent.swift');
      expect(habit).toContain('checkInHabit(path: path)');
      expect(habit).toContain('"HabitsWidget"');
      expect(widgetFiles.HabitsWidget).toContain('Button(intent: LogHabitIntent(path:');
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
        'BoardColumnWidget.swift',
        'MilestoneCountdownWidget.swift',
        'IdeaPipelineWidget.swift',
        'KnowledgeCardWidget.swift',
        'HabitsWidget.swift',
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

    it('defines Volt once, in sRGB, with no colour-space or tint leaks', () => {
      let voltLiterals = 0;
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.swift'))) {
        const swift = read(file);
        expect(swift, file).not.toMatch(/displayP3|\.accentColor|\.tint\(|Color\(red:/);
        voltLiterals += swift.match(/0xE6FF4A/gi)?.length ?? 0;
      }
      expect(voltLiterals).toBe(1);
      expect(read('Theme.swift')).toContain('.sRGB');
      expect(read('Theme.swift')).toContain('static let volt = Color(hex: 0xE6FF4A)');
      const render = readFileSync(join(dir, '..', 'ios-widget-render', 'RenderMain.swift'), 'utf8');
      expect(render).toContain('WidgetTheme.volt');
      expect(render).toContain('MilestoneCountdownView');
      expect(render).toContain('.accessoryRectangular');
    });

    it('lays out large board rows at a fixed height from the top', () => {
      const board = widgetFiles.BoardColumnWidget;
      expect(board).toContain('.frame(height: rowHeight)');
      expect(board).not.toContain(
        '.frame(maxHeight: .infinity)\n                        Rectangle',
      );
      expect(board).toContain('items.prefix(maxRows)');
      expect(board).toContain('alignment: .top');
      expect(board).toMatch(/isLarge \? \(freshness == \.fresh \? 7 : 6\)/);
    });

    it('does not fall back to inbox copy for other board columns', () => {
      const board = widgetFiles.BoardColumnWidget;
      expect(board).toContain('case .inbox: return "Inbox zero"');
      expect(board).toContain('default: return "Nothing here"');
    });

    it('fills the large knowledge card with a second card', () => {
      const cards = widgetFiles.KnowledgeCardWidget;
      expect(cards).toContain('offset: entry.cardOffset + 1');
      expect(cards).toContain('"UP NEXT"');
      expect(cards).toContain('alignment: .top');
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
        'MilestoneCountdownWidget.swift',
        'IdeaPipelineWidget.swift',
        'HabitsWidget.swift',
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
      for (const file of [
        'IdeaPipelineWidget.swift',
        'KnowledgeCardWidget.swift',
        'HabitsWidget.swift',
        'FocusLiveActivity.swift',
      ]) {
        expect(read(file), file).toContain('.privacySensitive()');
      }
      expect(read('HabitsWidget.swift')).toContain('snapshot.showsLockScreenText');
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

    it('opens the one-field inbox sheet from the quick-add widget and every "+"', () => {
      const intent = read('OpenQuickCaptureIntent.swift');
      expect(intent).toContain('case inbox');
      expect(intent).toContain('"kaihuman://quick-inbox"');
      const add = read('QuickAddWidget.swift');
      expect(add).toContain('.widgetURL(DeepLink.quickInbox)');
      expect(read('WidgetComponents.swift')).toContain('host: "quick-inbox"');
      const plus = /AddToInboxButton\(|showsAdd: true/g;
      expect(read('WidgetComponents.swift')).toContain(
        'Button(intent: OpenQuickCaptureIntent(kind: .inbox))',
      );
      // Next up: small and large headers plus the medium layout.
      expect(read('TodoWidgetViews.swift').match(plus)).toHaveLength(3);
      expect(read('InboxCountWidget.swift')).toMatch(plus);
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
      const controlKinds = [
        'NewTodoControl',
        'NewNoteControl',
        'NewLogControl',
        'NewIdeaControl',
        'AddToInboxControl',
      ];
      for (const kind of controlKinds) {
        expect(controls).toContain(`static let kind = "${kind}"`);
        expect(controls).toMatch(
          new RegExp(`@available\\(iOS 18\\.0, \\*\\)\\s+struct ${kind}: ControlWidget`),
        );
      }
      expect(controls).toContain(
        'ControlWidgetButton(action: OpenQuickCaptureIntent(kind: .inbox))',
      );
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
      expect(blocks).toHaveLength(4);
      for (const block of blocks) {
        const phrases = block.match(/"[^"]*"/g) ?? [];
        expect(phrases.length).toBeGreaterThan(0);
        for (const phrase of phrases) expect(phrase).toContain('\\(.applicationName)');
      }
      for (const intent of [
        'AddTodoIntent()',
        'WhatsNextIntent()',
        'CompleteTodoIntent()',
        'CaptureTodoIntent()',
      ]) {
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

  describe('background capture', () => {
    const capture = read('CaptureTodoIntent.swift');

    it('adds to the inbox without opening the app and queues on failure', () => {
      expect(capture).toContain('struct CaptureTodoIntent: AppIntent');
      expect(capture).toContain('openAppWhenRun = false');
      expect(capture).toMatch(/@Parameter\(title: "Todo"\)\s+var text: String/);
      expect(capture).toContain('some IntentResult & ProvidesDialog');
      expect(capture).toContain('"Added to inbox"');
      expect(capture).toContain('store.appendCapture(text: trimmed)');
      expect(capture).toContain('queueing: .capture(text: trimmed)');
    });

    it('answers "Add to kaihuman inbox" from Siri, Shortcuts and Spotlight', () => {
      const shortcuts = readFileSync(
        join(dir, '..', 'ios-app-intents', 'AppShortcuts.swift'),
        'utf8',
      );
      const block = shortcuts.slice(shortcuts.indexOf('intent: CaptureTodoIntent()'));
      expect(block).toContain('"Add to \\(.applicationName) inbox"');
    });
  });

  describe('focus live activity', () => {
    const attributes = read('FocusActivityAttributes.swift');
    const moduleSwift = readFileSync(
      join(dir, '..', '..', 'modules', 'kaihuman-shared', 'ios', 'KaihumanSharedModule.swift'),
      'utf8',
    );

    // Brace-matched struct text without comments or whitespace.
    const structOf = (swift: string): string => {
      const start = swift.indexOf('struct FocusActivityAttributes: ActivityAttributes');
      expect(start).toBeGreaterThanOrEqual(0);
      let depth = 0;
      for (let i = swift.indexOf('{', start); i < swift.length; i++) {
        if (swift[i] === '{') depth++;
        if (swift[i] === '}' && --depth === 0) {
          return swift
            .slice(start, i + 1)
            .replace(/\/\/.*$/gm, '')
            .replace(/\s+/g, '');
        }
      }
      throw new Error('unbalanced struct');
    };

    it('keeps the pod copy of the attributes identical to the app copy', () => {
      expect(structOf(moduleSwift)).toBe(structOf(attributes));
      for (const field of [
        'startedAt: Date',
        'plannedEnd: Date',
        'todoId: String',
        'todoText: String',
      ]) {
        expect(attributes).toContain(`var ${field}`);
      }
    });

    it('exposes start, update and end behind the availability and enabled checks', () => {
      for (const name of ['startFocusActivity', 'updateFocusActivity', 'endFocusActivity']) {
        expect(moduleSwift, name).toMatch(new RegExp(`(Async)?Function\\("${name}"\\)`));
      }
      expect(moduleSwift).toContain('#available(iOS 16.2, *)');
      expect(moduleSwift).toContain('ActivityAuthorizationInfo().areActivitiesEnabled');
      expect(moduleSwift).toContain('relevanceScore: 100');
    });

    it('runs Done and +5m as Live Activity intents', () => {
      const intents = read('FocusIntents.swift');
      expect(intents).toContain('struct FocusDoneIntent: LiveActivityIntent');
      expect(intents).toContain('struct FocusExtendIntent: LiveActivityIntent');
      expect(intents).toContain('store.toggle(itemId: todoId)');
      expect(intents).toContain('activity.end(nil, dismissalPolicy: .immediate)');
      expect(intents).toContain('activity.update(');
      expect(intents).toContain('5 * 60');
    });

    it('counts down with a system timer and has the Dynamic Island regions', () => {
      const activity = read('FocusLiveActivity.swift');
      expect(activity).toContain('Text(timerInterval:');
      expect(activity).toContain('countsDown: true');
      expect(activity).toContain('ActivityConfiguration(for: FocusActivityAttributes.self)');
      for (const region of [
        'compactLeading',
        'compactTrailing',
        'minimal',
        '.keylineTint(WidgetTheme.volt)',
      ]) {
        expect(activity, region).toContain(region);
      }
      expect(activity).toContain('Button(intent: FocusDoneIntent(');
      expect(activity).toContain('Button(intent: FocusExtendIntent(');
    });
  });
  it('pluralises todo counts and has a Next up empty state that is not "Inbox zero"', () => {
    const swift = readdirSync(dir)
      .filter((f) => f.endsWith('.swift'))
      .map(read)
      .join('\n');
    // A bare "\(n) todos" reads "1 todos"; every count must pick the singular for 1.
    expect(swift).not.toMatch(/\\\([\w.]+\) todos/);
    expect(views).toContain('case .all: return "Nothing up next"');
  });
});
