import type { GithubKey, StreamsFile } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  autoDoneOps,
  buildInbox,
  type InboxRow,
  pinnedKeys,
  unreadKeys,
  urgencyOf,
  workSummary,
} from './inbox.js';
import type {
  InboxReason,
  NotificationThread,
  PinnedStatus,
  WorkItemStatus,
  WorkSnapshot,
} from './types.js';

const key = (n: number) => `o/r#${n}` as GithubKey;

const status = (n: number, over: Partial<WorkItemStatus> = {}): WorkItemStatus => ({
  key: key(n),
  url: `https://github.com/o/r/pull/${n}`,
  repo: 'o/r',
  number: n,
  kind: 'pr',
  title: `PR ${n}`,
  state: 'open',
  isDraft: false,
  review: null,
  ci: null,
  conflict: false,
  updatedAt: `2026-01-0${n}T00:00:00Z`,
  ...over,
});

const thread = (n: number, over: Partial<NotificationThread> = {}): NotificationThread => ({
  threadId: `t${n}`,
  key: key(n),
  reason: 'mention',
  title: `PR ${n}`,
  url: `https://github.com/o/r/pull/${n}`,
  repo: 'o/r',
  updatedAt: `2026-01-0${n}T00:00:00Z`,
  unread: true,
  ...over,
});

const snapshot = (
  searches: Partial<Record<InboxReason | 'mine', WorkItemStatus[]>> = {},
  threads: NotificationThread[] = [],
  pinned: Record<string, PinnedStatus> = {},
): WorkSnapshot => ({
  login: 'me',
  fetchedAt: 0,
  searches: {
    'review-requested': [],
    assigned: [],
    failing: [],
    'changes-requested': [],
    'ready-to-merge': [],
    mine: [],
    ...searches,
  },
  threads,
  pinned,
  orgProblems: [],
  problem: null,
});

const fileWith = (items: { url: string; doneAt?: string }[]): StreamsFile => ({
  version: 1,
  updatedAt: '',
  invalidStreams: [],
  extra: {},
  streams: [
    {
      id: 's1' as never,
      name: 'S',
      createdAt: '',
      invalidItems: [],
      extra: {},
      items: items.map((item, i) => ({
        id: `i${i}` as never,
        url: item.url,
        title: '',
        addedAt: '',
        labels: [],
        extra: {},
        ...(item.doneAt ? { doneAt: item.doneAt } : {}),
      })),
    },
  ],
});

describe('buildInbox', () => {
  it('merges a search hit and a mention into one waiting row with two reasons', () => {
    const snap = snapshot({ 'review-requested': [status(1)] }, [thread(1)]);
    const { waiting, activity } = buildInbox(snap, null, {});
    expect(activity).toEqual([]);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.reasons).toEqual(['review-requested', 'mention']);
    expect(waiting[0]?.threadId).toBe('t1');
    expect(waiting[0]?.kind).toBe('pr');
  });

  it('excludes pinned items from every list', () => {
    const snap = snapshot({ 'review-requested': [status(1)], mine: [status(2)] }, [thread(3)]);
    const file = fileWith([
      { url: 'https://github.com/o/r/pull/1' },
      { url: 'https://github.com/o/r/pull/2' },
      { url: 'https://github.com/o/r/pull/3' },
    ]);
    const out = buildInbox(snap, file, {});
    expect(out).toEqual({ waiting: [], activity: [], mine: [] });
  });

  it('brings a dismissed row back when the item changes', () => {
    const snap = snapshot({ assigned: [status(1)] });
    expect(buildInbox(snap, null, { [key(1)]: status(1).updatedAt }).waiting).toEqual([]);
    expect(buildInbox(snap, null, { [key(1)]: '2025-12-31T00:00:00Z' }).waiting).toHaveLength(1);
  });

  it('keeps a dismissed row hidden after its thread is marked done', () => {
    const search = { assigned: [status(1, { updatedAt: '2026-01-01T00:00:00Z' })] };
    const withThread = snapshot(search, [thread(1, { updatedAt: '2026-02-01T00:00:00Z' })]);
    expect(buildInbox(withThread, null, {}).waiting[0]?.updatedAt).toBe('2026-02-01T00:00:00Z');
    const dismissed = { [key(1)]: '2026-02-01T00:00:00Z' };
    const done = snapshot(search, [
      thread(1, { updatedAt: '2026-02-01T00:00:00Z', unread: false }),
    ]);
    expect(buildInbox(done, null, dismissed).waiting).toEqual([]);
  });

  it('brings a dismissed row back when a newer change arrives', () => {
    const snap = snapshot({ assigned: [status(1, { updatedAt: '2026-03-01T00:00:00Z' })] });
    expect(buildInbox(snap, null, { [key(1)]: '2026-02-01T00:00:00Z' }).waiting).toHaveLength(1);
  });

  it('puts thread-only items under activity', () => {
    const snap = snapshot({ mine: [status(2)] }, [
      thread(1),
      thread(2, { unread: false }),
      thread(3, { key: 'thread:abc' as never, url: 'https://github.com/o/r/discussions/9' }),
    ]);
    const { waiting, activity, mine } = buildInbox(snap, null, {});
    expect(waiting).toEqual([]);
    expect(mine.map((m) => m.number)).toEqual([2]);
    expect(activity.map((r) => [r.key, r.kind, r.number])).toEqual([
      ['thread:abc', 'thread', undefined],
      [key(1), 'pr', 1],
    ]);
  });

  it('sorts by newest updatedAt and uses thread info when there is no search hit', () => {
    const snap = snapshot({ assigned: [status(1)] }, [
      thread(2, { url: 'https://github.com/o/r/issues/2' }),
      thread(1, { updatedAt: '2026-02-01T00:00:00Z' }),
    ]);
    const { waiting, activity } = buildInbox(snap, null, {});
    expect(waiting[0]?.updatedAt).toBe('2026-02-01T00:00:00Z');
    expect(activity[0]).toMatchObject({ kind: 'issue', number: 2, repo: 'o/r' });
  });
});

describe('inbox urgency', () => {
  const now = new Date('2026-02-01T00:00:00Z');
  const old = '2026-01-01T00:00:00Z';
  const fresh = '2026-01-31T20:00:00Z';

  it('failing CI outranks an old review request, which outranks changes requested', () => {
    const snap = snapshot({
      'changes-requested': [status(3, { updatedAt: fresh })],
      'review-requested': [status(2, { updatedAt: old })],
      failing: [status(1, { updatedAt: old })],
    });
    const { waiting } = buildInbox(snap, null, {}, now);
    expect(waiting.map((row) => row.key)).toEqual([key(1), key(2), key(3)]);
  });

  it('a fresh review request ranks below changes requested', () => {
    const snap = snapshot({
      'review-requested': [status(1, { updatedAt: fresh })],
      'changes-requested': [status(2, { updatedAt: old })],
    });
    const { waiting } = buildInbox(snap, null, {}, now);
    expect(waiting.map((row) => row.key)).toEqual([key(2), key(1)]);
  });

  it('equal urgency keeps newest first', () => {
    const snap = snapshot({
      assigned: [status(1, { updatedAt: old }), status(2, { updatedAt: fresh })],
    });
    const { waiting } = buildInbox(snap, null, {}, now);
    expect(waiting.map((row) => row.key)).toEqual([key(2), key(1)]);
  });

  it('scores a thread-only row 20 and takes the maximum over reasons', () => {
    const snap = snapshot({ assigned: [status(1)] }, [thread(1), thread(2)]);
    const { waiting, activity } = buildInbox(snap, null, {}, now);
    expect(urgencyOf(waiting[0] as InboxRow, now)).toBe(25);
    expect(urgencyOf(activity[0] as InboxRow, now)).toBe(20);
  });
});

describe('unreadKeys', () => {
  it('lists keys with an unread thread', () => {
    const snap = snapshot({}, [thread(1), thread(2, { unread: false })]);
    expect([...unreadKeys(snap)]).toEqual([key(1)]);
  });
});

describe('pinnedKeys', () => {
  it('skips done and non-GitHub items', () => {
    const file = fileWith([
      { url: 'https://github.com/o/r/pull/1' },
      { url: 'https://github.com/o/r/pull/2', doneAt: 'x' },
      { url: 'https://example.com/a' },
    ]);
    expect([...pinnedKeys(file)]).toEqual([key(1)]);
  });
});

describe('workSummary', () => {
  it('counts waiting, activity and red CI in streams', () => {
    const snap = snapshot({ assigned: [status(1)] }, [thread(4)], {
      [key(2)]: status(2, { ci: 'failure' }),
      [key(3)]: status(3, { ci: 'failure' }),
      [key(5)]: { key: key(5), error: 'not-found', org: 'o' },
    });
    const file = fileWith([
      { url: 'https://github.com/o/r/pull/2' },
      { url: 'https://github.com/o/r/pull/3', doneAt: 'x' },
      { url: 'https://github.com/o/r/pull/5' },
      { url: 'https://github.com/o/r/pull/6' },
    ]);
    expect(workSummary(snap, file, {})).toEqual({ waiting: 1, activity: 1, redCiInStreams: 1 });
  });
});

describe('muted keys', () => {
  it('a muted label removes rows from waiting and activity and the summary', () => {
    const snap = snapshot({ assigned: [status(1), status(2)] }, [thread(3)]);
    const muted = new Set([key(1), key(3)]);
    const inbox = buildInbox(snap, null, {}, new Date(), muted);
    expect(inbox.waiting.map((r) => r.key)).toEqual([key(2)]);
    expect(inbox.activity).toEqual([]);
    expect(workSummary(snap, null, {}, muted)).toMatchObject({ waiting: 1, activity: 0 });
  });
});

describe('autoDoneOps', () => {
  it('marks merged and closed pinned items done, once', () => {
    const file = fileWith([
      { url: 'https://github.com/o/r/pull/1' },
      { url: 'https://github.com/o/r/pull/2' },
      { url: 'https://github.com/o/r/pull/3', doneAt: 'x' },
      { url: 'https://github.com/o/r/pull/4' },
      { url: 'https://github.com/o/r/pull/5' },
      { url: 'https://github.com/o/r/pull/6' },
    ]);
    const pinned = {
      [key(1)]: status(1, { state: 'merged' }),
      [key(2)]: status(2, { state: 'closed' }),
      [key(3)]: status(3, { state: 'merged' }),
      [key(4)]: status(4),
      [key(5)]: { key: key(5), error: 'forbidden', org: 'o' } as PinnedStatus,
    };
    expect(autoDoneOps(file, pinned, 'NOW')).toEqual([
      { op: 'markDone', itemId: 'i0', at: 'NOW' },
      { op: 'markDone', itemId: 'i1', at: 'NOW' },
    ]);
  });
});
