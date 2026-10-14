import { itemRefOf, type Stream, type StreamItem, type StreamOp } from '@kaihuman/formats';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorkSnapshot } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { age } from './age.js';
import { chip, StatusChips } from './StatusChips.js';
import { updateWorkUi } from './useWorkState.js';

const DRAG_TYPE = 'text/kaihuman-item';
const CLICK_DELAY = 250;
const button = 'px-1 text-[13px] text-[#999] disabled:opacity-40';

/** Edits go through the worker, which queues and retries them; a failure surfaces as its banner. */
const sendOps = (ops: StreamOp[]) => {
  void send({ type: 'WORK_OPS', ops }).catch(() => {});
};

const toggleCollapsed = (streamId: string) =>
  updateWorkUi((ui) => ({
    collapsed: ui.collapsed.includes(streamId)
      ? ui.collapsed.filter((id) => id !== streamId)
      : [...ui.collapsed, streamId],
  }));

interface Props {
  stream: Stream;
  index: number;
  count: number;
  statuses: WorkSnapshot['pinned'];
  unread: Set<string>;
  label: string | undefined;
  collapsed: boolean;
  readOnly: boolean;
  streams: Stream[];
  /** Used to open an item at its unread notification thread. */
  threads?: WorkSnapshot['threads'];
}

const iconOf = (ref: ReturnType<typeof itemRefOf>) => {
  if (ref?.kind === 'github-pr') return '⇄';
  if (ref?.kind === 'github-issue') return '◎';
  return ref?.kind === 'link' && ref.host.endsWith('slack.com') ? '#' : '↗';
};

function ItemRow({
  item,
  streams,
  streamId,
  statuses,
  unread,
  threads,
  readOnly,
}: { item: StreamItem; streamId: string } & Pick<
  Props,
  'streams' | 'statuses' | 'unread' | 'threads' | 'readOnly'
>) {
  const ref = itemRefOf(item.url);
  const github = ref && ref.kind !== 'link' ? ref : undefined;
  const status = github ? statuses[github.key] : undefined;
  const live = status && !('error' in status) ? status : undefined;
  const title = live?.title ?? item.title;
  const isUnread = github ? unread.has(github.key) : false;
  const threadId = github
    ? threads?.find((thread) => thread.key === github.key && thread.unread)?.threadId
    : undefined;
  const open = () => {
    const message: Record<string, string> = { type: 'WORK_OPEN', url: item.url };
    if (threadId) message.threadId = threadId;
    void send(message).catch(() => {});
  };
  const editLabels = () => {
    const answer = window.prompt('Labels, separated by commas', item.labels.join(', '));
    if (answer === null) return;
    sendOps([
      {
        op: 'setLabels',
        itemId: item.id,
        labels: answer
          .split(',')
          .map((label) => label.trim())
          .filter((label) => label !== ''),
      },
    ]);
  };
  return (
    <li
      class="flex flex-col gap-1 border-t border-[#222] py-2 text-[13px]"
      draggable={!readOnly}
      onDragStart={(event) => {
        event.dataTransfer?.setData(DRAG_TYPE, item.id);
      }}
    >
      <div class="flex items-start gap-1">
        <span aria-hidden="true" class="text-[#999]">
          {iconOf(ref)}
        </span>
        {ref ? (
          <button type="button" class="flex-1 text-left underline break-words" onClick={open}>
            {title}
          </button>
        ) : (
          <span class="flex-1 break-words">{title}</span>
        )}
        <button type="button" class={button} disabled={readOnly} onClick={editLabels}>
          Labels
        </button>
        <select
          class="bg-[#050505] text-[12px] text-[#999] max-w-[70px] disabled:opacity-40"
          aria-label={`Move ${title}`}
          disabled={readOnly}
          value=""
          onChange={(event) => {
            const target = event.currentTarget;
            const to = streams.find((s) => s.id === target.value);
            target.value = '';
            if (to) sendOps([{ op: 'move', itemId: item.id, streamId: to.id }]);
          }}
        >
          <option value="">Move</option>
          {streams
            .filter((s) => s.id !== streamId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          class={button}
          aria-label={`Done ${title}`}
          disabled={readOnly}
          onClick={() =>
            sendOps([{ op: 'markDone', itemId: item.id, at: new Date().toISOString() }])
          }
        >
          ✓
        </button>
        <button
          type="button"
          class={button}
          aria-label={`Remove ${title}`}
          disabled={readOnly}
          onClick={() => sendOps([{ op: 'remove', itemId: item.id }])}
        >
          ✕
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-1 text-[12px] text-[#999]">
        {github && <span>{`${github.owner}/${github.repo}#${github.number}`}</span>}
        <StatusChips status={status} unread={isUnread} />
        {item.labels.map((name) => (
          <span key={name} class={chip}>
            {name}
          </span>
        ))}
        <span class="ml-auto">{age(Date.parse(item.addedAt))}</span>
      </div>
    </li>
  );
}

function DoneRow({ item, readOnly }: { item: StreamItem; readOnly: boolean }) {
  const ref = itemRefOf(item.url);
  return (
    <li class="flex items-center gap-1 border-t border-[#222] py-1 text-[13px] text-[#999]">
      <span aria-hidden="true">{iconOf(ref)}</span>
      <span class="flex-1 line-through break-words">{item.title}</span>
      <button
        type="button"
        class={button}
        disabled={readOnly}
        onClick={() => sendOps([{ op: 'undone', itemId: item.id }])}
      >
        Undo
      </button>
    </li>
  );
}

export function StreamSection(props: Props) {
  const { stream, index, count, label, collapsed, readOnly, streams } = props;
  const [renaming, setRenaming] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const toggleTimer = useRef<ReturnType<typeof setTimeout>>();
  // Set once Enter or Escape has settled the rename, so the blur of the closing input is ignored.
  const renameSettled = useRef(false);
  useEffect(() => () => clearTimeout(toggleTimer.current), []);
  const matches = (item: StreamItem) => label === undefined || item.labels.includes(label);
  const open = stream.items.filter((item) => !item.doneAt && matches(item));
  const done = stream.items.filter((item) => item.doneAt && matches(item));
  // A filter hides streams with nothing under that label.
  if (label !== undefined && open.length + done.length === 0) return null;

  const reorder = (by: number) => {
    const order = streams.map((s) => s.id);
    const [moved] = order.splice(index, 1);
    if (moved) order.splice(index + by, 0, moved);
    sendOps([{ op: 'reorderStreams', order }]);
  };
  const remove = () => {
    const n = stream.items.length;
    if (n > 0 && !window.confirm(`Delete "${stream.name}" and its ${n} items?`)) return;
    sendOps([{ op: 'deleteStream', streamId: stream.id }]);
  };
  const commitRename = (value: string) => {
    if (renameSettled.current) return;
    renameSettled.current = true;
    const name = value.trim();
    setRenaming(false);
    if (name && name !== stream.name) {
      sendOps([{ op: 'renameStream', streamId: stream.id, name }]);
    }
  };

  return (
    <section class="flex flex-col">
      <h3
        class="flex items-center gap-1 text-[13px] font-bold"
        onDragOver={(event) => {
          if (readOnly) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (readOnly) return;
          event.preventDefault();
          const itemId = event.dataTransfer?.getData(DRAG_TYPE);
          const own = stream.items.some((item) => item.id === itemId);
          if (itemId && !own)
            sendOps([{ op: 'move', itemId: itemId as never, streamId: stream.id }]);
        }}
      >
        {renaming ? (
          <input
            class="flex-1 bg-[#111] px-1 font-normal"
            aria-label="Stream name"
            defaultValue={stream.name}
            ref={(el) => el?.focus()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename(event.currentTarget.value);
              if (event.key === 'Escape') {
                renameSettled.current = true;
                setRenaming(false);
              }
            }}
            // Clicking away keeps what was typed, as Enter does; only Escape throws it away.
            onBlur={(event) => {
              commitRename(event.currentTarget.value);
            }}
          />
        ) : (
          <button
            type="button"
            class="flex-1 text-left"
            onClick={(event) => {
              if (readOnly) return void toggleCollapsed(stream.id);
              // A double click is two clicks then dblclick: wait to see whether it becomes a rename.
              if (event.detail > 1) return;
              clearTimeout(toggleTimer.current);
              toggleTimer.current = setTimeout(() => void toggleCollapsed(stream.id), CLICK_DELAY);
            }}
            onDblClick={() => {
              if (readOnly) return;
              clearTimeout(toggleTimer.current);
              renameSettled.current = false;
              setRenaming(true);
            }}
          >
            {`${collapsed ? '▸' : '▾'} ${stream.name} (${open.length})`}
          </button>
        )}
        <button
          type="button"
          class={button}
          aria-label={`Move ${stream.name} up`}
          disabled={readOnly || index === 0}
          onClick={() => reorder(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          class={button}
          aria-label={`Move ${stream.name} down`}
          disabled={readOnly || index === count - 1}
          onClick={() => reorder(1)}
        >
          ↓
        </button>
        <button type="button" class={button} disabled={readOnly} onClick={remove}>
          Delete
        </button>
      </h3>
      {!collapsed && (
        <>
          {open.length === 0 && done.length === 0 ? (
            <p class="text-[12px] text-[#999]">Nothing here.</p>
          ) : (
            <ul>
              {open.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  streamId={stream.id}
                  streams={streams}
                  statuses={props.statuses}
                  unread={props.unread}
                  threads={props.threads}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          )}
          {done.length > 0 && (
            <>
              <button
                type="button"
                class="text-left text-[12px] text-[#999] py-1"
                onClick={() => setShowDone(!showDone)}
              >
                {`Done (${done.length})`}
              </button>
              {showDone && (
                <ul>
                  {done.map((item) => (
                    <DoneRow key={item.id} item={item} readOnly={readOnly} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
