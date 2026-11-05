import { describe, expect, it } from 'vitest';
import { applyWidgetTodoToggle, buildWidgetTodoSnapshot } from './widget-sync.js';

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
  const snap = buildWidgetTodoSnapshot(files, 'o/r', 'dev', NOW);

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
    expect(snap.counts).toEqual({ inbox: 2, inProgress: 1, backlog: 2, doneToday: 1 });
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
  const snap = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW);
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
