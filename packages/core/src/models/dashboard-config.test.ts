import { describe, expect, it } from 'vitest';
import {
  appFolderFor,
  dashboardConfigPath,
  parseDashboardConfig,
  resolveDashboards,
} from './dashboard-config.js';
import legacy from './fixtures/legacy.dashboard.config.json?raw';
import malformed from './fixtures/malformed.dashboard.config.json?raw';
import seed from './fixtures/seed.dashboard.config.json?raw';
import stories from './fixtures/stories.dashboard.config.json?raw';

const FIXTURES = { legacy, malformed, seed, stories };
const fixture = (name: keyof typeof FIXTURES) => FIXTURES[name];

const DEFAULT = { id: 'default', name: 'Main' };

describe('parseDashboardConfig', () => {
  it.each([null, undefined, '', 'not json', '[]', '"x"', 'null'])('defaults for %j', (text) => {
    const c = parseDashboardConfig(text as string | null | undefined);
    expect(c.dashboards).toEqual([DEFAULT]);
    expect(c.entries).toEqual([]);
  });

  it('defaults dashboards when the arrays are missing', () => {
    const c = parseDashboardConfig('{"version":2}');
    expect(c).toMatchObject({ version: 2, dashboards: [DEFAULT], entries: [] });
  });

  it('keeps the seed config in order', () => {
    const c = parseDashboardConfig(fixture('seed'));
    expect(c.dashboards.map((d) => d.id)).toEqual(['overview', 'finance', 'reading']);
    expect(c.entries).toHaveLength(14);
  });

  it('drops malformed dashboards and entries but keeps the valid ones', () => {
    const c = parseDashboardConfig(fixture('malformed'));
    expect(c.dashboards).toEqual([{ id: 'ok', name: 'Fine' }]);
    expect(c.entries).toEqual([
      { path: '.kh/a.todos.md', dashboard: 'ok' },
      { path: '.kh/c.habit.csv', dashboard: 'ok' },
    ]);
  });
});

describe('resolveDashboards', () => {
  it('splits the seed config into three pages in entry order', () => {
    const config = parseDashboardConfig(fixture('seed'));
    const tree = config.entries.map((e) => e.path);
    const pages = resolveDashboards(config, tree);
    expect(pages.map((p) => [p.name, p.paths.length])).toEqual([
      ['Overview', 7],
      ['Finance', 4],
      ['Reading', 3],
    ]);
    expect(pages[0]?.paths[0]).toBe('.kh/projects.todos.md');
  });

  it('drops entries missing from the tree', () => {
    const config = parseDashboardConfig(fixture('seed'));
    const pages = resolveDashboards(config, ['.kh/projects.todos.md']);
    expect(pages.map((p) => p.paths)).toEqual([['.kh/projects.todos.md'], [], []]);
  });

  it('honours skipOnMobile only for mobile', () => {
    const config = parseDashboardConfig(fixture('stories'));
    const tree = config.entries.map((e) => e.path);
    const all = resolveDashboards(config, tree);
    const mobile = resolveDashboards(config, tree, { mobile: true });
    expect(all.find((p) => p.id === 'd2')?.paths).toEqual([
      'test-todos.todos.md',
      'reditlater.readitlater.json',
    ]);
    expect(mobile.find((p) => p.id === 'd2')?.paths).toEqual(['test-todos.todos.md']);
    expect(mobile.map((p) => p.name)).toContain('Health & Fitness');
  });

  it('rewrites legacy .lifeos paths to .kh', () => {
    const config = parseDashboardConfig(fixture('legacy'));
    const pages = resolveDashboards(config, ['.kh/a.todos.md', '.kh/b.habit.csv']);
    expect(pages).toEqual([{ ...DEFAULT, paths: ['.kh/a.todos.md', '.kh/b.habit.csv'] }]);
  });

  it('shows nothing for a malformed config with files in the tree', () => {
    const pages = resolveDashboards(parseDashboardConfig('{'), ['.kh/a.todos.md']);
    expect(pages).toEqual([{ ...DEFAULT, paths: [] }]);
  });
});

describe('dashboardConfigPath', () => {
  it('prefers .kh, falls back to .lifeos, defaults to .kh', () => {
    expect(appFolderFor(['.lifeos/x', '.kh/y'])).toBe('.kh');
    expect(dashboardConfigPath(['.lifeos/x.md'])).toBe('.lifeos/.dashboard.config.json');
    expect(dashboardConfigPath([])).toBe('.kh/.dashboard.config.json');
  });
});
