/**
 * Model answers kept in `chrome.storage.local`, so the new tab page and the side panel can show
 * them without calling the model, and a worker restart does not redo the work.
 */
export const AI_CACHE_KEY = 'aiCache';

const MAX_ENTRIES = 500;

interface Entry {
  value: unknown;
  at: number;
  ttl: number;
}

type Store = Record<string, Entry>;

/** FNV-1a over the parts, separated so that ('a', 'b') and ('ab') differ. */
export function hashKey(...parts: string[]): string {
  let hash = 0x811c9dc5;
  const text = parts.join('\u0000');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

async function readStore(): Promise<Store> {
  const data = await chrome.storage.local.get(AI_CACHE_KEY);
  const store = data[AI_CACHE_KEY];
  return typeof store === 'object' && store !== null ? (store as Store) : {};
}

const fresh = (entry: Entry | undefined, now: number): entry is Entry =>
  entry !== undefined && now - entry.at < entry.ttl;

export async function peek<T>(key: string): Promise<T | undefined> {
  const entry = (await readStore())[key];
  return fresh(entry, Date.now()) ? (entry.value as T) : undefined;
}

// Read-modify-write on one storage key: writes are chained so two puts cannot drop each other.
let writing: Promise<void> = Promise.resolve();

export function put<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const write = writing.then(async () => {
    const now = Date.now();
    const store = await readStore();
    store[key] = { value, at: now, ttl: ttlMs };
    const kept = Object.entries(store)
      .filter(([, entry]) => fresh(entry, now))
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX_ENTRIES);
    await chrome.storage.local.set({ [AI_CACHE_KEY]: Object.fromEntries(kept) });
  });
  writing = write.catch(() => {});
  return write;
}

/** The cached value while it is fresh, else `compute`'s; a null answer is retried next time. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T | null>,
): Promise<T | null> {
  const hit = await peek<T>(key);
  if (hit !== undefined) return hit;
  const value = await compute();
  if (value !== null) await put(key, value, ttlMs);
  return value;
}
