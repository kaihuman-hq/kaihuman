import { describe, expect, it } from 'vitest';
import { parseTagInput } from './templates-tile.js';

describe('parseTagInput', () => {
  it('splits on spaces and commas, strips # and dedupes', () => {
    expect(parseTagInput('#work, ops  work,')).toEqual(['work', 'ops']);
  });
  it('drops characters the file format cannot carry', () => {
    expect(parseTagInput('a/b ok ## ')).toEqual(['ok']);
  });
  it('is empty for blank input', () => {
    expect(parseTagInput('  ')).toEqual([]);
  });
});
