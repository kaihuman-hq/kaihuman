import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Metro compiles `import('react-native')` to importAll, which reads every lazy getter on
// react-native's exports. One of them (PushNotificationIOS) throws on iOS and the release app
// dies: this is what crashed the RSS view. Import react-native statically instead.
const root = join(import.meta.dirname, '..');
const sources = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });

describe('react-native imports', () => {
  it('are never dynamic', () => {
    const offenders = [...sources('src'), ...sources('app')].filter((file) =>
      /import\(\s*['"]react-native['"]\s*\)/.test(readFileSync(join(root, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
