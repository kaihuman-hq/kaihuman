import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WidgetTodoItem, WidgetTodoSnapshot } from '@kaihuman/core';
import { parseTodos } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import withKaihumanWidgets, {
  ANDROID_RECEIVER_NAME,
  ANDROID_WIDGETS,
  type AndroidManifest,
  APP_INTENTS_DIR,
  addComposeCompilerClasspath,
  addGlanceDependencies,
  addIosWidgetTarget,
  addSystemSurfacesToManifest,
  addWidgetReceiverToManifest,
  addWorkManagerKeepRules,
  applyComposePlugin,
  appSourceGroups,
  CAPTURE_KINDS,
  type CopyFs,
  copyAndroidWidgetSources,
  deriveIosIds,
  IOS_WIDGET_TARGET,
  iosWidgetTarget,
  kotlinVersionFromCatalog,
  type ModFn,
  resolveReactNativeKotlinVersion,
  SHARED_APP_SOURCES,
  WIDGET_ONLY_SOURCES,
  widgetBuildSettings,
  withIosAppGroup,
  withLiveActivities,
  withUrlScheme,
  type XcodeEditor,
  xcodeProjectEditor,
} from '../plugins/with-kaihuman-widgets.js';
import {
  PENDING_WIDGET_MUTATIONS_FILE,
  type PendingWidgetMutation,
  WIDGET_TODOS_FILE,
} from './adapters/widget-bridge.js';
import {
  planEventReminders,
  planMilestoneReminders,
  planReminders,
} from './notifications/milestone-reminders.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const kotlin = (f: string): string => read(`targets/android-widget/${f}`);
const KOTLIN_FILES = [
  'TodoGlanceWidget.kt',
  'TodoWidgetReceiver.kt',
  'ToggleTodoAction.kt',
  'WidgetSnapshot.kt',
  'SnapshotQueries.kt',
  'WidgetUi.kt',
  'WidgetConfigStore.kt',
  'TodoCommit.kt',
];
const kotlinAll = (): string => KOTLIN_FILES.map(kotlin).join('\n');

// ─── Config plugin ──────────────────────────────────────────────────────────

const emptyManifest = (): AndroidManifest => ({ manifest: { application: [{ $: {} }] } });

describe('config plugin transforms', () => {
  it('adds the app group entitlement idempotently, keeping other groups', () => {
    const once = withIosAppGroup({
      ios: { entitlements: { 'com.apple.security.application-groups': ['group.other'] } },
    });
    expect(once.ios?.entitlements?.['com.apple.security.application-groups']).toEqual([
      'group.other',
      'group.com.kaihuman.app',
    ]);
    expect(withIosAppGroup(once)).toEqual(once);
    expect(
      withIosAppGroup({}).ios?.entitlements?.['com.apple.security.application-groups'],
    ).toEqual(['group.com.kaihuman.app']);
  });

  it('declares Live Activity support in the app Info.plist, keeping other keys', () => {
    const once = withLiveActivities({ ios: { infoPlist: { UIBackgroundModes: ['fetch'] } } });
    expect(once.ios?.infoPlist).toEqual({
      UIBackgroundModes: ['fetch'],
      NSSupportsLiveActivities: true,
      KHAppGroup: 'group.com.kaihuman.app',
      KHKeychainService: 'com.kaihuman.app',
    });
    expect(withLiveActivities(once)).toEqual(once);
    expect(withLiveActivities({}).ios?.infoPlist).toMatchObject({ NSSupportsLiveActivities: true });
    expect(withLiveActivities({ ios: { bundleIdentifier: 'x' } }).ios?.bundleIdentifier).toBe('x');
    // The full plugin applies it too, next to the app group and scheme.
    expect(withKaihumanWidgets({}).ios?.infoPlist?.NSSupportsLiveActivities).toBe(true);
  });

  it('sets the kaihuman scheme without duplicating', () => {
    expect(withUrlScheme({}).scheme).toBe('kaihuman');
    expect(withUrlScheme({ scheme: 'kaihuman' }).scheme).toBe('kaihuman');
    expect(withUrlScheme({ scheme: 'other' }).scheme).toEqual(['other', 'kaihuman']);
    expect(withUrlScheme({ scheme: ['other', 'kaihuman'] }).scheme).toEqual(['other', 'kaihuman']);
  });

  it('adds every widget receiver to the manifest idempotently, keeping existing ones', () => {
    const existing = { $: { 'android:name': '.Other' } };
    const m: AndroidManifest = { manifest: { application: [{ $: {}, receiver: [existing] }] } };
    addWidgetReceiverToManifest(addWidgetReceiverToManifest(m));
    const receivers = m.manifest.application?.[0]?.receiver ?? [];
    expect(receivers).toHaveLength(ANDROID_WIDGETS.length + 1);
    expect(receivers[0]).toBe(existing);
    expect(receivers.find((r) => r.$?.['android:name'] === ANDROID_RECEIVER_NAME)).toEqual({
      $: { 'android:name': '.TodoWidgetReceiver', 'android:exported': 'false' },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.appwidget.provider',
            'android:resource': '@xml/todo_widget_info',
          },
        },
      ],
    });
    for (const { receiver, info } of ANDROID_WIDGETS) {
      const node = receivers.find((r) => r.$?.['android:name'] === receiver);
      expect(node?.$?.['android:exported'], receiver).toBe('false');
      expect(JSON.stringify(node), receiver).toContain(`@xml/${info}`);
    }
    expect(ANDROID_WIDGETS).toHaveLength(8);
  });

  it('adds the config activity, tiles, focus receiver, shortcuts and permission once', () => {
    const permission = { $: { 'android:name': 'android.permission.INTERNET' } };
    const main = { $: { 'android:name': '.MainActivity' }, 'meta-data': [{ $: { x: 'y' } }] };
    const m: AndroidManifest = {
      manifest: { 'uses-permission': [permission], application: [{ $: {}, activity: [main] }] },
    };
    addSystemSurfacesToManifest(addSystemSurfacesToManifest(m));
    const app = m.manifest.application?.[0];
    const named = (list: Array<{ $?: Record<string, string> }> | undefined, n: string) =>
      (list ?? []).filter((x) => x.$?.['android:name'] === n);

    expect(m.manifest['uses-permission']?.[0]).toBe(permission);
    expect(
      named(m.manifest['uses-permission'], 'android.permission.POST_NOTIFICATIONS'),
    ).toHaveLength(1);

    const config = named(app?.activity, '.WidgetConfigActivity');
    expect(config).toHaveLength(1);
    expect(config[0]).toEqual({
      $: {
        'android:name': '.WidgetConfigActivity',
        'android:exported': 'true',
        'android:theme': '@style/KhConfigTheme',
        'android:excludeFromRecents': 'true',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_CONFIGURE' } }] },
      ],
    });

    expect(app?.activity?.[0]).toBe(main);
    expect(main['meta-data']).toEqual([
      { $: { x: 'y' } },
      { $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/kh_shortcuts' } },
    ]);

    expect(app?.service).toHaveLength(4);
    expect(CAPTURE_KINDS).toEqual(['todo', 'note', 'log', 'idea']);
    for (const kind of CAPTURE_KINDS) {
      const name = `.${kind[0]?.toUpperCase()}${kind.slice(1)}CaptureTileService`;
      expect(named(app?.service, name)[0]).toEqual({
        $: {
          'android:name': name,
          'android:exported': 'true',
          'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
          'android:icon': `@drawable/kh_ic_${kind}`,
          'android:label': `@string/kh_tile_${kind}`,
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] },
        ],
      });
    }

    expect(named(app?.receiver, '.FocusActionReceiver')).toEqual([
      { $: { 'android:name': '.FocusActionReceiver', 'android:exported': 'false' } },
    ]);
  });

  it('has a provider xml in targets/android-widget/res/xml for every widget', () => {
    for (const { info } of ANDROID_WIDGETS) {
      expect(() => read(`targets/android-widget/res/xml/${info}.xml`), info).not.toThrow();
    }
  });

  it('describes the iOS widget extension target', () => {
    expect(IOS_WIDGET_TARGET).toMatchObject({
      name: 'KaihumanWidgets',
      bundleIdentifier: 'com.kaihuman.app.widgets',
      sourceDir: 'targets/ios-widget',
      deploymentTarget: '17.0',
    });
  });

  it('only adds the Xcode target when it is missing', () => {
    const calls: string[] = [];
    const appCalls: string[][] = [];
    let exists = false;
    const editor: XcodeEditor = {
      hasTarget: () => exists,
      addWidgetExtension: (_p, t, files) => {
        calls.push(`${t.name}:${files.join(',')}`);
        exists = true;
      },
      addAppSources: (_p, groups) => {
        appCalls.push(groups.flatMap((g) => g.files));
      },
    };
    addIosWidgetTarget({}, ['A.swift', 'SharedTodoStore.swift'], editor, IOS_WIDGET_TARGET, [
      'AppShortcuts.swift',
      'notes.md',
    ]);
    addIosWidgetTarget({}, ['A.swift', 'SharedTodoStore.swift'], editor);
    expect(calls).toEqual(['KaihumanWidgets:A.swift,SharedTodoStore.swift']);
    // The app sources are (re)applied every run so an upgraded project gains them.
    expect(appCalls).toEqual([
      ['SharedTodoStore.swift', 'AppShortcuts.swift'],
      ['SharedTodoStore.swift'],
    ]);
  });

  it('splits the widget Swift files between the extension only and the app too', () => {
    const swift = readdirSync(join(root, IOS_WIDGET_TARGET.sourceDir)).filter((f) =>
      f.endsWith('.swift'),
    );
    const claimed = [...SHARED_APP_SOURCES, ...WIDGET_ONLY_SOURCES];
    expect([...claimed].sort()).toEqual([...swift].sort());
    expect(new Set(claimed).size).toBe(claimed.length);
    // The app has its own @main and no business with views or controls.
    expect(SHARED_APP_SOURCES).not.toContain('KaihumanWidgets.swift');
    for (const file of SHARED_APP_SOURCES) {
      const source = readFileSync(join(root, IOS_WIDGET_TARGET.sourceDir, file), 'utf8');
      expect(source, file).not.toMatch(/import SwiftUI|@main|WidgetBundle/);
    }
    expect(appSourceGroups(IOS_WIDGET_TARGET, swift, ['AppShortcuts.swift'])).toEqual([
      {
        name: 'KaihumanWidgets',
        dir: 'targets/ios-widget',
        files: [...SHARED_APP_SOURCES].filter((f) => swift.includes(f)),
      },
      { name: 'KaihumanAppIntents', dir: 'targets/ios-app-intents', files: ['AppShortcuts.swift'] },
    ]);
  });

  it('wires the widget extension into a real Xcode project', () => {
    // `xcode` is the pbxproj library Expo hands to xcodeproj mods; no types ship with it.
    const xcode = createRequire(import.meta.url)('xcode') as {
      project(path: string): { parseSync(): { writeSync(): string } };
    };
    const project = xcode.project(join(root, 'src/fixtures/app.pbxproj')).parseSync();
    const files = readdirSync(join(root, IOS_WIDGET_TARGET.sourceDir));
    const intents = readdirSync(join(root, APP_INTENTS_DIR));
    const target = { ...IOS_WIDGET_TARGET, marketingVersion: '0.1.0', buildNumber: '7' };

    expect(xcodeProjectEditor.hasTarget(project, target.name)).toBe(false);
    addIosWidgetTarget(project, files, xcodeProjectEditor, target, intents);
    expect(xcodeProjectEditor.hasTarget(project, target.name)).toBe(true);
    addIosWidgetTarget(project, files, xcodeProjectEditor, target, intents);

    const out = project.writeSync();
    expect(out.match(/isa = PBXNativeTarget;/g)).toHaveLength(2);
    // Sources are referenced in place from the app root, one level above ios/.
    expect(out).toContain('path = "../targets/ios-widget";');
    expect(out).toContain('INFOPLIST_FILE = "../targets/ios-widget/Info.plist";');
    expect(out).toContain(
      'CODE_SIGN_ENTITLEMENTS = "../targets/ios-widget/KaihumanWidgets.entitlements";',
    );
    expect(out).toContain('IPHONEOS_DEPLOYMENT_TARGET = 17.0;');
    expect(out).toContain('MARKETING_VERSION = "0.1.0";');
    expect(out).toContain('CURRENT_PROJECT_VERSION = "7";');
    expect(out.match(/isa = PBXTargetDependency;/g)).toHaveLength(1);

    const swift = files.filter((f) => f.endsWith('.swift'));
    const sources = out.match(/\/\* "?[\w.]+\.swift"? in Sources \*\/,/g) ?? [];
    const appSwift = intents.filter((f) => f.endsWith('.swift'));
    // Extension: every widget file. App: the shared ones plus the App Shortcuts, each exactly once.
    expect(sources).toHaveLength(swift.length + SHARED_APP_SOURCES.length + appSwift.length);
    expect(out).toContain('path = "../targets/ios-app-intents";');
    const appSources = out.slice(
      out.indexOf('/* Sources */ = {'),
      out.indexOf('/* End PBXSourcesBuildPhase'),
    );
    const inApp = appSources.match(/\/\* [\w]+\.swift in Sources \*\/,/g) ?? [];
    expect(inApp).toHaveLength(SHARED_APP_SOURCES.length + appSwift.length);
    expect(appSources).toContain('AppShortcuts.swift in Sources');
    expect(appSources).not.toContain('KaihumanWidgets.swift in Sources');

    // The embed phase sits right after Resources, ahead of the React Native bundling script.
    const appPhases = out.slice(out.indexOf('/* app */ = {'));
    const order = ['/* Resources */,', '/* Copy Files */,', '/* Bundle React Native'];
    const positions = order.map((marker) => appPhases.indexOf(marker));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('composes with existing mods and applies the transforms through them', async () => {
    const order: string[] = [];
    const existing: ModFn = async (cfg) => {
      order.push('existing');
      return cfg;
    };
    const config = withKaihumanWidgets({
      scheme: 'kaihuman',
      android: { package: 'com.kaihuman.app' },
      mods: { android: { manifest: existing } },
    });

    expect(config.ios?.entitlements?.['com.apple.security.application-groups']).toContain(
      'group.com.kaihuman.app',
    );
    const manifestMod = config.mods?.android?.manifest as ModFn;
    const out = await manifestMod({ modResults: emptyManifest() });
    expect(order).toEqual(['existing']);
    expect((out.modResults as AndroidManifest).manifest.application?.[0]?.receiver).toHaveLength(
      ANDROID_WIDGETS.length + 1,
    );

    const added: string[] = [];
    const fakeXcode: XcodeEditor = {
      hasTarget: () => false,
      addWidgetExtension: (_p, t) => added.push(t.name),
      addAppSources: (_p, groups) => added.push(...groups.map((g) => g.name)),
    };
    const faked = withKaihumanWidgets({}, { xcode: fakeXcode });
    await (faked.mods?.ios?.xcodeproj as ModFn)({ modResults: {} });
    expect(added).toEqual(['KaihumanWidgets']);
  });

  it('enables the Compose compiler at the Kotlin version React Native uses', () => {
    const rootGradle = [
      'buildscript {',
      '  dependencies {',
      "    def kotlinVersion = findProperty('android.kotlinVersion')",
      '    classpath(kotlinVersion ? "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlinVersion" : \'org.jetbrains.kotlin:kotlin-gradle-plugin\')',
      '  }',
      '}',
    ].join('\n');
    const patched = addComposeCompilerClasspath(rootGradle, '2.2.0');
    expect(patched).toContain(
      `    classpath("org.jetbrains.kotlin:compose-compiler-gradle-plugin:\${kotlinVersion ?: '2.2.0'}")`,
    );
    expect(addComposeCompilerClasspath(patched, '2.2.0')).toBe(patched);

    const app =
      'apply plugin: "com.android.application"\napply plugin: "org.jetbrains.kotlin.android"\n';
    const withCompose = applyComposePlugin(app);
    expect(withCompose).toContain(
      'apply plugin: "org.jetbrains.kotlin.android"\napply plugin: "org.jetbrains.kotlin.plugin.compose"',
    );
    expect(applyComposePlugin(withCompose)).toBe(withCompose);

    expect(kotlinVersionFromCatalog('[versions]\nkotlin = "2.2.0"\nkotlinx = "1"\n')).toBe('2.2.0');
  });

  it("keeps WorkManager's Room database out of R8, once (release launch crash)", () => {
    const once = addWorkManagerKeepRules('# Add project specific ProGuard rules here.\n');
    expect(once).toContain('-keep class * extends androidx.room.RoomDatabase');
    expect(once).toContain('-keep class androidx.work.impl.WorkDatabase_Impl { *; }');
    expect(addWorkManagerKeepRules(once)).toBe(once);
    expect(addWorkManagerKeepRules('')).toContain('WorkDatabase_Impl');
  });

  it('reads the Kotlin version from the installed React Native', () => {
    expect(resolveReactNativeKotlinVersion(root)).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('adds Glance, test dependencies and testOptions to app/build.gradle idempotently', async () => {
    const gradle =
      'android {\n    compileSdk 35\n}\n\ndependencies {\n    implementation "x:y:1"\n}\n';
    const once = addGlanceDependencies(gradle);
    expect(once).toContain(
      'dependencies {\n    implementation "androidx.glance:glance-appwidget:1.1.1"',
    );
    for (const dep of [
      'implementation "androidx.glance:glance-material3:1.1.1"',
      'implementation "androidx.compose.material3:material3:1.3.1"',
      'testImplementation "junit:junit:4.13.2"',
      'testImplementation "org.json:json:20240303"',
      'testImplementation "org.robolectric:robolectric:4.14.1"',
      'testImplementation "androidx.test:core:1.6.1"',
    ]) {
      expect(once).toContain(dep);
    }
    expect(once).toMatch(
      /android \{\n {4}testOptions \{\n {8}unitTests \{\n {12}includeAndroidResources = true/,
    );
    expect(once).toContain('implementation "x:y:1"');
    expect(addGlanceDependencies(once)).toBe(once);
    // A project that already has the v1 Glance line gains only what is missing.
    const upgraded = addGlanceDependencies(
      gradle.replace(
        'dependencies {',
        'dependencies {\n    implementation "androidx.glance:glance-appwidget:1.1.1"',
      ),
    );
    expect(upgraded.match(/glance-appwidget:1\.1\.1/g)).toHaveLength(1);
    expect(upgraded).toContain('glance-material3:1.1.1');

    let previous = false;
    const config = withKaihumanWidgets({
      mods: {
        android: {
          appBuildGradle: async (cfg) => {
            previous = true;
            return cfg;
          },
        },
      },
    });
    const out = await (config.mods?.android?.appBuildGradle as ModFn)({
      modResults: { contents: gradle },
    });
    expect(previous).toBe(true);
    expect((out.modResults as { contents: string }).contents).toContain('glance-appwidget:1.1.1');
  });

  it('keeps Kotlin package lines aligned with the Android package', () => {
    for (const f of KOTLIN_FILES) {
      expect(kotlin(f)).toMatch(/^package com\.kaihuman\.app$/m);
    }
  });

  it('copies Kotlin sources, JVM tests and res into the generated project via an injected fs', () => {
    const ops: string[] = [];
    const fs: CopyFs = {
      exists: () => true,
      mkdir: (p) => ops.push(`mkdir ${p}`),
      copy: (a, b) => ops.push(`cp ${a} ${b}`),
      list: (p) =>
        p.endsWith('/test') ? ['ATest.kt', 'data.json'] : ['A.kt', 'res', 'test', 'notes.txt'],
    };
    const copied = copyAndroidWidgetSources('/p', '/p/android', 'com.kaihuman.app', fs);
    expect(copied).toEqual([
      '/p/android/app/src/main/java/com/kaihuman/app/A.kt',
      '/p/android/app/src/test/java/com/kaihuman/app/ATest.kt',
      '/p/android/app/src/main/res',
    ]);
    expect(ops).toContain(
      'cp /p/targets/android-widget/test/ATest.kt /p/android/app/src/test/java/com/kaihuman/app/ATest.kt',
    );

    const noTests: CopyFs = { ...fs, exists: (p) => !p.endsWith('/test') };
    expect(copyAndroidWidgetSources('/p', '/p/android', 'com.kaihuman.app', noTests)).toEqual([
      '/p/android/app/src/main/java/com/kaihuman/app/A.kt',
      '/p/android/app/src/main/res',
    ]);
  });
});

// ─── Kotlin / TS parity ─────────────────────────────────────────────────────

// Android only reads the v1 keys; v2 keys are preserved verbatim in its raw copy.
type V1Counts = Pick<
  WidgetTodoSnapshot['counts'],
  'inbox' | 'inProgress' | 'backlog' | 'doneToday'
>;
const fullItem: Required<Omit<WidgetTodoItem, 'priority' | 'pending'>> = {
  id: 'a#0',
  filePath: '.kh/inbox.todos.md',
  indexInFile: 0,
  text: 't',
  status: 'backlog',
  tags: [],
  milestoneId: 'm',
  milestoneName: 'M',
  milestoneDueDate: '2026-01-01',
  dueDate: '2026-01-02',
  dueTime: '09:00',
  updatedAt: 1,
};
const fullSnapshot: Required<
  Omit<
    WidgetTodoSnapshot,
    | 'schemaVersion'
    | 'stats'
    | 'milestones'
    | 'tags'
    | 'privacy'
    | 'timeZone'
    | 'counts'
    | 'items'
    | 'ideas'
    | 'cards'
    | 'habits'
  >
> & { counts: V1Counts; items: (typeof fullItem)[] } = {
  updatedAt: 1,
  repoFullName: 'o/r',
  branch: 'main',
  appFolder: '.kh',
  upcomingMilestone: { id: 'm', name: 'M', dueDate: '2026-01-01' },
  counts: { inbox: 0, inProgress: 0, backlog: 0, doneToday: 0 },
  items: [fullItem],
  files: { p: { sha: 's', content: 'c' } },
};
const snapshotKeys = [
  ...Object.keys(fullSnapshot),
  ...Object.keys(fullItem),
  ...Object.keys(fullSnapshot.upcomingMilestone),
  ...Object.keys(fullSnapshot.counts),
  ...Object.keys(fullSnapshot.files.p ?? {}),
];

describe('Kotlin widget sources', () => {
  it('uses every WidgetTodoSnapshot JSON key', () => {
    const src = kotlinAll();
    for (const key of new Set(snapshotKeys)) expect(src, key).toContain(`"${key}"`);
  });

  it('knows every todo status value', () => {
    for (const status of ['backlog', 'in-progress', 'done', 'rejected']) {
      expect(kotlinAll()).toContain(`"${status}"`);
    }
  });

  it('uses the shared preference and file names from widget-bridge.ts', () => {
    const src = kotlin('WidgetSnapshot.kt');
    expect(src).toContain('"kaihuman_widget"');
    expect(src).toContain(`"${WIDGET_TODOS_FILE}"`);
    expect(src).toContain(`"${PENDING_WIDGET_MUTATIONS_FILE}"`);
  });

  it('queues PendingWidgetMutation records', () => {
    const sample: PendingWidgetMutation = { itemId: 'x', timestamp: 1 };
    for (const key of Object.keys(sample)) expect(kotlin('TodoCommit.kt')).toContain(`"${key}"`);
  });

  it('pushes to the GitHub contents API with sha and branch', () => {
    const src = kotlin('TodoCommit.kt');
    expect(src).toMatch(
      /https:\/\/api\.github\.com\/repos\/\$\{snapshot\.repoFullName\}\/contents\/\$path/,
    );
    expect(src).toContain('"PUT"');
    for (const key of ['message', 'content', 'sha', 'branch']) expect(src).toContain(`"${key}"`);
    expect(src).toContain('Dispatchers.IO');
    expect(src).toContain('updateAllWidgets(context)');
  });

  it('serializes the updated marker like formats does', () => {
    const src = kotlin('TodoCommit.kt');
    expect(src).toContain('::updated:: $nowMs');
    expect(src).toContain('"[$to]"');
    expect(src).toContain('"x"');
    // Same layout the Kotlin edit targets: marker line, then meta line.
    const md = '- [ ] a #t\n::updated:: 1\n';
    expect(parseTodos(md).items[0]?.updatedAt).toBe(1);
  });

  it('gives every Next up check at least a 48 dp touch target', () => {
    const src = kotlin('TodoGlanceWidget.kt');
    expect(src).toContain('checkWidth: androidx.compose.ui.unit.Dp = 48.dp');
    for (const m of src.matchAll(/checkWidth = (\d+)\.dp/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(48);
    }
  });

  it('renders the Next up widget on the shared theme, not the old Nexus colours', () => {
    const src = kotlin('TodoGlanceWidget.kt');
    expect(src).toContain('DeepLinks.quick("todo")');
    expect(src).toContain('actionRunCallback<ToggleTodoAction>');
    expect(src).toContain('KhTheme');
    for (const s of ['0xFF0A0A0F', '0xFF00FF00', 'KAIHUMAN // TODOS']) {
      expect(kotlinAll()).not.toContain(s);
    }
    expect(kotlin('WidgetUi.kt')).toContain('0xFFE6FF4A'); // Volt
    expect(kotlin('WidgetUi.kt')).not.toContain('0xFF4F5E00'); // no olive tint in the light theme
  });

  it('queues move mutations like PendingWidgetMutation', () => {
    const sample: PendingWidgetMutation = {
      kind: 'move',
      itemId: 'x',
      status: 'in-progress',
      timestamp: 1,
    };
    for (const key of Object.keys(sample)) expect(kotlin('TodoCommit.kt')).toContain(`"${key}"`);
    expect(kotlin('TodoCommit.kt')).toContain('"toggle"');
    expect(kotlin('TodoCommit.kt')).toContain('"move"');
    expect(kotlin('ToggleTodoAction.kt')).toContain('class StartTodoAction');
  });

  it('wires the receiver and widget info xml', () => {
    expect(kotlin('TodoWidgetReceiver.kt')).toContain('GlanceAppWidgetReceiver');
    expect(kotlin('TodoWidgetReceiver.kt')).toContain('TodoGlanceWidget()');
    const xml = read('targets/android-widget/res/xml/todo_widget_info.xml');
    expect(xml).toContain('<appwidget-provider');
    expect(xml).toContain('android:widgetCategory="home_screen|keyguard"');
  });

  it('app.json registers the plugin and scheme', () => {
    const app = JSON.parse(read('app.json')) as { expo: { plugins: string[]; scheme: string } };
    expect(app.expo.scheme).toBe('kaihuman');
    expect(app.expo.plugins).toContain('./plugins/with-kaihuman-widgets.ts');
  });
});

// ─── Reminders ──────────────────────────────────────────────────────────────

const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();
const now = new Date(2026, 10, 5, 12, 0); // 2026-11-05 12:00 local

const todos = `---
milestones:
  - id: v1
    name: Version 1
    dueDate: 2026-11-07
  - id: old
    name: Old One
    dueDate: 2026-11-01
  - id: finished
    name: Finished
    dueDate: 2026-11-02
  - id: tomorrow
    name: Tomorrow
    dueDate: 2026-11-06
---

- [>] ship it !v1
- [ ] late !old
- [x] done thing !finished
- [ ] soon !tomorrow
`;

describe('milestone reminders', () => {
  it('schedules eve and due-day reminders at 09:00 local, skipping past ones', () => {
    const r = planMilestoneReminders(parseTodos(todos), now);
    const byId = new Map(r.map((x) => [x.id, x]));
    expect(byId.get('milestone:v1:eve')?.fireAt).toBe(at(2026, 11, 6, 9));
    expect(byId.get('milestone:v1:due')?.fireAt).toBe(at(2026, 11, 7, 9));
    // Eve of "tomorrow" is today 09:00, already past.
    expect(byId.has('milestone:tomorrow:eve')).toBe(false);
    expect(byId.get('milestone:tomorrow:due')?.fireAt).toBe(at(2026, 11, 6, 9));
  });

  it('fires overdue milestones immediately and ignores finished ones', () => {
    const r = planMilestoneReminders(parseTodos(todos), now);
    expect(r.find((x) => x.id === 'milestone:old:overdue')?.fireAt).toBe(now.getTime());
    expect(r.some((x) => x.id.startsWith('milestone:finished'))).toBe(false);
  });

  it('honors milestoneHour', () => {
    const r = planMilestoneReminders(parseTodos(todos), now, { milestoneHour: 8 });
    expect(r.find((x) => x.id === 'milestone:v1:due')?.fireAt).toBe(at(2026, 11, 7, 8));
  });
});

const csv = `name;type;start iso date;end iso date
Dentist;general;2026-11-06;2026-11-06
Past trip;general;2026-10-01;2026-10-03
Mum;birthday;1960-11-05;1960-11-05
Anna;birthday;1990-12-24;1990-12-24
Bad;general;nope;nope
`;

describe('event reminders', () => {
  it('fires N minutes before the assumed 09:00 start', () => {
    const r = planEventReminders(csv, now);
    expect(r.find((x) => x.title === 'Dentist')?.fireAt).toBe(at(2026, 11, 6, 8));
    const custom = planEventReminders(csv, now, { eventLeadMinutes: 30 });
    expect(custom.find((x) => x.title === 'Dentist')?.fireAt).toBe(at(2026, 11, 6, 8, 30));
  });

  it('skips past-only and malformed events, rolls birthdays forward', () => {
    const r = planEventReminders(csv, now);
    expect(r.some((x) => x.title === 'Past trip' || x.title === 'Bad')).toBe(false);
    // 09:00 today already passed, so Mum's next birthday is next year.
    expect(r.find((x) => x.title === 'Mum')?.id).toBe('event:birthday:Mum:2027-11-05');
    expect(r.find((x) => x.title === 'Anna')?.fireAt).toBe(at(2026, 12, 24, 8));
  });

  it('clamps a reminder whose lead time already passed to now', () => {
    const early = new Date(2026, 10, 6, 8, 30);
    const r = planEventReminders(csv, early);
    expect(r.find((x) => x.title === 'Dentist')?.fireAt).toBe(early.getTime());
  });
});

describe('planReminders', () => {
  it('merges, dedupes by id and sorts deterministically', () => {
    const a = planReminders({ todos: [todos, todos], events: csv }, now);
    const b = planReminders({ events: csv, todos: [todos] }, now);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    const times = a.map((x) => x.fireAt);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(a[0]?.kind).toBe('milestone-overdue');
  });

  it('returns nothing for empty sources', () => {
    expect(planReminders({}, now)).toEqual([]);
  });
});

// ─── kaihuman-shared native module ───────────────────────────────────────────

describe('kaihuman-shared native module', () => {
  const moduleDir = 'modules/kaihuman-shared';
  const config = JSON.parse(read(`${moduleDir}/expo-module.config.json`)) as {
    apple: { modules: string[] };
    android: { modules: string[] };
  };
  const declared = [...read(`${moduleDir}/index.ts`).matchAll(/^\s+(\w+)\(.*\):/gm)].map(
    (m) => m[1],
  );
  const swift = read(`${moduleDir}/ios/KaihumanSharedModule.swift`);
  const kotlinClass = config.android.modules[0] ?? '';
  const kotlinSource = read(
    `${moduleDir}/android/src/main/java/${kotlinClass.replaceAll('.', '/')}.kt`,
  );

  it('ships the native sources autolinking expects', () => {
    expect(config.apple.modules).toEqual(['KaihumanSharedModule']);
    expect(swift).toContain('public class KaihumanSharedModule: Module');
    expect(read(`${moduleDir}/ios/KaihumanShared.podspec`)).toContain(
      "s.name           = 'KaihumanShared'",
    );
    expect(kotlinSource).toContain('class KaihumanSharedModule : Module()');
    expect(read(`${moduleDir}/android/build.gradle`)).toContain('namespace "com.kaihuman.shared"');
  });

  it('implements every function the JS interface declares on both platforms', () => {
    expect(declared).toEqual([
      'readSharedFile',
      'writeSharedFile',
      'reloadWidgets',
      'setSharedToken',
      'consumePendingUrl',
    ]);
    for (const name of declared) {
      expect(swift).toContain(`Function("${name}")`);
      expect(kotlinSource).toContain(`Function("${name}")`);
    }
    expect(swift).toContain('Name("KaihumanShared")');
    expect(kotlinSource).toContain('Name("KaihumanShared")');
  });

  it('declares the Focus Live Activity functions on iOS', () => {
    for (const name of ['startFocusActivity', 'updateFocusActivity', 'endFocusActivity']) {
      expect(read(`${moduleDir}/index.ts`)).toContain(name);
      expect(swift).toContain(`Function("${name}")`);
    }
  });

  it('uses the keys the widget targets read', () => {
    for (const key of ['"group.com.kaihuman.app"', '"github-token"', '"pending-url"']) {
      expect(swift).toContain(key);
    }
    for (const key of ['"kaihuman_widget"', '"github-token"', '"pending-url"']) {
      expect(kotlinSource).toContain(key);
    }
    expect(kotlinSource).toContain(`"${ANDROID_RECEIVER_NAME}"`);
  });

  it('refreshes exactly the receivers in ANDROID_WIDGETS', () => {
    const list = /WIDGET_RECEIVER_CLASSES = listOf\(([^)]*)\)/.exec(kotlinSource)?.[1] ?? '';
    const names = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(ANDROID_WIDGETS.map((w) => w.receiver));
  });
});

describe('widget extension Info.plist', () => {
  it('names its executable, or the simulator rejects the installed app', () => {
    const plist = readFileSync(
      new URL('../targets/ios-widget/Info.plist', import.meta.url),
      'utf8',
    );
    expect(plist).toContain('<key>CFBundleExecutable</key>');
  });
});

describe('Android system surfaces', () => {
  const kinds = ['todo', 'note', 'log', 'idea'] as const;
  const moduleKt = read(
    'modules/kaihuman-shared/android/src/main/java/com/kaihuman/shared/KaihumanSharedModule.kt',
  );

  it('declares an abstract capture tile with one subclass per kind', () => {
    const tile = kotlin('CaptureTileService.kt');
    expect(tile).toContain('abstract class CaptureTileService : TileService()');
    for (const kind of kinds) {
      const name = `${kind[0]?.toUpperCase()}${kind.slice(1)}CaptureTileService`;
      expect(tile).toContain(`class ${name} : CaptureTileService()`);
      expect(tile).toContain(`override val kind = "${kind}"`);
      expect(read(`targets/android-widget/res/drawable/kh_ic_${kind}.xml`)).toContain('<vector');
    }
  });

  it('has a static shortcut that opens each quick-capture link', () => {
    const xml = read('targets/android-widget/res/xml/kh_shortcuts.xml');
    for (const kind of kinds) {
      expect(xml).toContain(`android:shortcutId="add_${kind}"`);
      expect(xml).toContain(`android:data="kaihuman://quick-${kind}"`);
    }
    expect(xml.match(/android:targetClass="com\.kaihuman\.app\.MainActivity"/g)).toHaveLength(4);
  });

  it('implements the three focus functions in the Android module', () => {
    for (const name of ['startFocusActivity', 'updateFocusActivity', 'endFocusActivity']) {
      expect(moduleKt).toContain(`Function("${name}")`);
    }
    // Android 13+ drops the focus notification unless the user granted POST_NOTIFICATIONS.
    expect(moduleKt).toContain('AsyncFunction("requestNotificationPermission")');
    expect(moduleKt).toContain('askForPermissions');
    expect(read('modules/kaihuman-shared/index.ts')).toContain('requestNotificationPermission');
    expect(read('modules/kaihuman-shared/ios/KaihumanSharedModule.swift')).toContain(
      'AsyncFunction("requestNotificationPermission")',
    );
    expect(moduleKt).toContain('.FocusActionReceiver');
  });
});

describe('iOS ids derive from the bundle id', () => {
  it('derives widget id, app group and keychain service', () => {
    expect(deriveIosIds()).toEqual({
      bundleId: 'com.kaihuman.app',
      widgetBundleId: 'com.kaihuman.app.widgets',
      appGroup: 'group.com.kaihuman.app',
    });
    expect(iosWidgetTarget('org.acme.kh')).toMatchObject({
      bundleIdentifier: 'org.acme.kh.widgets',
      appGroup: 'group.org.acme.kh',
      appBundleId: 'org.acme.kh',
    });
  });

  it('feeds a custom bundle id into entitlements, Info.plist and build settings', () => {
    const config = withLiveActivities(
      withIosAppGroup({ ios: { bundleIdentifier: 'org.acme.kh' } }),
    );
    expect(config.ios?.entitlements?.['com.apple.security.application-groups']).toEqual([
      'group.org.acme.kh',
    ]);
    expect(config.ios?.infoPlist).toMatchObject({
      NSSupportsLiveActivities: true,
      KHAppGroup: 'group.org.acme.kh',
      KHKeychainService: 'org.acme.kh',
    });
    expect(widgetBuildSettings(iosWidgetTarget('org.acme.kh'))).toMatchObject({
      PRODUCT_BUNDLE_IDENTIFIER: '"org.acme.kh.widgets"',
      KH_APP_GROUP: '"group.org.acme.kh"',
      KH_APP_BUNDLE_ID: '"org.acme.kh"',
    });
  });

  it('keeps the extension files free of hard-coded ids', () => {
    const dir = join(root, 'targets/ios-widget');
    expect(readFileSync(join(dir, 'KaihumanWidgets.entitlements'), 'utf8')).toContain(
      '$(KH_APP_GROUP)',
    );
    expect(readFileSync(join(dir, 'Info.plist'), 'utf8')).toContain('$(KH_APP_BUNDLE_ID)');
  });
});

describe('app.config', () => {
  it('declares the widget as an EAS app extension matching the plugin target', async () => {
    const { default: appConfig } = await import('../app.config.ts');
    const base = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
    const out = appConfig({ config: base } as never);
    type Ext = {
      targetName: string;
      bundleIdentifier: string;
      entitlements: Record<string, string[]>;
    };
    const eas = out.extra?.eas as { build: { experimental: { ios: { appExtensions: Ext[] } } } };
    const [ext] = eas.build.experimental.ios.appExtensions as [Ext];
    expect(ext.targetName).toBe(IOS_WIDGET_TARGET.name);
    expect(ext.bundleIdentifier).toBe(IOS_WIDGET_TARGET.bundleIdentifier);
    expect(ext.entitlements['com.apple.security.application-groups']).toEqual([
      IOS_WIDGET_TARGET.appGroup,
    ]);
    // The main app must carry the same group, or the widgets cannot read its data.
    expect(
      withIosAppGroup(base).ios?.entitlements?.['com.apple.security.application-groups'],
    ).toContain(IOS_WIDGET_TARGET.appGroup);
  });
});
