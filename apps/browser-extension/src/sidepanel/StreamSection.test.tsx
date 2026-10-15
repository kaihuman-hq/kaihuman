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
const findStream = (name: string) =>
  host.querySelector(`section[aria-label="${name}"]`) as HTMLElement | null;
const stream = (name: string) => {
  const found = findStream(name);
  if (!found) throw new Error(`No stream "${name}"`);
  return found;
};
const countOf = (name: string) => findStream(name)?.querySelector('h3 [data-count]')?.textContent;
/** Waits for a stream to show this many open items, e.g. `mount('Alpha', 3)`. */
const mount = async (name: string, count: number) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<SidePanel />, host);
  await waitFor(() => countOf(name) === String(count));
};
const header = (name: string) => stream(name).querySelector('h3') as HTMLElement;
const rowOf = (title: string) => {
  const li = [...host.querySelectorAll('li')].find((el) => el.textContent?.includes(title));
  if (!li) throw new Error(`No row "${title}"`);
  return li as HTMLElement;
};
const byLabel = (root: Element, label: string) => {
  const el = root.querySelector(`[aria-label="${label}"]`) as HTMLElement | null;
  if (!el) throw new Error(`No control "${label}"`);
  return el;
};
const buttonOf = (root: Element, text: string) => {
  const el = [...root.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!el) throw new Error(`No button "${text}"`);
  return el;
};
const clickText = (root: Element, text: string) => buttonOf(root, text).click();
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const options = async (name: string) => {
  byLabel(header(name), `Options for ${name}`).click();
  await waitFor(() =>
    [...stream(name).querySelectorAll('button')].some((b) => b.textContent === 'Rename'),
  );
};
const more = async (title: string) => {
  byLabel(rowOf(title), `More for ${title}`).click();
  await waitFor(() => rowOf(title).textContent?.includes('Edit labels') ?? false);
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
          // A real storage round trip, so overlapping read-modify-writes can interleave.
          await tick();
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
      connect: () => ({ disconnect: () => {}, onDisconnect: { addListener: () => {} } }),
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        respond?.({ ok: true });
      },
      lastError: undefined,
    },
  };
  // Side panels block these: calling one dims the panel and returns nothing.
  window.prompt = () => {
    throw new Error('window.prompt does not work in a side panel');
  };
  window.confirm = () => {
    throw new Error('window.confirm does not work in a side panel');
  };
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('StreamSection', () => {
  it('shows open items with status and labels, and done items folded', async () => {
    await mount('Alpha', 3);
    const pr = rowOf('Live title');
    expect(pr.textContent).toContain('⇄');
    expect(pr.textContent).toContain('acme/web#7');
    expect(pr.textContent).toContain('approved');
    expect(pr.textContent).toContain('CI ✗');
    expect(pr.textContent).toContain('• new');
    expect(pr.textContent).toContain('urgent');
    expect(pr.textContent).toMatch(/just now|\d+[mhd] ago/);
    // Failing CI outranks the approval: the row's rail is red.
    expect(pr.querySelector('[data-tone]')?.getAttribute('data-tone')).toBe('bad');
    expect(rowOf('A doc').textContent).toContain('↗');
    expect(rowOf('A doc').textContent).toContain('example.com');
    expect(rowOf('Slack chat').textContent).toContain('#');
    expect(host.textContent).not.toContain('Old issue');
    clickText(stream('Alpha'), '▸ Done 1');
    await waitFor(() => host.textContent?.includes('Old issue') ?? false);
    expect(rowOf('Old issue').textContent).toContain('◎');
    clickText(rowOf('Old issue'), 'Undo');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'undone', itemId: 'it_4' });
  });

  it('opens the related picker from the options menu', async () => {
    await mount('Alpha', 3);
    await options('Alpha');
    clickText(stream('Alpha'), 'Find related');
    await waitFor(() => host.querySelector('[aria-label="Related to Alpha"]') !== null);
    expect(host.querySelector('[aria-label="Related to Alpha"]')?.textContent).toContain(
      'No other open tabs',
    );
  });

  it('uses the live title for GitHub items', async () => {
    await mount('Alpha', 3);
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

  it('clamps a long title and keeps it whole on hover', async () => {
    const long = `Investigate ${'flaky integration test in the payments service '.repeat(6)}`;
    const f = file();
    const first = f.streams[1]?.items[0];
    if (first) first.title = long;
    store = { ...store, streamsCache: { ...cache(), state: { ok: true, file: f } } };
    await mount('Beta', 1);
    const title = [...rowOf('Investigate').querySelectorAll('button')].find(
      (el) => el.textContent === long,
    );
    expect(title?.getAttribute('title')).toBe(long);
    expect(title?.className).toContain('line-clamp-2');
  });

  it('sends move when an item is dropped on another stream', async () => {
    await mount('Alpha', 3);
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

  it('asks in place before deleting a stream with items', async () => {
    await mount('Alpha', 3);
    await options('Alpha');
    clickText(stream('Alpha'), 'Delete');
    await waitFor(
      () => stream('Alpha').textContent?.includes('Delete “Alpha” and its 4 items?') ?? false,
    );
    expect(ops()).toHaveLength(0);
    clickText(stream('Alpha'), 'Keep');
    await waitFor(() => !stream('Alpha').textContent?.includes('Delete “Alpha”'));
    expect(ops()).toHaveLength(0);
    await options('Alpha');
    clickText(stream('Alpha'), 'Delete');
    await waitFor(() => stream('Alpha').textContent?.includes('Delete stream') ?? false);
    clickText(stream('Alpha'), 'Delete stream');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'deleteStream', streamId: 'st_a' });
    // An empty stream loses nothing, so it goes at once.
    await options('Empty');
    clickText(stream('Empty'), 'Delete');
    await waitFor(() => ops().length > 1);
    expect(ops()[1]).toEqual({ op: 'deleteStream', streamId: 'st_c' });
  });

  it('filters by label across streams', async () => {
    await mount('Alpha', 3);
    const filter = host.querySelector('fieldset') as HTMLElement;
    expect(filter.querySelector('legend')?.textContent).toBe('Filter by label');
    expect([...filter.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'All',
      'later',
      'urgent',
    ]);
    clickText(filter, 'urgent');
    await waitFor(() => countOf('Alpha') === '1');
    expect(countOf('Beta')).toBe('1');
    expect(host.textContent).not.toContain('A doc');
    expect(findStream('Empty')).toBeNull();
    expect((store.workUi as { label?: string }).label).toBe('urgent');
    expect(buttonOf(filter, 'urgent').getAttribute('aria-pressed')).toBe('true');
    // Clicking the active label again clears the filter.
    clickText(filter, 'urgent');
    await waitFor(() => countOf('Alpha') === '3');
  });

  it('edits labels, marks done, removes, reorders and adds streams', async () => {
    await mount('Alpha', 3);
    await more('A doc');
    clickText(rowOf('A doc'), 'Edit labels');
    await waitFor(() => rowOf('A doc').querySelector('input[aria-label="Labels"]') !== null);
    const labels = byLabel(rowOf('A doc'), 'Labels') as HTMLInputElement;
    expect(labels.value).toBe('later');
    type(labels, 'a, b ,a');
    await tick();
    clickText(rowOf('A doc'), 'Save');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toMatchObject({ op: 'setLabels', itemId: 'it_2', labels: ['a', 'b', 'a'] });
    byLabel(rowOf('A doc'), 'Done A doc').click();
    await waitFor(() => rowOf('A doc').textContent?.includes('Remove') ?? false);
    clickText(rowOf('A doc'), 'Remove');
    await waitFor(() => ops().length > 2);
    expect(ops()[1]).toMatchObject({ op: 'markDone', itemId: 'it_2' });
    expect(ops()[2]).toEqual({ op: 'remove', itemId: 'it_2' });
    await options('Beta');
    byLabel(stream('Beta'), 'Move Beta up').click();
    await waitFor(() => ops().length > 3);
    expect(ops()[3]).toEqual({ op: 'reorderStreams', order: ['st_b', 'st_a', 'st_c'] });
    clickText(host, '+ New stream');
    await waitFor(() => host.querySelector('input[aria-label="New stream name"]') !== null);
    const name = host.querySelector('input[aria-label="New stream name"]') as HTMLInputElement;
    type(name, ' Fresh ');
    await tick();
    clickText(host, 'Add');
    await waitFor(() => ops().length > 4);
    expect(ops()[4]).toMatchObject({ op: 'addStream', name: 'Fresh' });
    await waitFor(() => host.querySelector('input[aria-label="New stream name"]') === null);
    header('Beta')
      .querySelector('button')
      ?.dispatchEvent(new Event('dblclick', { bubbles: true }));
    await waitFor(() => host.querySelector('input[aria-label="Stream name"]') !== null);
    const input = host.querySelector('input[aria-label="Stream name"]') as HTMLInputElement;
    input.value = ' Gamma ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => ops().length > 5);
    expect(ops()[5]).toEqual({ op: 'renameStream', streamId: 'st_b', name: 'Gamma' });
  });

  it('renames from the options menu too', async () => {
    await mount('Alpha', 3);
    await options('Beta');
    clickText(stream('Beta'), 'Rename');
    await waitFor(() => host.querySelector('input[aria-label="Stream name"]') !== null);
    const input = host.querySelector('input[aria-label="Stream name"]') as HTMLInputElement;
    input.value = 'Delta';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'renameStream', streamId: 'st_b', name: 'Delta' });
  });

  it('cancels a new stream with Escape', async () => {
    await mount('Alpha', 3);
    clickText(host, '+ New stream');
    await waitFor(() => host.querySelector('input[aria-label="New stream name"]') !== null);
    const name = host.querySelector('input[aria-label="New stream name"]') as HTMLInputElement;
    type(name, 'Nope');
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => host.querySelector('input[aria-label="New stream name"]') === null);
    expect(ops()).toHaveLength(0);
  });

  it('keeps a rename on blur, and drops it on Escape', async () => {
    await mount('Alpha', 3);
    const rename = async (name: string) => {
      header('Beta')
        .querySelector('button')
        ?.dispatchEvent(new Event('dblclick', { bubbles: true }));
      await waitFor(() => host.querySelector('input[aria-label="Stream name"]') !== null);
      const input = host.querySelector('input[aria-label="Stream name"]') as HTMLInputElement;
      input.value = name;
      return input;
    };
    (await rename('Gamma')).dispatchEvent(new FocusEvent('blur'));
    await waitFor(() => ops().length > 0);
    expect(ops()).toEqual([{ op: 'renameStream', streamId: 'st_b', name: 'Gamma' }]);

    const input = await rename('Delta');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    await waitFor(() => host.querySelector('input[aria-label="Stream name"]') === null);
    await tick();
    expect(ops()).toHaveLength(1);
  });

  it('double click renames without toggling collapse', async () => {
    await mount('Alpha', 3);
    const button = header('Alpha').querySelector('button') as HTMLElement;
    const mouse = (type: string, detail: number) =>
      button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail }));
    mouse('click', 1);
    mouse('click', 2);
    mouse('dblclick', 2);
    await waitFor(() => host.querySelector('input[aria-label="Stream name"]') !== null);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(store.workUi).toBeUndefined();
    expect(host.textContent).toContain('Live title');
  });

  it('persists collapse on a header click', async () => {
    await mount('Alpha', 3);
    (header('Alpha').querySelector('button') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((store.workUi as { collapsed: string[] }).collapsed).toEqual(['st_a']);
    await waitFor(
      () => header('Alpha').querySelector('button')?.getAttribute('aria-expanded') === 'false',
    );
    expect(header('Alpha').textContent).toContain('▸');
    expect(host.textContent).not.toContain('Live title');
  });

  it('keeps both toggles when two streams are collapsed at once', async () => {
    await mount('Alpha', 3);
    (header('Alpha').querySelector('button') as HTMLElement).click();
    (header('Beta').querySelector('button') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((store.workUi as { collapsed: string[] }).collapsed.sort()).toEqual(['st_a', 'st_b']);
  });

  it('moves an item to another stream from its actions', async () => {
    await mount('Alpha', 3);
    await more('A doc');
    const row = rowOf('A doc');
    expect(row.textContent).toContain('Move to');
    expect(() => buttonOf(row, 'Alpha')).toThrow();
    clickText(row, 'Empty');
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'move', itemId: 'it_2', streamId: 'st_c' });
  });

  it('moves a stream down, with the end buttons disabled', async () => {
    await mount('Alpha', 3);
    await options('Alpha');
    await options('Empty');
    const btn = (name: string, dir: string) =>
      byLabel(stream(name), `Move ${name} ${dir}`) as HTMLButtonElement;
    expect(btn('Alpha', 'up').disabled).toBe(true);
    expect(btn('Empty', 'down').disabled).toBe(true);
    btn('Alpha', 'down').click();
    await waitFor(() => ops().length > 0);
    expect(ops()[0]).toEqual({ op: 'reorderStreams', order: ['st_b', 'st_a', 'st_c'] });
  });

  it('ignores a drop that is not an item or lands on its own stream', async () => {
    await mount('Alpha', 3);
    const drop = (name: string, value: string) => {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(event, { dataTransfer: { getData: () => value } });
      header(name).dispatchEvent(event);
    };
    drop('Beta', '');
    drop('Alpha', 'it_2');
    await tick();
    await tick();
    expect(ops()).toHaveLength(0);
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
    await options('Alpha');
    await more('A doc');
    const controls = [...host.querySelectorAll('button')].filter(
      (b) =>
        ['Rename', 'Delete', 'Edit labels', 'Remove', 'Beta', 'Empty'].includes(
          b.textContent ?? '',
        ) || /^(Done|Move) /.test(b.getAttribute('aria-label') ?? ''),
    );
    expect(controls.length).toBeGreaterThan(8);
    expect(controls.every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('li')?.getAttribute('draggable')).toBe('false');
  });

  it('hides streams and + New stream without a data repo', async () => {
    store = { workSnapshot: snapshot() };
    host = document.createElement('div');
    document.body.appendChild(host);
    render(<SidePanel />, host);
    await waitFor(() => host.textContent?.includes('Waiting on you') ?? false);
    expect(host.textContent).not.toContain('+ New stream');
    expect(host.querySelector('fieldset')).toBeNull();
  });

  it('saves and removes the work token', async () => {
    store.workToken = 'ghp_secret';
    await mount('Alpha', 3);
    byLabel(host, 'Settings').click();
    await waitFor(() => host.querySelector('input[type="password"]') !== null);
    await waitFor(() => host.textContent?.includes('A work token is set') ?? false);
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
