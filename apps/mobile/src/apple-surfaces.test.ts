import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOCUS_FILTER_FILE, type WidgetFilter } from '@kaihuman/core';
import { describe, expect, it } from 'vitest';
import {
  APP_INTENTS_DIR,
  IOS_WIDGET_TARGET,
  SHARED_APP_SOURCES,
  WIDGET_ONLY_SOURCES,
} from '../plugins/with-kaihuman-widgets.js';

// Source-text checks: there is no Swift compiler in CI Linux, so these pin the wiring (names,
// shared keys, which target a file compiles into) that a device test would otherwise catch late.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const widget = (name: string): string =>
  readFileSync(join(root, IOS_WIDGET_TARGET.sourceDir, name), 'utf8');
const intent = (name: string): string => readFileSync(join(root, APP_INTENTS_DIR, name), 'utf8');
const hasProperty = (swift: string, key: string): boolean =>
  new RegExp(`\\bvar ${key}\\s*:`).test(swift);

describe('focus session surfaces (proposal 2.3)', () => {
  const activity = widget('FocusLiveActivity.swift');
  const bundle = widget('KaihumanWidgets.swift');

  it('declares the small family for the Watch Smart Stack, Mac menu bar and CarPlay', () => {
    expect(activity).toContain('@available(iOS 18.0, *)\nstruct FocusLiveActivityFamilies: Widget');
    expect(activity).toContain('.supplementalActivityFamilies([.small])');
    expect(activity).toContain('@Environment(\\.activityFamily)');
    expect(activity).toMatch(/case \.small: FocusSmallView\(/);
    // View-only surfaces: a button there would do nothing or be dropped.
    const from = activity.indexOf('struct FocusSmallView');
    expect(activity.slice(from, activity.indexOf('enum FocusStyle'))).not.toContain('Button(');
  });

  it('registers exactly one activity configuration per OS version', () => {
    expect(bundle).toMatch(
      /if #available\(iOS 18\.0, \*\) \{\s*FocusLiveActivityFamilies\(\)\s*\}\s*if #unavailable\(iOS 18\.0\) \{\s*FocusLiveActivity\(\)\s*\}/,
    );
    // Regression: WidgetBundleBuilder has no buildEither, so an else branch fails to compile.
    expect(bundle).not.toMatch(/\}\s*else\s*\{/);
    expect(activity.match(/ActivityConfiguration\(for:/g)).toHaveLength(2);
    // The island is built once and shared, so compact and minimal stay identical on both.
    expect(activity.match(/FocusActivityUI\.island\(context\)/g)).toHaveLength(2);
  });

  it('keeps compact and minimal to an icon and a short countdown for the landscape island', () => {
    const island = activity.slice(activity.indexOf('static func island'));
    const compact = island.slice(island.indexOf('compactLeading'), island.indexOf('.keylineTint'));
    expect(compact).toContain('FocusTimerText(state: context.state, size: 13)');
    expect(compact).not.toContain('todoText');
  });

  it('stops the session from a control, the Action button included', () => {
    const stop = widget('FocusStopIntent.swift');
    expect(stop).toContain('struct StopFocusIntent: LiveActivityIntent');
    expect(stop).toContain('for activity in Activity<FocusActivityAttributes>.activities');
    expect(stop).toContain('FocusTimerState.set(activityId: nil)');
    const control = widget('FocusStopControl.swift');
    expect(control).toContain('@available(iOS 18.0, *)\nstruct StopFocusControl: ControlWidget');
    expect(control).toContain('ControlWidgetButton(action: StopFocusIntent())');
    // Inside the first iOS 18 block, which ios-widget.test.ts keeps in step with the control list.
    expect(bundle.slice(bundle.indexOf('if #available(iOS 18.0, *)'))).toContain(
      'StopFocusControl()',
    );
  });

  it('compiles the intent into the app (it runs there) and the control into the extension only', () => {
    expect(SHARED_APP_SOURCES).toContain('FocusStopIntent.swift');
    expect(WIDGET_ONLY_SOURCES).toContain('FocusStopControl.swift');
    expect(WIDGET_ONLY_SOURCES).toContain('TodayDashboardWidget.swift');
    expect(SHARED_APP_SOURCES).toContain('FocusFilter.swift');
  });
});

describe('focus filters (proposal 2.5)', () => {
  const filter = widget('FocusFilter.swift');
  const models = widget('SharedTodoModels.swift');
  const sample: Required<WidgetFilter> = { tags: [], area: '', board: '', label: '' };

  it('mirrors the TS filter and uses the shared file name', () => {
    const struct = models.slice(models.indexOf('struct SharedFocusFilter'));
    for (const key of Object.keys(sample))
      expect(hasProperty(struct.slice(0, 200), key), key).toBe(true);
    expect(hasProperty(models, 'filter')).toBe(true);
    expect(filter).toContain(`focusFilterFile = "${FOCUS_FILTER_FILE}"`);
  });

  it('matches like matchesWidgetFilter: any tag, area from the file name, board by id or name', () => {
    expect(filter).toContain('caseInsensitiveCompare');
    expect(filter).toContain('wanted.contains(where:');
    expect(filter).toContain('".todos.md"');
    expect(filter).toMatch(/!same\(milestoneId, board\), !same\(milestoneName, board\)/);
  });

  it('applies to every widget and intent through nextUp', () => {
    expect(widget('SnapshotQueries.swift')).toMatch(/var nextUp[\s\S]*?matchesFocusFilter\(/);
  });

  it('clears the filter when the Focus ends and refreshes widgets at once', () => {
    expect(filter).toContain('filter.isEmpty ? nil : filter');
    expect(filter).toContain('Data("{}".utf8)');
    expect(filter).toContain('snapshot.filter = active');
    expect(filter).toContain('WidgetCenter.shared.reloadAllTimelines()');
  });

  it('is a SetFocusFilterIntent in the app target with tags, area and board', () => {
    const swift = intent('KaihumanFocusFilter.swift');
    expect(swift).toContain('struct KaihumanFocusFilter: SetFocusFilterIntent');
    for (const p of ['tags', 'area', 'board'])
      expect(swift).toMatch(new RegExp(`var ${p}: String\\?`));
    expect(swift).toContain('SharedTodoStore.shared.saveFocusFilter(');
    expect(swift).toContain('CharacterSet(charactersIn: "#")');
  });

  it('shows the extra-large Today dashboard only on iOS 27 and titles it with the filter', () => {
    const dash = widget('TodayDashboardWidget.swift');
    expect(dash).toContain('.supportedFamilies([.systemExtraLarge])');
    expect(dash).toContain('snapshot.filter');
    expect(dash).toContain('filter.title.uppercased()');
    expect(widget('KaihumanWidgets.swift')).toMatch(
      /if #available\(iOS 27\.0, \*\) \{\s*TodayDashboardWidget\(\)\s*\}/,
    );
  });
});

describe('digest intent for Shortcuts "Use Model"', () => {
  const swift = intent('SaveDigestIntent.swift');

  it('takes the previous action output as text and returns the repo path', () => {
    expect(swift).toContain('struct SaveDigestIntent: AppIntent');
    expect(swift).toContain('inputConnectionBehavior: .connectToPreviousIntentResult');
    expect(swift).toContain('ReturnsValue<String>');
    expect(swift).toContain('openAppWhenRun = false');
  });

  it('queues a digest mutation that the app writes to logs/digest-<date>.md', () => {
    expect(swift).toContain('queue(.digest(text: text, date: date, now: now))');
    expect(swift).toContain('"logs/digest-\\(date).md"');
    expect(widget('SharedTodoModels.swift')).toContain('PendingWidgetMutation(kind: "digest"');
  });

  it('does not take an App Shortcut slot (the system caps an app at 10)', () => {
    expect(intent('AppShortcuts.swift')).not.toContain('SaveDigestIntent');
  });
});
