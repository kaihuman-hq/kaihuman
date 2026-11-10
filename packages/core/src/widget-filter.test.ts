import { describe, expect, it } from 'vitest';
import {
  applyWidgetFilter,
  areaOf,
  matchesWidgetFilter,
  parseWidgetFilter,
} from './widget-filter.js';
import { buildWidgetTodoSnapshot } from './widget-sync.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const file = (content: string) => ({ sha: 's', content });
const files = {
  '.kh/work.todos.md': file(
    [
      '---',
      'milestones:',
      '  - id: v1',
      '    name: Launch',
      '---',
      '',
      '- [ ] ship #app !v1',
      '- [>] review #app',
      '- [ ] late #team',
      '::due:: 2026-11-01',
      '',
    ].join('\n'),
  ),
  '.kh/home.todos.md': file('- [ ] laundry #chores\n- [ ] gym #health\n'),
  '.kh/inbox.todos.md': file('- [ ] inbox #app\n'),
};
const snap = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, { timeZone: 'UTC' });

describe('parseWidgetFilter', () => {
  it('normalizes tags, drops empties and accepts JSON text', () => {
    expect(parseWidgetFilter({ tags: ['#work', ' work ', 3], area: ' ', label: 'Work' })).toEqual({
      tags: ['work'],
      label: 'Work',
    });
    expect(parseWidgetFilter('{"board":"Launch"}')).toEqual({ board: 'Launch' });
  });
  it('returns undefined for no dimensions or junk', () => {
    expect(parseWidgetFilter({})).toBeUndefined();
    expect(parseWidgetFilter('nope')).toBeUndefined();
    expect(parseWidgetFilter(null)).toBeUndefined();
  });
});

describe('matchesWidgetFilter', () => {
  const item = {
    tags: ['App'],
    filePath: '.kh/work.todos.md',
    milestoneId: 'v1',
    milestoneName: 'Launch',
  };
  it('needs every set dimension, case-insensitively', () => {
    expect(matchesWidgetFilter(item, undefined)).toBe(true);
    expect(matchesWidgetFilter(item, { tags: ['x', 'app'] })).toBe(true);
    expect(matchesWidgetFilter(item, { tags: ['x'] })).toBe(false);
    expect(matchesWidgetFilter(item, { area: 'WORK', board: 'launch' })).toBe(true);
    expect(matchesWidgetFilter(item, { area: 'home' })).toBe(false);
    expect(matchesWidgetFilter(item, { board: 'v1' })).toBe(true);
  });
  it('derives the area from the todo file name', () => {
    expect(areaOf('.kh/work.todos.md')).toBe('work');
  });
});

describe('applyWidgetFilter', () => {
  it('is a no-op without a filter', () => {
    expect(applyWidgetFilter(snap)).toBe(snap);
  });
  it('filters items, today list and counts but keeps the full set in the source snapshot', () => {
    const out = applyWidgetFilter(snap, { area: 'work' });
    expect(out.items.map((i) => i.text).sort()).toEqual(['late', 'review', 'ship']);
    expect(out.todayItems.map((i) => i.text)).toEqual(['late', 'review']);
    expect(out.counts).toMatchObject({ inProgress: 1, inbox: 0, backlog: 2 });
    expect(out.todayCounts).toMatchObject({ left: 2, overdue: 1 });
    expect(out.filter).toEqual({ area: 'work' });
    expect(snap.items).toHaveLength(6);
  });
  it('a snapshot carries the filter it was built with', () => {
    const built = buildWidgetTodoSnapshot(files, 'o/r', 'main', NOW, {
      timeZone: 'UTC',
      filter: { tags: ['app'] },
    });
    expect(
      applyWidgetFilter(built)
        .items.map((i) => i.text)
        .sort(),
    ).toEqual(['inbox', 'review', 'ship']);
  });
});
