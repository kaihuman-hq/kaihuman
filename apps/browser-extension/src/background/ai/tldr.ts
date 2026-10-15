/**
 * One-line TL;DR for the PRs and issues waiting on the user, shown under the title in the side
 * panel. Written ahead of time by the precompute run, so opening the panel never waits on the model.
 */
import { WORK_KEYS, type WorkItemStatus, type WorkSnapshot } from '../work/types.js';
import { cached, peek } from './cache.js';
import { summarize } from './model.js';
import { readAiSettings } from './settings.js';

export interface TldrRow {
  key: string;
  updatedAt: string;
  title: string;
  body?: string;
}

// The key carries updatedAt, so a changed item gets a new summary; the TTL only bounds old entries.
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
// The newest rows first: the model is slow and the panel shows the top of the list.
const MAX_ROWS = 30;

export const tldrKey = (row: Pick<TldrRow, 'key' | 'updatedAt'>) =>
  `tldr:${row.key}@${row.updatedAt}`;

/** Takes the first line: the summarizer may add more, and the panel has room for one. */
const oneLine = (text: string) => text.split('\n')[0].trim();

export async function summarizeWaiting(rows: TldrRow[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of rows.slice(0, MAX_ROWS)) {
    if (!row.body) continue;
    const text = await cached<string>(tldrKey(row), CACHE_TTL_MS, async () => {
      const summary = await summarize(`${row.title}\n\n${row.body}`, {
        type: 'tldr',
        length: 'short',
        priority: 'background',
      });
      return summary ? oneLine(summary) || null : null;
    });
    if (text) out[row.key] = text;
  }
  return out;
}

const WAITING = [
  'review-requested',
  'assigned',
  'failing',
  'changes-requested',
  'ready-to-merge',
] as const;

/** The items of the five waiting searches, newest first, each once. */
export function waitingRows(snapshot: WorkSnapshot | undefined): TldrRow[] {
  const seen = new Map<string, WorkItemStatus>();
  for (const reason of WAITING) {
    for (const item of snapshot?.searches[reason] ?? []) {
      const prev = seen.get(item.key);
      if (!prev || (!prev.body && item.body)) seen.set(item.key, item);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ key, updatedAt, title, body }) => ({ key, updatedAt, title, body }));
}

const readSnapshot = async () =>
  (await chrome.storage.local.get(WORK_KEYS.snapshot))[WORK_KEYS.snapshot] as
    | WorkSnapshot
    | undefined;

export async function precomputeTldrs(): Promise<void> {
  if (!(await readAiSettings()).sidePanel) return;
  await summarizeWaiting(waitingRows(await readSnapshot()));
}

/** What is already written, by item key; never calls the model. */
export async function readTldrs(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const row of waitingRows(await readSnapshot()).slice(0, MAX_ROWS)) {
    const text = await peek<string>(tldrKey(row));
    if (text) out[row.key] = text;
  }
  return out;
}
