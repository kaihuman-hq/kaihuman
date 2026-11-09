import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheFs, SecureStoreApi } from '../sync/persistent-storage.js';

const secure: SecureStoreApi = {
  getItem: () => null,
  setItem: () => {},
  deleteItemAsync: async () => {},
};
const fs: CacheFs = {
  readSync: () => null,
  writeSync: () => {},
  read: async () => null,
  write: async () => {},
  remove: async () => {},
  list: async () => [],
};

// Fresh core per test: "has storage been read yet" is process state.
async function fresh() {
  vi.resetModules();
  return {
    boot: await import('./storage-boot.js'),
    adapter: await import('@kaihuman/core/src/storage/adapter.ts'),
  };
}

beforeEach(() => vi.restoreAllMocks());

describe('bootStorage', () => {
  it('throws in development when the file system is missing', async () => {
    const { boot } = await fresh();
    expect(() => boot.bootStorage({ platform: 'ios', dev: true, fs: null, secure })).toThrow(
      /Device storage is unavailable/,
    );
  });

  it('logs and raises a non-blocking warning in production instead of silently using memory', async () => {
    const { boot } = await fresh();
    const log = vi.fn();
    expect(boot.bootStorage({ platform: 'android', dev: false, fs: null, secure, log })).toBe(
      false,
    );
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/lost when the app closes/));
    expect(boot.storageWarning.value).toMatch(/Device storage is unavailable/);
  });

  it('installs device storage without a warning when everything is there', async () => {
    const { boot, adapter } = await fresh();
    expect(boot.bootStorage({ platform: 'ios', dev: true, fs, secure })).toBe(true);
    expect(adapter.hasCoreStorage()).toBe(true);
    expect(boot.storageWarning.value).toBeNull();
  });

  it('reports a store that read storage before the install', async () => {
    const { boot, adapter } = await fresh();
    adapter.getCoreStorage();
    expect(() => boot.bootStorage({ platform: 'ios', dev: true, fs, secure })).toThrow(
      /read before it was installed/,
    );
  });

  it('leaves web on localStorage and IndexedDB, like the PWA', async () => {
    const { boot, adapter } = await fresh();
    expect(boot.bootStorage({ platform: 'web', dev: true, fs: null, secure })).toBe(false);
    expect(adapter.hasCoreStorage()).toBe(false);
  });
});
