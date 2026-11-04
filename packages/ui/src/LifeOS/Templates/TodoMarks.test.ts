import { describe, expect, it } from 'vitest';
import { fileColorHex, priorityMark } from './TodoMarks';

describe('priorityMark', () => {
  it('maps each priority to 1–3 bangs', () => {
    expect(priorityMark('high').glyph).toBe('!');
    expect(priorityMark('super-high').glyph).toBe('!!');
    expect(priorityMark('ultra-high').glyph).toBe('!!!');
  });
  it('has a placeholder when unset', () => {
    expect(priorityMark(undefined).glyph).toBe('!');
    expect(priorityMark(undefined).title).toMatch(/set priority/i);
  });
});

describe('fileColorHex', () => {
  it('returns the hex for a set color and undefined otherwise', () => {
    expect(fileColorHex({ color: 'red' })).toBe('#ef4444');
    expect(fileColorHex({})).toBeUndefined();
  });
});
