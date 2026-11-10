import type { ExpoConfigLike, ModConfig, ModFn } from './with-kaihuman-widgets.js';

/**
 * Swift compilation conditions that switch on the App Schemas code in
 * targets/ios-app-intents/AssistantSchemas.swift. Off by default: that code has never been
 * compiled on CI (no Swift on Linux), so a release build opts in after a Mac or EAS build passes.
 */
export const APP_SCHEMA_FLAGS = {
  /** iOS 18 `.journal` schemas for notes and log entries. */
  journal: 'KAIHUMAN_APP_SCHEMAS',
  /** iOS 27 `.reminders` schemas for todos. API names unverified. */
  reminders: 'KAIHUMAN_REMINDERS_SCHEMA',
} as const;

export type AppSchemaOptions = { [K in keyof typeof APP_SCHEMA_FLAGS]?: boolean };

const SETTING = 'SWIFT_ACTIVE_COMPILATION_CONDITIONS';

/** Adds the flags to a pbxproj build setting value (quoted string, list, or unset), once. */
export const addSwiftConditions = (current: unknown, flags: readonly string[]): string => {
  const raw = Array.isArray(current)
    ? current.join(' ')
    : typeof current === 'string'
      ? current
      : '';
  const words = raw.replace(/^"|"$/g, '').split(/\s+/).filter(Boolean);
  const merged = words.length > 0 ? words : ['$(inherited)'];
  for (const flag of flags) if (!merged.includes(flag)) merged.push(flag);
  return `"${merged.join(' ')}"`;
};

interface SchemaPbx {
  hash: {
    project: {
      objects: {
        XCConfigurationList: Record<
          string,
          { buildConfigurations: Array<{ value: string }> } | string
        >;
        XCBuildConfiguration: Record<string, { buildSettings: Record<string, unknown> } | string>;
      };
    };
  };
  getFirstTarget(): { firstTarget: { buildConfigurationList: string } };
}

/** Sets the flags on every build configuration of the main app target (the first target). */
export const setAppSchemaFlags = (project: unknown, flags: readonly string[]): void => {
  const pbx = project as SchemaPbx;
  const { objects } = pbx.hash.project;
  const list = objects.XCConfigurationList[pbx.getFirstTarget().firstTarget.buildConfigurationList];
  if (!list || typeof list === 'string') return;
  for (const { value } of list.buildConfigurations) {
    const config = objects.XCBuildConfiguration[value];
    if (!config || typeof config === 'string') continue;
    config.buildSettings[SETTING] = addSwiftConditions(config.buildSettings[SETTING], flags);
  }
};

/** app.json: `["./plugins/with-kaihuman-app-schemas.ts", { "journal": true }]`. */
const withKaihumanAppSchemas = (
  config: ExpoConfigLike,
  options: AppSchemaOptions = {},
): ExpoConfigLike => {
  const flags = (Object.keys(APP_SCHEMA_FLAGS) as Array<keyof typeof APP_SCHEMA_FLAGS>)
    .filter((key) => options[key])
    .map((key) => APP_SCHEMA_FLAGS[key]);
  if (flags.length === 0) return config;
  const previous = config.mods?.ios?.xcodeproj;
  const mod: ModFn = async (cfg: ModConfig) => {
    setAppSchemaFlags(cfg.modResults, flags);
    return previous ? previous(cfg) : cfg;
  };
  return { ...config, mods: { ...config.mods, ios: { ...config.mods?.ios, xcodeproj: mod } } };
};

export default withKaihumanAppSchemas;
