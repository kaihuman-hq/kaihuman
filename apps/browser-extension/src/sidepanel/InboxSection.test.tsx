import type { StreamsFile } from '@kaihuman/formats';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { suggestStream } from '../background/work/suggest';
import type { StreamsCache, WorkItemStatus, WorkSnapshot } from '../background/work/types';
import { SidePanel } from './SidePanel';
import { resetSuggestions } from './useSuggestion';

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
let listeners: ((changes: Record<string, unknown>, area: string) => void)[];

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
  await waitFor(() => headings().includes(settled));
};
/** A section by its heading as people read it, e.g. "Waiting on you (2)". */
const headingOf = (el: Element) =>
  `${el.querySelector('h2 span')?.textContent} (${el.querySelector('[data-count]')?.textContent})`;
const headings = () => [...host.querySelectorAll('section[data-section]')].map(headingOf);
const section = (heading: string) => {
  const found = [...host.querySelectorAll('section[data-section]')].find(
    (el) => headingOf(el) === heading,
  );
  if (!found) throw new Error(`No section "${heading}"; have ${headings().join(', ')}`);
  return found;
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
  // Earlier mounts cached "no suggestion" for these rows.
  resetSuggestions();
  store = { streamsCache: cache(), workSnapshot: snapshot() };
  sent = [];
  failNext = undefined;
  listeners = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async () => {},
      },
      onChanged: {
        addListener: (l: (changes: Record<string, unknown>, area: string) => void) =>
          listeners.push(l),
        removeListener: () => {},
      },
    },
    tabs: {
      query: async () => [],
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      connect: () => ({ disconnect: () => {}, onDisconnect: { addListener: () => {} } }),
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        if (message.type === 'GET_TLDRS') respond?.({ 'acme/web#2': 'Retries flaky uploads.' });
        // The worker's side, run here against the stubbed model.
        else if (message.type === 'SUGGEST_STREAM') {
          void suggestStream(message.file as never, message.candidate as never).then((suggestion) =>
            respond?.({ ok: true, suggestion }),
          );
        } else if (failNext) respond?.({ error: failNext });
        else respond?.({ ok: true });
      },
      lastError: undefined,
    },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  render(null, host);
  host.remove();
});

describe('InboxSection', () => {
  it('lists waiting before activity with counts in the headings', async () => {
    await mount('Waiting on you (2)');
    expect(headings()).toEqual(['Waiting on you (2)', 'New activity (1)', 'My open PRs (1)']);
    expect(section('Waiting on you (2)').textContent).toContain('PR 2');
    expect(section('New activity (1)').textContent).toContain('review requested by');
    expect(section('My open PRs (1)').textContent).toContain('draft');
    expect(section('My open PRs (1)').querySelector('[aria-label="Dismiss"]')).toBeNull();
  });

  it('shows the TL;DR line', async () => {
    await mount('Waiting on you (2)');
    await waitFor(
      () => section('Waiting on you (2)').textContent?.includes('Retries flaky') ?? false,
    );
    const rows = [...section('Waiting on you (2)').querySelectorAll('li')];
    expect(rows.find((li) => li.textContent?.includes('PR 2'))?.textContent).toContain(
      'Retries flaky uploads.',
    );
    expect(rows.find((li) => li.textContent?.includes('PR 1'))?.textContent).not.toContain(
      'Retries',
    );
    expect(sent.filter((m) => m.type === 'GET_TLDRS')).toHaveLength(1);
  });

  it('asks for the TL;DRs again when the AI cache changes', async () => {
    await mount('Waiting on you (2)');
    await waitFor(() => sent.some((m) => m.type === 'GET_TLDRS'));
    const asked = () => sent.filter((m) => m.type === 'GET_TLDRS').length;
    // Other storage keys are none of its business.
    for (const l of listeners) l({ somethingElse: {} }, 'local');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(asked()).toBe(1);
    for (const l of listeners) l({ aiCache: {} }, 'local');
    for (const l of listeners) l({ aiCache: {} }, 'local');
    await waitFor(() => asked() > 1);
    await new Promise((resolve) => setTimeout(resolve, 250));
    // Writes that come in a burst are asked for once.
    expect(asked()).toBe(2);
  });

  it("puts the suggestion's reason in the button's title", async () => {
    store.aiSettings = { inboxLabels: [] };
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () =>
          JSON.stringify({ stream: 'Alpha', labels: [], reason: 'Same repo as Alpha' }),
        destroy: () => {},
      }),
    });
    await mount('Waiting on you (2)');
    await waitFor(() => host.querySelector('button[aria-label^="Pin PR 2 to"]') !== null);
    expect(host.querySelector('button[aria-label^="Pin PR 2 to"]')?.getAttribute('title')).toBe(
      'Same repo as Alpha',
    );
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

  it("filter chips show only that label's rows", async () => {
    store.aiSettings = {
      inboxLabels: [
        { name: 'Mine', hint: 'mine', mute: false },
        { name: 'Other', hint: 'other', mute: false },
        { name: 'Noise', hint: 'noise', mute: true },
      ],
    };
    store.aiCache = {
      'inbox:labels': {
        value: { 'acme/web#1': 'Mine', 'acme/web#2': 'Other', 'acme/web#3': 'Noise' },
        at: Date.now(),
        ttl: 60_000,
      },
    };
    // PR 3 (new activity) is muted away; PR 1 and 2 wait.
    await mount('Waiting on you (2)');
    expect(headings()).toEqual(['Waiting on you (2)', 'New activity (0)', 'My open PRs (1)']);
    expect(section('Waiting on you (2)').querySelectorAll('[data-label]')).toHaveLength(2);
    const chips = [...host.querySelectorAll('fieldset button')].map((b) => b.textContent);
    expect(chips).toEqual(['All', 'Mine', 'Other']);
    clickText(host as Element, 'Mine');
    await waitFor(() => headings().includes('Waiting on you (1)'));
    expect(section('Waiting on you (1)').textContent).toContain('PR 1');
    expect(section('Waiting on you (1)').textContent).not.toContain('PR 2');
  });

  it('ignores cached labels and mutes while the side panel AI is off', async () => {
    store.aiSettings = {
      sidePanel: false,
      inboxLabels: [
        { name: 'Mine', hint: 'mine', mute: false },
        { name: 'Noise', hint: 'noise', mute: true },
      ],
    };
    store.aiCache = {
      'inbox:labels': {
        value: { 'acme/web#1': 'Mine', 'acme/web#3': 'Noise' },
        at: Date.now(),
        ttl: 60_000,
      },
    };
    await mount('Waiting on you (2)');
    await tick();
    expect(headings()).toEqual(['Waiting on you (2)', 'New activity (1)', 'My open PRs (1)']);
    expect(host.querySelectorAll('[data-label]')).toHaveLength(0);
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
    await waitFor(() => host.textContent?.includes('Could not dismiss. Try again.') ?? false);
    expect(sent.find((m) => m.type === 'WORK_DISMISS')).toEqual({
      type: 'WORK_DISMISS',
      key: 'acme/web#2',
      updatedAt: '2026-10-14T09:02:00.000Z',
    });
    expect(section('Waiting on you (2)').textContent).toContain('PR 2');
    failNext = undefined;
    byLabel(section('Waiting on you (2)'), 'Dismiss PR 2').click();
    await waitFor(() => headings().includes('Waiting on you (1)'));
    expect(host.textContent).not.toContain('Could not dismiss');
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

  it('shows a dismissed row again when it comes back newer', async () => {
    await mount('Waiting on you (2)');
    byLabel(section('Waiting on you (2)'), 'Dismiss PR 2').click();
    await waitFor(() => headings().includes('Waiting on you (1)'));
    const snap = snapshot();
    snap.searches.assigned = [status(2, { updatedAt: '2026-10-14T09:50:00.000Z' }), status(1)];
    store = { ...store, workSnapshot: snap };
    for (const l of listeners) l({ workSnapshot: {} }, 'local');
    await waitFor(() => headings().includes('Waiting on you (2)'));
    expect(section('Waiting on you (2)').textContent).toContain('PR 2');
  });

  it('creates a stream and pins in one message from + New stream, and cancel sends nothing', async () => {
    await mount('Waiting on you (2)');
    const waiting = section('Waiting on you (2)');
    byLabel(waiting, 'Pin PR 2').click();
    await tick();
    clickText(waiting, '+ New stream');
    await tick();
    const input = byLabel(waiting, 'New stream name') as HTMLInputElement;
    await waitFor(() => document.activeElement === input);
    // A blank name keeps the input open and sends nothing.
    clickText(waiting, 'Add and pin');
    await tick();
    byLabel(waiting, 'Cancel').click();
    await tick();
    expect(waiting.querySelector('[aria-label="New stream name"]')).toBeNull();
    expect(sent.filter((m) => m.type === 'WORK_OPS')).toHaveLength(0);
    clickText(waiting, '+ New stream');
    await tick();
    const name = byLabel(waiting, 'New stream name') as HTMLInputElement;
    name.value = ' Fresh ';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    clickText(waiting, 'Add and pin');
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPS'));
    const message = sent.find((m) => m.type === 'WORK_OPS') as { ops: Record<string, unknown>[] };
    expect(message.ops).toHaveLength(2);
    expect(message.ops[0]).toMatchObject({ op: 'addStream', name: 'Fresh' });
    expect(message.ops[1]).toMatchObject({ op: 'pin', streamId: message.ops[0]?.streamId });
  });

  it('never opens a browser dialog', async () => {
    const dialogs: string[] = [];
    window.prompt = () => {
      dialogs.push('prompt');
      return null;
    };
    await mount('Waiting on you (2)');
    const waiting = section('Waiting on you (2)');
    byLabel(waiting, 'Pin PR 2').click();
    await tick();
    clickText(waiting, '+ New stream');
    await tick();
    expect(dialogs).toEqual([]);
  });

  it('closes the pin menu after pinning', async () => {
    await mount('Waiting on you (2)');
    const waiting = section('Waiting on you (2)');
    byLabel(waiting, 'Pin PR 2').click();
    await tick();
    clickText(waiting, 'Alpha');
    await waitFor(() => !section('Waiting on you (2)').textContent?.includes('+ New stream'));
  });

  it('disables pinning without a file', async () => {
    store = { workSnapshot: snapshot() };
    await mount('Waiting on you (2)');
    expect((byLabel(section('Waiting on you (2)'), 'Pin PR 2') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
