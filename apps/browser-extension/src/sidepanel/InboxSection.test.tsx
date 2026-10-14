import type { StreamsFile } from '@kaihuman/formats';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamsCache, WorkItemStatus, WorkSnapshot } from '../background/work/types';
import { SidePanel } from './SidePanel';

const NOW = '2026-10-14T10:00:00.000Z';
const FETCHED = new Date('2026-10-14T09:45:00.000Z').getTime();

const status = (n: number, patch: Partial<WorkItemStatus> = {}): WorkItemStatus => ({
  key: `acme/web#${n}` as never,
  url: `https://github.com/acme/web/pull/${n}`,
  repo: 'acme/web',
  number: n,
  kind: 'pr',
  title: `PR ${n}`,
  state: 'open',
  isDraft: false,
  review: null,
  ci: null,
  conflict: false,
  updatedAt: `2026-10-14T09:0${n}:00.000Z`,
  ...patch,
});

const file = (): StreamsFile => ({
  version: 1,
  updatedAt: NOW,
  invalidStreams: [],
  extra: {},
  streams: [
    { id: 'st_a' as never, name: 'Alpha', createdAt: NOW, invalidItems: [], extra: {}, items: [] },
  ],
});

const cache = (): StreamsCache => ({
  repo: 'owner/repo',
  state: { ok: true, file: file() },
  sha: 'abc',
  etag: null,
  fetchedAt: FETCHED,
});

const snapshot = (patch: Partial<WorkSnapshot> = {}): WorkSnapshot => ({
  login: 'me',
  fetchedAt: FETCHED,
  searches: {
    'review-requested': [status(1, { ci: 'success' })],
    assigned: [status(2), status(1, { ci: 'success' })],
    failing: [],
    'changes-requested': [],
    'ready-to-merge': [],
    mine: [status(4, { isDraft: true })],
  },
  threads: [
    {
      threadId: 't9',
      key: 'acme/web#3' as never,
      reason: 'review_requested_by',
      title: 'PR 3',
      url: 'https://github.com/acme/web/pull/3',
      repo: 'acme/web',
      updatedAt: '2026-10-14T09:30:00.000Z',
      unread: true,
    },
  ],
  pinned: {},
  orgProblems: [],
  problem: null,
  ...patch,
});

let host: HTMLDivElement;
let store: Record<string, unknown>;
let sent: Record<string, unknown>[];
let failNext: string | undefined;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error(`Timed out; panel shows: ${host.textContent}`);
};
const mount = async (settled: string) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<SidePanel />, host);
  await waitFor(() => host.textContent?.includes(settled) ?? false);
};
const section = (heading: string) => {
  const h = [...host.querySelectorAll('h2')].find((el) => el.textContent === heading);
  if (!h?.parentElement) throw new Error(`No section "${heading}"`);
  return h.parentElement;
};
const byLabel = (root: Element, label: string) => {
  const el = root.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  if (!el) throw new Error(`No control "${label}"`);
  return el;
};
const clickText = (root: Element, text: string) => {
  const el = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!el) throw new Error(`No button "${text}"`);
  el.click();
};

beforeEach(() => {
  store = { streamsCache: cache(), workSnapshot: snapshot() };
  sent = [];
  failNext = undefined;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async () => {},
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: async () => [],
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      connect: () => ({ disconnect: () => {} }),
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        if (failNext) respond?.({ error: failNext });
        else respond?.({ ok: true });
      },
      lastError: undefined,
    },
  };
  window.prompt = () => null;
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('InboxSection', () => {
  it('lists waiting before activity with counts in the headings', async () => {
    await mount('Waiting on you (2)');
    const headings = [...host.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings).toEqual(['Waiting on you (2)', 'New activity (1)', 'My open PRs (1)']);
    expect(section('Waiting on you (2)').textContent).toContain('PR 2');
    expect(section('New activity (1)').textContent).toContain('review requested by');
    expect(section('My open PRs (1)').textContent).toContain('draft');
    expect(section('My open PRs (1)').querySelector('[aria-label="Dismiss"]')).toBeNull();
  });

  it('shows one row with two reason chips', async () => {
    await mount('Waiting on you (2)');
    const row = [...section('Waiting on you (2)').querySelectorAll('li')].find((li) =>
      li.textContent?.includes('PR 1'),
    ) as HTMLElement;
    expect(row.textContent).toContain('PR 1');
    expect(row.textContent).toContain('acme/web#1');
    expect(row.textContent).toContain('review requested');
    expect(row.textContent).toContain('assigned');
    expect(row.textContent).toContain('CI ✓');
  });

  it('pins a row into a stream', async () => {
    await mount('Waiting on you (2)');
    const waiting = section('Waiting on you (2)');
    byLabel(waiting, 'Pin PR 2').click();
    await tick();
    clickText(waiting, 'Alpha');
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPS'));
    const message = sent.find((m) => m.type === 'WORK_OPS') as { ops: Record<string, unknown>[] };
    expect(message.ops).toHaveLength(1);
    expect(message.ops[0]).toMatchObject({
      op: 'pin',
      streamId: 'st_a',
      url: 'https://github.com/acme/web/pull/2',
      title: 'PR 2',
      labels: [],
    });
    expect(message.ops[0]?.itemId).toMatch(/^it_/);
  });

  it('hides a dismissed row at once and brings it back with a note when dismissing fails', async () => {
    failNext = 'nope';
    await mount('Waiting on you (2)');
    byLabel(section('Waiting on you (2)'), 'Dismiss PR 2').click();
    await waitFor(() => host.textContent?.includes('could not dismiss — retry') ?? false);
    expect(sent.find((m) => m.type === 'WORK_DISMISS')).toEqual({
      type: 'WORK_DISMISS',
      key: 'acme/web#2',
      updatedAt: '2026-10-14T09:02:00.000Z',
    });
    expect(section('Waiting on you (2)').textContent).toContain('PR 2');
    failNext = undefined;
    byLabel(section('Waiting on you (2)'), 'Dismiss PR 2').click();
    await waitFor(() => host.textContent?.includes('Waiting on you (1)') ?? false);
    expect(host.textContent).not.toContain('could not dismiss');
  });

  it('opens a row and passes its thread id', async () => {
    await mount('New activity (1)');
    clickText(section('New activity (1)'), 'PR 3');
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPEN'));
    expect(sent.find((m) => m.type === 'WORK_OPEN')).toEqual({
      type: 'WORK_OPEN',
      url: 'https://github.com/acme/web/pull/3',
      threadId: 't9',
    });
  });
});
