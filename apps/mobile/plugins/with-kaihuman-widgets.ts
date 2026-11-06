import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Local, minimal stand-ins for the `@expo/config-plugins` types. The plugin is dependency-free on
 * purpose: Expo hands us a plain config object whose `mods` chain we extend ourselves.
 */
export interface XmlNode {
  $?: Record<string, string>;
  [child: string]: unknown;
}

export interface AndroidManifest {
  manifest: { application?: Array<XmlNode & { receiver?: XmlNode[] }> };
}

export interface ModConfig<Results = unknown> {
  modResults: Results;
  modRequest?: { projectRoot?: string; platformProjectRoot?: string };
  [key: string]: unknown;
}

export type ModFn = (config: ModConfig) => Promise<ModConfig>;

export interface ExpoConfigLike {
  scheme?: string | string[];
  ios?: {
    bundleIdentifier?: string;
    entitlements?: Record<string, unknown>;
    [key: string]: unknown;
  };
  android?: { package?: string; [key: string]: unknown };
  mods?: Record<string, Record<string, ModFn | undefined> | undefined>;
  plugins?: unknown[];
  [key: string]: unknown;
}

export const APP_GROUP = 'group.com.kaihuman.app';
export const URL_SCHEME = 'kaihuman';
export const APP_GROUP_ENTITLEMENT = 'com.apple.security.application-groups';
export const ANDROID_RECEIVER_NAME = '.TodoWidgetReceiver';
export const ANDROID_WIDGET_INFO = '@xml/todo_widget_info';
const APPWIDGET_UPDATE = 'android.appwidget.action.APPWIDGET_UPDATE';
const APPWIDGET_PROVIDER = 'android.appwidget.provider';

export interface WidgetTargetDescriptor {
  name: string;
  bundleIdentifier: string;
  /** Relative to the mobile app root. */
  sourceDir: string;
  deploymentTarget: string;
  appGroup: string;
  /** The app's version and build number; an extension must match its containing app. */
  marketingVersion?: string;
  buildNumber?: string;
}

export const IOS_WIDGET_TARGET: WidgetTargetDescriptor = {
  name: 'KaihumanWidgets',
  bundleIdentifier: 'com.kaihuman.app.widgets',
  sourceDir: 'targets/ios-widget',
  deploymentTarget: '17.0',
  appGroup: APP_GROUP,
};

// ─── Pure config transforms ──────────────────────────────────────────────────

export const withIosAppGroup = (config: ExpoConfigLike): ExpoConfigLike => {
  const entitlements = { ...config.ios?.entitlements };
  const existing = entitlements[APP_GROUP_ENTITLEMENT];
  const groups = Array.isArray(existing) ? (existing as string[]) : [];
  entitlements[APP_GROUP_ENTITLEMENT] = groups.includes(APP_GROUP)
    ? groups
    : [...groups, APP_GROUP];
  return { ...config, ios: { ...config.ios, entitlements } };
};

export const withUrlScheme = (config: ExpoConfigLike): ExpoConfigLike => {
  const current = config.scheme;
  if (current === undefined) return { ...config, scheme: URL_SCHEME };
  const list = Array.isArray(current) ? current : [current];
  return list.includes(URL_SCHEME) ? config : { ...config, scheme: [...list, URL_SCHEME] };
};

const nameOf = (node: XmlNode): string | undefined => node.$?.['android:name'];

/** Adds the Glance receiver to the xml2js-shaped manifest Expo uses. Mutates and returns it. */
export const addWidgetReceiverToManifest = (manifest: AndroidManifest): AndroidManifest => {
  const application = manifest.manifest.application?.[0];
  if (!application) return manifest;
  const receivers = application.receiver ?? [];
  if (!receivers.some((r) => nameOf(r) === ANDROID_RECEIVER_NAME)) {
    receivers.push({
      $: { 'android:name': ANDROID_RECEIVER_NAME, 'android:exported': 'false' },
      'intent-filter': [{ action: [{ $: { 'android:name': APPWIDGET_UPDATE } }] }],
      'meta-data': [
        { $: { 'android:name': APPWIDGET_PROVIDER, 'android:resource': ANDROID_WIDGET_INFO } },
      ],
    });
  }
  application.receiver = receivers;
  return manifest;
};

export const GLANCE_DEPENDENCY = 'androidx.glance:glance-appwidget:1.1.1';

/** Inserts the Glance dependency into the `dependencies {` block of app/build.gradle. */
export const addGlanceDependencies = (buildGradle: string): string => {
  if (buildGradle.includes(GLANCE_DEPENDENCY)) return buildGradle;
  return buildGradle.replace(
    /^dependencies\s*\{/m,
    (open) => `${open}\n    implementation "${GLANCE_DEPENDENCY}"`,
  );
};

// Glance pulls in WorkManager, which creates its Room database reflectively. R8 in release builds
// renames/removes `WorkDatabase_Impl`, and the app then dies in InitializationProvider on launch
// ("Failed to create an instance of androidx.work.impl.WorkDatabase").
export const WORK_KEEP_RULES = [
  '-keep class * extends androidx.room.RoomDatabase',
  '-keep class androidx.work.impl.WorkDatabase_Impl { *; }',
].join('\n');

/** Appends the WorkManager keep rules to proguard-rules.pro, once. */
export const addWorkManagerKeepRules = (rules: string): string =>
  rules.includes(WORK_KEEP_RULES)
    ? rules
    : `${rules}${rules === '' || rules.endsWith('\n') ? '' : '\n'}\n# kaihuman widgets\n${WORK_KEEP_RULES}\n`;

// Glance widgets are Compose code, so the app module needs the Compose compiler, whose version
// must equal the Kotlin Gradle plugin's. React Native's version catalog pins that version.
export const COMPOSE_PLUGIN_ID = 'org.jetbrains.kotlin.plugin.compose';
const COMPOSE_ARTIFACT = 'org.jetbrains.kotlin:compose-compiler-gradle-plugin';
const KOTLIN_ANDROID_APPLY = 'apply plugin: "org.jetbrains.kotlin.android"';

export const kotlinVersionFromCatalog = (toml: string): string | undefined =>
  /^kotlin\s*=\s*"([^"]+)"/m.exec(toml)?.[1];

/** Adds the Compose compiler plugin next to the Kotlin plugin in the root build.gradle. */
export const addComposeCompilerClasspath = (rootGradle: string, kotlinVersion: string): string => {
  if (rootGradle.includes(COMPOSE_ARTIFACT)) return rootGradle;
  const kotlinClasspath = /^(\s*)classpath\(.*org\.jetbrains\.kotlin:kotlin-gradle-plugin.*\)\s*$/m;
  // The root script reads `android.kotlinVersion` into `kotlinVersion`; honour it when set.
  return rootGradle.replace(
    kotlinClasspath,
    (line, indent: string) =>
      `${line}\n${indent}classpath("${COMPOSE_ARTIFACT}:\${kotlinVersion ?: '${kotlinVersion}'}")`,
  );
};

export const applyComposePlugin = (appGradle: string): string => {
  if (appGradle.includes(COMPOSE_PLUGIN_ID)) return appGradle;
  return appGradle.replace(
    KOTLIN_ANDROID_APPLY,
    `${KOTLIN_ANDROID_APPLY}\napply plugin: "${COMPOSE_PLUGIN_ID}"`,
  );
};

/** Reads the Kotlin version React Native's Gradle plugin builds with, resolved from the app. */
export const resolveReactNativeKotlinVersion = (projectRoot: string): string | undefined => {
  const fromApp = createRequire(join(projectRoot, 'package.json'));
  const reactNative = fromApp.resolve('react-native/package.json');
  const gradlePlugin = createRequire(reactNative).resolve(
    '@react-native/gradle-plugin/package.json',
  );
  for (const catalog of [
    join(dirname(gradlePlugin), 'gradle/libs.versions.toml'),
    join(dirname(reactNative), 'gradle/libs.versions.toml'),
  ]) {
    const version = existsSync(catalog)
      ? kotlinVersionFromCatalog(readFileSync(catalog, 'utf8'))
      : undefined;
    if (version) return version;
  }
  return undefined;
};

// ─── Mod chain ───────────────────────────────────────────────────────────────

/**
 * Registers `mutate` on `config.mods[platform][mod]`, composing with any mod already there the
 * way Expo's own `withMod` does: ours runs first, then the previous one sees our result.
 */
export const composeMod = <R>(
  config: ExpoConfigLike,
  platform: string,
  mod: string,
  mutate: (config: ModConfig<R>) => ModConfig<R> | Promise<ModConfig<R>>,
): ExpoConfigLike => {
  const previous = config.mods?.[platform]?.[mod];
  const composed: ModFn = async (cfg) => {
    const next = await mutate(cfg as ModConfig<R>);
    return previous ? previous(next) : next;
  };
  return {
    ...config,
    mods: { ...config.mods, [platform]: { ...config.mods?.[platform], [mod]: composed } },
  };
};

// ─── Xcode (behind an interface so tests can fake it) ────────────────────────

export interface XcodeEditor {
  hasTarget(project: unknown, name: string): boolean;
  addWidgetExtension(project: unknown, target: WidgetTargetDescriptor, sourceFiles: string[]): void;
}

interface PbxObjects {
  PBXNativeTarget: Record<string, PbxNativeTarget | string>;
  XCConfigurationList: Record<string, { buildConfigurations: Array<{ value: string }> } | string>;
  XCBuildConfiguration: Record<string, { buildSettings: Record<string, unknown> } | string>;
  PBXTargetDependency?: Record<string, unknown>;
  PBXContainerItemProxy?: Record<string, unknown>;
  [section: string]: Record<string, unknown> | undefined;
}

interface PbxNativeTarget {
  name: string;
  buildConfigurationList: string;
  buildPhases: Array<{ value: string; comment?: string }>;
}

/** The slice of the `xcode` npm project API (bundled with Expo) used by the real editor. */
interface PbxProject {
  hash: { project: { objects: PbxObjects } };
  pbxTargetByName(name: string): unknown;
  getFirstTarget(): { uuid: string; firstTarget: PbxNativeTarget };
  getFirstProject(): { firstProject: { mainGroup: string } };
  addTarget(name: string, type: string, subfolder: string, bundleId: string): { uuid: string };
  addBuildPhase(files: string[], type: string, comment: string, target: string): unknown;
  addPbxGroup(files: string[], name: string, path: string): { uuid: string };
  addToPbxGroup(groupUuid: string, parentGroupUuid: string): void;
}

/** The generated Xcode project lives in `ios/`, so app-root paths are one level up from SRCROOT. */
export const fromIosProject = (path: string): string => `../${path}`;

/** Build settings the widget extension needs on top of what `addTarget` writes. */
export const widgetBuildSettings = (target: WidgetTargetDescriptor): Record<string, string> => {
  const dir = fromIosProject(target.sourceDir);
  return {
    INFOPLIST_FILE: `"${dir}/Info.plist"`,
    CODE_SIGN_ENTITLEMENTS: `"${dir}/${target.name}.entitlements"`,
    PRODUCT_BUNDLE_IDENTIFIER: `"${target.bundleIdentifier}"`,
    IPHONEOS_DEPLOYMENT_TARGET: target.deploymentTarget,
    SDKROOT: 'iphoneos',
    TARGETED_DEVICE_FAMILY: '"1,2"',
    SWIFT_VERSION: '5.0',
    APPLICATION_EXTENSION_API_ONLY: 'YES',
    // Info.plist reads these; an extension whose version differs from its app is rejected.
    MARKETING_VERSION: `"${target.marketingVersion ?? '1.0'}"`,
    CURRENT_PROJECT_VERSION: `"${target.buildNumber ?? '1'}"`,
  };
};

const configsOf = (objects: PbxObjects, target: PbxNativeTarget) => {
  const list = objects.XCConfigurationList[target.buildConfigurationList];
  if (!list || typeof list === 'string') return [];
  return list.buildConfigurations.flatMap(({ value }) => {
    const config = objects.XCBuildConfiguration[value];
    return config && typeof config !== 'string' ? [config.buildSettings] : [];
  });
};

/** node-xcode stores names of targets it created quoted, so look up both spellings. */
const hasNamedTarget = (pbx: PbxProject, name: string): boolean =>
  Boolean(pbx.pbxTargetByName(name) ?? pbx.pbxTargetByName(`"${name}"`));

export const xcodeProjectEditor: XcodeEditor = {
  hasTarget: (project, name) => hasNamedTarget(project as PbxProject, name),
  addWidgetExtension(project, target, sourceFiles) {
    const pbx = project as PbxProject;
    const objects = pbx.hash.project.objects;
    // addTarget only makes the app depend on the extension when these sections exist.
    objects.PBXTargetDependency ??= {};
    objects.PBXContainerItemProxy ??= {};

    const app = pbx.getFirstTarget();
    const appPhaseCount = app.firstTarget.buildPhases.length;
    const created = pbx.addTarget(
      target.name,
      'app_extension',
      target.name,
      target.bundleIdentifier,
    );

    // The group points at the checked-in sources, so files are referenced in place, not copied.
    // It must exist before the Sources phase so the phase reuses its file references.
    const group = pbx.addPbxGroup(
      sourceFiles,
      target.name,
      `"${fromIosProject(target.sourceDir)}"`,
    );
    pbx.addToPbxGroup(group.uuid, pbx.getFirstProject().firstProject.mainGroup);
    const swift = sourceFiles.filter((f) => f.endsWith('.swift'));
    pbx.addBuildPhase(swift, 'PBXSourcesBuildPhase', 'Sources', created.uuid);
    pbx.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', created.uuid);
    pbx.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', created.uuid);

    // addTarget appends the embed phase last; behind the React Native bundling script it forms a
    // build cycle, so move it to just after the app's Resources phase.
    const phases = app.firstTarget.buildPhases;
    const embed = phases.splice(appPhaseCount);
    const resources = phases.findIndex((p) => p.comment === 'Resources');
    phases.splice(resources === -1 ? phases.length : resources + 1, 0, ...embed);

    const native = objects.PBXNativeTarget[created.uuid];
    if (!native || typeof native === 'string') return;
    const settings = widgetBuildSettings(target);
    for (const buildSettings of configsOf(objects, native)) Object.assign(buildSettings, settings);
  },
};

export const addIosWidgetTarget = (
  project: unknown,
  sourceFiles: string[],
  editor: XcodeEditor = xcodeProjectEditor,
  target: WidgetTargetDescriptor = IOS_WIDGET_TARGET,
): void => {
  if (editor.hasTarget(project, target.name)) return;
  editor.addWidgetExtension(project, target, sourceFiles);
};

// ─── Android source copy ─────────────────────────────────────────────────────

export interface CopyFs {
  exists(path: string): boolean;
  mkdir(path: string): void;
  copy(from: string, to: string): void;
  list(path: string): string[];
}

const nodeCopyFs: CopyFs = {
  exists: existsSync,
  mkdir: (p) => mkdirSync(p, { recursive: true }),
  copy: (from, to) => cpSync(from, to, { recursive: true }),
  list: (p) => readdirSync(p),
};

/** Copies the Kotlin sources and `res/` of the Glance target into the generated Android project. */
export const copyAndroidWidgetSources = (
  projectRoot: string,
  platformProjectRoot: string,
  packageName: string,
  fs: CopyFs = nodeCopyFs,
): string[] => {
  const source = join(projectRoot, 'targets/android-widget');
  if (!fs.exists(source)) return [];
  const main = join(platformProjectRoot, 'app/src/main');
  const javaDir = join(main, 'java', ...packageName.split('.'));
  fs.mkdir(javaDir);
  const copied: string[] = [];
  for (const file of fs.list(source).filter((f) => f.endsWith('.kt'))) {
    fs.copy(join(source, file), join(javaDir, file));
    copied.push(join(javaDir, file));
  }
  if (fs.exists(join(source, 'res'))) {
    fs.copy(join(source, 'res'), join(main, 'res'));
    copied.push(join(main, 'res'));
  }
  return copied;
};

// ─── Plugin ──────────────────────────────────────────────────────────────────

export interface PluginOptions {
  xcode?: XcodeEditor;
  fs?: CopyFs;
  /** Overrides the Kotlin version read from React Native's version catalog. */
  kotlinVersion?: string;
}

const withKaihumanWidgets = (
  config: ExpoConfigLike,
  options: PluginOptions = {},
): ExpoConfigLike => {
  let next = withUrlScheme(withIosAppGroup(config));

  next = composeMod<AndroidManifest>(next, 'android', 'manifest', (cfg) => ({
    ...cfg,
    modResults: addWidgetReceiverToManifest(cfg.modResults),
  }));

  next = composeMod<{ contents: string }>(next, 'android', 'appBuildGradle', (cfg) => ({
    ...cfg,
    modResults: {
      ...cfg.modResults,
      contents: applyComposePlugin(addGlanceDependencies(cfg.modResults.contents)),
    },
  }));

  next = composeMod<{ contents: string }>(next, 'android', 'projectBuildGradle', (cfg) => {
    const root = cfg.modRequest?.projectRoot;
    const version = options.kotlinVersion ?? (root && resolveReactNativeKotlinVersion(root));
    if (!version) {
      throw new Error('with-kaihuman-widgets: cannot find the Kotlin version React Native uses');
    }
    return {
      ...cfg,
      modResults: {
        ...cfg.modResults,
        contents: addComposeCompilerClasspath(cfg.modResults.contents, version),
      },
    };
  });

  next = composeMod<unknown>(next, 'android', 'dangerous', (cfg) => {
    const { projectRoot, platformProjectRoot } = cfg.modRequest ?? {};
    if (projectRoot && platformProjectRoot) {
      copyAndroidWidgetSources(
        projectRoot,
        platformProjectRoot,
        next.android?.package ?? 'com.kaihuman.app',
        options.fs,
      );
      const rulesFile = join(platformProjectRoot, 'app/proguard-rules.pro');
      if (existsSync(rulesFile)) {
        writeFileSync(rulesFile, addWorkManagerKeepRules(readFileSync(rulesFile, 'utf8')));
      }
    }
    return cfg;
  });

  next = composeMod<unknown>(next, 'ios', 'xcodeproj', (cfg) => {
    const root = cfg.modRequest?.projectRoot;
    const dir = root ? join(root, IOS_WIDGET_TARGET.sourceDir) : undefined;
    const fs = options.fs ?? nodeCopyFs;
    const files = dir && fs.exists(dir) ? fs.list(dir) : [];
    const ios = next.ios as { buildNumber?: string } | undefined;
    addIosWidgetTarget(cfg.modResults, files, options.xcode, {
      ...IOS_WIDGET_TARGET,
      marketingVersion: typeof next.version === 'string' ? next.version : undefined,
      buildNumber: ios?.buildNumber,
    });
    return cfg;
  });

  return next;
};

export default withKaihumanWidgets;
