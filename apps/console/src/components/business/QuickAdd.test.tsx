import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../../lib/business/fixture.test-helper';
import type { BusinessState } from '../../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
vi.mock('../../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));

const { QuickAdd } = await import('./QuickAdd');

const target = { full_name: 'me/biz', default_branch: 'main' } as never;
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});
const TODOS = '.kh/business/clients/acme-gmbh/todos.todos.md';
const LOG = '.kh/business/clients/acme-gmbh/log.actionlog.md';

let built: { ok?: boolean; value?: { changes: Record<string, string | null>; message: string } };
const writeAgainst = (files: Record<string, string> = {}) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({
      repo: loadBusinessRepo(loadFixtureRepo()),
      headSha: 'h',
      tree: [],
      read: async (p: string) => files[p] ?? null,
    });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (kind: 'todo' | 'log') => {
  hooks.state = ready(loadBusinessRepo(loadFixtureRepo()));
  act(() => render(<QuickAdd client={'acme-gmbh' as never} kind={kind} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const input = () => host.querySelector('input') as HTMLInputElement;
const type = (value: string) =>
  act(() => {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('QuickAdd', () => {
  it('has a label and renders nothing until the repo is ready', () => {
    show('todo');
    expect(host.querySelector(`label[for="${input().id}"]`)?.textContent).toBe('New todo');
    act(() => render(null, host));
    hooks.state = { status: 'loading' };
    act(() => render(<QuickAdd client={'acme-gmbh' as never} kind="todo" />, host));
    expect(host.querySelector('input')).toBeNull();
  });

  it('adds a todo to the fresh file text in one write and clears the input', async () => {
    const old = '# Acme todos\n\nProse stays.\n\n- [ ] Earlier, no tags\n';
    writeAgainst({ [TODOS]: old });
    show('todo');
    type('Send invoice');
    act(() => submit().click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(Object.keys(built.value?.changes ?? {})).toEqual([TODOS]);
    expect(built.value?.changes[TODOS]?.startsWith(old)).toBe(true);
    expect(built.value?.changes[TODOS]).toContain('\n- [ ] Send invoice\n');
    expect(built.value?.message).toBe('business: todo for acme-gmbh');
    expect(input().value).toBe('');
  });

  it('keeps the whole old log text and adds one line', async () => {
    const old = '# Acme log\n\nProse.\n- 2026-10-01 08:00:00 Earlier';
    writeAgainst({ [LOG]: old });
    show('log');
    type('Called Erika');
    act(() => submit().click());
    await flush();
    const text = built.value?.changes[LOG] ?? '';
    expect(text.startsWith(`${old}\n- `)).toBe(true);
    expect(
      text
        .slice(old.length + 1)
        .trim()
        .split('\n'),
    ).toHaveLength(1);
  });

  it('creates the log file when the client has none', async () => {
    writeAgainst();
    show('log');
    type('Called Erika');
    act(() => submit().click());
    await flush();
    expect(built.value?.changes[LOG]).toMatch(
      /\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Called Erika/,
    );
  });

  it('refuses empty text without writing', async () => {
    show('log');
    type('   ');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Enter some text.');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('keeps the text and shows the error when the write fails', async () => {
    writes.writeBusiness.mockRejectedValue(new Error('boom'));
    show('todo');
    type('Keep me');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('boom');
    expect(input().value).toBe('Keep me');
    expect(submit().disabled).toBe(false);
  });
});
