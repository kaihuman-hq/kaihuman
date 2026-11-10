import { type ReadonlySignal, signal } from '@preact/signals';
import { useSignalValue } from '../views/use-signal.js';
import type { TileFile } from './dashboards.js';

/**
 * The dashboard tile files last loaded by the Today screen. The ＋ menu and the quick-entry sheet
 * live outside that screen and build their Track entries from these, without a second load.
 */
const files = signal<readonly TileFile[]>([]);

export const loadedTiles: ReadonlySignal<readonly TileFile[]> = files;

/** Replaces the cache; the same path on several pages is kept once (first wins). */
export function setLoadedTiles(next: readonly TileFile[]): void {
  const seen = new Set<string>();
  files.value = next.filter((f) => !seen.has(f.path) && seen.add(f.path));
}

const written = signal<TileFile | null>(null);

/** The last tile file written from outside the dashboard (＋ menu, quick-entry); the dashboard patches its pages from it. */
export const tileWrite: ReadonlySignal<TileFile | null> = written;

/** Patches one file after a write so the menu's next glance and the dashboard see the new text. */
export function updateLoadedTile(path: string, content: string): void {
  files.value = files.value.map((f) => (f.path === path ? { path, content } : f));
  written.value = { path, content };
}

export const useLoadedTiles = (): readonly TileFile[] => useSignalValue(loadedTiles);
