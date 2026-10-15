import { newItemId, newStreamId, type StreamOp, type StreamsFile } from '@kaihuman/formats';
import { useEffect, useState } from 'preact/hooks';
import type { InboxRow } from '../background/work/inbox.js';
import type { WorkItemStatus } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { age } from './age.js';
import { Choice, errorText, Heading, iconButton, NewStreamInput } from './controls.js';
import { chipClass, Rail, StatusChips, type Tone, toneOf } from './StatusChips.js';
import { fileAsSuggested, suggestionName, useSuggestion } from './useSuggestion.js';

const REASONS: Record<string, readonly [label: string, tone: Tone]> = {
  'review-requested': ['review requested', 'warn'],
  assigned: ['assigned', 'plain'],
  failing: ['CI failing', 'bad'],
  'changes-requested': ['changes requested', 'bad'],
  'ready-to-merge': ['ready to merge', 'good'],
};
const reasonOf = (reason: string) =>
  REASONS[reason] ?? ([reason.replaceAll('_', ' '), 'plain'] as const);

interface Props {
  file: StreamsFile | null;
  readOnly: boolean;
  /** row key → the user's label for it. */
  labels?: Record<string, string>;
  /** One-line summaries by item key; absent while the model has not written them. */
  tldrs?: Record<string, string>;
}

/** The TL;DRs the worker has written, asked for once per snapshot (`stamp` changes with it). */
export function useTldrs(stamp: number | undefined): Record<string, string> {
  const [tldrs, setTldrs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (stamp === undefined) return;
    let live = true;
    send({ type: 'GET_TLDRS' }).then(
      (response) => {
        if (!live || typeof response !== 'object' || response === null) return;
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(response)) {
          if (typeof value === 'string' && value !== '') next[key] = value;
        }
        setTldrs(next);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [stamp]);
  return tldrs;
}

function PinMenu({ row, file, onDone }: { row: InboxRow; file: StreamsFile; onDone: () => void }) {
  const [error, setError] = useState<string>();
  const [naming, setNaming] = useState(file.streams.length === 0);
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
      onDone();
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  const create = (name: string) => {
    const streamId = newStreamId();
    void pin(streamId, [{ op: 'addStream', streamId, name, at: new Date().toISOString() }]);
  };
  return (
    <div class="flex flex-col gap-1.5 border-t border-nt-row pt-2">
      <span class="text-[11px] text-nt-muted">Pin to a stream</span>
      {naming ? (
        <NewStreamInput
          submit="Add and pin"
          onCreate={create}
          onCancel={() => (file.streams.length === 0 ? onDone() : setNaming(false))}
        />
      ) : (
        <div class="flex flex-wrap gap-1">
          {file.streams.map((stream) => (
            <Choice key={stream.id} title={stream.name} onClick={() => void pin(stream.id)}>
              {stream.name}
            </Choice>
          ))}
          <Choice onClick={() => setNaming(true)}>+ New stream</Choice>
        </div>
      )}
      {error && <p class="text-[12px] text-nt-prod [overflow-wrap:anywhere]">{error}</p>}
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
  labels,
  tldrs,
}: {
  row: InboxRow;
  unread: boolean;
  dismissible: boolean;
  failed: boolean;
  onDismiss: () => void;
} & Props) {
  const [menu, setMenu] = useState(false);
  const [pinError, setPinError] = useState<string>();
  const suggestion = useSuggestion(
    file,
    file && !readOnly ? { url: row.url, title: row.title } : undefined,
  );
  const suggested = suggestion && file ? suggestionName(file, suggestion) : undefined;
  const open = () => {
    const message: Record<string, string> = { type: 'WORK_OPEN', url: row.url };
    if (row.threadId) message.threadId = row.threadId;
    void send(message).catch(() => {});
  };
  const ref = row.number === undefined ? row.repo : `${row.repo}#${row.number}`;
  const reasons = row.reasons.map(reasonOf);
  const tone = toneOf(
    row.status,
    unread,
    reasons.map(([, t]) => t),
  );
  return (
    <li class="group flex gap-2.5 py-2">
      <Rail tone={tone} />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="flex items-start gap-1">
          <button
            type="button"
            title={row.title}
            class="min-w-0 flex-1 text-left text-[13px] leading-[18px] line-clamp-2 [overflow-wrap:anywhere] hover:text-nt-accent"
            onClick={open}
          >
            {row.title}
          </button>
          <span class="shrink-0 pt-px text-[11px] text-nt-faint">
            {age(Date.parse(row.updatedAt))}
          </span>
        </div>
        {tldrs?.[row.key] && (
          <p class="text-[11px] leading-4 text-nt-muted line-clamp-2 [overflow-wrap:anywhere]">
            {tldrs[row.key]}
          </p>
        )}
        <div class="flex items-center gap-1">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <span class="min-w-0 max-w-full truncate text-[11px] text-nt-muted" title={ref}>
              {ref}
            </span>
            {reasons.map(([label, t]) => (
              <span key={label} class={chipClass(t)}>
                {label}
              </span>
            ))}
            {labels?.[row.key] && (
              <span class={chipClass('plain')} data-label>
                {labels[row.key]}
              </span>
            )}
            <StatusChips status={row.status} unread={unread} />
          </div>
          <button
            type="button"
            class={iconButton}
            aria-label={`Pin ${row.title}`}
            aria-expanded={menu}
            title="Pin to a stream"
            disabled={readOnly || !file}
            onClick={() => setMenu(!menu)}
          >
            +
          </button>
          {dismissible && (
            <button
              type="button"
              class={iconButton}
              aria-label={`Dismiss ${row.title}`}
              title="Dismiss until it changes"
              onClick={onDismiss}
            >
              ✕
            </button>
          )}
        </div>
        {suggestion && suggested && !menu && (
          <button
            type="button"
            aria-label={`Pin ${row.title} to ${suggested}`}
            title={
              suggestion.source === 'model'
                ? "Suggested by Chrome's on-device model"
                : 'Most items from this repository are in this stream'
            }
            class="flex min-w-0 max-w-full items-baseline gap-1.5 self-start text-left text-[11px] text-nt-muted hover:text-nt-accent"
            onClick={() => {
              setPinError(undefined);
              fileAsSuggested(suggestion, row).catch((failure) => setPinError(errorText(failure)));
            }}
          >
            <span aria-hidden="true" class="shrink-0">
              →
            </span>
            <span class="truncate">
              {suggestion.stream.kind === 'new' ? `New stream “${suggested}”` : suggested}
            </span>
            {suggestion.labels.length > 0 && (
              <span class="shrink-0 text-nt-faint">{suggestion.labels.join(', ')}</span>
            )}
            {suggestion.reason && <span class="truncate text-nt-faint">{suggestion.reason}</span>}
          </button>
        )}
        {pinError && <p class="text-[12px] text-nt-prod [overflow-wrap:anywhere]">{pinError}</p>}
        {menu && file && !readOnly && (
          <PinMenu row={row} file={file} onDone={() => setMenu(false)} />
        )}
        {failed && <p class="text-[12px] text-nt-prod">Could not dismiss. Try again.</p>}
      </div>
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
  labels,
  tldrs,
}: { title: string; rows: InboxRow[]; dismissible: boolean; unread?: Set<string> } & Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  // Keyed by timestamp too: a newer update to a dismissed item must show again.
  const slot = (row: InboxRow) => `${row.key}@${row.updatedAt}`;
  const shown = rows.filter((row) => !hidden.has(slot(row)));
  const update = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };
  const dismiss = (row: InboxRow) => {
    setHidden((h) => update(h, slot(row), true));
    setFailed((f) => update(f, slot(row), false));
    const message: Record<string, string> = {
      type: 'WORK_DISMISS',
      key: row.key,
      updatedAt: row.updatedAt,
    };
    if (row.threadId) message.threadId = row.threadId;
    send(message).catch(() => {
      setHidden((h) => update(h, slot(row), false));
      setFailed((f) => update(f, slot(row), true));
    });
  };
  return (
    <section class="flex flex-col" data-section={title}>
      <Heading title={title} count={shown.length} />
      {shown.length > 0 && (
        <ul class="flex flex-col divide-y divide-nt-row">
          {shown.map((row) => (
            <Row
              key={row.key}
              row={row}
              file={file}
              readOnly={readOnly}
              labels={labels}
              tldrs={tldrs}
              dismissible={dismissible}
              failed={failed.has(slot(row))}
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
