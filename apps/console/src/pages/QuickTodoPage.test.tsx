import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
const store = vi.hoisted(() => ({
  saveFile: vi.fn(async () => {}),
  createFile: vi.fn(async () => {}),
  updateFileContent: vi.fn(),
  openFile: vi.fn(),
  loadTree: vi.fn(),
}));
vi.mock('@kaihuman/core', async (importOriginal) => {
  const { signal } = await import('@preact/signals');
  return {
    ConflictError: (await importOriginal<typeof import('@kaihuman/core')>()).ConflictError,
    githubFileStore: {
      ...store,
      tree: signal([{ path: 'kh/other.md', type: 'blob', sha: 's', url: '' }]),
      openFiles: signal({}),
      appFolder: signal('kh'),
    },
  };
});
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));
vi.mock('../hooks/useManifest', () => ({ useManifest: () => {} }));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { QuickTodoPage } = await import('./QuickTodoPage');

const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const data: BusinessRepo = loadBusinessRepo(loadFixtureRepo());
const ready: BusinessState = { status: 'ready', repo: target, data, contents: {}, loadErrors: [] };
const TODOS = '.kh/business/clients/acme-gmbh/todos.todos.md';

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const set = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const submit = async () => {
  await act(() => {
    (host.querySelector('button[type="submit"]') as HTMLButtonElement).click();
  });
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  hooks.state = ready;
  act(() => render(<QuickTodoPage />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('QuickTodoPage', () => {
  it('commits a todo to the chosen client file instead of the inbox', async () => {
    let built: unknown;
    writes.writeBusiness.mockImplementation(async (_t, build) => {
      built = await build({
        repo: data,
        headSha: 'h',
        tree: [],
        read: async () => '- [ ] old\n',
      });
      return { ok: true, value: { commitSha: 'c' } };
    });
    set('quick-todo-client', 'acme-gmbh');
    set('quick-todo-task', 'send draft');
    await submit();

    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const { changes, message } = (built as { value: { changes: Record<string, string> } })
      .value as {
      changes: Record<string, string>;
      message: string;
    };
    expect(Object.keys(changes)).toEqual([TODOS]);
    expect(changes[TODOS]).toContain('send draft');
    expect(changes[TODOS]?.startsWith('- [ ] old\n')).toBe(true);
    expect(message).toBe('business: todo for acme-gmbh');
    expect(store.saveFile).not.toHaveBeenCalled();
    expect(store.createFile).not.toHaveBeenCalled();
    expect(field('quick-todo-task').value).toBe('');
  });

  it('keeps writing to the inbox when no client is chosen', async () => {
    set('quick-todo-task', 'plain task');
    await submit();

    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(store.createFile).toHaveBeenCalledTimes(1);
    const [path, content] = store.createFile.mock.calls[0] as unknown as [string, string];
    expect(path).toBe('kh/inbox.todos.md');
    expect(content).toContain('plain task');
  });

  it('shows the failure and keeps the input when the client write fails', async () => {
    writes.writeBusiness.mockRejectedValue(new Error('offline'));
    set('quick-todo-client', 'acme-gmbh');
    set('quick-todo-task', 'send draft');
    await submit();

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Saving failed, nothing was written: offline',
    );
    expect(field('quick-todo-task').value).toBe('send draft');
  });

  it('offers no client select when business is not set up', () => {
    act(() => render(null, host));
    hooks.state = { status: 'disabled', repo: target };
    act(() => render(<QuickTodoPage />, host));
    expect(host.querySelector('#quick-todo-client')).toBeNull();
  });

  it('refuses a chosen client while business data is not ready, instead of using the inbox', async () => {
    set('quick-todo-client', 'acme-gmbh');
    hooks.state = { status: 'loading' };
    set('quick-todo-task', 'send draft');
    await submit();

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Business data is still loading. Try again in a moment.',
    );
    expect(store.createFile).not.toHaveBeenCalled();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(field('quick-todo-task').value).toBe('send draft');
  });

  it('drops a selected client that is no longer listed', async () => {
    set('quick-todo-client', 'acme-gmbh');
    hooks.state = { ...ready, data: { ...data, clients: [] } };
    set('quick-todo-tags', 'x'); // re-renders the page with the new hook state
    hooks.state = ready;
    set('quick-todo-tags', 'y');
    expect(field('quick-todo-client').value).toBe('');
  });

  it('writes tags as inline #tags on the client line', async () => {
    let text = '';
    writes.writeBusiness.mockImplementation(async (_t, build) => {
      const r = await build({ repo: data, headSha: 'h', tree: [], read: async () => null });
      text = r.ok ? String(Object.values(r.value.changes)[0] ?? '') : '';
      return { ok: true, value: { commitSha: 'c' } };
    });
    set('quick-todo-client', 'acme-gmbh');
    set('quick-todo-task', 'send draft');
    set('quick-todo-tags', '#Urgent, billing');
    await submit();
    expect(text).toContain('#urgent');
    expect(text).toContain('#billing');
  });
});
