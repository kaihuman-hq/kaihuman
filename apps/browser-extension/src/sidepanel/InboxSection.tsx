import { newItemId, newStreamId, type StreamOp, type StreamsFile } from '@kaihuman/formats';
import { useState } from 'preact/hooks';
import type { InboxRow } from '../background/work/inbox.js';
import type { WorkItemStatus } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { age } from './age.js';
import { chip, StatusChips } from './StatusChips.js';

const REASON_LABELS: Record<string, string> = {
  'review-requested': 'review requested',
  assigned: 'assigned',
  failing: 'CI failing',
  'changes-requested': 'changes requested',
  'ready-to-merge': 'ready to merge',
};
const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason.replaceAll('_', ' ');

const iconButton = 'px-1 text-[13px] text-[#999] disabled:opacity-40';

interface Props {
  file: StreamsFile | null;
  readOnly: boolean;
}

function PinMenu({ row, file }: { row: InboxRow; file: StreamsFile }) {
  const [error, setError] = useState<string>();
  const pin = async (streamId: ReturnType<typeof newStreamId>, extra: StreamOp[] = []) => {
    const at = new Date().toISOString();
    const op: StreamOp = {
      op: 'pin',
      streamId,
      itemId: newItemId(),
      url: row.url,
      title: row.title,
      labels: [],
      at,
    };
    try {
      await send({ type: 'WORK_OPS', ops: [...extra, op] });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const create = () => {
    const name = window.prompt('Name of the new stream')?.trim();
    if (!name) return;
    const streamId = newStreamId();
    void pin(streamId, [{ op: 'addStream', streamId, name, at: new Date().toISOString() }]);
  };
  return (
    <div class="flex flex-wrap gap-1 pt-1">
      {file.streams.map((stream) => (
        <button key={stream.id} type="button" class={chip} onClick={() => void pin(stream.id)}>
          {stream.name}
        </button>
      ))}
      <button type="button" class={chip} onClick={create}>
        New stream…
      </button>
      {error && <span class="text-red-400 text-[12px] break-words">{error}</span>}
    </div>
  );
}

function Row({
  row,
  unread,
  dismissible,
  failed,
  onDismiss,
  file,
  readOnly,
}: {
  row: InboxRow;
  unread: boolean;
  dismissible: boolean;
  failed: boolean;
  onDismiss: () => void;
} & Props) {
  const [menu, setMenu] = useState(false);
  const open = () => {
    const message: Record<string, string> = { type: 'WORK_OPEN', url: row.url };
    if (row.threadId) message.threadId = row.threadId;
    void send(message).catch(() => {});
  };
  const ref = row.number === undefined ? row.repo : `${row.repo}#${row.number}`;
  return (
    <li class="flex flex-col gap-1 border-t border-[#222] py-2 text-[13px]">
      <div class="flex items-start gap-1">
        <button type="button" class="flex-1 text-left underline break-words" onClick={open}>
          {row.title}
        </button>
        <button
          type="button"
          class={iconButton}
          aria-label={`Pin ${row.title}`}
          disabled={readOnly || !file}
          onClick={() => setMenu(!menu)}
        >
          📌
        </button>
        {dismissible && (
          <button
            type="button"
            class={iconButton}
            aria-label={`Dismiss ${row.title}`}
            onClick={onDismiss}
          >
            ✕
          </button>
        )}
      </div>
      <div class="flex flex-wrap items-center gap-1 text-[12px] text-[#999]">
        <span>{ref}</span>
        {row.reasons.map((reason) => (
          <span key={reason} class={chip}>
            {reasonLabel(reason)}
          </span>
        ))}
        <StatusChips status={row.status} unread={unread} />
        <span class="ml-auto">{age(Date.parse(row.updatedAt))}</span>
      </div>
      {menu && file && !readOnly && <PinMenu row={row} file={file} />}
      {failed && <p class="text-red-400 text-[12px]">could not dismiss — retry</p>}
    </li>
  );
}

function Section({
  title,
  rows,
  dismissible,
  unread,
  file,
  readOnly,
}: { title: string; rows: InboxRow[]; dismissible: boolean; unread?: Set<string> } & Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const shown = rows.filter((row) => !hidden.has(row.key));
  const update = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };
  const dismiss = (row: InboxRow) => {
    setHidden((h) => update(h, row.key, true));
    setFailed((f) => update(f, row.key, false));
    const message: Record<string, string> = {
      type: 'WORK_DISMISS',
      key: row.key,
      updatedAt: row.updatedAt,
    };
    if (row.threadId) message.threadId = row.threadId;
    send(message).catch(() => {
      setHidden((h) => update(h, row.key, false));
      setFailed((f) => update(f, row.key, true));
    });
  };
  return (
    <section class="flex flex-col">
      <h2 class="text-[13px] font-bold">{`${title} (${shown.length})`}</h2>
      {shown.length === 0 ? (
        <p class="text-[12px] text-[#999]">Nothing here.</p>
      ) : (
        <ul>
          {shown.map((row) => (
            <Row
              key={row.key}
              row={row}
              file={file}
              readOnly={readOnly}
              dismissible={dismissible}
              failed={failed.has(row.key)}
              unread={unread?.has(row.key) ?? row.threadId !== undefined}
              onDismiss={() => dismiss(row)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function InboxSection(props: { title: string; rows: InboxRow[] } & Props) {
  return <Section {...props} dismissible />;
}

const asRow = (status: WorkItemStatus): InboxRow => ({
  key: status.key,
  url: status.url,
  title: status.title,
  repo: status.repo,
  number: status.number,
  kind: status.kind,
  reasons: [],
  updatedAt: status.updatedAt,
  status,
});

export function MineSection({
  prs,
  unread,
  ...rest
}: { title: string; prs: WorkItemStatus[]; unread: Set<string> } & Props) {
  return <Section {...rest} rows={prs.map(asRow)} dismissible={false} unread={unread} />;
}
