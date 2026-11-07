import { getCoreStorage } from './storage/adapter.js';

/** Kept for backwards compatibility: resolves to the configured adapter. Prefer `getCoreStorage()`. */
export const dbPromise = Promise.resolve().then(() => getCoreStorage());
