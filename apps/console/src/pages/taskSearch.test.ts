import type { TaskList } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { searchTaskRows } from './taskSearch';

const item = (id: string, text: string, tags: string[] = [], status = 'backlog') =>
  ({ id, text, tags, status }) as TaskList['items'][number];
const lists: TaskList[] = [
  { path: 'a', name: 'a', items: [item('0', 'Buy Milk', ['home']), item('1', 'Old', [], 'done')] },
  { path: 'b', name: 'b', items: [item('0', 'Call bank', ['Money'])] },
];

describe('searchTaskRows', () => {
  it('returns nothing for an empty term', () => {
    expect(searchTaskRows(lists, '  ')).toEqual([]);
  });
  it('matches title case-insensitively across lists, including done', () => {
    expect(searchTaskRows(lists, 'MILK').map((r) => r.item.text)).toEqual(['Buy Milk']);
    expect(searchTaskRows(lists, 'old').map((r) => r.item.text)).toEqual(['Old']);
  });
  it('matches tags', () => {
    expect(searchTaskRows(lists, 'money').map((r) => r.list.path)).toEqual(['b']);
  });
});
