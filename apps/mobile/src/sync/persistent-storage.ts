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

const KV_BACKUP = `${KV_FILE}.bak`;

/** Parses a kv file; null for missing, empty, truncated or non-object text. */
function parseKv(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, string>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Synchronous KV: core reads it while constructing stores, so it must be in memory.
 * Every write goes to the backup first and then the main file, so at any moment one of them is
 * whole; a load takes the first that parses. Store constructors write at once, so falling back
 * to an empty map would overwrite the user's repo and settings with nothing.
 */
export function createFileKeyValueDriver(fs: CacheFs): KeyValueDriver {
  let data: Record<string, string> = {};
  // A read that throws (e.g. file protection before first unlock) is not "no data": write
  // nothing this session, or the empty in-memory map would replace the real file.
  let readOnly = false;
  try {
    const raw = fs.readSync(KV_FILE);
    const main = parseKv(raw);
    const backup = main ? null : parseKv(fs.readSync(KV_BACKUP));
    data = main ?? backup ?? {};
    if (!main && backup) fs.writeSync(KV_FILE, JSON.stringify(backup));
    // Nothing usable: set the unreadable text aside rather than lose it to the next write.
    else if (!main && raw) fs.writeSync(`${KV_FILE}.corrupt`, raw);
  } catch {
    readOnly = true;
  }
  let saved = JSON.stringify(data);
  const persist = () => {
    const text = JSON.stringify(data);
    if (readOnly || text === saved) return;
    try {
      fs.writeSync(KV_BACKUP, text);
      fs.writeSync(KV_FILE, text);
      saved = text;
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
 * launch); such a key is not deleted this session, because an unreadable token looks exactly
 * like a missing one and core would otherwise "clean it up". Failures are not cached, so the
 * key is read again once the device unlocks (see `AuthStore.restore`).
 */
export function createSecureKeyValueDriver(api: SecureStoreApi): KeyValueDriver {
  const cache = new Map<string, string | null>();
  // Per key: one readable item (e.g. AFTER_FIRST_UNLOCK) must not unlock deletes of another.
  const unreadable = new Set<string>();
  // SecureStore keys allow only [A-Za-z0-9._-]; core uses `record:auth:token`.
  const native = (key: string) => key.replace(/[^\w.-]/g, '_');
  return {
    get(key) {
      if (cache.has(key)) return cache.get(key) ?? null;
      try {
        const value = api.getItem(native(key));
        cache.set(key, value);
        unreadable.delete(key);
        return value;
      } catch {
        unreadable.add(key);
        return null;
      }
    },
    set(key, value) {
      cache.set(key, value);
      try {
        api.setItem(native(key), value);
        unreadable.delete(key);
      } catch {
        // The cached copy still serves this session.
      }
    },
    remove(key) {
      if (unreadable.has(key)) {
        // Never confirmed empty: forget nothing, so a later read still finds the stored value.
        cache.delete(key);
        return;
      }
      cache.set(key, null);
      void api.deleteItemAsync(native(key)).catch(() => undefined);
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
