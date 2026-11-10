import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import withKaihumanAppSchemas, {
  APP_SCHEMA_FLAGS,
  addSwiftConditions,
  setAppSchemaFlags,
} from '../plugins/with-kaihuman-app-schemas.js';
import type { ModFn } from '../plugins/with-kaihuman-widgets.js';
import type { SpotlightItem } from './spotlight/spotlight.js';

// No Swift compiler on Linux CI: these check the Swift and SKILL.md sources as text.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const intentsDir = join(root, 'targets/ios-app-intents');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const intent = (file: string) => read(`targets/ios-app-intents/${file}`);

const entity = intent('ItemEntity.swift');
const find = intent('FindItemsIntent.swift');
const hook = intent('AppLaunchHook.swift');
const schemas = intent('AssistantSchemas.swift');

/** The body between `#if FLAG` and its `#endif` (blocks are not nested). */
const block = (flag: string) => new RegExp(`#if ${flag}\\n([\\s\\S]*?)#endif`).exec(schemas)?.[1];

describe('item entity for open-ended queries', () => {
  it('decodes every SpotlightItem key, date included', () => {
    const keys: Record<keyof SpotlightItem, true> = {
      id: true,
      kind: true,
      title: true,
      subtitle: true,
      date: true,
    };
    for (const key of Object.keys(keys)) expect(entity).toMatch(new RegExp(`var ${key}: String`));
  });

  it('has an AppEnum case for every SpotlightKind', () => {
    for (const kind of ['todo', 'note', 'log'])
      expect(entity).toMatch(new RegExp(`case ${kind}\\n`));
    expect(entity).toContain('enum KaihumanItemKind: String, AppEnum');
  });

  it('finds by words, kind and an inclusive day range, without opening the app', () => {
    expect(entity).toContain('static func find(');
    expect(entity).toContain('if let from, day < from { return false }');
    expect(entity).toContain('if let to, day > to { return false }');
    expect(entity).toContain('"%04d-%02d-%02d"');
    expect(find).toContain('struct FindItemsIntent: AppIntent');
    expect(find).not.toContain('openAppWhenRun');
    expect(find).toContain('ReturnsValue<[KaihumanItemEntity]>');
    for (const p of ['text: String?', 'kind: KaihumanItemKind?', 'from: Date?', 'to: Date?']) {
      expect(find).toContain(`var ${p}`);
    }
    // Siri finds it without a phrase; App Shortcuts stay at 9 of 10.
    expect(intent('AppShortcuts.swift')).not.toContain('FindItemsIntent');
  });
});

describe('app-target launch hook', () => {
  const delegate = read('modules/kaihuman-shared/ios/KaihumanAppDelegate.swift');
  const module = read('modules/kaihuman-shared/ios/KaihumanSharedModule.swift');

  it('is an Objective-C class the pod finds by name', () => {
    expect(hook).toContain('@objc(KaihumanAppLaunchHook)');
    expect(hook).toContain('@objc static func run()');
    expect(delegate).toContain('NSClassFromString("KaihumanAppLaunchHook")');
    expect(delegate).toContain('NSSelectorFromString("run")');
  });

  it('runs at launch and after each Spotlight publish', () => {
    expect(delegate).toMatch(
      /didFinishLaunchingWithOptions[\s\S]*runAppLaunchHook\(\)\n\s*return true/,
    );
    expect(module).toMatch(/Function\("indexSpotlight"\)[\s\S]*runAppLaunchHook\(\)/);
    expect(module).toContain('"kaihuman.log"');
  });

  it('refreshes Siri parameters and indexes app entities on iOS 18', () => {
    expect(hook).toContain('KaihumanAppShortcuts.updateAppShortcutParameters()');
    expect(hook).toContain('guard #available(iOS 18.0, *)');
    expect(hook).toContain('index.indexAppEntities(items)');
    expect(hook).toContain('UNVERIFIED');
  });
});

describe('assistant schemas', () => {
  it('keeps every schema behind a plugin flag, off by default', () => {
    const journal = block(APP_SCHEMA_FLAGS.journal);
    const reminders = block(APP_SCHEMA_FLAGS.reminders);
    expect(journal).toBeDefined();
    expect(reminders).toBeDefined();
    const outside = schemas.replace(/#if [A-Z_]+\n[\s\S]*?#endif/g, '');
    expect(outside).not.toMatch(/@Assistant(Entity|Intent)\(/);
    expect(read('app.json')).not.toContain('with-kaihuman-app-schemas');
  });

  it('maps notes and log entries onto the journal schema', () => {
    const journal = block(APP_SCHEMA_FLAGS.journal) ?? '';
    expect(journal).toContain('@AssistantEntity(schema: .journal.entry)');
    expect(journal).toContain('@AssistantIntent(schema: .journal.createEntry)');
    expect(journal).toContain('@AssistantIntent(schema: .journal.search)');
    expect(journal).toContain('["note", "log"]');
    // createEntry prefills the log sheet through a link the app routes (src/navigation/routes.ts).
    expect(journal).toContain('components.host = "quick-log"');
    expect(journal).toContain('URLQueryItem(name: "text"');
  });

  it('maps todos onto the iOS 27 reminders schema, marked unverified', () => {
    const reminders = block(APP_SCHEMA_FLAGS.reminders) ?? '';
    expect(reminders).toContain('@available(iOS 27.0, *)');
    expect(reminders).toContain('@AssistantEntity(schema: .reminders.reminder)');
    expect(reminders).toContain('@AssistantIntent(schema: .reminders.createReminder)');
    expect(reminders).toContain('CaptureTodoIntent(text: title)');
    expect(reminders.match(/UNVERIFIED/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Siri AI app skills', () => {
  const swift = ['ItemEntity', 'FindItemsIntent', 'AssistantSchemas', 'SiriIntents', 'TodoIntents']
    .map((f) => intent(`${f}.swift`))
    .join('\n')
    .concat(read('targets/ios-widget/CaptureTodoIntent.swift'));

  for (const name of ['todos', 'notes', 'log']) {
    it(`ships ${name}/SKILL.md naming only types that exist`, () => {
      const path = join(intentsDir, 'skills', name, 'SKILL.md');
      expect(existsSync(path)).toBe(true);
      const skill = readFileSync(path, 'utf8');
      expect(skill).toMatch(new RegExp(`^---\\nname: kaihuman-${name}\\ndescription: .+\\n---\\n`));
      expect(skill).toContain('UNVERIFIED');
      const types = skill.match(/`([A-Z]\w+)(\([^`]*\))?`/g) ?? [];
      expect(types.length).toBeGreaterThan(2);
      for (const t of types) {
        const typeName = t.slice(1).split(/[(`]/)[0] ?? '';
        expect(swift, typeName).toMatch(new RegExp(`(struct|enum) ${typeName}\\b`));
      }
    });
  }
});

describe('with-kaihuman-app-schemas plugin', () => {
  it('adds flags to SWIFT_ACTIVE_COMPILATION_CONDITIONS once, keeping existing ones', () => {
    expect(addSwiftConditions(undefined, ['A'])).toBe('"$(inherited) A"');
    expect(addSwiftConditions('"$(inherited) DEBUG"', ['A', 'B'])).toBe('"$(inherited) DEBUG A B"');
    expect(addSwiftConditions('"$(inherited) DEBUG A"', ['A'])).toBe('"$(inherited) DEBUG A"');
    expect(addSwiftConditions(['$(inherited)', 'DEBUG'], ['A'])).toBe('"$(inherited) DEBUG A"');
  });

  const project = () => ({
    hash: {
      project: {
        objects: {
          XCConfigurationList: {
            list: { buildConfigurations: [{ value: 'debug' }, { value: 'release' }] },
          },
          XCBuildConfiguration: {
            debug: {
              buildSettings: { SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"$(inherited) DEBUG"' },
            },
            release: { buildSettings: {} as Record<string, unknown> },
          },
        },
      },
    },
    getFirstTarget: () => ({ firstTarget: { buildConfigurationList: 'list' } }),
  });

  it('sets the flags on every configuration of the main app target', () => {
    const pbx = project();
    setAppSchemaFlags(pbx, [APP_SCHEMA_FLAGS.journal]);
    const { debug, release } = pbx.hash.project.objects.XCBuildConfiguration;
    expect(debug.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS).toBe(
      '"$(inherited) DEBUG KAIHUMAN_APP_SCHEMAS"',
    );
    expect(release.buildSettings.SWIFT_ACTIVE_COMPILATION_CONDITIONS).toBe(
      '"$(inherited) KAIHUMAN_APP_SCHEMAS"',
    );
  });

  it('does nothing unless a schema is switched on, and composes with existing mods', async () => {
    expect(withKaihumanAppSchemas({})).toEqual({});
    let ran = false;
    const existing: ModFn = async (cfg) => {
      ran = true;
      return cfg;
    };
    const config = withKaihumanAppSchemas(
      { mods: { ios: { xcodeproj: existing } } },
      { reminders: true },
    );
    const pbx = project();
    await (config.mods?.ios?.xcodeproj as ModFn)({ modResults: pbx });
    expect(ran).toBe(true);
    expect(pbx.hash.project.objects.XCBuildConfiguration.release.buildSettings).toEqual({
      SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"$(inherited) KAIHUMAN_REMINDERS_SCHEMA"',
    });
  });
});
