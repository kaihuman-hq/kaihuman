import {
  type CoreStorageAdapter,
  configureCoreStorage,
  getCoreStorage,
  githubProfileStore,
  type RecordStore,
} from '@kaihuman/core';
import {
  type KeyValueDriver,
  MobileStorageAdapter,
  type RecordDriver,
} from '../adapters/mobile-storage.js';

/**
 * The few file operations the cache needs, relative to the cache root. Injected so the drivers
 * run against an in-memory fake in Vitest; `expo-cache-fs.ts` provides the device one.
 */
export interface CacheFs {
  readSync(path: string): string | null;
  writeSync(path: string, text: string): void;
  read(path: string): Promise<string | null>;
  write(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** File names (not paths) directly inside `dir`; empty when it does not exist. */
  list(dir: string): Promise<string[]>;
}

const KV_FILE = 'kv.json';
// Keys the app set on the in-memory adapter before this install; carried over so they survive.
const CARRIED_KEYS = ['lifeos_current_repo', 'lifeos_logged_out'];

/** One JSON file per record: a corrupt or half-written file loses one record, not the cache. */
export function createFileRecordDriver(fs: CacheFs): RecordDriver {
  const file = (store: string, key: string) => `${store}/${encodeURIComponent(key)}.json`;
  return {
    async get<T>(store: RecordStore | 'mutations', key: string) {
      const raw = await fs.read(file(store, key));
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    put: (store, key, value) => fs.write(file(store, key), JSON.stringify(value)),
    delete: (store, key) => fs.remove(file(store, key)),
    async list<T>(store: RecordStore | 'mutations') {
      const out: T[] = [];
      for (const name of await fs.list(store)) {
        if (!name.endsWith('.json')) continue;
        try {
          const raw = await fs.read(`${store}/${name}`);
          if (raw !== null) out.push(JSON.parse(raw) as T);
        } catch {
          // skip unreadable record
        }
      }
      return out;
    },
  };
}

/** Synchronous KV: core reads it while constructing stores, so it must be in memory. */
export function createFileKeyValueDriver(fs: CacheFs): KeyValueDriver {
  let data: Record<string, string> = {};
  try {
    const raw = fs.readSync(KV_FILE);
    if (raw) data = JSON.parse(raw) as Record<string, string>;
  } catch {
    data = {};
  }
  const persist = () => {
    try {
      fs.writeSync(KV_FILE, JSON.stringify(data));
    } catch {
      // The in-memory copy still serves this session.
    }
  };
  return {
    get: (key) => (key in data ? (data[key] ?? null) : null),
    set(key, value) {
      data[key] = value;
      persist();
    },
    remove(key) {
      delete data[key];
      persist();
    },
  };
}

/**
 * Installs file-backed core storage. Secrets (token, remembered passwords) stay on the previous
 * adapter, i.e. in memory: the Keychain copy is owned by token-sync. Returns false (and changes
 * nothing) when there is no file system, as on web and under Vitest.
 */
export function installPersistentStorage(fs: CacheFs | null): boolean {
  if (!fs) return false;
  const previous: CoreStorageAdapter = getCoreStorage();
  const kv = createFileKeyValueDriver(fs);
  for (const key of CARRIED_KEYS) {
    const value = previous.getItem(key);
    if (value !== null) kv.set(key, value);
  }
  configureCoreStorage(
    new MobileStorageAdapter({
      kv,
      records: createFileRecordDriver(fs),
      secure: {
        get: (key) => previous.getItem(key),
        set: (key, value) => previous.setItem(key, value),
        remove: (key) => previous.removeItem(key),
      },
    }),
  );
  // githubProfileStore read its repo when it was constructed, before this storage existed.
  const saved = kv.get('lifeos_current_repo');
  if (saved && githubProfileStore.currentRepo.peek() === null) {
    try {
      githubProfileStore.currentRepo.value = JSON.parse(saved);
    } catch {
      // A corrupt value just means no repo is selected.
    }
  }
  return true;
}
