import type { Signal } from '@preact/signals';
import type { Config } from '../models/types.js';
import type { AuthStore } from './auth.store.js';

export interface RootStore {
  auth: AuthStore;
  config: Signal<Config>;
  // Placeholders for future stores
  // fileSystem: FileSystemStore;
  // git: GitStore;
}
