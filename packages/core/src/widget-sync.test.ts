import { describe, expect, it } from 'vitest';
import {
  applyWidgetCapture,
  applyWidgetTodoMove,
  applyWidgetTodoToggle,
  buildWidgetExtras,
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

describe('applyWidgetTodoMove', () => {
  const snap = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, { timeZone: 'UTC' });
  const later = new Date('2026-06-10T13:00:00Z');
  const idOf = (text: string) => snap.items.find((i) => i.text === text)?.id ?? '';

  it('moves backlog to in-progress and stamps updatedAt', () => {
    const res = applyWidgetTodoMove(snap, idOf('plain backlog'), 'in-progress', later);
    expect(res?.updatedContent).toContain('- [>] plain backlog');
    expect(res?.updatedContent).toContain(`::updated:: ${later.getTime()}`);
    expect(res?.snapshot.counts.inProgress).toBe(2);
  });

  it('moves in-progress back to backlog', () => {
    const res = applyWidgetTodoMove(snap, idOf('working'), 'backlog', later);
    expect(res?.updatedContent).toContain('- [ ] working');
    expect(res?.baseSha).toBe('p1');
  });

  it('is a no-op for the same status, unknown ids and drifted items', () => {
    expect(applyWidgetTodoMove(snap, idOf('working'), 'in-progress', later)).toBeNull();
    expect(applyWidgetTodoMove(snap, 'nope', 'done', later)).toBeNull();
    const drift = { ...snap, items: snap.items.map((i) => ({ ...i, text: `${i.text}!` })) };
    expect(applyWidgetTodoMove(drift, drift.items[0]?.id ?? '', 'done', later)).toBeNull();
  });

  it('carries ideas, cards, habits and options through a move', () => {
    const extras = {
      ideas: { byStatus: { seed: 1 }, hot: [] },
      cards: [{ path: '.kh/wiki/a.md', title: 'A', excerpt: 'x', tags: [] }],
      habits: [{ path: '.kh/run.habit.csv', name: 'Run', doneToday: false, streakDays: 2 }],
    };
    const base = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, {
      timeZone: 'UTC',
      knowledgeInbox: 4,
      weeklyGoal: 7,
      lockScreenText: false,
      ...extras,
    });
    const res = applyWidgetTodoMove(base, idOf('plain backlog'), 'done', later);
    expect(res?.snapshot).toMatchObject({
      ...extras,
      counts: { knowledgeInbox: 4 },
      stats: { weeklyGoal: 7 },
      privacy: { lockScreenText: false },
    });
  });
});

describe('applyWidgetCapture', () => {
  const snap = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, { timeZone: 'UTC' });

  it('appends an open todo to the inbox with the current sha as base', () => {
    const res = applyWidgetCapture(snap, '  buy milk #home ', NOW);
    expect(res?.updatedFilePath).toBe('.kh/inbox.todos.md');
    expect(res?.baseSha).toBe('i1');
    expect(res?.updatedContent).toContain('- [ ] inbox one');
    expect(res?.updatedContent).toContain('- [ ] buy milk #home');
    expect(res?.snapshot.counts.inbox).toBe(3);
  });

  it('creates the inbox with an empty base sha when absent', () => {
    const { '.kh/inbox.todos.md': _, ...rest } = files;
    const bare = buildWidgetTodoSnapshot(rest, 'o/r', 'main', NOW, { timeZone: 'UTC' });
    const res = applyWidgetCapture(bare, 'first', NOW);
    expect(res?.baseSha).toBe('');
    expect(res?.updatedContent).toContain('- [ ] first');
  });

  it('rejects empty text', () => {
    expect(applyWidgetCapture(snap, '   ', NOW)).toBeNull();
    expect(applyWidgetCapture(snap, '#only', NOW)).toBeNull();
  });
});

describe('buildWidgetExtras', () => {
  const idea = (title: string, status: string, updated: string) => ({
    content: `---\ntitle: ${title}\nstatus: ${status}\nupdated: ${updated}\n---\n\n## Summary\n\nx\n`,
  });
  const csv = (days: string[]) => ({
    content: `iso date;goal reached\n${days.map((d) => `${d};x`).join('\n')}`,
  });
  const run = (f: Record<string, { content: string }>, at = NOW) => buildWidgetExtras(f, at, 'UTC');

  it('is minimal and omits sections when there is nothing', () => {
    const extras = run({ '.kh/inbox.todos.md': { content: '' } });
    expect(extras).toEqual({ knowledgeInbox: 0 });
  });

  it('counts raw captures in either folder and ignores .enc', () => {
    expect(
      run({ '.kh/raw/a.md': { content: '' }, '.kh/raw/b.md.enc': { content: '' } }).knowledgeInbox,
    ).toBe(1);
    expect(
      run({ '.lifeos/raw/a.md': { content: '' }, '.lifeos/x.todos.md': { content: '' } })
        .knowledgeInbox,
    ).toBe(1);
  });

  it('summarises ideas: byStatus over all, hot = 3 open by recency', () => {
    const extras = run({
      '.kh/ideas/idea-a.md': idea('A', 'seed', '2026-06-09'),
      '.kh/ideas/idea-b.md': idea('B', 'exploring', '2026-06-10'),
      '.kh/ideas/idea-c.md': idea('C', 'committed', '2026-05-01'),
      '.kh/ideas/idea-d.md': idea('D', 'seed', '2026-06-01'),
      '.kh/ideas/idea-e.md': idea('E', 'shipped', '2026-06-10'),
      '.kh/ideas/e.md.enc': idea('Z', 'seed', '2026-06-10'),
    });
    expect(extras.ideas?.byStatus).toEqual({ seed: 2, exploring: 1, committed: 1, shipped: 1 });
    expect(extras.ideas?.hot.map((h) => h.slug)).toEqual(['idea-b', 'idea-a', 'idea-d']);
    expect(extras.ideas?.hot[0]).toEqual({ slug: 'idea-b', title: 'B', level: 'hot' });
  });

  const wiki = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        `.kh/wiki/p${String(i).padStart(2, '0')}.md`,
        { content: `# P${i}\n\nbody ${i}` },
      ]),
    );

  it('builds cards: title, stripped excerpt, tags', () => {
    const extras = run({
      '.kh/wiki/x.md': {
        content:
          '---\ntags: [a, "b c"]\n---\n# The X\n\nSome **bold** [link](http://u) and `code`.\n\n- item\n',
      },
      '.kh/wiki/no-heading.md': { content: 'plain\n\ntags:\n  - nope' },
    });
    const x = extras.cards?.find((c) => c.path === '.kh/wiki/x.md');
    expect(x).toEqual({
      path: '.kh/wiki/x.md',
      title: 'The X',
      excerpt: 'Some bold link and code. item',
      tags: ['a', 'b c'],
    });
    expect(extras.cards?.find((c) => c.path.endsWith('no-heading.md'))?.title).toBe('no-heading');
  });

  it('block-list tags and 280-char excerpt with ellipsis', () => {
    const extras = run({
      '.kh/wiki/l.md': {
        content: `---\ntags:\n  - one\n  - two\n---\n# L\n\n${'word '.repeat(100)}`,
      },
    });
    const card = extras.cards?.[0];
    expect(card?.tags).toEqual(['one', 'two']);
    expect(card?.excerpt.length).toBe(280);
    expect(card?.excerpt.endsWith('…')).toBe(true);
  });

  it('caps at 20 cards, stable within a day, rotating across days', () => {
    const f = wiki(40);
    const a = run(f, new Date('2026-06-10T01:00:00Z'));
    const same = run(f, new Date('2026-06-10T22:00:00Z'));
    const next = run(f, new Date('2026-06-11T01:00:00Z'));
    expect(a.cards).toHaveLength(20);
    expect(same.cards).toEqual(a.cards);
    expect(next.cards?.map((c) => c.path)).not.toEqual(a.cards?.map((c) => c.path));
  });

  it('day boundary follows the time zone', () => {
    const f = wiki(40);
    const at = new Date('2026-06-10T23:30:00Z');
    const prague = buildWidgetExtras(f, at, 'Europe/Prague'); // already 06-11 locally
    expect(prague.cards).toEqual(run(f, new Date('2026-06-11T12:00:00Z')).cards);
  });

  it('excludes .enc wiki pages', () => {
    expect(run({ '.kh/wiki/a.md.enc': { content: '# A' } }).cards).toBeUndefined();
  });

  it('computes habits with local-day doneToday and streak', () => {
    const extras = run({
      '.kh/morning-run.habit.csv': csv(['2026-06-08', '2026-06-09', '2026-06-10']),
      '.kh/read.habit.csv': csv(['2026-06-08', '2026-06-09']),
      '.kh/old.habit.csv': csv(['2026-06-01']),
    });
    expect(extras.habits).toEqual([
      { path: '.kh/morning-run.habit.csv', name: 'Morning run', doneToday: true, streakDays: 3 },
      { path: '.kh/old.habit.csv', name: 'Old', doneToday: false, streakDays: 0 },
      { path: '.kh/read.habit.csv', name: 'Read', doneToday: false, streakDays: 2 },
    ]);
  });

  it('uses the zone for doneToday (23:30Z is already tomorrow in Prague)', () => {
    const f = { '.kh/r.habit.csv': csv(['2026-06-11']) };
    expect(
      buildWidgetExtras(f, new Date('2026-06-10T23:30:00Z'), 'Europe/Prague').habits?.[0]
        ?.doneToday,
    ).toBe(true);
    expect(run(f, new Date('2026-06-10T23:30:00Z')).habits?.[0]?.doneToday).toBe(false);
  });

  it('feeds the snapshot, which still keeps only todo files', () => {
    const extras = run({ '.kh/ideas/idea-a.md': idea('A', 'seed', '2026-06-10'), ...wiki(2) });
    const snap = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, { timeZone: 'UTC', ...extras });
    expect(snap.ideas).toEqual(extras.ideas);
    expect(snap.cards).toEqual(extras.cards);
    expect('habits' in snap).toBe(false);
    expect(Object.keys(snap.files).sort()).toEqual(Object.keys(files).sort());
  });
});
