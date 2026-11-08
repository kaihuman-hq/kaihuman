import { describe, expect, it } from 'vitest';
import { describeSyncStatus } from './describe.js';
import { initialSyncStatus, type SyncStatus } from './status.js';

const NOW = 1_000_000_000;
const s = (patch: Partial<SyncStatus>): SyncStatus => ({ ...initialSyncStatus, ...patch });

describe('describeSyncStatus', () => {
  it('says nothing before the first sync', () => {
    expect(describeSyncStatus(s({}), NOW)).toEqual({ text: '', tone: 'neutral' });
  });

  it('formats the relative age', () => {
    const at = (ms: number) => describeSyncStatus(s({ lastSyncedAt: NOW - ms }), NOW).text;
    expect(at(5_000)).toBe('Updated just now');
    expect(at(59_999)).toBe('Updated just now');
    expect(at(5 * 60_000)).toBe('Updated 5 min ago');
    expect(at(2 * 3_600_000)).toBe('Updated 2 h ago');
    expect(at(3 * 86_400_000)).toBe('Updated 3 d ago');
    expect(at(-5_000)).toBe('Updated just now');
  });

  it('shows syncing', () => {
    expect(describeSyncStatus(s({ phase: 'syncing', lastSyncedAt: NOW }), NOW)).toEqual({
      text: 'Syncing…',
      tone: 'neutral',
    });
  });

  it('describes offline with pending changes', () => {
    expect(describeSyncStatus(s({ phase: 'offline', pending: 2 }), NOW).text).toBe(
      'Offline · 2 changes pending',
    );
    expect(describeSyncStatus(s({ phase: 'offline', pending: 1 }), NOW).text).toBe(
      'Offline · 1 change pending',
    );
    expect(describeSyncStatus(s({ phase: 'offline' }), NOW).text).toBe('Offline');
  });

  it('reports errors with the error tone', () => {
    expect(describeSyncStatus(s({ phase: 'error', error: 'Rate limited' }), NOW)).toEqual({
      text: 'Rate limited',
      tone: 'error',
    });
    expect(describeSyncStatus(s({ phase: 'error', error: null }), NOW).tone).toBe('error');
  });

  it('reports conflicts first', () => {
    const r = describeSyncStatus(
      s({ conflicts: ['a.md'], phase: 'error', error: 'x', pending: 3 }),
      NOW,
    );
    expect(r).toEqual({ text: '1 file needs review', tone: 'warning' });
    expect(describeSyncStatus(s({ conflicts: ['a', 'b'] }), NOW).text).toBe('2 files need review');
  });

  it('shows pending changes when idle', () => {
    expect(describeSyncStatus(s({ pending: 2, lastSyncedAt: NOW }), NOW)).toEqual({
      text: '2 changes pending',
      tone: 'neutral',
    });
  });
});
