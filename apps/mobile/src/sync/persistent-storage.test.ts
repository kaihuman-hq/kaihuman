import { configureCoreStorage, getCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CacheFs,
  createFileKeyValueDriver,
  createFileRecordDriver,
  createSecureKeyValueDriver,
  installPersistentStorage,
} from './persistent-storage.js';

const fakeFs = (files = new Map<string, string>()): CacheFs & { files: Map<string, string> } => ({
  files,
  readSync: (p) => files.get(p) ?? null,
  writeSync: (p, t) => void files.set(p, t),
  read: async (p) => files.get(p) ?? null,
  write: async (p, t) => void files.set(p, t),
  remove: async (p) => void files.delete(p),
  list: async (dir) =>
    [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1)),
});

beforeEach(() => {
  configureCoreStorage(new InMemoryStorageAdapter());
});

describe('record driver', () => {
  it('writes one encoded JSON file per record and reads it back', async () => {
    const fs = fakeFs();
    const d = createFileRecordDriver(fs);
    await d.put('files', 'o/r:notes/a b.md', { content: 'x' });
    expect([...fs.files.keys()]).toEqual(['files/o%2Fr%3Anotes%2Fa%20b.md.json']);
    expect(await d.get('files', 'o/r:notes/a b.md')).toEqual({ content: 'x' });
    expect(await d.get('files', 'missing')).toBeUndefined();
  });

  it('lists a store, ignoring other stores and corrupt files, and deletes', async () => {
    const fs = fakeFs();
    const d = createFileRecordDriver(fs);
    await d.put('files', 'a', 1);
    await d.put('files', 'b', 2);
    await d.put('trees', 'c', 3);
    fs.files.set('files/bad.json', '{nope');
    expect((await d.list<number>('files')).sort()).toEqual([1, 2]);
    await d.delete('files', 'a');
    expect(await d.list('files')).toEqual([2]);
  });

  it('keeps the offline mutation queue in its own folder', async () => {
    const fs = fakeFs();
    const d = createFileRecordDriver(fs);
    await d.put('mutations', 'm1', { id: 'm1' });
    expect(await d.list('mutations')).toEqual([{ id: 'm1' }]);
    expect(await d.list('files')).toEqual([]);
  });
});

describe('key/value driver', () => {
  it('is readable synchronously, persisted on write, and reloaded by a new driver', () => {
    const fs = fakeFs();
    const kv = createFileKeyValueDriver(fs);
    expect(kv.get('k')).toBeNull();
    kv.set('k', 'v');
    expect(kv.get('k')).toBe('v');
    expect(createFileKeyValueDriver(fs).get('k')).toBe('v');
    kv.remove('k');
    expect(createFileKeyValueDriver(fs).get('k')).toBeNull();
  });

  it('survives a corrupt file', () => {
    const fs = fakeFs(new Map([['kv.json', '{nope']]));
    expect(createFileKeyValueDriver(fs).get('k')).toBeNull();
  });
});

describe('installPersistentStorage', () => {
  it('does nothing without a file system', () => {
    const before = getCoreStorage();
    expect(installPersistentStorage(null)).toBe(false);
    expect(getCoreStorage()).toBe(before);
  });

  it('keeps the token and remembered passwords out of the kv file', () => {
    const fs = fakeFs();
    installPersistentStorage(fs);
    const storage = getCoreStorage();
    storage.setItem('lifeos_gh_token', 'secret');
    storage.setItem('kaihuman_saved_passwords', '{"a":"pw"}');
    storage.setItem('other', 'x');
    expect(storage.getItem('lifeos_gh_token')).toBe('secret');
    const kvFile = fs.files.get('kv.json') ?? '';
    expect(kvFile).not.toContain('secret');
    expect(kvFile).not.toContain('pw');
    expect(kvFile).toContain('other');
  });

  it('persists records through the installed adapter', async () => {
    const fs = fakeFs();
    installPersistentStorage(fs);
    await getCoreStorage().putRecord('files', 'o/r:a.md', { content: 'hi', dirty: true });
    const again = createFileRecordDriver(fs);
    expect(await again.get('files', 'o/r:a.md')).toEqual({ content: 'hi', dirty: true });
  });
});

describe('secure driver', () => {
  const keychain = (entries: [string, string][] = []) => {
    const items = new Map(entries);
    return {
      items,
      getItem: vi.fn((k: string) => items.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => void items.set(k, v)),
      deleteItemAsync: vi.fn(async (k: string) => void items.delete(k)),
    };
  };

  it('maps core keys onto the characters SecureStore accepts', () => {
    const api = keychain();
    const driver = createSecureKeyValueDriver(api);
    driver.set('record:auth:token', '"t"');
    expect(api.items.get('record_auth_token')).toBe('"t"');
    expect(createSecureKeyValueDriver(api).get('record:auth:token')).toBe('"t"');
  });

  it('reads deletes back as missing before the async delete lands', () => {
    const api = keychain([['lifeos_gh_token', 't']]);
    const driver = createSecureKeyValueDriver(api);
    driver.remove('lifeos_gh_token');
    expect(driver.get('lifeos_gh_token')).toBeNull();
    expect(api.deleteItemAsync).toHaveBeenCalledWith('lifeos_gh_token');
  });

  it('deletes nothing after a locked-device read failure', () => {
    const api = keychain([['lifeos_gh_token', 't']]);
    api.getItem.mockImplementation(() => {
      throw new Error('locked');
    });
    const driver = createSecureKeyValueDriver(api);
    expect(driver.get('lifeos_gh_token')).toBeNull();
    driver.remove('lifeos_gh_token');
    expect(api.deleteItemAsync).not.toHaveBeenCalled();
    expect(api.items.get('lifeos_gh_token')).toBe('t');
  });

  it('keeps auth records in the secure driver, not the files', async () => {
    const fs = fakeFs();
    const api = keychain();
    installPersistentStorage(fs, createSecureKeyValueDriver(api));
    await getCoreStorage().putRecord('auth', 'token', 'ghp_x');
    expect([...fs.files.values()].join('')).not.toContain('ghp_x');
    expect(api.items.get('record_auth_token')).toBe('"ghp_x"');
  });
});
