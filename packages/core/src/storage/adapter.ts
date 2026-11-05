import { WebStorageAdapter } from './web-adapter.js';

export interface CachedFileRecord {
  /** Composite key: `${repoFullName}:${path}`. */
  path: string;
  content: string;
  sha: string;
  timestamp: number;
}

export interface PendingMutation {
  /** Stable per repo+path so a newer offline edit replaces an older one. */
  id: string;
  repoFullName: string;
  path: string;
  content: string;
  /** SHA the edit was based on; undefined means create. */
  baseSha?: string;
  timestamp: number;
}

export type RecordStore = 'auth' | 'profiles' | 'trees' | 'files';

/**
 * Persistence used by `@kaihuman/core`. `getItem`/`setItem`/`removeItem` are
 * synchronous (localStorage-shaped); record and mutation methods are async.
 */
export interface CoreStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  getRecord<T = unknown>(store: RecordStore, key: string): Promise<T | undefined>;
  putRecord(store: RecordStore, key: string, value: unknown): Promise<void>;
  deleteRecord(store: RecordStore, key: string): Promise<void>;
  listPendingMutations(): Promise<PendingMutation[]>;
  putPendingMutation(mutation: PendingMutation): Promise<void>;
  deletePendingMutation(id: string): Promise<void>;
}

let current: CoreStorageAdapter | undefined;

export function configureCoreStorage(adapter: CoreStorageAdapter): void {
  current = adapter;
}

/** Lazily defaults to the web adapter (which itself falls back to memory). */
export function getCoreStorage(): CoreStorageAdapter {
  current ??= new WebStorageAdapter();
  return current;
}
