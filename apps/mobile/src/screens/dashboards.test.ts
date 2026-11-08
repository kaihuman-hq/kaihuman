import { buildDemoSeed, configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type DashboardPage,
  lastDashboardId,
  loadDashboards,
  rememberDashboard,
} from './dashboards.js';
import type { ContentFiles } from './file-editor-screen.js';

const NOW = new Date(2026, 10, 5, 10, 0, 0);

function fakeFiles(contents: Record<string, string>, failing: string[] = []) {
  const reads: string[] = [];
  const files = {
    tree: () => Object.keys(contents).map((path) => ({ path, type: 'blob' }) as never),
    read: async (path: string) => {
      reads.push(path);
      if (failing.includes(path)) throw new Error('boom');
      return contents[path] as string;
    },
  } as unknown as ContentFiles;
  return { files, reads };
}

const paths = (p: DashboardPage) => p.files.map((f) => f.path);

describe('loadDashboards', () => {
  it('turns the demo seed into its three dashboards', async () => {
    const { files } = fakeFiles(buildDemoSeed(NOW).files);
    const { pages, defaulted } = await loadDashboards(files);
    expect(defaulted).toBe(false);
    expect(pages.map((p) => p.name)).toEqual(['Overview', 'Finance', 'Reading', 'Tools']);
    expect(paths(pages[0] as DashboardPage)[0]).toBe('.kh/projects.todos.md');
    // Console-only kinds stay on the page so they can offer "Open file".
    expect(paths(pages[2] as DashboardPage)).toContain('.kh/news.rss.json');
  });

  it('falls back to one Today page of all tile files when there is no config', async () => {
    const { files } = fakeFiles({
      'b.habit.csv': 'x',
      'a.todos.md': '',
      'notes.md': 'hi',
    });
    const { pages, defaulted } = await loadDashboards(files);
    expect(defaulted).toBe(true);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ id: 'today', name: 'Today' });
    expect(paths(pages[0] as DashboardPage)).toEqual(['a.todos.md', 'b.habit.csv']);
  });

  it('falls back when the config places no files', async () => {
    const { files } = fakeFiles({
      '.kh/.dashboard.config.json': '{"dashboards":[{"id":"x","name":"X"}],"entries":[]}',
      '.kh/a.todos.md': '',
    });
    const { pages, defaulted } = await loadDashboards(files);
    expect(defaulted).toBe(true);
    expect(paths(pages[0] as DashboardPage)).toEqual(['.kh/a.todos.md']);
  });

  it('keeps an empty configured dashboard and reads shared files once', async () => {
    const { files, reads } = fakeFiles({
      '.kh/.dashboard.config.json': JSON.stringify({
        dashboards: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
        entries: [
          { path: '.kh/x.todos.md', dashboard: 'a' },
          { path: '.kh/x.todos.md', dashboard: 'b' },
        ],
      }),
      '.kh/x.todos.md': '',
    });
    const { pages } = await loadDashboards(files);
    expect(pages.map(paths)).toEqual([['.kh/x.todos.md'], ['.kh/x.todos.md'], []]);
    expect(reads.filter((p) => p === '.kh/x.todos.md')).toHaveLength(1);
  });

  it('leaves out files that fail to read', async () => {
    const seed = buildDemoSeed(NOW).files;
    const { files } = fakeFiles(seed, ['.kh/health.habit.csv']);
    const { pages } = await loadDashboards(files);
    expect(paths(pages[0] as DashboardPage)).not.toContain('.kh/health.habit.csv');
  });
});

describe('remembered dashboard', () => {
  beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));

  it('round-trips the id', () => {
    expect(lastDashboardId()).toBeNull();
    rememberDashboard('finance');
    expect(lastDashboardId()).toBe('finance');
  });
});
