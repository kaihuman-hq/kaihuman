import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_CACHE_KEY, cached, hashKey, peek, put } from './cache';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        },
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('cached', () => {
  it('cached computes once within ttl', async () => {
    const compute = vi.fn(async () => 'answer');
    expect(await cached('k', 60_000, compute)).toBe('answer');
    expect(await cached('k', 60_000, compute)).toBe('answer');
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('cached recomputes after ttl', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T10:00:00.000Z'));
    const compute = vi.fn(async () => 'answer');
    await cached('k', 60_000, compute);
    vi.setSystemTime(new Date('2026-10-15T10:00:59.000Z'));
    await cached('k', 60_000, compute);
    expect(compute).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-10-15T10:01:01.000Z'));
    await cached('k', 60_000, compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('null results are not cached', async () => {
    const compute = vi.fn(async () => null);
    expect(await cached('k', 60_000, compute)).toBeNull();
    expect(await cached('k', 60_000, compute)).toBeNull();
    expect(compute).toHaveBeenCalledTimes(2);
    expect(await peek('k')).toBeUndefined();
  });
});

describe('put and peek', () => {
  it('keeps at most 500 entries, dropping the oldest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-10-15T10:00:00.000Z').getTime();
    for (let i = 0; i < 501; i++) {
      vi.setSystemTime(start + i);
      await put(`k${i}`, i, 3_600_000);
    }
    const entries = store[AI_CACHE_KEY] as Record<string, unknown>;
    expect(Object.keys(entries)).toHaveLength(500);
    expect(await peek('k0')).toBeUndefined();
    expect(await peek('k1')).toBe(1);
    expect(await peek('k500')).toBe(500);
  });

  it('keeps concurrent writes', async () => {
    await Promise.all([put('a', 1, 60_000), put('b', 2, 60_000)]);
    expect(await peek('a')).toBe(1);
    expect(await peek('b')).toBe(2);
  });
});

describe('hashKey', () => {
  it('hashKey is stable', () => {
    expect(hashKey('a', 'b')).toBe(hashKey('a', 'b'));
    expect(hashKey('a', 'b')).not.toBe(hashKey('ab'));
    expect(hashKey('a', 'b')).toMatch(/^[0-9a-f]{8}$/);
  });
});
