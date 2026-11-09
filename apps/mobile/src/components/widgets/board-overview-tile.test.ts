import { describe, expect, it } from 'vitest';
import { boardConfig, updateBoardConfig } from './board-overview-tile.js';

describe('updateBoardConfig', () => {
  it('patches over the defaults and keeps other settings', () => {
    const a = updateBoardConfig('', { showDone: true });
    expect(boardConfig(a)).toMatchObject({ showDone: true, showBacklog: true, overdueDays: 7 });
    const b = updateBoardConfig(a, { scope: 'business', minAgeDays: 2 });
    expect(boardConfig(b)).toMatchObject({ showDone: true, scope: 'business', minAgeDays: 2 });
  });
  it('keeps the current day counts when the new ones are invalid', () => {
    const base = updateBoardConfig('', { overdueDays: 10, minAgeDays: 4 });
    const bad = updateBoardConfig(base, { overdueDays: 0, minAgeDays: -1 });
    expect(boardConfig(bad)).toMatchObject({ overdueDays: 10, minAgeDays: 4 });
    const frac = updateBoardConfig(base, { overdueDays: 2.5 });
    expect(boardConfig(frac).overdueDays).toBe(10);
  });
  it('recovers from a corrupt file', () => {
    expect(boardConfig(updateBoardConfig('{nope', { showRejected: true })).showRejected).toBe(true);
  });
});
