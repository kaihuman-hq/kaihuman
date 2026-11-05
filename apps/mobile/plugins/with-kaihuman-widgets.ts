import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

/** The slice of the `xcode` npm project API (bundled with Expo) used by the real editor. */
interface PbxProject {
  pbxTargetByName(name: string): unknown;
  addTarget(name: string, type: string, subfolder: string, bundleId: string): { uuid: string };
  addBuildPhase(files: string[], type: string, comment: string, target: string): unknown;
  addPbxGroup(files: string[], name: string, path: string): { uuid: string };
  updateBuildProperty(key: string, value: string, build?: string, targetName?: string): void;
}

export const xcodeProjectEditor: XcodeEditor = {
  hasTarget: (project, name) => Boolean((project as PbxProject).pbxTargetByName(name)),
  addWidgetExtension(project, target, sourceFiles) {
    const pbx = project as PbxProject;
    const created = pbx.addTarget(
      target.name,
      'app_extension',
      target.name,
      target.bundleIdentifier,
    );
    const swift = sourceFiles.filter((f) => f.endsWith('.swift'));
    pbx.addBuildPhase(swift, 'PBXSourcesBuildPhase', 'Sources', created.uuid);
    pbx.addPbxGroup(sourceFiles, target.name, target.sourceDir);
    pbx.updateBuildProperty(
      'IPHONEOS_DEPLOYMENT_TARGET',
      target.deploymentTarget,
      undefined,
      target.name,
    );
    pbx.updateBuildProperty(
      'PRODUCT_BUNDLE_IDENTIFIER',
      target.bundleIdentifier,
      undefined,
      target.name,
    );
    pbx.updateBuildProperty('SWIFT_VERSION', '5.0', undefined, target.name);
    pbx.updateBuildProperty(
      'CODE_SIGN_ENTITLEMENTS',
      `${target.sourceDir}/${target.name}.entitlements`,
      undefined,
      target.name,
    );
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
    modResults: { ...cfg.modResults, contents: addGlanceDependencies(cfg.modResults.contents) },
  }));

  next = composeMod<unknown>(next, 'android', 'dangerous', (cfg) => {
    const { projectRoot, platformProjectRoot } = cfg.modRequest ?? {};
    if (projectRoot && platformProjectRoot) {
      copyAndroidWidgetSources(
        projectRoot,
        platformProjectRoot,
        next.android?.package ?? 'com.kaihuman.app',
        options.fs,
      );
    }
    return cfg;
  });

  next = composeMod<unknown>(next, 'ios', 'xcodeproj', (cfg) => {
    const root = cfg.modRequest?.projectRoot;
    const dir = root ? join(root, IOS_WIDGET_TARGET.sourceDir) : undefined;
    const fs = options.fs ?? nodeCopyFs;
    const files = dir && fs.exists(dir) ? fs.list(dir) : [];
    addIosWidgetTarget(cfg.modResults, files, options.xcode);
    return cfg;
  });

  return next;
};

export default withKaihumanWidgets;
