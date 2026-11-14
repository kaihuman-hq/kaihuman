import { getCoreStorage } from '@kaihuman/core';

const LAST_KEY = 'kh.mobile.last-stream';

/** Narrows lists to those whose name contains `query`; with no query the last-used list leads. */
export function jumpStreams<T extends { path: string }>(
  streams: readonly T[],
  query: string,
  nameOf: (path: string) => string,
  lastPath: string | null,
): T[] {
  const q = query.trim().toLowerCase();
  if (q) return streams.filter((s) => nameOf(s.path).toLowerCase().includes(q));
  const last = streams.find((s) => s.path === lastPath);
  return last ? [last, ...streams.filter((s) => s !== last)] : [...streams];
}

export function loadLastStream(): string | null {
  try {
    return getCoreStorage().getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function saveLastStream(path: string): void {
  try {
    getCoreStorage().setItem(LAST_KEY, path);
  } catch {
    // A convenience only; a failed write must not block adding the item.
  }
}
