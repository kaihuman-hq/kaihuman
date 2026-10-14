import type { StreamsFile } from '@kaihuman/formats';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StreamsCache, WorkSnapshot } from '../background/work/types';
import { SidePanel } from './SidePanel';
import { StreamSection } from './StreamSection';

const NOW = '2026-10-14T10:00:00.000Z';
const FETCHED = new Date('2026-10-14T09:45:00.000Z').getTime();

const item = (id: string, url: string, title: string, extra: Record<string, unknown> = {}) => ({
  id: id as never,
  url,
  title,
  addedAt: '2026-10-14T07:00:00.000Z',
  labels: [] as string[],
  extra: {},
  ...extra,
});

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
        item('it_1', 'https://github.com/acme/web/pull/7', 'Stored title', { labels: ['urgent'] }),
        item('it_2', 'https://example.com/doc', 'A doc', { labels: ['later'] }),
        item('it_3', 'https://acme.slack.com/archives/C1/p1', 'Slack chat'),
        item('it_4', 'https://github.com/acme/web/issues/9', 'Old issue', {
          doneAt: '2026-10-13T10:00:00.000Z',
        }),
      ],
    },
    {
      id: 'st_b' as never,
      name: 'Beta',
      createdAt: NOW,
      invalidItems: [],
      extra: {},
      items: [item('it_5', 'https://example.com/b', 'Beta item', { labels: ['urgent'] })],
    },
    { id: 'st_c' as never, name: 'Empty', createdAt: NOW, invalidItems: [], extra: {}, items: [] },
  ],
});

const cache = (ok = true): StreamsCache => ({
  repo: 'owner/repo',
  state: ok ? { ok: true, file: file() } : { ok: false, error: 'bad json' },
  sha: 'abc',
  etag: null,
  fetchedAt: FETCHED,
});

const snapshot = (): WorkSnapshot => ({
  login: 'me',
  fetchedAt: FETCHED,
  searches: {
    'review-requested': [],
    assigned: [],
    failing: [],
    'changes-requested': [],
    'ready-to-merge': [],
    mine: [],
  },
  threads: [
    {
      threadId: 't7',
      key: 'acme/web#7' as never,
      reason: 'comment',
      title: 'Live title',
      url: 'https://github.com/acme/web/pull/7',
      repo: 'acme/web',
      updatedAt: '2026-10-14T09:30:00.000Z',
      unread: true,
    },
  ],
  pinned: {
    'acme/web#7': {
      key: 'acme/web#7' as never,
      url: 'https://github.com/acme/web/pull/7',
      repo: 'acme/web',
      number: 7,
      kind: 'pr',
      title: 'Live title',
      state: 'open',
      isDraft: false,
      review: 'approved',
      ci: 'failure',
      conflict: false,
      updatedAt: '2026-10-14T09:00:00.000Z',
    },
  },
  orgProblems: [],
  problem: null,
});

let host: HTMLDivElement;
let store: Record<string, unknown>;
let sent: Record<string, unknown>[];
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
  await waitFor(() => host.textContent?.includes(settled) ?? false);
};
const stream = (name: string) => {
  const h = [...host.querySelectorAll('h3')].find((el) => el.textContent?.includes(name));
  if (!h?.parentElement) throw new Error(`No stream "${name}"`);
  return h.parentElement;
};
const header = (name: string) => stream(name).querySelector('h3') as HTMLElement;
const rowOf = (title: string) => {
  const li = [...host.querySelectorAll('li')].find((el) => el.textContent?.includes(title));
  if (!li) throw new Error(`No row "${title}"`);
  return li as HTMLElement;
};
const clickText = (root: Element, text: string) => {
  const el = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!el) throw new Error(`No button "${text}"`);
  el.click();
};
const ops = () => sent.filter((m) => m.type === 'WORK_OPS').flatMap((m) => m.ops as never[]);

beforeEach(() => {
  store = { streamsCache: cache(), workSnapshot: snapshot() };
  sent = [];
  listeners = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async (values: Record<string, unknown>) => {
          Object.assign(store, values);
          for (const l of listeners)
            l(Object.fromEntries(Object.keys(values).map((k) => [k, {}])), 'local');
        },
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
      connect: () => ({ disconnect: () => {} }),
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        respond?.({ ok: true });
      },
      lastError: undefined,
    },
  };
  window.prompt = () => null;
  window.confirm = () => true;
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('StreamSection', () => {
  it('shows open items with status and labels, and done items folded', async () => {
    await mount('Alpha (3)');
    const pr = rowOf('Live title');
    expect(pr.textContent).toContain('⇄');
    expect(pr.textContent).toContain('acme/web#7');
    expect(pr.textContent).toContain('approved');
    expect(pr.textContent).toContain('CI ✗');
    expect(pr.textContent).toContain('• new');
    expect(pr.textContent).toContain('urgent');
    expect(pr.textContent).toMatch(/just now|\d+[mhd] ago/);
    expect(rowOf('A doc').textContent).toContain('↗');
    expect(rowOf('Slack chat').textContent).toContain('#');
    expect(host.textContent).not.toContain('Old issue');
    expect(host.textContent).toContain('Done (1)');
    clickText(stream('Alpha'), 'Done (1)');
    await waitFor(() => host.textContent?.includes('Old issue') ?? false);
    expect(rowOf('Old issue').textContent).toContain('◎');
    clickText(rowOf('Old issue'), 'Undo');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'undone', itemId: 'it_4' });
  });

  it('uses the live title for GitHub items', async () => {
    await mount('Alpha (3)');
    expect(host.textContent).toContain('Live title');
    expect(host.textContent).not.toContain('Stored title');
    clickText(rowOf('Live title'), 'Live title');
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPEN'));
    expect(sent.find((m) => m.type === 'WORK_OPEN')).toEqual({
      type: 'WORK_OPEN',
      url: 'https://github.com/acme/web/pull/7',
      threadId: 't7',
    });
  });

  it('sends move when an item is dropped on another stream', async () => {
    await mount('Alpha (3)');
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
      effectAllowed: '',
      dropEffect: '',
    };
    const fire = (el: Element, type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { dataTransfer });
      el.dispatchEvent(event);
      return event;
    };
    const row = rowOf('A doc');
    expect(row.getAttribute('draggable')).toBe('true');
    fire(row, 'dragstart');
    expect(data.get('text/kaihuman-item')).toBe('it_2');
    expect(fire(header('Beta'), 'dragover').defaultPrevented).toBe(true);
    fire(header('Beta'), 'drop');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'move', itemId: 'it_2', streamId: 'st_b' });
  });

  it('asks before deleting a stream with items', async () => {
    await mount('Alpha (3)');
    const asked: string[] = [];
    window.confirm = (message?: string) => {
      asked.push(message ?? '');
      return false;
    };
    clickText(header('Alpha'), 'Delete');
    expect(asked).toEqual(['Delete "Alpha" and its 4 items?']);
    expect(ops()).toHaveLength(0);
    window.confirm = (message?: string) => {
      asked.push(message ?? '');
      return true;
    };
    clickText(header('Alpha'), 'Delete');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'deleteStream', streamId: 'st_a' });
    clickText(header('Empty'), 'Delete');
    await waitFor(() => ops().length > 1);
    expect(asked).toHaveLength(2);
    expect(ops()[1]).toEqual({ op: 'deleteStream', streamId: 'st_c' });
  });

  it('filters by label across streams', async () => {
    await mount('Alpha (3)');
    const select = host.querySelector('select[aria-label="Filter by label"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'later', 'urgent']);
    select.value = 'urgent';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => host.textContent?.includes('Alpha (1)') ?? false);
    expect(host.textContent).toContain('Beta (1)');
    expect(host.textContent).not.toContain('A doc');
    expect([...host.querySelectorAll('h3')].some((h) => h.textContent?.includes('Empty'))).toBe(
      false,
    );
    expect((store.workUi as { label?: string }).label).toBe('urgent');
  });

  it('edits labels, renames, reorders and adds streams', async () => {
    await mount('Alpha (3)');
    window.prompt = () => 'a, b ,a';
    clickText(rowOf('A doc'), 'Labels');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toMatchObject({ op: 'setLabels', itemId: 'it_2' });
    clickText(rowOf('A doc'), '✓');
    clickText(rowOf('A doc'), '✕');
    await waitFor(() => ops().length > 2);
    expect(ops()[1]).toMatchObject({ op: 'markDone', itemId: 'it_2' });
    expect(ops()[2]).toEqual({ op: 'remove', itemId: 'it_2' });
    clickText(header('Beta'), '↑');
    await waitFor(() => ops().length > 3);
    expect(ops()[3]).toEqual({ op: 'reorderStreams', order: ['st_b', 'st_a', 'st_c'] });
    window.prompt = () => 'Fresh';
    clickText(host, '+ New stream');
    await waitFor(() => ops().length > 4);
    expect(ops()[4]).toMatchObject({ op: 'addStream', name: 'Fresh' });
    header('Beta')
      .querySelector('span,button')
      ?.dispatchEvent(new Event('dblclick', { bubbles: true }));
    await waitFor(() => host.querySelector('input[aria-label="Stream name"]') !== null);
    const input = host.querySelector('input[aria-label="Stream name"]') as HTMLInputElement;
    input.value = ' Gamma ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => ops().length > 5);
    expect(ops()[5]).toEqual({ op: 'renameStream', streamId: 'st_b', name: 'Gamma' });
  });

  it('disables editing when the file is read-only', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const f = file();
    render(
      <StreamSection
        stream={f.streams[0] as never}
        index={0}
        count={3}
        statuses={snapshot().pinned}
        unread={new Set()}
        label={undefined}
        collapsed={false}
        readOnly
        streams={f.streams}
      />,
      host,
    );
    const buttons = [...host.querySelectorAll('button')].filter((b) =>
      ['Delete', '↑', '↓', 'Labels', '✓', '✕'].includes(b.textContent ?? ''),
    );
    expect(buttons.length).toBeGreaterThan(6);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    expect([...host.querySelectorAll('select')].every((s) => s.disabled)).toBe(true);
    expect(host.querySelector('li')?.getAttribute('draggable')).toBe('false');
  });

  it('hides streams and + New stream without a data repo', async () => {
    store = { workSnapshot: snapshot() };
    await mount('Settings');
    expect(host.textContent).not.toContain('+ New stream');
    expect(host.querySelector('select[aria-label="Filter by label"]')).toBeNull();
  });

  it('saves and removes the work token', async () => {
    store.workToken = 'ghp_secret';
    await mount('Settings');
    clickText(host, 'Settings');
    await waitFor(() => host.querySelector('input[type="password"]') !== null);
    expect(host.textContent).toContain('A work token is set');
    expect(host.innerHTML).not.toContain('ghp_secret');
    expect(host.textContent).toContain(
      'A classic token with repo and notifications, for orgs that block the kaihuman app.',
    );
    const input = host.querySelector('input[type="password"]') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('Work token');
    input.value = ' ghp_new ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    clickText(host, 'Save');
    await waitFor(() => sent.some((m) => m.type === 'WORK_SET_TOKEN'));
    expect(sent.find((m) => m.type === 'WORK_SET_TOKEN')).toEqual({
      type: 'WORK_SET_TOKEN',
      key: 'ghp_new',
    });
    clickText(host, 'Remove');
    await waitFor(() => sent.filter((m) => m.type === 'WORK_SET_TOKEN').length === 2);
    expect(sent.filter((m) => m.type === 'WORK_SET_TOKEN')[1]).toEqual({
      type: 'WORK_SET_TOKEN',
      key: '',
    });
  });
});
