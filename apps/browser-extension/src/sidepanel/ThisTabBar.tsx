import {
  findItemByUrl,
  isSafeUrl,
  newItemId,
  newStreamId,
  type StreamId,
  type StreamOp,
  type StreamsFile,
} from '@kaihuman/formats';
import { useEffect, useState } from 'preact/hooks';
import type { WorkUi } from '../background/work/types.js';
import { send } from '../palette/port.js';
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

const field = 'bg-[#111] border border-[#333] text-[#e6e6e6] text-[13px] px-2 py-1 min-w-0';
const action = 'px-3 py-1 bg-[#e6e6e6] text-black text-[13px] font-bold disabled:opacity-50';

export function ThisTabBar({
  file,
  ui,
  readOnly,
}: {
  file: StreamsFile | null;
  ui: WorkUi;
  readOnly: boolean;
}) {
  const tab = useActiveTab();
  const [streamId, setStreamId] = useState<string>();
  const [labels, setLabels] = useState('');
  const [error, setError] = useState<string>();

  if (!tab) return null;
  const box = 'border border-[#222] p-3 flex flex-col gap-2 text-[13px]';
  if (!tab.url || !isSafeUrl(tab.url)) {
    return <section class={box}>This page cannot be pinned.</section>;
  }
  const url = tab.url;
  const streams = file?.streams ?? [];

  const run = async (ops: StreamOp[]): Promise<boolean> => {
    setError(undefined);
    try {
      await send({ type: 'WORK_OPS', ops });
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return false;
    }
  };

  const found = file ? findItemByUrl(file, url) : undefined;
  if (found) {
    const { stream, item } = found;
    return (
      <section class={box}>
        <div class="truncate">In {stream.name}</div>
        <div class="flex gap-2 items-center">
          <button
            type="button"
            class={action}
            disabled={readOnly || item.doneAt !== undefined}
            onClick={() =>
              void run([{ op: 'markDone', itemId: item.id, at: new Date().toISOString() }])
            }
          >
            ✓ Done
          </button>
          <select
            aria-label="Move"
            class={`${field} flex-1`}
            disabled={readOnly}
            value={stream.id}
            onChange={(event) => {
              const to = event.currentTarget.value as StreamId;
              if (to !== stream.id) void run([{ op: 'move', itemId: item.id, streamId: to }]);
            }}
          >
            {streams.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                Move to {candidate.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p class="text-red-400 break-words">{error}</p>}
      </section>
    );
  }

  const selected =
    streams.length === 0
      ? NEW_STREAM
      : (streamId ??
        (streams.some((s) => s.id === ui.lastStreamId) ? ui.lastStreamId : streams[0]?.id));

  const pin = async () => {
    const at = new Date().toISOString();
    const ops: StreamOp[] = [];
    let target = selected as StreamId;
    if (selected === NEW_STREAM) {
      const name = window.prompt('Name of the new stream')?.trim();
      if (!name) return;
      target = newStreamId();
      ops.push({ op: 'addStream', streamId: target, name, at });
    }
    ops.push({
      op: 'pin',
      streamId: target,
      itemId: newItemId(),
      url,
      title: tab.title || url,
      labels: labels
        .split(',')
        .map((label) => label.trim())
        .filter((label) => label !== ''),
      at,
    });
    if (!(await run(ops))) return;
    if (selected !== NEW_STREAM) await updateWorkUi({ lastStreamId: target });
    setLabels('');
  };

  return (
    <section class={box}>
      <div class="truncate" title={url}>
        {tab.title || url}
      </div>
      <div class="flex gap-2">
        <select
          aria-label="Stream"
          class={`${field} flex-1`}
          disabled={readOnly}
          value={selected}
          onChange={(event) => setStreamId(event.currentTarget.value)}
        >
          {streams.map((stream) => (
            <option key={stream.id} value={stream.id}>
              {stream.name}
            </option>
          ))}
          <option value={NEW_STREAM}>New stream…</option>
        </select>
        <input
          aria-label="Labels"
          class={`${field} flex-1`}
          placeholder="labels, comma separated"
          value={labels}
          disabled={readOnly}
          onInput={(event) => setLabels(event.currentTarget.value)}
        />
        <button type="button" class={action} disabled={readOnly} onClick={() => void pin()}>
          Pin
        </button>
      </div>
      {error && <p class="text-red-400 break-words">{error}</p>}
    </section>
  );
}
