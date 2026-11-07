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

  private db(): Promise<IDBPDatabase<LifeOSDB>> {
    this.dbPromise ??= openDB<LifeOSDB>(DB_NAME, DB_VERSION, {
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
    });
    return this.dbPromise;
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
    if (!this.hasIdb) return this.fallback.getRecord<T>(store, key);
    return (await (await this.db()).get(store, key)) as T | undefined;
  }
  async putRecord(store: RecordStore, key: string, value: unknown): Promise<void> {
    if (!this.hasIdb) return this.fallback.putRecord(store, key, value);
    const db = await this.db();
    // `files` uses an in-line keyPath, so the key comes from the value itself.
    if (store === 'files') await db.put('files', value);
    else await db.put(store, value, key);
  }
  async deleteRecord(store: RecordStore, key: string): Promise<void> {
    if (!this.hasIdb) return this.fallback.deleteRecord(store, key);
    await (await this.db()).delete(store, key);
  }
  async listRecords<T>(store: RecordStore): Promise<T[]> {
    if (!this.hasIdb) return this.fallback.listRecords<T>(store);
    return (await (await this.db()).getAll(store)) as T[];
  }
  async listPendingMutations(): Promise<PendingMutation[]> {
    if (!this.hasIdb) return this.fallback.listPendingMutations();
    const all = await (await this.db()).getAll('mutations');
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }
  async putPendingMutation(mutation: PendingMutation): Promise<void> {
    if (!this.hasIdb) return this.fallback.putPendingMutation(mutation);
    await (await this.db()).put('mutations', mutation);
  }
  async deletePendingMutation(id: string): Promise<void> {
    if (!this.hasIdb) return this.fallback.deletePendingMutation(id);
    await (await this.db()).delete('mutations', id);
  }
}
