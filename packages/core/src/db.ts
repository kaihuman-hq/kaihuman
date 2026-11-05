import { type DBSchema, openDB } from 'idb';

interface LifeOSDB extends DBSchema {
  auth: {
    key: string;
    value: any;
  };
  profiles: {
    key: string;
    value: any;
  };
  files: {
    key: string;
    value: {
      path: string;
      content: string;
      /** Sha of the base: the remote version the working copy was last synced with. */
      sha: string;
      timestamp: number;
      /** Unsaved local edits. A dirty copy is merged with the remote, never replaced by it. */
      dirty?: boolean;
      /** Content at `sha`, the base of a three-way merge. */
      baseContent?: string;
    };
    indexes: { 'by-path': string };
  };
  trees: {
    key: string;
    value: any;
  };
}

export const dbPromise = openDB<LifeOSDB>('life-os-db', 1, {
  upgrade(db) {
    // Auth store
    if (!db.objectStoreNames.contains('auth')) {
      db.createObjectStore('auth');
    }
    // Profiles store
    if (!db.objectStoreNames.contains('profiles')) {
      db.createObjectStore('profiles');
    }
    // Files store
    if (!db.objectStoreNames.contains('files')) {
      const fileStore = db.createObjectStore('files', { keyPath: 'path' });
      fileStore.createIndex('by-path', 'path');
    }
    // Trees store
    if (!db.objectStoreNames.contains('trees')) {
      db.createObjectStore('trees');
    }
  },
});
