import { describe, expect, it } from 'vitest';
import { jumpStreams } from './stream-jump.js';

const s = ['.kh/home.todos.md', '.kh/work.todos.md', '.kh/Side.todos.md'].map((path) => ({ path }));
const name = (p: string) => p.slice(4).replace('.todos.md', '');

describe('jumpStreams', () => {
  it('filters by name, case-insensitively', () => {
    expect(jumpStreams(s, ' SI ', name, null).map((x) => x.path)).toEqual(['.kh/Side.todos.md']);
  });
  it('puts the last-used list first when not filtering', () => {
    expect(jumpStreams(s, '', name, '.kh/work.todos.md')[0]?.path).toBe('.kh/work.todos.md');
    expect(jumpStreams(s, '', name, 'gone')).toEqual(s);
  });
});
