import { parseTodos } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  addMilestoneTo,
  addTodoTask,
  deleteMilestone,
  editMilestone,
  filterByTag,
  migrateTodos,
  normalizeTag,
  promptFilePath,
  promptFileStem,
  promptText,
  setTodoDueAt,
  setTodoMilestoneAt,
  setTodoPromptAt,
  setTodoStatusAt,
  todosView,
} from './todos-tile.js';

const now = new Date(2026, 10, 8, 12, 0, 0);
const text = (r: { ok: boolean; content?: string; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.content as string;
};
const base = text(addMilestoneTo('', 'Launch', '2026-12-01', now));
const msId = parseTodos(base).milestones[0]?.id as string;

describe('add with details', () => {
  it('adds tags, milestone, due and repeat in one write', () => {
    const out = text(
      addTodoTask(base, 'Pay rent', now, ['Home Life', '#bills', 'bills'], {
        milestoneId: msId,
        due: { date: '2026-11-10', time: '09:00' },
        repeat: { unit: 'month', interval: 1, day: 10 },
      }),
    );
    expect(parseTodos(out).items[0]).toMatchObject({
      text: 'Pay rent',
      tags: ['home-life', 'bills'],
      milestoneId: msId,
      dueDate: '2026-11-10',
      dueTime: '09:00',
      repeat: { unit: 'month', interval: 1 },
    });
  });

  it('rejects blank text, unknown milestones and bad dates', () => {
    expect(addTodoTask(base, ' ', now).ok).toBe(false);
    expect(addTodoTask(base, 'x', now, [], { milestoneId: 'nope' }).ok).toBe(false);
    expect(addTodoTask(base, 'x', now, [], { due: { date: '2026-13-45' } }).ok).toBe(false);
  });

  it('normalizes tags', () => {
    expect(normalizeTag('  #Deep Work! ')).toBe('deep-work');
    expect(normalizeTag('###')).toBe('');
  });
});

describe('view, filter and status', () => {
  const content = text(addTodoTask(text(addTodoTask(base, 'A', now, ['x'])), 'B', now, ['y']));

  it('lists tags, milestones and filters rows by tag', () => {
    const view = todosView(content, now);
    expect(view.tags).toEqual(['x', 'y']);
    expect(view.milestones).toHaveLength(1);
    expect(filterByTag(view.rows, 'y').map((r) => r.text)).toEqual(['B']);
    expect(filterByTag(view.rows, null)).toHaveLength(2);
  });

  it('hides old completed todos but counts them, and can show all', () => {
    const done = text(setTodoStatusAt(content, 0, 'done', now));
    const later = new Date(now.getTime() + 2 * 3_600_000);
    expect(todosView(done, later).hiddenCount).toBe(1);
    const all = todosView(done, later, Number.POSITIVE_INFINITY);
    expect(all.hiddenCount).toBe(0);
    expect(all.rows).toHaveLength(2);
  });

  it('sets a status directly and rejects unknown tasks', () => {
    const started = text(setTodoStatusAt(content, 1, 'in-progress', now));
    expect(todosView(started, now).rows[1]?.status).toBe('in-progress');
    expect(setTodoStatusAt(content, 9, 'done', now).ok).toBe(false);
  });

  it('sets milestone and due on an existing task', () => {
    const withMs = text(setTodoMilestoneAt(content, 0, msId));
    expect(todosView(withMs, now).rows[0]).toMatchObject({
      milestone: 'Launch',
      milestoneId: msId,
    });
    expect(
      todosView(text(setTodoMilestoneAt(withMs, 0, undefined)), now).rows[0]?.milestoneId,
    ).toBe(undefined);
    expect(setTodoMilestoneAt(content, 0, 'nope').ok).toBe(false);
    const due = text(
      setTodoDueAt(content, 0, { date: '2026-11-09' }, { unit: 'day', interval: 1 }),
    );
    expect(todosView(due, now).rows[0]).toMatchObject({
      dueDate: '2026-11-09',
      repeat: { unit: 'day' },
    });
    expect(todosView(text(setTodoDueAt(due, 0, undefined)), now).rows[0]?.repeat).toBeUndefined();
    expect(setTodoDueAt(content, 9, { date: '2026-11-09' }).ok).toBe(false);
  });
});

describe('milestones', () => {
  it('adds with unique ids, renames, moves dates, and deleting unassigns tasks', () => {
    const two = text(addMilestoneTo(base, 'Launch', undefined, now));
    expect(new Set(parseTodos(two).milestones.map((m) => m.id)).size).toBe(2);
    expect(addMilestoneTo(base, ' ', undefined, now).ok).toBe(false);
    expect(addMilestoneTo(base, 'x', 'soon', now).ok).toBe(false);

    const renamed = text(editMilestone(base, msId, { name: ' Ship ', dueDate: null }));
    expect(parseTodos(renamed).milestones[0]).toMatchObject({ name: 'Ship' });
    expect(parseTodos(renamed).milestones[0]?.dueDate).toBeUndefined();
    const moved = text(editMilestone(base, msId, { dueDate: '2027-01-02' }));
    expect(parseTodos(moved).milestones[0]?.dueDate).toBe('2027-01-02');
    expect(editMilestone(base, msId, { name: '' }).ok).toBe(false);
    expect(editMilestone(base, 'nope', { name: 'x' }).ok).toBe(false);

    const assigned = text(addTodoTask(base, 'T', now, [], { milestoneId: msId }));
    const removed = parseTodos(text(deleteMilestone(assigned, msId)));
    expect(removed.milestones).toHaveLength(0);
    expect(removed.items[0]?.milestoneId).toBeUndefined();
    expect(deleteMilestone(base, 'nope').ok).toBe(false);
  });
});

describe('prompts and migration', () => {
  const content = text(addTodoTask('', 'Write docs', now));

  it('saves, copies and clears a prompt', () => {
    const saved = text(setTodoPromptAt(content, 0, 'Line one\n\nLine two', ' docs/p.md '));
    const row = todosView(saved, now).rows[0];
    expect(row?.prompt).toEqual({ lines: ['Line one', 'Line two'], refFile: 'docs/p.md' });
    expect(promptText(row?.prompt)).toBe('Line one\nLine two\nref: docs/p.md');
    expect(promptText(undefined)).toBe('');
    const cleared = todosView(text(setTodoPromptAt(saved, 0, '  ', '')), now);
    expect(cleared.rows[0]?.prompt).toBeUndefined();
    expect(setTodoPromptAt(content, 5, 'x', '').ok).toBe(false);
  });

  it('migrates a legacy file to the current format', () => {
    const legacy = '- [ ] old task #a\n';
    expect(todosView(migrateTodos(legacy), now).legacy).toBe(false);
    expect(todosView(content, now).legacy).toBe(false);
  });
});

describe('prompt files', () => {
  it('derives a stem and a path beside the todos file', () => {
    expect(promptFileStem('Plan the Launch!')).toBe('plan-the-launch');
    expect(promptFileStem('!!!')).toBe('prompt');
    expect(promptFilePath('.kh/a.todos.md', 'notes')).toBe('.kh/notes.md');
    expect(promptFilePath('a.todos.md', 'notes.md')).toBe('notes.md');
    expect(promptFilePath('a.todos.md', '  ')).toBeUndefined();
  });

  it('references the prompt file from the new task', () => {
    const out = text(addTodoTask('', 'Write', now, [], { promptFile: '.kh/write.md' }));
    expect(parseTodos(out).items[0]?.prompt?.refFile).toBe('.kh/write.md');
  });
});
