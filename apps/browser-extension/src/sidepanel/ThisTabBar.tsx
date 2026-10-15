import {
  findItemByUrl,
  isSafeUrl,
  newItemId,
  newStreamId,
  type StreamId,
  type StreamOp,
  type StreamsFile,
} from '@kaihuman/formats';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorkUi } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { Choice, errorText, field, primary, splitLabels } from './controls.js';
import { useSuggestion } from './useSuggestion.js';
import { updateWorkUi } from './useWorkState.js';

const NEW_STREAM = '__new__';

interface TabInfo {
  url?: string;
  title?: string;
}

/** The active tab of this window, kept current as the user switches and navigates. */
function useActiveTab(): TabInfo | undefined {
  const [tab, setTab] = useState<TabInfo>();
  useEffect(() => {
    let live = true;
    let activeId: number | undefined;
    const load = async () => {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeId = active?.id;
      if (live) setTab(active ? { url: active.url, title: active.title } : undefined);
    };
    const onUpdated = (tabId: number, changeInfo: { url?: string; title?: string }) => {
      if (tabId === activeId && (changeInfo.url !== undefined || changeInfo.title !== undefined)) {
        void load();
      }
    };
    void load();
    chrome.tabs.onActivated.addListener(load);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      live = false;
      chrome.tabs.onActivated.removeListener(load);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return tab;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const box = 'flex flex-col gap-2.5 border border-nt-divider bg-nt-row-hover p-3';

/** The page being looked at, clamped so a long title never pushes the controls off screen. */
function Page({ title, url }: { title: string; url: string }) {
  return (
    <div class="flex min-w-0 flex-col gap-0.5">
      <p
        class="text-[13px] font-bold leading-[18px] line-clamp-2 [overflow-wrap:anywhere]"
        title={title}
      >
        {title}
      </p>
      <p class="truncate text-[11px] text-nt-muted" title={url}>
        {hostOf(url)}
      </p>
    </div>
  );
}

interface CardProps {
  file: StreamsFile | null;
  ui: WorkUi;
  readOnly: boolean;
}

export function ThisTabBar(props: CardProps) {
  const tab = useActiveTab();
  if (!tab) return null;
  // Keyed by the page, so a choice made for one tab does not carry over to the next.
  return <TabCard key={tab.url ?? ''} tab={tab} {...props} />;
}

function TabCard({ tab, file, ui, readOnly }: CardProps & { tab: TabInfo }) {
  // Unset until the user picks or types, so a suggestion arriving later can still fill them in.
  const [streamId, setStreamId] = useState<string>();
  const [typedName, setNewName] = useState<string>();
  const [typedLabels, setLabels] = useState<string>();
  const [error, setError] = useState<string>();
  const nameInput = useRef<HTMLInputElement>(null);
  // Focus follows a click on "+ New stream"; an empty file opens on it without taking focus.
  useEffect(() => {
    if (streamId === NEW_STREAM) nameInput.current?.focus();
  }, [streamId]);
  const pinnable = tab.url !== undefined && isSafeUrl(tab.url);
  const candidate =
    pinnable && tab.url && file && !findItemByUrl(file, tab.url) && !readOnly
      ? { url: tab.url, title: tab.title || tab.url }
      : undefined;
  const suggestion = useSuggestion(file, candidate);

  if (!tab.url || !pinnable) {
    return (
      <section class={`${box} text-[12px] text-nt-muted`}>This page cannot be pinned.</section>
    );
  }
  const url = tab.url;
  const title = tab.title || url;
  const streams = file?.streams ?? [];

  const run = async (ops: StreamOp[]): Promise<boolean> => {
    setError(undefined);
    try {
      await send({ type: 'WORK_OPS', ops });
      return true;
    } catch (failure) {
      setError(errorText(failure));
      return false;
    }
  };

  const found = file ? findItemByUrl(file, url) : undefined;
  if (found) {
    const { stream, item } = found;
    const isDone = item.doneAt !== undefined;
    const others = streams.filter((candidate) => candidate.id !== stream.id);
    return (
      <section class={box} aria-label="This tab">
        <Page title={title} url={url} />
        <div class="flex items-center gap-2">
          <p class="flex min-w-0 flex-1 items-baseline gap-1.5 text-[12px] text-nt-muted">
            <span class="shrink-0">{isDone ? 'Done in ' : 'In '}</span>
            <span class={`truncate ${isDone ? 'text-nt-done' : 'text-nt-fg'}`} title={stream.name}>
              {stream.name}
            </span>
          </p>
          <button
            type="button"
            class={primary}
            disabled={readOnly}
            onClick={() =>
              void run(
                isDone
                  ? [{ op: 'undone', itemId: item.id }]
                  : [{ op: 'markDone', itemId: item.id, at: new Date().toISOString() }],
              )
            }
          >
            {isDone ? 'Undo' : '✓ Done'}
          </button>
        </div>
        {others.length > 0 && (
          <div class="flex flex-wrap items-center gap-1">
            <span class="pr-1 text-[11px] text-nt-muted">Move to</span>
            {others.map((candidate) => (
              <Choice
                key={candidate.id}
                title={candidate.name}
                disabled={readOnly}
                onClick={() =>
                  void run([{ op: 'move', itemId: item.id, streamId: candidate.id as StreamId }])
                }
              >
                {candidate.name}
              </Choice>
            ))}
          </div>
        )}
        {error && <p class="text-[12px] text-nt-prod [overflow-wrap:anywhere]">{error}</p>}
      </section>
    );
  }

  const suggested =
    suggestion?.stream.kind === 'new'
      ? NEW_STREAM
      : suggestion?.stream.kind === 'existing'
        ? suggestion.stream.id
        : undefined;
  const selected =
    streams.length === 0
      ? NEW_STREAM
      : (streamId ??
        suggested ??
        (streams.some((s) => s.id === ui.lastStreamId) ? ui.lastStreamId : streams[0]?.id));
  const naming = selected === NEW_STREAM;
  const newName = typedName ?? (suggestion?.stream.kind === 'new' ? suggestion.stream.name : '');
  const labels = typedLabels ?? suggestion?.labels.join(', ') ?? '';
  // Shown while the pick is still the suggestion's, so the user knows where the choice came from.
  const showsSuggestion = suggestion && streamId === undefined;

  const pin = async () => {
    const at = new Date().toISOString();
    const ops: StreamOp[] = [];
    let target = selected as StreamId;
    if (naming) {
      const name = newName.trim();
      if (!name) {
        setError('Name the new stream first.');
        nameInput.current?.focus();
        return;
      }
      target = newStreamId();
      ops.push({ op: 'addStream', streamId: target, name, at });
    }
    ops.push({
      op: 'pin',
      streamId: target,
      itemId: newItemId(),
      url,
      title,
      labels: splitLabels(labels),
      at,
    });
    if (!(await run(ops))) return;
    // A stream made here becomes the next pin's default, as a picked one does.
    await updateWorkUi({ lastStreamId: target });
    setStreamId(undefined);
    setNewName(undefined);
    setLabels(undefined);
  };

  return (
    <form
      class={box}
      aria-label="This tab"
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly) void pin();
      }}
    >
      <Page title={title} url={url} />
      <div class="flex flex-col gap-1.5">
        <p class="flex items-baseline gap-2 text-[11px] text-nt-muted">
          <span>Pin to</span>
          {suggestion === undefined && candidate && <span class="text-nt-faint">Suggesting…</span>}
          {showsSuggestion && (
            <span
              class="text-nt-accent"
              title={
                suggestion.source === 'model'
                  ? "Suggested by Chrome's on-device model"
                  : 'Most items from this repository are in this stream'
              }
            >
              Suggested
            </span>
          )}
        </p>
        <div class="flex flex-wrap gap-1">
          {streams.map((stream) => (
            <Choice
              key={stream.id}
              title={stream.name}
              selected={selected === stream.id}
              disabled={readOnly}
              onClick={() => {
                setError(undefined);
                setStreamId(stream.id);
              }}
            >
              {stream.name}
            </Choice>
          ))}
          <Choice
            selected={naming}
            disabled={readOnly}
            onClick={() => {
              setError(undefined);
              setStreamId(NEW_STREAM);
            }}
          >
            + New stream
          </Choice>
        </div>
        {naming && (
          <input
            aria-label="New stream name"
            placeholder="Name the new stream"
            class={field}
            value={newName}
            disabled={readOnly}
            ref={nameInput}
            onInput={(event) => setNewName(event.currentTarget.value)}
          />
        )}
      </div>
      <div class="flex gap-1.5">
        <input
          aria-label="Labels"
          class={`${field} flex-1`}
          placeholder="Labels, comma separated"
          value={labels}
          disabled={readOnly}
          onInput={(event) => setLabels(event.currentTarget.value)}
        />
        <button type="submit" class={primary} disabled={readOnly}>
          Pin
        </button>
      </div>
      {error && <p class="text-[12px] text-nt-prod [overflow-wrap:anywhere]">{error}</p>}
    </form>
  );
}
