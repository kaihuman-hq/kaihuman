import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openDB = vi.fn();
vi.mock('idb', () => ({ openDB: (...args: unknown[]) => openDB(...args) }));

const { IDB_OPEN_TIMEOUT_MS, WebStorageAdapter } = await import('./web-adapter.js');

describe('WebStorageAdapter when IndexedDB never opens', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    openDB.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back to memory after the timeout, then answers instantly', async () => {
    openDB.mockReturnValue(new Promise(() => {}));
    const adapter = new WebStorageAdapter();
    const first = adapter.getRecord('auth', 'k');
    await vi.advanceTimersByTimeAsync(IDB_OPEN_TIMEOUT_MS);
    expect(await first).toBeUndefined();
    expect(console.warn).toHaveBeenCalledTimes(1);

    // No timer advance: later calls must not wait or reopen.
    await adapter.putRecord('auth', 'k', { a: 1 });
    expect(await adapter.getRecord('auth', 'k')).toEqual({ a: 1 });
    expect(await adapter.listRecords('auth')).toEqual([{ a: 1 }]);
    expect(openDB).toHaveBeenCalledTimes(1);
  });

  it('falls back when the open rejects', async () => {
    openDB.mockRejectedValue(new Error('boom'));
    const adapter = new WebStorageAdapter();
    await adapter.putRecord('profiles', 'k', 1);
    expect(await adapter.getRecord('profiles', 'k')).toBe(1);
  });

  it('uses IndexedDB when it opens, and closes on blocking', async () => {
    const db = { get: vi.fn().mockResolvedValue('v'), close: vi.fn() };
    openDB.mockResolvedValue(db);
    const adapter = new WebStorageAdapter();
    expect(await adapter.getRecord('auth', 'k')).toBe('v');
    expect(db.get).toHaveBeenCalledWith('auth', 'k');
    const handlers = openDB.mock.calls[0]?.[2] as { blocking: () => void };
    handlers.blocking();
    expect(db.close).toHaveBeenCalled();
    await adapter.getRecord('auth', 'k');
    expect(openDB).toHaveBeenCalledTimes(2);
  });
});
