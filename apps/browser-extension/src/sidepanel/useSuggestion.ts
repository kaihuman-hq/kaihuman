import type { StreamsFile } from '@kaihuman/formats';
import { useEffect, useState } from 'preact/hooks';
import type { InboxRow } from '../background/work/inbox.js';
import {
  type Candidate,
  type Suggestion,
  suggestionOps,
  suggestStream,
} from '../background/work/suggest.js';
import { WORK_KEYS } from '../background/work/types.js';
import { send } from '../palette/port.js';

/** Keyed by the streams' ids and names: a pin elsewhere should not re-ask about every row. */
const signature = (file: StreamsFile) =>
  JSON.stringify(file.streams.map((stream) => [stream.id, stream.name]));

let cache = new Map<string, Promise<Suggestion | null>>();
// One question at a time: the model answers in turn anyway, and the tab card should not wait
// behind a dozen inbox rows asked at once.
let queue: Promise<unknown> = Promise.resolve();

/** For tests: forgets every answer. */
export function resetSuggestions(): void {
  cache = new Map();
  queue = Promise.resolve();
}

export function suggestFor(file: StreamsFile, candidate: Candidate): Promise<Suggestion | null> {
  const key = `${signature(file)}|${candidate.url}`;
  const known = cache.get(key);
  if (known) return known;
  const asked = queue.then(() => suggestStream(file, candidate)).catch(() => null);
  queue = asked;
  cache.set(key, asked);
  return asked;
}

/** The suggestion for a candidate; `undefined` while it is being worked out. */
export function useSuggestion(
  file: StreamsFile | null,
  candidate: Candidate | undefined,
): Suggestion | null | undefined {
  const [answer, setAnswer] = useState<{ key: string; suggestion: Suggestion | null }>();
  const key = file && candidate ? `${signature(file)}|${candidate.url}` : undefined;
  useEffect(() => {
    if (!file || !candidate || key === undefined) return;
    let live = true;
    void suggestFor(file, candidate).then((suggestion) => {
      if (live) setAnswer({ key, suggestion });
    });
    return () => {
      live = false;
    };
    // The key covers what the suggestion depends on; the objects are rebuilt every render.
  }, [key]);
  if (key === undefined) return null;
  return answer?.key === key ? answer.suggestion : undefined;
}

/** The stream a suggestion names, as the panel shows it. */
export const suggestionName = (file: StreamsFile, suggestion: Suggestion) =>
  suggestion.stream.kind === 'new'
    ? suggestion.stream.name
    : (file.streams.find((stream) => stream.id === (suggestion.stream as { id: string }).id)
        ?.name ?? '');

/** Files a candidate where it was suggested; resolves once the worker has queued it. */
export async function fileAsSuggested(suggestion: Suggestion, candidate: Candidate) {
  const { ops } = suggestionOps(suggestion, candidate, new Date().toISOString());
  await send({ type: 'WORK_OPS', ops });
}

/** Most recent keys kept, so the record cannot grow without end. */
const AUTO_FILED_LIMIT = 500;

/**
 * Files Waiting-on-you rows into their suggested streams while the panel is open, each key once:
 * an item the user takes back out of a stream comes back to the inbox and stays there.
 */
export function useAutoFileInbox(
  rows: InboxRow[] | undefined,
  file: StreamsFile | null,
  enabled: boolean,
): void {
  const keys = rows?.map((row) => row.key).join('\n') ?? '';
  useEffect(() => {
    if (!enabled || !file || !rows || rows.length === 0) return;
    let live = true;
    void (async () => {
      const stored = await chrome.storage.local.get(WORK_KEYS.autoFiled);
      const done = new Set<string>((stored[WORK_KEYS.autoFiled] as string[] | undefined) ?? []);
      for (const row of rows) {
        if (!live) return;
        if (done.has(row.key)) continue;
        const suggestion = await suggestFor(file, row);
        // Without a suggestion the row stays where it is; guessing would bury it.
        if (!live || !suggestion) continue;
        try {
          await fileAsSuggested(suggestion, row);
        } catch {
          continue;
        }
        done.add(row.key);
        await chrome.storage.local.set({
          [WORK_KEYS.autoFiled]: [...done].slice(-AUTO_FILED_LIMIT),
        });
      }
    })();
    return () => {
      live = false;
    };
    // `keys` and the streams' signature stand for the rows and the file.
  }, [keys, enabled, file ? signature(file) : '']);
}
