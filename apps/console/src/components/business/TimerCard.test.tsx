import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../../lib/business/fixture.test-helper';
import type { BusinessState } from '../../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
const router = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));
vi.mock('preact-router', () => router);

const { TimerCard } = await import('./TimerCard');

const TIMER = '.kh/business/time/running.yaml';
const target = { full_name: 'me/biz', default_branch: 'main' } as never;
const load = (running: boolean): BusinessRepo => {
  const m = loadFixtureRepo();
  if (running) m.set(TIMER, 'client: acme-gmbh\nstarted_at: 2026-11-02T09:00:00Z\nnote: Calls\n');
  return loadBusinessRepo(m);
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

/** Runs the builder against `fresh` like writeBusiness does and records what it would commit. */
let built: unknown;
const writeAgainst = (fresh: BusinessRepo) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ repo: fresh, headSha: 'h', tree: [], read: async () => null });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (state: BusinessState, client?: string) => {
  hooks.state = state;
  act(() => render(<TimerCard client={client as never} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const button = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
const choose = (id: string, value: string) =>
  act(() => {
    const el = host.querySelector(`#${id}`) as HTMLSelectElement;
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

beforeEach(() => {
  vi.clearAllMocks();
  built = undefined;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

describe('TimerCard, no timer', () => {
  it('renders nothing until the data is ready', () => {
    show({ status: 'loading' });
    expect(host.innerHTML).toBe('');
  });

  it('starts a timer for the chosen client and project in one write', async () => {
    const data = load(false);
    writeAgainst(data);
    show(ready(data));
    expect(button('Start').disabled).toBe(true);
    choose('timer-client', 'acme-gmbh');
    choose('timer-project', 'website');
    act(() => button('Start').click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(writes.writeBusiness.mock.calls[0]?.[0]).toBe(target);
    const value = (built as { value: { changes: Record<string, string>; message: string } }).value;
    expect(Object.keys(value.changes)).toEqual([TIMER]);
    expect(value.changes[TIMER]).toContain('client: acme-gmbh');
    expect(value.changes[TIMER]).toContain('project: website');
    expect(value.message).toBe('business: start timer for acme-gmbh');
  });

  it('fixes the client when one is given', () => {
    show(ready(load(false)), 'acme-gmbh');
    const select = host.querySelector('#timer-client') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.value).toBe('acme-gmbh');
    expect(button('Start').disabled).toBe(false);
  });

  it('shows the refusal when a timer started elsewhere in the meantime', async () => {
    writeAgainst(load(true));
    show(ready(load(false)), 'acme-gmbh');
    act(() => button('Start').click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'A timer is already running for acme-gmbh.',
    );
  });

  it('shows the conflict message when the write throws', async () => {
    const { ConflictError } = await import('@kaihuman/core');
    writes.writeBusiness.mockRejectedValue(new ConflictError('moved'));
    show(ready(load(false)), 'acme-gmbh');
    act(() => button('Start').click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Someone else changed the repository at the same time. Reload and try again.',
    );
  });
});

describe('TimerCard, running', () => {
  it('shows who it runs for and the elapsed time, refreshed every 30 s and cleared on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T10:05:00Z'));
    show(ready(load(true)));
    expect(host.textContent).toContain('Running for acme-gmbh · 1:05');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(host.textContent).toContain('Running for acme-gmbh · 1:06');
    act(() => render(null, host));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Stop… opens the log-time form prefilled from the timer', () => {
    show(ready(load(true)));
    act(() => button('Stop…').click());
    expect(router.route).toHaveBeenCalledWith('/business/time/new?from=timer');
  });

  it('asks before cancelling and deletes only the timer file', async () => {
    const data = load(true);
    writeAgainst(data);
    show(ready(data));
    act(() => button('Cancel').click());
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Discard this timer');
    act(() => button('Keep running').click());
    expect(button('Cancel')).toBeDefined();
    act(() => button('Cancel').click());
    act(() => button('Yes, cancel timer').click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect((built as { value: { changes: unknown } }).value.changes).toEqual({ [TIMER]: null });
  });

  it('ignores a second confirm while the first write runs', async () => {
    const data = load(true);
    writeAgainst(data);
    show(ready(data));
    act(() => button('Cancel').click());
    act(() => {
      button('Yes, cancel timer').click();
      button('Yes, cancel timer').click();
    });
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
  });
});
