import type { StreamsFile } from '@kaihuman/formats';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamsCache, WorkItemStatus, WorkSnapshot } from '../background/work/types';
import { SidePanel } from './SidePanel';
import { resetSuggestions } from './useSuggestion';

const NOW = '2026-10-15T10:00:00.000Z';
const FETCHED = new Date('2026-10-15T09:45:00.000Z').getTime();

const file = (): StreamsFile => ({
  version: 1,
  updatedAt: NOW,
  invalidStreams: [],
  extra: {},
  streams: [
    {
      id: 'st_a' as never,
      name: 'Alpha',
      createdAt: NOW,
      invalidItems: [],
      extra: {},
      items: [
        {
          id: 'it_1' as never,
          url: 'https://github.com/acme/api/pull/1',
          title: 'API thing',
          addedAt: NOW,
          labels: ['backend'],
          extra: {},
        },
      ],
    },
    { id: 'st_b' as never, name: 'Beta', createdAt: NOW, invalidItems: [], extra: {}, items: [] },
  ],
});

const cache = (): StreamsCache => ({
  repo: 'owner/repo',
  state: { ok: true, file: file() },
  sha: 'abc',
  etag: null,
  fetchedAt: FETCHED,
});

const status = (n: number, repo = 'acme/web'): WorkItemStatus => ({
  key: `${repo}#${n}` as never,
  url: `https://github.com/${repo}/pull/${n}`,
  repo,
  number: n,
  kind: 'pr',
  title: `PR ${n}`,
  state: 'open',
  isDraft: false,
  review: null,
  ci: null,
  conflict: false,
  updatedAt: `2026-10-15T09:0${n}:00.000Z`,
});

const snapshot = (assigned: WorkItemStatus[] = []): WorkSnapshot => ({
  login: 'me',
  fetchedAt: FETCHED,
  searches: {
    'review-requested': [],
    assigned,
    failing: [],
    'changes-requested': [],
    'ready-to-merge': [],
    mine: [],
  },
  threads: [],
  pinned: {},
  orgProblems: [],
  problem: null,
});

let host: HTMLDivElement;
let store: Record<string, unknown>;
let sent: Record<string, unknown>[];
let activeTab: { id: number; url?: string; title?: string } | undefined;
let listeners: ((changes: Record<string, unknown>, area: string) => void)[];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 200; i++) {
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
const byLabel = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
/** The checkbox whose label starts with `label`. */
const checkbox = (label: string) =>
  [...host.querySelectorAll('label')]
    .find((l) => l.textContent?.startsWith(label))
    ?.querySelector('input[type="checkbox"]') as HTMLInputElement | undefined;
const ops = () => sent.filter((m) => m.type === 'WORK_OPS').flatMap((m) => m.ops as never[]);

/** Chrome's model as a stub: `answer` maps an item's title to the JSON the model returns. */
const model = (answer: (input: string) => object, availability = 'available') => {
  const stub = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async (options: { monitor?: (m: unknown) => void } = {}) => {
      options.monitor?.({
        addEventListener: (_t: string, l: (e: { loaded: number }) => void) => l({ loaded: 0.4 }),
      });
      return {
        prompt: async (input: string) => JSON.stringify(answer(input)),
        destroy: () => {},
      };
    }),
  };
  vi.stubGlobal('LanguageModel', stub);
  return stub;
};

beforeEach(() => {
  resetSuggestions();
  store = { streamsCache: cache(), workSnapshot: snapshot() };
  sent = [];
  listeners = [];
  activeTab = { id: 7, url: 'https://example.com/hiring', title: 'Hiring plan' };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
          for (const l of listeners)
            l(Object.fromEntries(Object.keys(items).map((k) => [k, {}])), 'local');
        },
      },
      onChanged: {
        addListener: (l: (changes: Record<string, unknown>, area: string) => void) =>
          listeners.push(l),
        removeListener: () => {},
      },
    },
    tabs: {
      query: async () => (activeTab ? [activeTab] : []),
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      connect: () => ({ disconnect: () => {}, onDisconnect: { addListener: () => {} } }),
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        respond?.({ ok: true });
      },
      lastError: undefined,
    },
  });
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

describe('suggestions in the This-tab card', () => {
  it('preselects the suggested stream and labels, and pins there', async () => {
    model(() => ({ stream: 'Beta', labels: ['people'] }));
    await mount('Pin to');
    await waitFor(() => host.textContent?.includes('Suggested') ?? false);
    expect(button('Beta').getAttribute('aria-pressed')).toBe('true');
    expect((byLabel('Labels') as HTMLInputElement).value).toBe('people');
    button('Pin').click();
    await waitFor(() => ops().length > 0);
    expect(ops()).toEqual([
      expect.objectContaining({ op: 'pin', streamId: 'st_b', labels: ['people'] }),
    ]);
  });

  it('shows the reason under Suggested', async () => {
    model(() => ({ stream: 'Beta', labels: [], reason: 'Hiring plans live here' }));
    await mount('Pin to');
    await waitFor(() => host.textContent?.includes('Hiring plans live here') ?? false);
    expect(host.textContent).toContain('Suggested');
  });

  it('proposes a new stream by name and creates it on Pin', async () => {
    model(() => ({ stream: '(new stream)', newStreamName: 'Hiring', labels: [] }));
    await mount('Pin to');
    await waitFor(() => host.querySelector('input[aria-label="New stream name"]') !== null);
    expect(button('+ New stream').getAttribute('aria-pressed')).toBe('true');
    expect((byLabel('New stream name') as HTMLInputElement).value).toBe('Hiring');
    button('Pin').click();
    await waitFor(() => ops().length > 1);
    expect(ops()[0]).toMatchObject({ op: 'addStream', name: 'Hiring' });
    expect(ops()[1]).toMatchObject({
      op: 'pin',
      streamId: (ops()[0] as { streamId: string }).streamId,
    });
  });

  it('lets the user’s own pick win over the suggestion', async () => {
    model(() => ({ stream: 'Beta', labels: ['people'] }));
    await mount('Pin to');
    await waitFor(() => host.textContent?.includes('Suggested') ?? false);
    button('Alpha').click();
    await waitFor(() => !host.textContent?.includes('Suggested'));
    button('Pin').click();
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toMatchObject({ op: 'pin', streamId: 'st_a' });
  });

  it('follows the repository without the model', async () => {
    activeTab = { id: 7, url: 'https://github.com/acme/api/pull/9', title: 'API follow-up' };
    await mount('Pin to');
    await waitFor(() => host.textContent?.includes('Suggested') ?? false);
    expect(button('Alpha').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('suggestions in the inbox', () => {
  it('offers one click to pin a row where it was suggested', async () => {
    activeTab = undefined;
    store.workSnapshot = snapshot([status(2)]);
    model(() => ({ stream: 'Beta', labels: ['web'] }));
    await mount('PR 2');
    await waitFor(() => byLabel('Pin PR 2 to Beta') !== null);
    expect(byLabel('Pin PR 2 to Beta').textContent).toContain('web');
    byLabel('Pin PR 2 to Beta').click();
    await waitFor(() => ops().length > 0);
    expect(ops()).toEqual([
      expect.objectContaining({
        op: 'pin',
        streamId: 'st_b',
        url: 'https://github.com/acme/web/pull/2',
        labels: ['web'],
      }),
    ]);
  });

  it('files new waiting items on its own when asked to, each only once', async () => {
    activeTab = undefined;
    store.workSnapshot = snapshot([status(2), status(3, 'acme/other')]);
    store.workUi = { collapsed: [], autoFileInbox: true };
    model((input) =>
      input.includes('PR 2') ? { stream: 'Beta', labels: [] } : { stream: 'Alpha', labels: [] },
    );
    await mount('PR 2');
    await waitFor(() => ops().length === 2);
    expect(
      ops().map((op) => [(op as { url: string }).url, (op as { streamId: string }).streamId]),
    ).toEqual([
      // Newest first, as the inbox lists them.
      ['https://github.com/acme/other/pull/3', 'st_a'],
      ['https://github.com/acme/web/pull/2', 'st_b'],
    ]);
    expect(store.workAutoFiled).toEqual(['acme/other#3', 'acme/web#2']);

    // Taken back out of their streams, the rows stay in the inbox.
    render(null, host);
    host.remove();
    sent = [];
    resetSuggestions();
    await mount('PR 2');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ops()).toEqual([]);
  });

  it('leaves rows alone when nothing can be suggested', async () => {
    activeTab = undefined;
    store.workSnapshot = snapshot([status(2)]);
    store.workUi = { collapsed: [], autoFileInbox: true };
    await mount('PR 2');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ops()).toEqual([]);
    expect(host.querySelector('[aria-label^="Pin PR 2 to"]')).toBeNull();
  });
});

describe('suggestion settings', () => {
  it('downloads the model from a click and shows its progress', async () => {
    model(() => ({}), 'downloadable');
    await mount('Work');
    byLabel('Settings').click();
    await waitFor(() => host.textContent?.includes('not downloaded yet') ?? false);
    button('Download the model').click();
    await waitFor(() => host.textContent?.includes('suggests a stream and labels') ?? false);
  });

  it('says when this device has no model', async () => {
    await mount('Work');
    byLabel('Settings').click();
    await waitFor(() => host.textContent?.includes('not available on this device') ?? false);
    expect(button('Download the model')).toBeUndefined();
  });

  it('stores both filing switches', async () => {
    await mount('Work');
    byLabel('Settings').click();
    await waitFor(() => checkbox('Tidy tabs') !== undefined);
    const files = checkbox('File pins from the shortcut');
    const inbox = checkbox('File new Waiting-on-you items');
    expect(files?.checked).toBe(true);
    expect(inbox?.checked).toBe(false);
    files?.click();
    await waitFor(() => (store.workUi as { autoFile?: boolean })?.autoFile === false);
    inbox?.click();
    await waitFor(() => (store.workUi as { autoFileInbox?: boolean })?.autoFileInbox === true);
  });

  it('stores the AI group switches', async () => {
    await mount('Work');
    byLabel('Settings').click();
    await waitFor(() => host.textContent?.includes('On-device AI') ?? false);
    await waitFor(() => checkbox('Rank and summarize on the new tab page') !== undefined);
    for (const label of [
      'Rank and summarize on the new tab page',
      'Suggest when saving',
      'Triage in the side panel',
      'Palette actions',
      'Tidy tabs',
    ]) {
      expect(checkbox(label)?.checked).toBe(true);
    }
    checkbox('Rank and summarize on the new tab page')?.click();
    await waitFor(() => (store.aiSettings as { newTab?: boolean })?.newTab === false);
    expect(store.aiSettings).toMatchObject({ newTab: false, tabs: true });
    expect(checkbox('Rank and summarize on the new tab page')?.checked).toBe(false);
  });

  it('keeps both of two AI switches flipped back to back', async () => {
    await mount('Work');
    byLabel('Settings').click();
    await waitFor(() => checkbox('Tidy tabs') !== undefined);
    checkbox('Tidy tabs')?.click();
    checkbox('Palette actions')?.click();
    await waitFor(() => {
      const ai = store.aiSettings as { tabs?: boolean; palette?: boolean } | undefined;
      return ai?.tabs === false && ai?.palette === false;
    });
    expect(checkbox('Tidy tabs')?.checked).toBe(false);
    expect(checkbox('Palette actions')?.checked).toBe(false);
  });
});
