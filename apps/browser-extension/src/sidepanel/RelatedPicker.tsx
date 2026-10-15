import {
  findItemByUrl,
  isSafeUrl,
  newItemId,
  normalizeItemUrl,
  type Stream,
  type StreamsFile,
} from '@kaihuman/formats';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  type Candidate,
  MAX_CANDIDATES,
  MAX_TAB_CANDIDATES,
  profileOf,
} from '../background/ai/grow.js';
import type { InboxRow } from '../background/work/inbox.js';
import { send } from '../palette/port.js';
import { errorText, quiet } from './controls.js';

interface Props {
  stream: Stream;
  file: StreamsFile;
  /** Inbox rows offered beside the open tabs. */
  rows: InboxRow[];
  onClose: () => void;
}

/**
 * Open tabs of this window, then inbox rows, without anything already pinned or repeated. Tabs
 * stop at 30, so a window full of tabs still leaves the inbox rows a place under the cap.
 */
async function collect(file: StreamsFile, rows: InboxRow[]): Promise<Candidate[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true }).catch(() => []);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const add = (url: string | undefined, title: string | undefined, max: number) => {
    if (out.length >= max || !url || !isSafeUrl(url)) return;
    const id = normalizeItemUrl(url);
    if (seen.has(id) || findItemByUrl(file, url)) return;
    seen.add(id);
    out.push({ id, title: title || url, url });
  };
  for (const tab of tabs) add(tab.url, tab.title, MAX_TAB_CANDIDATES);
  for (const row of rows) add(row.url, row.title, MAX_CANDIDATES);
  return out;
}

export function RelatedPicker({ stream, file, rows, onClose }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState(true);
  const [error, setError] = useState<string>();
  // The user's own ticks win over a suggestion that arrives late.
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const found = await collect(file, rows);
      if (!live) return;
      setCandidates(found);
      // The worker asks the model, in its one queue and with a timeout.
      const related: string[] = await send({
        type: 'RELATED_TO',
        profile: profileOf(stream),
        candidates: found,
      }).then(
        (response) => (Array.isArray(response?.related) ? response.related : []),
        () => [],
      );
      if (!live) return;
      if (!touched.current) setChecked(new Set(related));
      setFinding(false);
    })();
    return () => {
      live = false;
    };
    // Opened once per click; the file changing underneath must not re-ask the model.
  }, []);

  const toggle = (id: string) => {
    touched.current = true;
    setChecked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const picked = (candidates ?? []).filter((c) => checked.has(c.id));
  const add = async () => {
    const at = new Date().toISOString();
    try {
      await send({
        type: 'WORK_OPS',
        ops: picked.map((c) => ({
          op: 'pin' as const,
          streamId: stream.id,
          itemId: newItemId(),
          url: c.url,
          title: c.title,
          labels: [],
          at,
        })),
      });
      onClose();
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <fieldset
      aria-label={`Related to ${stream.name}`}
      class="m-0 mb-2 ml-5 flex flex-col gap-2 border-l-2 border-nt-accent bg-nt-row-hover border-y-0 border-r-0 px-3 py-2 text-[12px]"
    >
      <span class="text-nt-muted">
        {finding ? 'Looking for related tabs and items…' : `Add to “${stream.name}”`}
      </span>
      {candidates && candidates.length === 0 && (
        <p class="text-nt-faint">No other open tabs or inbox items to add.</p>
      )}
      <ul class="flex flex-col gap-1">
        {(candidates ?? []).map((c) => (
          <li key={c.id}>
            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-0.5"
                checked={checked.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span class="min-w-0 flex-1 truncate" title={c.url}>
                {c.title}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p class="text-nt-prod [overflow-wrap:anywhere]">{error}</p>}
      <div class="flex gap-1.5">
        <button
          type="button"
          class="bg-nt-accent px-3 py-1 text-[12px] font-bold text-black disabled:opacity-40"
          disabled={picked.length === 0}
          onClick={() => void add()}
        >
          {`Add ${picked.length}`}
        </button>
        <button type="button" class={quiet} onClick={onClose}>
          Close
        </button>
      </div>
    </fieldset>
  );
}
