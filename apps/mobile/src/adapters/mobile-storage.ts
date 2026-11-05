import {
  type CoreStorageAdapter,
  InMemoryStorageAdapter,
  type PendingMutation,
  type RecordStore,
} from '@kaihuman/core';

/** Synchronous key/value driver (expo-secure-store sync API, MMKV, SharedPreferences). */
export interface KeyValueDriver {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Async record driver (SQLite). `mutations` holds the offline write queue. */
export interface RecordDriver {
  get<T>(store: RecordStore | 'mutations', key: string): Promise<T | undefined>;
  put(store: RecordStore | 'mutations', key: string, value: unknown): Promise<void>;
  delete(store: RecordStore | 'mutations', key: string): Promise<void>;
  list<T>(store: RecordStore | 'mutations'): Promise<T[]>;
}

export interface MobileStorageDrivers {
  /** Keychain / Keystore. Receives auth tokens and the `auth` record store. */
  secure?: KeyValueDriver;
  /** Fast KV for everything else. */
  kv?: KeyValueDriver;
  /** SQLite-style store for file/tree caches and the mutation queue. */
  records?: RecordDriver;
  /** Mirrors keys the native widgets need (token, repo) into the App Group / SharedPreferences. */
  mirror?: (key: string, value: string | null) => void;
}

const SECURE_KEYS: ReadonlySet<string> = new Set(['lifeos_gh_token']);
const MIRRORED_KEYS: ReadonlySet<string> = new Set(['lifeos_gh_token', 'lifeos_current_repo']);

/**
 * `CoreStorageAdapter` backed by native drivers. Every driver is optional: whatever is
 * missing falls back to memory so the same class runs headless under Vitest.
 */
export class MobileStorageAdapter implements CoreStorageAdapter {
  private readonly fallback = new InMemoryStorageAdapter();

  constructor(private readonly drivers: MobileStorageDrivers = {}) {}

  private kvFor(key: string): KeyValueDriver | undefined {
    return SECURE_KEYS.has(key) ? this.drivers.secure : this.drivers.kv;
  }

  getItem(key: string): string | null {
    const driver = this.kvFor(key);
    return driver ? driver.get(key) : this.fallback.getItem(key);
  }

  setItem(key: string, value: string): void {
    const driver = this.kvFor(key);
    if (driver) driver.set(key, value);
    else this.fallback.setItem(key, value);
    if (MIRRORED_KEYS.has(key)) this.drivers.mirror?.(key, value);
  }

  removeItem(key: string): void {
    const driver = this.kvFor(key);
    if (driver) driver.remove(key);
    else this.fallback.removeItem(key);
    if (MIRRORED_KEYS.has(key)) this.drivers.mirror?.(key, null);
  }

  async getRecord<T = unknown>(store: RecordStore, key: string): Promise<T | undefined> {
    if (store === 'auth' && this.drivers.secure) {
      const raw = this.drivers.secure.get(`record:${store}:${key}`);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    }
    return this.drivers.records
      ? this.drivers.records.get<T>(store, key)
      : this.fallback.getRecord<T>(store, key);
  }

  async putRecord(store: RecordStore, key: string, value: unknown): Promise<void> {
    if (store === 'auth' && this.drivers.secure) {
      this.drivers.secure.set(`record:${store}:${key}`, JSON.stringify(value));
      return;
    }
    if (this.drivers.records) await this.drivers.records.put(store, key, value);
    else await this.fallback.putRecord(store, key, value);
  }

  async deleteRecord(store: RecordStore, key: string): Promise<void> {
    if (store === 'auth' && this.drivers.secure) {
      this.drivers.secure.remove(`record:${store}:${key}`);
      return;
    }
    if (this.drivers.records) await this.drivers.records.delete(store, key);
    else await this.fallback.deleteRecord(store, key);
  }

  async listPendingMutations(): Promise<PendingMutation[]> {
    if (!this.drivers.records) return this.fallback.listPendingMutations();
    const all = await this.drivers.records.list<PendingMutation>('mutations');
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }

  async putPendingMutation(mutation: PendingMutation): Promise<void> {
    if (this.drivers.records) await this.drivers.records.put('mutations', mutation.id, mutation);
    else await this.fallback.putPendingMutation(mutation);
  }

  async deletePendingMutation(id: string): Promise<void> {
    if (this.drivers.records) await this.drivers.records.delete('mutations', id);
    else await this.fallback.deletePendingMutation(id);
  }
}
