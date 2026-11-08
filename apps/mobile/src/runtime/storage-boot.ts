import { hasCoreStorage } from '@kaihuman/core/src/storage/adapter.ts';
import { signal } from '@preact/signals';
import {
  type CacheFs,
  createSecureKeyValueDriver,
  installPersistentStorage,
  type SecureStoreApi,
} from '../sync/persistent-storage.js';

export interface StorageBootDeps {
  platform: string;
  /** `__DEV__`: problems throw instead of degrading. */
  dev: boolean;
  fs: CacheFs | null;
  secure: SecureStoreApi;
  log?: (message: string) => void;
}

/** Shown as a non-blocking banner when the app cannot keep data on this device. */
export const storageWarning = signal<string | null>(null);

function report(deps: StorageBootDeps, message: string): void {
  if (deps.dev) throw new Error(message);
  (deps.log ?? console.error)(message);
  storageWarning.value = message;
}

/**
 * Installs the device storage before any core store exists. Web keeps core's default
 * (localStorage + IndexedDB), exactly like the PWA. Returns whether device storage is installed.
 */
export function bootStorage(deps: StorageBootDeps): boolean {
  if (deps.platform === 'web') return false;
  if (hasCoreStorage()) {
    report(
      deps,
      'Storage was read before it was installed: data from the last session is missing.',
    );
  }
  if (!deps.fs) {
    report(deps, 'Device storage is unavailable: changes will be lost when the app closes.');
    return false;
  }
  return installPersistentStorage(deps.fs, createSecureKeyValueDriver(deps.secure));
}
