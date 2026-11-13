import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { CoreStorageAdapter, PendingMutation, RecordStore } from './adapter.js';
import { InMemoryStorageAdapter } from './memory-adapter.js';

interface LifeOSDB extends DBSchema {
  auth: { key: string; value: unknown };
  profiles: { key: string; value: unknown };
  files: { key: string; value: unknown; indexes: { 'by-path': string } };
  trees: { key: string; value: unknown };
  mutations: { key: string; value: PendingMutation };
}

const DB_NAME = 'life-os-db';
// v2 adds the `mutations` store; existing stores are untouched.
const DB_VERSION = 2;
/** An open that takes longer is treated as wedged; the adapter then uses memory. */
export const IDB_OPEN_TIMEOUT_MS = 3000;

/** Browser adapter: IndexedDB via `idb` plus `localStorage`; memory fallback otherwise. */
export class WebStorageAdapter implements CoreStorageAdapter {
  private fallback = new InMemoryStorageAdapter();
  private dbPromise: Promise<IDBPDatabase<LifeOSDB>> | undefined;
  private hasIdb = typeof indexedDB !== 'undefined';
  private hasLs = (() => {
    try {
      return typeof localStorage !== 'undefined';
    } catch {
      return false;
    }
  })();

  /** The open IndexedDB, or undefined once the adapter has switched to memory for this session. */
  private async idb(): Promise<IDBPDatabase<LifeOSDB> | undefined> {
    if (!this.hasIdb) return undefined;
    this.dbPromise ??= this.open();
    try {
      return await this.dbPromise;
    } catch (error) {
      // Never retry: a wedged backend would stall every later call again.
      console.warn('IndexedDB unavailable, using in-memory storage for this session', error);
      this.hasIdb = false;
      return undefined;
    }
  }

  private open(): Promise<IDBPDatabase<LifeOSDB>> {
    let opened: IDBPDatabase<LifeOSDB> | undefined;
    let timedOut = false;
    const forget = () => {
      opened = undefined;
      this.dbPromise = undefined;
    };
    const opening = openDB<LifeOSDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('auth')) db.createObjectStore('auth');
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles');
        if (!db.objectStoreNames.contains('files')) {
          const files = db.createObjectStore('files', { keyPath: 'path' });
          files.createIndex('by-path', 'path');
        }
        if (!db.objectStoreNames.contains('trees')) db.createObjectStore('trees');
        if (!db.objectStoreNames.contains('mutations')) {
          db.createObjectStore('mutations', { keyPath: 'id' });
        }
      },
      blocked() {
        console.warn('IndexedDB open is blocked by another tab holding an older version');
      },
      // Let a newer version in another tab upgrade instead of waiting on us forever.
      blocking() {
        opened?.close();
        forget();
      },
      terminated: forget,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    opening.then(
      (db) => {
        clearTimeout(timer);
        if (timedOut) db.close();
        else opened = db;
      },
      () => clearTimeout(timer),
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`IndexedDB open timed out after ${IDB_OPEN_TIMEOUT_MS} ms`));
      }, IDB_OPEN_TIMEOUT_MS);
    });
    return Promise.race([opening, timeout]);
  }

  getItem(key: string): string | null {
    return this.hasLs ? localStorage.getItem(key) : this.fallback.getItem(key);
  }
  setItem(key: string, value: string): void {
    if (this.hasLs) localStorage.setItem(key, value);
    else this.fallback.setItem(key, value);
  }
  removeItem(key: string): void {
    if (this.hasLs) localStorage.removeItem(key);
    else this.fallback.removeItem(key);
  }
  async getRecord<T>(store: RecordStore, key: string): Promise<T | undefined> {
    const db = await this.idb();
    if (!db) return this.fallback.getRecord<T>(store, key);
    return (await db.get(store, key)) as T | undefined;
  }
  async putRecord(store: RecordStore, key: string, value: unknown): Promise<void> {
    const db = await this.idb();
    if (!db) return this.fallback.putRecord(store, key, value);
    // `files` uses an in-line keyPath, so the key comes from the value itself.
    if (store === 'files') await db.put('files', value);
    else await db.put(store, value, key);
  }
  async deleteRecord(store: RecordStore, key: string): Promise<void> {
    const db = await this.idb();
    if (!db) return this.fallback.deleteRecord(store, key);
    await db.delete(store, key);
  }
  async listRecords<T>(store: RecordStore): Promise<T[]> {
    const db = await this.idb();
    if (!db) return this.fallback.listRecords<T>(store);
    return (await db.getAll(store)) as T[];
  }
  async listPendingMutations(): Promise<PendingMutation[]> {
    const db = await this.idb();
    if (!db) return this.fallback.listPendingMutations();
    const all = await db.getAll('mutations');
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }
  async putPendingMutation(mutation: PendingMutation): Promise<void> {
    const db = await this.idb();
    if (!db) return this.fallback.putPendingMutation(mutation);
    await db.put('mutations', mutation);
  }
  async deletePendingMutation(id: string): Promise<void> {
    const db = await this.idb();
    if (!db) return this.fallback.deletePendingMutation(id);
    await db.delete('mutations', id);
  }
}
