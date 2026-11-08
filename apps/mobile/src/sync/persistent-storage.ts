import type { RecordStore } from '@kaihuman/core/src/storage/adapter.ts';
import { configureCoreStorage } from '@kaihuman/core/src/storage/adapter.ts';
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

function memoryKeyValueDriver(): KeyValueDriver {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

/** expo-secure-store's synchronous calls; it has no synchronous delete. */
export interface SecureStoreApi {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * Keychain/Keystore KV for secrets. A read can throw while the device is locked (background
 * task before first unlock); then nothing is deleted this session, because an unreadable token
 * looks exactly like a missing one and core would otherwise "clean it up".
 */
export function createSecureKeyValueDriver(api: SecureStoreApi): KeyValueDriver {
  const cache = new Map<string, string | null>();
  let readFailed = false;
  // SecureStore keys allow only [A-Za-z0-9._-]; core uses `record:auth:token`.
  const native = (key: string) => key.replace(/[^\w.-]/g, '_');
  return {
    get(key) {
      if (cache.has(key)) return cache.get(key) ?? null;
      try {
        const value = api.getItem(native(key));
        cache.set(key, value);
        return value;
      } catch {
        readFailed = true;
        return null;
      }
    },
    set(key, value) {
      cache.set(key, value);
      try {
        api.setItem(native(key), value);
      } catch {
        // The cached copy still serves this session.
      }
    },
    remove(key) {
      cache.set(key, null);
      if (!readFailed) void api.deleteItemAsync(native(key)).catch(() => undefined);
    },
  };
}

/**
 * Installs file-backed core storage, with secrets in `secure`. Must run before anything imports
 * the `@kaihuman/core` root, whose stores read storage while being constructed. Returns false
 * (and changes nothing) when there is no file system.
 */
export function installPersistentStorage(
  fs: CacheFs | null,
  secure: KeyValueDriver | null = null,
): boolean {
  if (!fs) return false;
  configureCoreStorage(
    new MobileStorageAdapter({
      kv: createFileKeyValueDriver(fs),
      records: createFileRecordDriver(fs),
      // Without a Keychain, secrets stay in memory rather than in the plain files.
      secure: secure ?? memoryKeyValueDriver(),
    }),
  );
  return true;
}
