import { describe, expect, it } from 'vitest';
import {
  applyWidgetTodoToggle,
  buildWidgetTodoSnapshot,
  WIDGET_SCHEMA_VERSION,
} from './widget-sync.js';

const NOW = new Date('2026-06-10T12:00:00Z');
const file = (content: string, sha = 'sha') => ({ content, sha });

const files = {
  '.kh/projects.todos.md': file(
    [
      '---',
      'milestones:',
      '  - id: v1',
      '    name: Launch',
      '    dueDate: 2099-01-01',
      '---',
      '',
      '- [ ] plain backlog #misc',
      '- [ ] milestone backlog #app !v1',
      '- [>] working #app',
      `- [x] done today`,
      `::updated:: ${NOW.getTime() - 1000}`,
      `- [x] done long ago`,
      `::updated:: ${NOW.getTime() - 3 * 86400000}`,
      '- [-] rejected',
      '',
    ].join('\n'),
    'p1',
  ),
  '.kh/inbox.todos.md': file('- [ ] inbox one\n- [ ] inbox two\n', 'i1'),
  '.kh/notes.md': file('- [ ] not a todo file'),
};

describe('buildWidgetTodoSnapshot', () => {
  const snap = buildWidgetTodoSnapshot(files, 'o/r', 'dev', NOW, { timeZone: 'UTC' });

  it('prioritizes in-progress, then inbox, then milestone backlog, then the rest', () => {
    expect(snap.items.map((i) => i.text)).toEqual([
      'working',
      'inbox one',
      'inbox two',
      'milestone backlog',
      'plain backlog',
    ]);
    expect(snap.items[0]?.id).toBe('.kh/projects.todos.md#2');
  });

  it('counts open items and items done today', () => {
    expect(snap.counts).toMatchObject({ inbox: 2, inProgress: 1, backlog: 2, doneToday: 1 });
  });

  it('extracts the upcoming milestone and enriches items', () => {
    expect(snap.upcomingMilestone).toEqual({ id: 'v1', name: 'Launch', dueDate: '2099-01-01' });
    expect(snap.items.find((i) => i.text === 'milestone backlog')?.milestoneName).toBe('Launch');
  });

  it('records repo, branch, folder and only keeps raw files it was given', () => {
    expect(snap).toMatchObject({ repoFullName: 'o/r', branch: 'dev', appFolder: '.kh' });
    expect(snap.files).toBe(files);
  });

  it('falls back to .lifeos and defaults the branch', () => {
    const s = buildWidgetTodoSnapshot({ '.lifeos/inbox.todos.md': file('- [ ] a') }, 'o/r');
    expect(s.appFolder).toBe('.lifeos');
    expect(s.branch).toBe('main');
    expect(s.counts.inbox).toBe(1);
  });
});

describe('applyWidgetTodoToggle', () => {
  const snap = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, { timeZone: 'UTC' });
  const later = new Date('2026-06-10T13:00:00Z');

  it.each([
    ['in-progress', 'working'],
    ['backlog', 'plain backlog'],
  ])('moves a %s item to done with ::updated:: metadata', (_s, text) => {
    const id = snap.items.find((i) => i.text === text)?.id ?? '';
    const res = applyWidgetTodoToggle(snap, id, later);
    expect(res?.updatedFilePath).toBe('.kh/projects.todos.md');
    expect(res?.baseSha).toBe('p1');
    expect(res?.updatedContent).toContain(`- [x] ${text}`);
    expect(res?.updatedContent).toContain(`::updated:: ${later.getTime()}`);
    expect(res?.snapshot.items.some((i) => i.text === text)).toBe(false);
    expect(res?.snapshot.counts.doneToday).toBe(2);
    expect(res?.snapshot.files['.kh/projects.todos.md']?.content).toBe(res?.updatedContent);
  });

  it('leaves other files and items untouched', () => {
    const id = snap.items.find((i) => i.text === 'inbox one')?.id ?? '';
    const res = applyWidgetTodoToggle(snap, id, later);
    expect(res?.snapshot.files['.kh/projects.todos.md']).toBe(snap.files['.kh/projects.todos.md']);
    expect(res?.updatedContent).toContain('- [ ] inbox two');
  });

  it('returns null for unknown ids and stale items', () => {
    expect(applyWidgetTodoToggle(snap, 'nope', later)).toBeNull();
    const stale = {
      ...snap,
      items: snap.items.map((i) => ({ ...i, text: `${i.text} (old)` })),
    };
    expect(applyWidgetTodoToggle(stale, stale.items[0]?.id ?? '', later)).toBeNull();
  });
});

const done = (text: string, iso: string) =>
  `- [x] ${text}\n::updated:: ${new Date(iso).getTime()}\n`;

describe('local-day logic (regression: was UTC)', () => {
  const build = (content: string, now: string, timeZone: string) =>
    buildWidgetTodoSnapshot({ '.kh/a.todos.md': file(content) }, 'o/r', 'main', new Date(now), {
      timeZone,
    });

  it('Europe/Prague: 23:30 local yesterday is not today, 00:10 local is', () => {
    const content = done('late', '2026-06-10T21:30:00Z') + done('early', '2026-06-10T22:10:00Z');
    const s = build(content, '2026-06-10T22:30:00Z', 'Europe/Prague');
    expect(s.counts.doneToday).toBe(1);
    expect(s.stats.doneByDay).toEqual([0, 0, 1, 1, 0, 0, 0]);
  });

  it('America/Los_Angeles: UTC-tomorrow items still count as today', () => {
    // 2026-06-11T02:00Z is 19:00 on Jun 10 in LA; now is 20:00 Jun 10 local.
    const content = done('a', '2026-06-11T02:00:00Z') + done('b', '2026-06-10T06:30:00Z');
    const s = build(content, '2026-06-11T03:00:00Z', 'America/Los_Angeles');
    expect(s.counts.doneToday).toBe(1);
    expect(s.timeZone).toBe('America/Los_Angeles');
  });
});

describe('schema v2', () => {
  // Wed 2026-06-10 UTC; week starts Mon 2026-06-08.
  const content = [
    '---',
    'milestones:',
    '  - id: v1',
    '    name: Launch',
    '    dueDate: 2099-01-01',
    '  - id: v2',
    '    name: Later',
    '---',
    '',
    '- [ ] open a #b #a !v1',
    '- [>] open b #a !v1',
    '- [x] d1 !v1',
    `::updated:: ${new Date('2026-06-08T10:00:00Z').getTime()}`,
    '- [x] d2 !v1',
    `::updated:: ${new Date('2026-06-09T10:00:00Z').getTime()}`,
    '- [x] d3',
    `::updated:: ${new Date('2026-06-10T10:00:00Z').getTime()}`,
    '- [x] d4',
    `::updated:: ${new Date('2026-06-10T11:00:00Z').getTime()}`,
    '',
  ].join('\n');
  const f = { '.kh/a.todos.md': file(content) };
  const opts = { timeZone: 'UTC', knowledgeInbox: 3, weeklyGoal: 10, lockScreenText: false };
  const snap = buildWidgetTodoSnapshot(f, 'o/r', 'main', NOW, opts);

  it('exposes version, options, tags, milestones and stats', () => {
    expect(WIDGET_SCHEMA_VERSION).toBe(2);
    expect(snap.schemaVersion).toBe(2);
    expect(snap.counts.knowledgeInbox).toBe(3);
    expect(snap.counts.doneThisWeek).toBe(4);
    expect(snap.stats).toEqual({ doneByDay: [1, 1, 2, 0, 0, 0, 0], streakDays: 3, weeklyGoal: 10 });
    expect(snap.tags).toEqual(['a', 'b']);
    expect(snap.privacy).toEqual({ lockScreenText: false });
    expect(snap.milestones).toEqual([
      { id: 'v1', name: 'Launch', dueDate: '2099-01-01', open: 2, done: 2 },
      { id: 'v2', name: 'Later', open: 0, done: 0 },
    ]);
  });

  it('defaults options', () => {
    const s = buildWidgetTodoSnapshot(f, 'o/r', 'main', NOW);
    expect(s.privacy.lockScreenText).toBe(true);
    expect(s.counts.knowledgeInbox).toBe(0);
    expect(s.stats.weeklyGoal).toBeUndefined();
    expect(s.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('streak starts from yesterday when today is empty, and breaks on gaps', () => {
    const only = done('x', '2026-06-09T10:00:00Z') + done('y', '2026-06-08T10:00:00Z');
    const s = buildWidgetTodoSnapshot({ '.kh/a.todos.md': file(only) }, 'o/r', 'main', NOW, opts);
    expect(s.stats.streakDays).toBe(2);
    const gap = done('x', '2026-06-08T10:00:00Z');
    const g = buildWidgetTodoSnapshot({ '.kh/a.todos.md': file(gap) }, 'o/r', 'main', NOW, opts);
    expect(g.stats.streakDays).toBe(0);
  });

  it('streak counts across the week boundary', () => {
    const sunday = new Date('2026-06-14T12:00:00Z'); // Sunday; streak goes back into Fri/Sat
    const c =
      done('a', '2026-06-14T09:00:00Z') +
      done('b', '2026-06-13T09:00:00Z') +
      done('c', '2026-06-12T09:00:00Z');
    const s = buildWidgetTodoSnapshot({ '.kh/a.todos.md': file(c) }, 'o/r', 'main', sunday, opts);
    expect(s.stats.doneByDay).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(s.stats.streakDays).toBe(3);
  });

  it('keeps every v1 key with the same types', () => {
    const v1Keys = ['updatedAt', 'repoFullName', 'branch', 'appFolder', 'counts', 'items', 'files'];
    for (const k of v1Keys) expect(snap).toHaveProperty(k);
    expect(typeof snap.updatedAt).toBe('number');
    expect(Object.keys(snap.counts)).toEqual(
      expect.arrayContaining(['inbox', 'inProgress', 'backlog', 'doneToday']),
    );
    for (const k of ['inbox', 'inProgress', 'backlog', 'doneToday'] as const)
      expect(typeof snap.counts[k]).toBe('number');
    expect(snap.items[0]).toMatchObject({ id: expect.any(String), tags: expect.any(Array) });
  });

  it('sets item priority when present', () => {
    const s = buildWidgetTodoSnapshot(
      { '.kh/a.todos.md': file('- [ ] hot ^high\n') },
      'o/r',
      'main',
      NOW,
      opts,
    );
    expect(s.items[0]?.priority).toBe('high');
  });

  it('toggle preserves options', () => {
    const id = snap.items[0]?.id ?? '';
    const res = applyWidgetTodoToggle(snap, id, NOW);
    expect(res?.snapshot).toMatchObject({
      timeZone: 'UTC',
      privacy: { lockScreenText: false },
      counts: { knowledgeInbox: 3, doneThisWeek: 5 },
      stats: { weeklyGoal: 10 },
    });
  });
});
