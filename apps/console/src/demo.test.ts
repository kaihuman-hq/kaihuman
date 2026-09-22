import { buildDemoSeed, type DashboardConfig, InMemoryGithubService } from '@lifosy/core';
import { describe, expect, it } from 'vitest';

const CONFIG_PATH = '.kh/.dashboard.config.json';

describe('buildDemoSeed', () => {
  it('produces a repo, a user and a non-empty filesystem', () => {
    const seed = buildDemoSeed();
    expect(seed.repos).toHaveLength(1);
    expect(seed.repos[0]?.full_name).toBe('demo-user/life-os-demo');
    expect(seed.user.login).toBe('demo-user');
    expect(Object.keys(seed.files).length).toBeGreaterThan(10);
  });

  it('includes a valid dashboard config whose entries all resolve to seeded files', () => {
    const seed = buildDemoSeed();
    const raw = seed.files[CONFIG_PATH];
    expect(raw).toBeDefined();

    const config = JSON.parse(raw as string) as DashboardConfig;
    expect(config.version).toBe(1);
    expect(config.dashboards.length).toBeGreaterThanOrEqual(2);
    expect(config.entries.length).toBeGreaterThan(0);

    const dashboardIds = new Set(config.dashboards.map((d) => d.id));
    for (const entry of config.entries) {
      // every entry points at a file that exists in the seed…
      expect(seed.files[entry.path], `missing file for entry ${entry.path}`).toBeDefined();
      // …and a dashboard that exists.
      expect(dashboardIds.has(entry.dashboard)).toBe(true);
    }
  });

  it('emits valid JSON for every .json widget file', () => {
    const seed = buildDemoSeed();
    for (const [path, content] of Object.entries(seed.files)) {
      if (path.endsWith('.json')) {
        expect(() => JSON.parse(content), `invalid JSON in ${path}`).not.toThrow();
      }
    }
  });

  // Guards the file formats against the widget parsers' expectations
  // (see the matching *Logic.ts in @lifosy/ui). Asserted structurally to keep
  // the suite free of the heavy UI bundle.
  it('emits widget files that match the documented formats', () => {
    const f = buildDemoSeed().files;

    expect(f['.kh/work.timetracking.csv']).toMatch(/^iso date;time\n/);
    expect(f['.kh/health.habit.csv']).toMatch(/^iso date;goal reached\n/);
    expect(f['.kh/personal.events.csv']).toMatch(/^name;type;start iso date;end iso date\n/);
    expect(f['.kh/monthly.budget.csv']).toMatch(/^name;account;category;date;value\n/);
    expect(f['.kh/portfolio.stocks.csv']).toMatch(/^timestamp,current value,invest\n/);
    expect(f['.kh/utilities.consumption.csv']).toMatch(/^created,Electricity\[/);
    expect(f['.kh/metrics.data-collection.csv']).toMatch(/^name::created,type::auto:date;/);
    expect(f['.kh/daily.actionlog.md']).toMatch(/\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /);

    // bookmarks: the shape BookmarksLogic parses, with only openable urls
    const bookmarks = JSON.parse(f['.kh/browser.bookmarks.json'] as string);
    expect(Array.isArray(bookmarks.bookmarks)).toBe(true);
    expect(bookmarks.bookmarks.length).toBeGreaterThan(0);
    for (const bookmark of bookmarks.bookmarks) {
      expect(bookmark).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        url: expect.stringMatching(/^https?:\/\//),
        tags: expect.any(Array),
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    }

    // todos: frontmatter + at least one task of each interesting marker
    const todos = f['.kh/projects.todos.md'] as string;
    expect(todos).toMatch(/^---\nmilestones:/);
    for (const marker of ['- [ ]', '- [>]', '- [x]', '- [-]']) {
      expect(todos.includes(marker), `todos missing a ${marker} item`).toBe(true);
    }

    // every CSV data row has the same column count as its header
    for (const path of [
      '.kh/work.timetracking.csv',
      '.kh/health.habit.csv',
      '.kh/personal.events.csv',
      '.kh/monthly.budget.csv',
    ]) {
      const lines = (f[path] as string).trim().split('\n');
      const cols = (lines[0] as string).split(';').length;
      for (const line of lines.slice(1)) {
        expect(line.split(';').length, `${path}: ragged row "${line}"`).toBe(cols);
      }
    }
  });
});

describe('InMemoryGithubService', () => {
  const owner = 'demo-user';
  const repo = 'life-os-demo';

  function loaded() {
    const svc = new InMemoryGithubService();
    const seed = buildDemoSeed();
    svc.load(seed.files, seed.repos);
    return { svc, seed };
  }

  it('lists the seeded repos and reads seeded files', async () => {
    const { svc } = loaded();
    expect(await svc.listRepos()).toHaveLength(1);

    const file = await svc.getFileContent(owner, repo, CONFIG_PATH);
    expect(file.content).toContain('dashboards');
    expect(file.sha).toHaveLength(40);
  });

  it('builds a tree with folder and blob entries', async () => {
    const { svc } = loaded();
    const tree = await svc.fetchRepoTree(owner, repo);
    expect(tree.some((t) => t.type === 'tree' && t.path === '.kh')).toBe(true);
    expect(tree.some((t) => t.type === 'blob' && t.path === CONFIG_PATH)).toBe(true);
  });

  it('persists writes in memory and changes the sha', async () => {
    const { svc } = loaded();
    const before = await svc.getFileContent(owner, repo, CONFIG_PATH);

    const res = await svc.saveFile(owner, repo, 'notes/new.md', '# Hello', 'msg');
    expect(res.content.sha).toHaveLength(40);

    const created = await svc.getFileContent(owner, repo, 'notes/new.md');
    expect(created.content).toBe('# Hello');

    const updated = await svc.saveFile(owner, repo, CONFIG_PATH, 'changed', 'msg');
    expect(updated.content.sha).not.toBe(before.sha);
  });

  it('throws a 404 for missing files and deletes existing ones', async () => {
    const { svc } = loaded();
    await expect(svc.getFileContent(owner, repo, 'nope.md')).rejects.toMatchObject({ status: 404 });

    await svc.deleteFile(owner, repo, CONFIG_PATH, 'msg', 'sha');
    await expect(svc.getFileContent(owner, repo, CONFIG_PATH)).rejects.toMatchObject({
      status: 404,
    });
  });
});
