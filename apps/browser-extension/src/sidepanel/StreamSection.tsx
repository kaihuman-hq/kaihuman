import { itemRefOf, type Stream, type StreamItem } from '@kaihuman/formats';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorkSnapshot } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { age } from './age.js';
import { Choice, InlineInput, iconButton, quiet, sendOps, splitLabels } from './controls.js';
import { labelChip, Rail, StatusChips, toneOf } from './StatusChips.js';
import { updateWorkUi } from './useWorkState.js';

const DRAG_TYPE = 'text/kaihuman-item';
const CLICK_DELAY = 250;

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

/** Where an item lives, short enough for the meta line: `owner/repo#7` or the host. */
const whereOf = (ref: ReturnType<typeof itemRefOf>) => {
  if (!ref) return undefined;
  if (ref.kind === 'link') return ref.host.replace(/^www\./, '');
  return `${ref.owner}/${ref.repo}#${ref.number}`;
};

function ItemActions({
  item,
  streamId,
  streams,
  readOnly,
}: { item: StreamItem; streamId: string } & Pick<Props, 'streams' | 'readOnly'>) {
  const [editing, setEditing] = useState(false);
  const others = streams.filter((s) => s.id !== streamId);
  return (
    <div class="flex flex-col gap-2 border-t border-nt-row pt-2">
      {others.length > 0 && (
        <div class="flex flex-wrap items-center gap-1">
          <span class="pr-1 text-[11px] text-nt-muted">Move to</span>
          {others.map((s) => (
            <Choice
              key={s.id}
              title={s.name}
              disabled={readOnly}
              onClick={() => sendOps([{ op: 'move', itemId: item.id, streamId: s.id }])}
            >
              {s.name}
            </Choice>
          ))}
        </div>
      )}
      {editing ? (
        <InlineInput
          label="Labels"
          placeholder="Labels, separated by commas"
          submit="Save"
          initial={item.labels.join(', ')}
          onSubmit={(value) => {
            setEditing(false);
            sendOps([{ op: 'setLabels', itemId: item.id, labels: splitLabels(value) }]);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div class="flex gap-1.5">
          <button type="button" class={quiet} disabled={readOnly} onClick={() => setEditing(true)}>
            Edit labels
          </button>
          <button
            type="button"
            class={`${quiet} hover:border-nt-prod hover:text-nt-prod`}
            disabled={readOnly}
            onClick={() => sendOps([{ op: 'remove', itemId: item.id }])}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

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
  const [actions, setActions] = useState(false);
  const ref = itemRefOf(item.url);
  const github = ref && ref.kind !== 'link' ? ref : undefined;
  const status = github ? statuses[github.key] : undefined;
  const live = status && !('error' in status) ? status : undefined;
  const title = live?.title ?? item.title;
  const isUnread = github ? unread.has(github.key) : false;
  const threadId = github
    ? threads?.find((thread) => thread.key === github.key && thread.unread)?.threadId
    : undefined;
  const where = whereOf(ref);
  const open = () => {
    const message: Record<string, string> = { type: 'WORK_OPEN', url: item.url };
    if (threadId) message.threadId = threadId;
    void send(message).catch(() => {});
  };
  return (
    <li
      class="flex gap-2.5 py-2"
      draggable={!readOnly}
      onDragStart={(event) => {
        event.dataTransfer?.setData(DRAG_TYPE, item.id);
      }}
    >
      <Rail tone={toneOf(status, isUnread)} />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex items-start gap-1.5">
          <span
            aria-hidden="true"
            class="w-3 shrink-0 text-center text-[12px] leading-[18px] text-nt-faint"
          >
            {iconOf(ref)}
          </span>
          {ref ? (
            <button
              type="button"
              title={title}
              class="min-w-0 flex-1 text-left text-[13px] leading-[18px] line-clamp-2 [overflow-wrap:anywhere] hover:text-nt-accent"
              onClick={open}
            >
              {title}
            </button>
          ) : (
            <span
              title={title}
              class="min-w-0 flex-1 text-[13px] leading-[18px] line-clamp-2 [overflow-wrap:anywhere]"
            >
              {title}
            </span>
          )}
          <button
            type="button"
            class={`${iconButton} hover:text-nt-done`}
            aria-label={`Done ${title}`}
            title="Mark done"
            disabled={readOnly}
            onClick={() =>
              sendOps([{ op: 'markDone', itemId: item.id, at: new Date().toISOString() }])
            }
          >
            ✓
          </button>
          <button
            type="button"
            class={iconButton}
            aria-label={`More for ${title}`}
            aria-expanded={actions}
            title="Move, labels, remove"
            onClick={() => setActions(!actions)}
          >
            ⋯
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-1 pl-[18px]">
          {where && (
            <span class="min-w-0 max-w-full truncate text-[11px] text-nt-muted" title={where}>
              {where}
            </span>
          )}
          <StatusChips status={status} unread={isUnread} />
          {item.labels.map((name) => (
            <span key={name} class={labelChip} title={name}>
              {name}
            </span>
          ))}
          <span class="ml-auto shrink-0 text-[11px] text-nt-faint">
            {age(Date.parse(item.addedAt))}
          </span>
        </div>
        {actions && (
          <div class="pl-[18px]">
            <ItemActions item={item} streamId={streamId} streams={streams} readOnly={readOnly} />
          </div>
        )}
      </div>
    </li>
  );
}

function DoneRow({ item, readOnly }: { item: StreamItem; readOnly: boolean }) {
  const ref = itemRefOf(item.url);
  return (
    <li class="flex items-center gap-1.5 py-1 text-[12px] text-nt-faint">
      <span aria-hidden="true" class="w-3 shrink-0 text-center">
        {iconOf(ref)}
      </span>
      <span class="min-w-0 flex-1 truncate line-through" title={item.title}>
        {item.title}
      </span>
      <button
        type="button"
        class="shrink-0 px-1 text-[12px] text-nt-muted hover:text-nt-fg disabled:opacity-40"
        disabled={readOnly}
        onClick={() => sendOps([{ op: 'undone', itemId: item.id }])}
      >
        Undo
      </button>
    </li>
  );
}

type Menu = 'closed' | 'open' | 'confirm-delete';

export function StreamSection(props: Props) {
  const { stream, index, count, label, collapsed, readOnly, streams } = props;
  const [renaming, setRenaming] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<Menu>('closed');
  const [dropping, setDropping] = useState(false);
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
    // An empty stream loses nothing, so only a stream with items asks first.
    if (stream.items.length > 0 && menu !== 'confirm-delete') return setMenu('confirm-delete');
    setMenu('closed');
    sendOps([{ op: 'deleteStream', streamId: stream.id }]);
  };
  const startRename = () => {
    clearTimeout(toggleTimer.current);
    renameSettled.current = false;
    setMenu('closed');
    setRenaming(true);
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
  const total = stream.items.length;

  return (
    <section
      aria-label={stream.name}
      class={`flex flex-col border-l pl-2.5 ${dropping ? 'border-nt-accent' : 'border-transparent'}`}
      onDragOver={(event) => {
        if (readOnly) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        setDropping(false);
        if (readOnly) return;
        event.preventDefault();
        const itemId = event.dataTransfer?.getData(DRAG_TYPE);
        const own = stream.items.some((item) => item.id === itemId);
        if (itemId && !own) sendOps([{ op: 'move', itemId: itemId as never, streamId: stream.id }]);
      }}
    >
      <h3 class="flex items-center gap-1 py-1 text-[13px] font-bold">
        {renaming ? (
          <input
            class="min-w-0 flex-1 border border-nt-pin bg-nt-bg px-1.5 py-0.5 text-[13px] font-normal"
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
            aria-expanded={!collapsed}
            title={stream.name}
            class="flex min-w-0 flex-1 items-baseline gap-2 text-left"
            onClick={(event) => {
              if (readOnly) return void toggleCollapsed(stream.id);
              // A double click is two clicks then dblclick: wait to see whether it becomes a rename.
              if (event.detail > 1) return;
              clearTimeout(toggleTimer.current);
              toggleTimer.current = setTimeout(() => void toggleCollapsed(stream.id), CLICK_DELAY);
            }}
            onDblClick={() => {
              if (!readOnly) startRename();
            }}
          >
            <span aria-hidden="true" class="w-3 shrink-0 text-[10px] text-nt-faint">
              {collapsed ? '▸' : '▾'}
            </span>
            <span data-name class="truncate">
              {stream.name}
            </span>
            <span
              data-count
              class={`shrink-0 font-normal tabular-nums ${open.length > 0 ? 'text-nt-accent' : 'text-nt-faint'}`}
            >
              {open.length}
            </span>
          </button>
        )}
        <button
          type="button"
          class={iconButton}
          aria-label={`Options for ${stream.name}`}
          aria-expanded={menu !== 'closed'}
          title="Rename, reorder, delete"
          onClick={() => setMenu(menu === 'closed' ? 'open' : 'closed')}
        >
          ⋯
        </button>
      </h3>
      {menu === 'open' && (
        <div class="flex flex-wrap gap-1.5 pb-2 pl-5">
          <button type="button" class={quiet} disabled={readOnly} onClick={startRename}>
            Rename
          </button>
          <button
            type="button"
            class={quiet}
            aria-label={`Move ${stream.name} up`}
            disabled={readOnly || index === 0}
            onClick={() => reorder(-1)}
          >
            ↑ Up
          </button>
          <button
            type="button"
            class={quiet}
            aria-label={`Move ${stream.name} down`}
            disabled={readOnly || index === count - 1}
            onClick={() => reorder(1)}
          >
            ↓ Down
          </button>
          <button
            type="button"
            class={`${quiet} hover:border-nt-prod hover:text-nt-prod`}
            disabled={readOnly}
            onClick={remove}
          >
            Delete
          </button>
        </div>
      )}
      {menu === 'confirm-delete' && (
        <div class="mb-2 ml-5 flex flex-col gap-2 border-l-2 border-nt-prod bg-nt-row-hover px-3 py-2 text-[12px]">
          <p class="[overflow-wrap:anywhere]">
            {`Delete “${stream.name}” and its ${total} ${total === 1 ? 'item' : 'items'}?`}
          </p>
          <div class="flex gap-1.5">
            <button
              type="button"
              class="bg-nt-prod px-3 py-1 text-[12px] font-bold text-black"
              onClick={remove}
            >
              Delete stream
            </button>
            <button type="button" class={quiet} onClick={() => setMenu('closed')}>
              Keep
            </button>
          </div>
        </div>
      )}
      {!collapsed && (
        <div class="pl-5">
          {open.length === 0 && done.length === 0 ? (
            <p class="py-1 text-[12px] text-nt-faint">
              Empty. Pin the open tab above or drag an item here.
            </p>
          ) : (
            <ul class="flex flex-col divide-y divide-nt-row">
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
                aria-expanded={showDone}
                class="py-1 text-left text-[11px] text-nt-muted hover:text-nt-fg"
                onClick={() => setShowDone(!showDone)}
              >
                {`${showDone ? '▾' : '▸'} Done ${done.length}`}
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
        </div>
      )}
    </section>
  );
}
