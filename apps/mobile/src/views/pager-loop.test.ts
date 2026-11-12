import { describe, expect, it } from 'vitest';
import { isLooped, jumpSlot, pageAtOffset, pageOfSlot, slotCount, slotOf } from './pager-loop.js';

describe('pager-loop', () => {
  it('loops only with 2+ pages', () => {
    expect(isLooped(1)).toBe(false);
    expect(isLooped(2)).toBe(true);
    expect(slotCount(1)).toBe(1);
    expect(slotCount(3)).toBe(5);
  });

  it('maps pages to slots and back', () => {
    expect(slotOf(0, 3)).toBe(1);
    expect(slotOf(2, 3)).toBe(3);
    expect(slotOf(0, 1)).toBe(0);
    expect([0, 1, 2, 3, 4].map((s) => pageOfSlot(s, 3))).toEqual([2, 0, 1, 2, 0]);
    expect(pageOfSlot(5, 1)).toBe(0);
    expect(pageOfSlot(1, 0)).toBe(0);
  });

  it('derives the page from the live offset at the halfway point', () => {
    expect(pageAtOffset(0, 400, 3)).toBe(2); // leading clone of the last page
    expect(pageAtOffset(199, 400, 3)).toBe(2);
    expect(pageAtOffset(201, 400, 3)).toBe(0);
    expect(pageAtOffset(400, 400, 3)).toBe(0);
    expect(pageAtOffset(1200, 400, 3)).toBe(2);
    expect(pageAtOffset(1600, 400, 3)).toBe(0); // trailing clone of the first page
    expect(pageAtOffset(10, 0, 3)).toBe(0);
    expect(pageAtOffset(500, 400, 1)).toBe(0);
  });

  it('jumps off clones only', () => {
    expect(jumpSlot(0, 3)).toBe(3);
    expect(jumpSlot(4, 3)).toBe(1);
    expect(jumpSlot(1, 3)).toBeNull();
    expect(jumpSlot(3, 3)).toBeNull();
    expect(jumpSlot(0, 1)).toBeNull();
  });
});
