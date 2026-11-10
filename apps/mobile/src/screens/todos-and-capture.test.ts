import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import { newIdea, parseActionLog, parseIdea, parseTodos } from '@kaihuman/formats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repoReady, whenRepoReady } from '../sync/repo-ready.js';
import { KanbanBoardController } from './kanban-board.js';
import {
  githubRepoFiles,
  QuickCaptureController,
  REPO_NOT_READY,
  type RepoFiles,
} from './quick-capture.js';
import { isoWeekLabel, TodoAnalyticsController } from './todo-analytics.js';

const NOW = new Date('2026-09-24T10:00:00');

class MemoryFiles implements RepoFiles {
  writes: string[] = [];
  ready?: () => Promise<boolean>;
  failWrites = new Set<string>();
  constructor(
    public store = new Map<string, string>(),
    private folder = '.kh',
  ) {}
  appFolder = () => this.folder;
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    if (this.failWrites.has(p)) throw new Error(`save failed: ${p}`);
    this.writes.push(p);
    this.store.set(p, c);
  }
}

const mem = (files: Record<string, string> = {}, folder = '.kh') =>
  new MemoryFiles(new Map(Object.entries(files)), folder);

describe('QuickCaptureController', () => {
  const capture = (files: MemoryFiles) => new QuickCaptureController(files, () => NOW);

  it('adds a todo to a new inbox with parsed tags', async () => {
    const files = mem();
    const res = await capture(files).quickTodo('Call #admin the bank', '#home, Errands');
    expect(res).toMatchObject({ ok: true, path: '.kh/inbox.todos.md' });
    const [todo] = parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items;
    expect(todo).toMatchObject({
      text: 'Call the bank',
      status: 'backlog',
      tags: ['home', 'errands', 'admin'],
    });
  });

  it('appends to an existing inbox and rejects empty todos without writing', async () => {
    const files = mem({ '.kh/inbox.todos.md': '- [ ] first\n' });
    const c = capture(files);
    expect(await c.quickTodo('second')).toMatchObject({ ok: true });
    expect(
      parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items.map((i) => i.text),
    ).toEqual(['first', 'second']);
    files.writes.length = 0;
    expect(await c.quickTodo('   ')).toEqual({ ok: false, error: 'Nothing to add' });
    expect(files.writes).toEqual([]);
  });

  it('uses the legacy .lifeos folder when the repo has it', async () => {
    const files = mem({}, '.lifeos');
    expect(await capture(files).quickTodo('x')).toMatchObject({ path: '.lifeos/inbox.todos.md' });
  });

  it('prepends notes to the dump file', async () => {
    const files = mem({ '.kh/dump.md': '- 2026-09-01 old\n' });
    const c = capture(files);
    await c.quickNote('  new thought ');
    expect(files.store.get('.kh/dump.md')).toBe('- 2026-09-24 new thought\n- 2026-09-01 old\n');
    expect(await c.quickNote('')).toMatchObject({ ok: false });
  });

  it('appends action log entries with tags', async () => {
    const files = mem();
    await capture(files).quickLog('Ran 5k', ['health']);
    const [entry] = parseActionLog(files.store.get('.kh/inbox.actionlog.md') ?? '').entries;
    expect(entry?.timestamp).toBe('2026-09-24 10:00:00');
    expect(entry?.tags).toEqual(['health']);
    expect(await capture(files).quickLog(' ')).toMatchObject({ ok: false });
  });

  it('logs onto a targeted idea instead of the action log', async () => {
    const idea = newIdea({ title: 'Solar' }, { now: NOW, author: 'human' });
    const files = mem({ [idea.path]: idea.content });
    const c = capture(files);
    c.targetIdea = idea.slug;
    expect(await c.quickLog('Measured the roof')).toMatchObject({ ok: true, path: idea.path });
    expect(files.store.get(idea.path)).toContain('Measured the roof');
    expect(files.store.has('.kh/inbox.actionlog.md')).toBe(false);
    c.targetIdea = 'missing';
    expect(await c.quickLog('x')).toMatchObject({ ok: false });
    expect(await capture(files).quickLog('plain')).toMatchObject({
      path: '.kh/inbox.actionlog.md',
    });
  });

  it('turns plain idea text into a new idea and refuses to overwrite', async () => {
    const files = mem();
    const c = capture(files);
    const res = await c.quickIdea('Solar balcony\nCheck the roof angle');
    expect(res).toEqual({
      ok: true,
      results: [{ kind: 'created', slug: 'solar-balcony', path: '.kh/ideas/solar-balcony.md' }],
    });
    const idea = parseIdea(files.store.get('.kh/ideas/solar-balcony.md') ?? '');
    expect(idea.title).toBe('Solar balcony');
    expect(files.store.get('.kh/ideas/solar-balcony.md')).toContain('Check the roof angle');
    expect(await c.quickIdea('Solar balcony')).toMatchObject({
      ok: false,
      error: expect.stringContaining('already exists'),
    });
    expect(await c.quickIdea('  ')).toMatchObject({ ok: false });
  });

  it('applies kh-idea hand-off blocks, creating and updating', async () => {
    const files = mem();
    const c = capture(files);
    const create = '```kh-idea\ntitle: Garden robot\nsummary: Weeds itself\n```';
    expect(await c.quickIdea(create, { author: 'claude.ai' })).toMatchObject({
      ok: true,
      results: [{ kind: 'created', slug: 'garden-robot' }],
    });
    expect(files.store.get('.kh/ideas/garden-robot.md')).toContain('claude.ai');

    const update = '```kh-idea\nslug: garden-robot\nstatus: exploring\nlog: Prototype planned\n```';
    expect(await c.quickIdea(update)).toMatchObject({
      ok: true,
      results: [{ kind: 'updated', slug: 'garden-robot' }],
    });
    expect(parseIdea(files.store.get('.kh/ideas/garden-robot.md') ?? '').status).toBe('exploring');
  });

  it('keeps earlier hand-off blocks when a later one fails', async () => {
    const files = mem();
    const text = '```kh-idea\ntitle: First idea\n```\n```kh-idea\nslug: missing-one\nlog: hi\n```';
    const res = await capture(files).quickIdea(text);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.results).toHaveLength(1);
      expect(res.error).toContain('missing-one');
    }
    expect(files.exists('.kh/ideas/first-idea.md')).toBe(true);
  });

  it('reports an invalid hand-off status', async () => {
    const res = await capture(mem()).quickIdea('```kh-idea\ntitle: X idea\nstatus: bogus\n```');
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining('not an idea status') });
  });

  it('saves knowledge sources under raw/ with unique names', async () => {
    const files = mem();
    const c = capture(files);
    const a = await c.quickKnowledge('Key takeaway\nmore', 'Deep Work');
    const b = await c.quickKnowledge('Another', 'Deep Work');
    expect(a).toMatchObject({ ok: true, path: '.kh/raw/2026-09-24-deep-work.md' });
    expect(b).toMatchObject({ ok: true, path: '.kh/raw/2026-09-24-deep-work-2.md' });
    expect(files.store.get('.kh/raw/2026-09-24-deep-work.md')).toContain('processed: false');
    expect(await c.quickKnowledge(' ')).toMatchObject({ ok: false });
  });

  it('surfaces save failures instead of reporting success', async () => {
    const files = mem();
    files.failWrites.add('.kh/inbox.todos.md');
    expect(await capture(files).quickTodo('x')).toEqual({
      ok: false,
      error: 'save failed: .kh/inbox.todos.md',
    });
  });

  it('rejects a second capture while one is saving', async () => {
    const files = mem();
    let release: () => void = () => {};
    files.write = (p, c) =>
      new Promise<void>((r) => {
        release = () => {
          files.store.set(p, c);
          r();
        };
      });
    const c = capture(files);
    const first = c.quickTodo('a');
    await vi.waitFor(() => expect(release).not.toBe(undefined));
    expect(await c.quickTodo('b')).toMatchObject({ ok: false });
    release();
    expect(await first).toMatchObject({ ok: true });
  });
});

describe('capture before the repo is loaded (widget cold launch)', () => {
  afterEach(() => {
    githubProfileStore.currentRepo.value = null;
    githubFileStore.loadedRepo.value = null;
    githubFileStore.tree.value = [];
    vi.useRealTimers();
  });

  const repo = {
    id: 1,
    name: 'kb',
    full_name: 'me/kb',
    private: true,
    owner: { login: 'me', avatar_url: '' },
    default_branch: 'main',
    updated_at: '',
  };

  it('waits for the tree, then appends to the existing inbox', async () => {
    const files = mem({ '.kh/inbox.todos.md': '- [ ] existing\n' });
    let release: (ok: boolean) => void = () => undefined;
    files.ready = () =>
      new Promise<boolean>((r) => {
        release = r;
      });
    const pending = new QuickCaptureController(files, () => NOW).quickTodo('from widget');
    await Promise.resolve();
    expect(files.writes).toEqual([]);
    release(true);
    expect(await pending).toMatchObject({ ok: true });
    const texts = parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items.map((i) => i.text);
    expect(texts).toEqual(['existing', 'from widget']);
  });

  it('fails without writing when the repo never loads', async () => {
    const files = mem({ '.kh/inbox.todos.md': '- [ ] existing\n' });
    files.ready = async () => false;
    const c = new QuickCaptureController(files, () => NOW);
    expect(await c.quickTodo('lost?')).toEqual({ ok: false, error: REPO_NOT_READY });
    expect(await c.quickIdea('An idea')).toMatchObject({ ok: false, error: REPO_NOT_READY });
    expect(files.writes).toEqual([]);
  });

  it('whenRepoReady resolves once the current repo tree is loaded, false on timeout', async () => {
    expect(repoReady()).toBe(false);
    const ready = whenRepoReady(1000);
    githubProfileStore.currentRepo.value = repo;
    // createFile's optimistic tree before loadTree ran is not the repo.
    githubFileStore.tree.value = [
      { path: '.kh/inbox.todos.md', mode: '', type: 'blob', sha: '', url: '' },
    ];
    expect(repoReady()).toBe(false);
    githubFileStore.loadedRepo.value = 'me/kb';
    expect(await ready).toBe(true);

    githubFileStore.loadedRepo.value = null;
    vi.useFakeTimers();
    const late = whenRepoReady(1000);
    vi.advanceTimersByTime(1000);
    expect(await late).toBe(false);
  });
});

describe('githubRepoFiles adapter', () => {
  afterEach(() => {
    githubFileStore.tree.value = [];
    githubFileStore.openFiles.value = {};
    githubFileStore.dirtyFiles.value = new Set();
    githubFileStore.error.value = null;
    vi.restoreAllMocks();
  });

  it('updates open files, creates missing ones and lists todo files', async () => {
    githubFileStore.tree.value = [
      { path: '.kh/a.todos.md', mode: '', type: 'blob', sha: '1', url: '' },
      { path: 'notes.md', mode: '', type: 'blob', sha: '2', url: '' },
    ];
    githubFileStore.openFiles.value = { '.kh/a.todos.md': { content: 'old', sha: '1' } };
    const save = vi.spyOn(githubFileStore, 'saveFile').mockImplementation(async (path) => {
      githubFileStore.dirtyFiles.value = new Set();
      void path;
    });
    const flush = vi.spyOn(githubFileStore, 'flushPendingWrites').mockResolvedValue(undefined);
    const create = vi.spyOn(githubFileStore, 'createFile').mockResolvedValue(undefined);

    expect(githubRepoFiles.todoPaths()).toEqual(['.kh/a.todos.md']);
    expect(await githubRepoFiles.read('.kh/a.todos.md')).toBe('old');
    expect(await githubRepoFiles.read('missing.md')).toBeNull();
    await githubRepoFiles.write('.kh/a.todos.md', 'new');
    expect(githubFileStore.openFiles.value['.kh/a.todos.md']?.content).toBe('new');
    // Optimistic: the dirty copy is persisted; the outbox pushes it later.
    expect(flush).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await githubRepoFiles.write('.kh/b.todos.md', 'x');
    expect(create).toHaveBeenCalledWith('.kh/b.todos.md', 'x');
  });

  it('does not throw when the push is merely queued (offline)', async () => {
    githubFileStore.openFiles.value = { 'a.md': { content: 'x', sha: '1' } };
    const save = vi.spyOn(githubFileStore, 'saveFile');
    vi.spyOn(githubFileStore, 'flushPendingWrites').mockResolvedValue(undefined);
    await expect(githubRepoFiles.write('a.md', 'y')).resolves.toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    expect(githubFileStore.openFiles.value['a.md']?.content).toBe('y');
  });
});

const INBOX = [
  '---',
  'milestones:',
  '  - id: v1',
  '    name: Version 1',
  '    dueDate: 2026-10-01',
  '---',
  '',
  '- [ ] write docs #docs !v1',
  '- [>] build ui #ui !v1',
  '- [x] ship alpha #ui !v1',
  '',
].join('\n');

const WORK = '- [ ] review pr #ui\n- [-] old idea #misc\n';

describe('KanbanBoardController', () => {
  const board = async (files = mem({ '.kh/inbox.todos.md': INBOX, 'work.todos.md': WORK })) => {
    const c = new KanbanBoardController(files);
    await c.load();
    return { c, files };
  };

  it('aggregates files into status columns and always includes the inbox', async () => {
    const { c } = await board();
    const cols = c.columns();
    expect(cols.backlog.map((b) => b.item.text)).toEqual(['write docs', 'review pr']);
    expect(cols['in-progress']).toHaveLength(1);
    expect(cols.done).toHaveLength(1);
    expect(cols.rejected[0]?.filePath).toBe('work.todos.md');

    const empty = await board(mem({ 'work.todos.md': WORK }));
    expect(empty.c.paths).toEqual(['work.todos.md']);
    // The inbox is listed as a target even though it has no file yet.
    await empty.c.moveTodo('work.todos.md', 0, '.kh/inbox.todos.md');
    expect(empty.files.exists('.kh/inbox.todos.md')).toBe(true);
  });

  it('filters by tag, milestone, search and file', async () => {
    const { c } = await board();
    c.setFilter({ tag: 'UI' });
    expect(
      Object.values(c.columns())
        .flat()
        .map((b) => b.item.text)
        .sort(),
    ).toEqual(['build ui', 'review pr', 'ship alpha']);
    c.setFilter({ milestoneId: 'v1' });
    expect(Object.values(c.columns()).flat()).toHaveLength(3);
    c.setFilter({ search: 'docs' });
    expect(Object.values(c.columns()).flat()).toHaveLength(1);
    c.setFilter({ files: ['work.todos.md'] });
    expect(Object.values(c.columns()).flat()).toHaveLength(2);
    expect(c.tags).toEqual(['docs', 'misc', 'ui']);
  });

  it('pins a deep-link milestone or item that survives setFilter', async () => {
    const { c } = await board();
    const all = () => Object.values(c.columns()).flat();
    c.pin({ milestoneId: 'v1' });
    c.setFilter({ tag: 'ui' });
    expect(
      all()
        .map((b) => b.item.text)
        .sort(),
    ).toEqual(['build ui', 'ship alpha']);
    c.setFilter({});
    expect(all()).toHaveLength(3);
    const id = all()[0]?.item.id ?? '';
    c.pin({ itemId: id });
    // Ids are per file (`item-<n>`), so the same id can match in more than one file.
    expect(all().length).toBeGreaterThan(0);
    expect(all().every((b) => b.item.id === id)).toBe(true);
    c.pin({ itemId: '.kh/inbox.todos.md#0' });
    expect(all().map((b) => b.filePath)).toEqual(['.kh/inbox.todos.md']);
    c.pin({});
    expect(all()).toHaveLength(5);
  });

  it('transitions status and persists it', async () => {
    const { c, files } = await board();
    expect(await c.setStatus('.kh/inbox.todos.md', 0, 'in-progress')).toEqual({ ok: true });
    expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items[0]?.status).toBe(
      'in-progress',
    );
    expect(c.columns()['in-progress']).toHaveLength(2);
    for (const status of ['done', 'rejected', 'backlog'] as const) {
      expect(await c.setStatus('.kh/inbox.todos.md', 0, status)).toEqual({ ok: true });
    }
    expect(await c.setStatus('.kh/inbox.todos.md', 99, 'done')).toEqual({
      ok: false,
      error: 'Todo not found',
    });
  });

  it('leaves the board unchanged when a save fails', async () => {
    const { c, files } = await board();
    files.failWrites.add('work.todos.md');
    expect(await c.setStatus('work.todos.md', 0, 'done')).toMatchObject({ ok: false });
    expect(c.columns().backlog.some((b) => b.item.text === 'review pr')).toBe(true);
  });

  it('adds todos, edits text and assigns milestones', async () => {
    const { c, files } = await board();
    await c.addTodo('work.todos.md', 'plan #q4', ['ops'], 'v1');
    const added = parseTodos(files.store.get('work.todos.md') ?? '').items.at(-1);
    expect(added).toMatchObject({ text: 'plan', tags: ['ops', 'q4'], milestoneId: 'v1' });
    await c.editText('work.todos.md', 0, 'review the pr');
    await c.assignMilestone('work.todos.md', 0, 'v1');
    expect(parseTodos(files.store.get('work.todos.md') ?? '').items[0]).toMatchObject({
      text: 'review the pr',
      milestoneId: 'v1',
    });
    expect(await c.addTodo('work.todos.md', '  ')).toMatchObject({ ok: false });
  });

  it('moves a todo between files, keeping its metadata, and writes the target first', async () => {
    const { c, files } = await board();
    expect(await c.moveTodo('.kh/inbox.todos.md', 1, 'work.todos.md')).toEqual({ ok: true });
    expect(files.writes.slice(-2)).toEqual(['work.todos.md', '.kh/inbox.todos.md']);
    const moved = parseTodos(files.store.get('work.todos.md') ?? '').items.at(-1);
    expect(moved).toMatchObject({ text: 'build ui', status: 'in-progress', milestoneId: 'v1' });
    expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items).toHaveLength(2);
    expect(await c.moveTodo('work.todos.md', 50, '.kh/inbox.todos.md')).toMatchObject({
      ok: false,
    });
    expect(await c.moveTodo('work.todos.md', 0, 'work.todos.md')).toEqual({ ok: true });
  });

  it('keeps the source intact when writing the target fails', async () => {
    const { c, files } = await board();
    files.failWrites.add('work.todos.md');
    expect(await c.moveTodo('.kh/inbox.todos.md', 0, 'work.todos.md')).toMatchObject({ ok: false });
    expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items).toHaveLength(3);
  });

  it('creates, updates and removes milestones', async () => {
    const { c, files } = await board();
    expect(await c.addMilestone('Beta Launch', '2026-12-01', 'work.todos.md')).toEqual({
      ok: true,
    });
    expect(c.milestones.map((m) => m.id)).toEqual(['v1', 'beta-launch']);
    expect(await c.addMilestone('beta launch')).toMatchObject({ ok: false });
    expect(await c.addMilestone('  ')).toMatchObject({ ok: false });

    await c.updateMilestone('beta-launch', { name: 'Beta', dueDate: '2026-11-01' });
    expect(parseTodos(files.store.get('work.todos.md') ?? '').milestones[0]).toEqual({
      id: 'beta-launch',
      name: 'Beta',
      dueDate: '2026-11-01',
    });
    expect(await c.updateMilestone('nope', { name: 'x' })).toMatchObject({ ok: false });

    await c.removeMilestone('v1');
    const inbox = parseTodos(files.store.get('.kh/inbox.todos.md') ?? '');
    expect(inbox.milestones).toEqual([]);
    expect(inbox.items.every((i) => i.milestoneId === undefined)).toBe(true);
    expect(await c.removeMilestone('v1')).toMatchObject({ ok: false });
  });
});

describe('TodoAnalyticsController', () => {
  const ms = (iso: string) => new Date(iso).getTime();
  const todos = [
    '- [x] a #ui !v1',
    `::updated:: ${ms('2026-09-08T12:00:00')}`,
    '- [x] b #ui',
    `::updated:: ${ms('2026-09-09T12:00:00')}`,
    '- [x] c #ops !v1',
    `::updated:: ${ms('2026-09-23T12:00:00')}`,
    '- [x] old #ops',
    `::updated:: ${ms('2025-01-01T12:00:00')}`,
    '- [-] d #ui',
    '- [ ] e !v1',
    '',
  ].join('\n');

  const analytics = async () => {
    const files = mem({
      '.kh/inbox.todos.md': `---\nmilestones:\n  - id: v1\n    name: V1\n---\n\n${todos}`,
    });
    const c = new TodoAnalyticsController(files, () => NOW);
    await c.load();
    return c;
  };

  it('summarises statuses and completion rate', async () => {
    const s = (await analytics()).summary();
    expect(s.total).toBe(6);
    expect(s.byStatus).toEqual({ backlog: 1, 'in-progress': 0, done: 4, rejected: 1 });
    expect(s.completionRate).toBe(80);
    const empty = new TodoAnalyticsController(mem(), () => NOW);
    await empty.load();
    expect(empty.summary().completionRate).toBeNull();
  });

  it('computes weekly velocity with zero-filled gaps and time frames', async () => {
    const c = await analytics();
    const week = (iso: string) => isoWeekLabel(new Date(iso));
    expect(c.velocity('4W')).toEqual([
      { week: week('2026-09-08T12:00:00'), count: 2 },
      { week: week('2026-09-15T12:00:00'), count: 0 },
      { week: week('2026-09-22T12:00:00'), count: 1 },
    ]);
    expect(c.velocity('ALL')[0]).toEqual({ week: week('2025-01-01T12:00:00'), count: 1 });
    expect(c.velocity('ALL').length).toBeGreaterThan(50);
    const none = new TodoAnalyticsController(mem(), () => NOW);
    await none.load();
    expect(none.velocity()).toEqual([]);
  });

  it('labels ISO weeks across year boundaries', () => {
    expect(isoWeekLabel(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(isoWeekLabel(new Date(2027, 0, 1))).toBe('2026-W53');
  });

  it('ranks tags and limits the list', async () => {
    const c = await analytics();
    expect(c.tagDistribution()).toEqual([
      { tag: 'ui', count: 3 },
      { tag: 'ops', count: 2 },
    ]);
    expect(c.tagDistribution(1)).toHaveLength(1);
  });

  it('reports milestone progress', async () => {
    const [p] = (await analytics()).milestoneProgress();
    expect(p).toMatchObject({ total: 3, donePct: 67 });
    expect(p?.byStatus).toEqual({ backlog: 1, 'in-progress': 0, done: 2, rejected: 0 });
  });
});
