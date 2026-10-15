import { type GithubKey, itemRefOf, type StreamOp, type StreamsFile } from '@kaihuman/formats';
import type {
  InboxReason,
  NotificationThread,
  PinnedStatus,
  WorkItemStatus,
  WorkSnapshot,
} from './types.js';

export interface InboxRow {
  key: string;
  url: string;
  title: string;
  repo: string;
  number?: number;
  kind: 'pr' | 'issue' | 'thread';
  reasons: (InboxReason | string)[];
  updatedAt: string;
  threadId?: string;
  status?: WorkItemStatus;
}

/** key → the `updatedAt` it was dismissed at. */
export type Dismissed = Record<string, string>;

const INBOX_REASONS = [
  'review-requested',
  'assigned',
  'failing',
  'changes-requested',
  'ready-to-merge',
] as const satisfies readonly InboxReason[];

const isInboxReason = (reason: string): reason is InboxReason =>
  (INBOX_REASONS as readonly string[]).includes(reason);

const githubKeyOf = (url: string): GithubKey | null => {
  const ref = itemRefOf(url);
  return ref && ref.kind !== 'link' ? ref.key : null;
};

const pinnedItems = (file: StreamsFile | null) =>
  (file?.streams ?? []).flatMap((stream) => stream.items).filter((item) => !item.doneAt);

/** Keys of the not-done pinned GitHub items. */
export const pinnedKeys = (file: StreamsFile): Set<string> => {
  const keys = new Set<string>();
  for (const item of pinnedItems(file)) {
    const key = githubKeyOf(item.url);
    if (key) keys.add(key);
  }
  return keys;
};

/** Keys with an unread notification thread. */
export const unreadKeys = (snapshot: WorkSnapshot): Set<string> =>
  new Set(snapshot.threads.filter((thread) => thread.unread).map((thread) => thread.key));

const rowFromStatus = (status: WorkItemStatus): InboxRow => ({
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

const rowFromThread = (thread: NotificationThread): InboxRow => {
  const row: InboxRow = {
    key: thread.key,
    url: thread.url,
    title: thread.title,
    repo: thread.repo,
    kind: 'thread',
    reasons: [],
    updatedAt: thread.updatedAt,
  };
  if (thread.key.startsWith('thread:')) return row;
  row.kind = thread.url.includes('/pull/') ? 'pr' : 'issue';
  const number = Number(thread.key.slice(thread.key.lastIndexOf('#') + 1));
  if (Number.isInteger(number)) row.number = number;
  return row;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** How pressing a row is: its most urgent reason wins, so a merged-in mention never lowers it. */
export function urgencyOf(row: InboxRow, now: Date): number {
  let score = 0;
  for (const reason of row.reasons) {
    let reasonScore = 20;
    if (reason === 'failing') reasonScore = 60;
    else if (reason === 'review-requested') {
      // An unparseable date makes the age NaN, which ranks as a fresh request.
      reasonScore = now.getTime() - Date.parse(row.updatedAt) >= DAY_MS ? 50 : 35;
    } else if (reason === 'changes-requested') reasonScore = 40;
    else if (reason === 'ready-to-merge') reasonScore = 30;
    else if (reason === 'assigned') reasonScore = 25;
    if (reasonScore > score) score = reasonScore;
  }
  return score;
}

export const buildInbox = (
  snapshot: WorkSnapshot,
  file: StreamsFile | null,
  dismissed: Dismissed,
  now: Date = new Date(),
  muted: Set<string> = new Set(),
): { waiting: InboxRow[]; activity: InboxRow[]; mine: WorkItemStatus[] } => {
  const pinned = file ? pinnedKeys(file) : new Set<string>();
  const rows = new Map<string, InboxRow>();
  const bump = (row: InboxRow, updatedAt: string) => {
    if (updatedAt > row.updatedAt) row.updatedAt = updatedAt;
  };

  for (const reason of INBOX_REASONS) {
    for (const status of snapshot.searches[reason]) {
      const row = rows.get(status.key) ?? rowFromStatus(status);
      rows.set(status.key, row);
      if (!row.reasons.includes(reason)) row.reasons.push(reason);
      bump(row, status.updatedAt);
    }
  }
  for (const thread of snapshot.threads) {
    if (!thread.unread) continue;
    const row = rows.get(thread.key) ?? rowFromThread(thread);
    rows.set(thread.key, row);
    if (!row.reasons.includes(thread.reason)) row.reasons.push(thread.reason);
    row.threadId = thread.threadId;
    bump(row, thread.updatedAt);
  }

  const newestFirst = (a: { updatedAt: string }, b: { updatedAt: string }) =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0;
  const byUrgency = (a: InboxRow, b: InboxRow) =>
    urgencyOf(b, now) - urgencyOf(a, now) || newestFirst(a, b);
  const waiting: InboxRow[] = [];
  const activity: InboxRow[] = [];
  const waitingKeys = new Set<string>();
  for (const row of rows.values()) {
    if (pinned.has(row.key) || muted.has(row.key)) continue;
    const isWaiting = row.reasons.some(isInboxReason);
    // Dismissal hides the row but must not resurface it under "mine".
    if (isWaiting) waitingKeys.add(row.key);
    const at = dismissed[row.key];
    // `>=` so a vanished unread thread (older merged timestamp) keeps the row hidden.
    if (at !== undefined && at >= row.updatedAt) continue;
    (isWaiting ? waiting : activity).push(row);
  }
  const mine = snapshot.searches.mine.filter(
    (status) => !pinned.has(status.key) && !waitingKeys.has(status.key),
  );
  return {
    waiting: waiting.sort(byUrgency),
    activity: activity.sort(byUrgency),
    mine: mine.sort(newestFirst),
  };
};

const isStatus = (status: PinnedStatus | undefined): status is WorkItemStatus =>
  status !== undefined && !('error' in status);

export const workSummary = (
  snapshot: WorkSnapshot,
  file: StreamsFile | null,
  dismissed: Dismissed,
  muted: Set<string> = new Set(),
): { waiting: number; activity: number; redCiInStreams: number } => {
  const { waiting, activity } = buildInbox(snapshot, file, dismissed, new Date(), muted);
  let redCiInStreams = 0;
  for (const item of pinnedItems(file)) {
    const key = githubKeyOf(item.url);
    const status = key ? snapshot.pinned[key] : undefined;
    if (isStatus(status) && status.ci === 'failure') redCiInStreams++;
  }
  return { waiting: waiting.length, activity: activity.length, redCiInStreams };
};

/** A `markDone` for every not-done pinned item whose PR or issue has merged or closed. */
export const autoDoneOps = (
  file: StreamsFile,
  pinned: Record<string, PinnedStatus>,
  at: string,
): StreamOp[] => {
  const ops: StreamOp[] = [];
  for (const item of pinnedItems(file)) {
    const key = githubKeyOf(item.url);
    const status = key ? pinned[key] : undefined;
    if (isStatus(status) && status.state !== 'open') {
      ops.push({ op: 'markDone', itemId: item.id, at });
    }
  }
  return ops;
};
