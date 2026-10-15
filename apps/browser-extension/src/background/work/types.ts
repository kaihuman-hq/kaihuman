import type { GithubKey, StreamId, StreamsParse } from '@kaihuman/formats';

/** `chrome.storage.local` keys of the work-streams feature. */
export const WORK_KEYS = {
  snapshot: 'workSnapshot',
  streamsCache: 'streamsCache',
  queue: 'streamsWriteQueue',
  saveError: 'streamsSaveError',
  pollState: 'workPollState',
  dismissed: 'workDismissed',
  workToken: 'workToken',
  ui: 'workUi',
  autoFiled: 'workAutoFiled',
} as const;

/** The streams file as last read; reads are served from here, writes always re-read. */
export interface StreamsCache {
  repo: string;
  state: StreamsParse;
  /** Blob sha of the cached content, or null when the file does not exist yet. */
  sha: string | null;
  etag: string | null;
  fetchedAt: number;
}

export type CiState = 'success' | 'failure' | 'pending' | null;
export type ReviewState = 'approved' | 'changes_requested' | 'review_required' | null;

export interface WorkItemStatus {
  key: GithubKey;
  url: string;
  repo: string;
  number: number;
  kind: 'pr' | 'issue';
  title: string;
  state: 'open' | 'merged' | 'closed';
  isDraft: boolean;
  review: ReviewState;
  ci: CiState;
  conflict: boolean;
  updatedAt: string;
  /** Start of the description; only the waiting searches ask for it, as input for the TL;DR. */
  body?: string;
}

export type PinnedStatus =
  | WorkItemStatus
  | { key: GithubKey; error: 'not-found' | 'forbidden'; org: string };

export type InboxReason =
  | 'review-requested'
  | 'assigned'
  | 'failing'
  | 'changes-requested'
  | 'ready-to-merge';

export interface NotificationThread {
  threadId: string;
  key: GithubKey | `thread:${string}`;
  reason: string;
  title: string;
  url: string;
  repo: string;
  updatedAt: string;
  unread: boolean;
}

export interface OrgAccessProblem {
  org: string;
  fix: 'oauth' | 'sso';
  url: string;
}

export type WorkProblem =
  | { kind: 'signed-out' }
  | { kind: 'auth' }
  | { kind: 'rate-limit'; until: number }
  | { kind: 'offline'; retryAt: number };

export interface WorkSnapshot {
  login: string;
  fetchedAt: number;
  searches: Record<InboxReason | 'mine', WorkItemStatus[]>;
  threads: NotificationThread[];
  pinned: Record<string, PinnedStatus>;
  orgProblems: OrgAccessProblem[];
  problem: WorkProblem | null;
}

/** The side panel's own settings, kept across sessions. */
export interface WorkUi {
  /** Where the next pin goes when none is named. */
  lastStreamId?: StreamId;
  collapsed: string[];
  label?: string;
  /**
   * Whether the shortcut and the menu's pins go to the suggested stream rather than the last one
   * used; unset means on.
   */
  autoFile?: boolean;
  /** Whether new Waiting-on-you items are filed into their suggested stream as the panel shows them. */
  autoFileInbox?: boolean;
}

export const EMPTY_WORK_UI: WorkUi = { collapsed: [] };
