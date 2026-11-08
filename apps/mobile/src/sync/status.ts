import { signal } from '@preact/signals';

export type SyncTrigger =
  | 'launch'
  | 'foreground'
  | 'focus'
  | 'pull'
  | 'poll'
  | 'write'
  | 'online'
  | 'background';

export interface SyncStatus {
  /** `syncing` while a run is in flight; `offline` when the network is down. */
  phase: 'idle' | 'syncing' | 'offline' | 'error';
  /** Epoch ms of the last successful run; null before the first. */
  lastSyncedAt: number | null;
  /** Local edits not yet on GitHub. */
  pending: number;
  /** Paths whose merge needs a decision. */
  conflicts: string[];
  /** Message of the last failed run; cleared by a successful one. */
  error: string | null;
}

export const initialSyncStatus: SyncStatus = {
  phase: 'idle',
  lastSyncedAt: null,
  pending: 0,
  conflicts: [],
  error: null,
};

export const syncStatus = signal<SyncStatus>(initialSyncStatus);

/** Bumped after every run that may have changed data, so mounted screens re-read. */
export const syncRevision = signal(0);
