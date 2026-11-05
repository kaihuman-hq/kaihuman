import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
const router = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => router);

const { LogTimePage } = await import('./LogTimePage');

const TIMER = '.kh/business/time/running.yaml';
const NOV = '.kh/business/time/2026-11.jsonl';
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const load = (running: boolean): BusinessRepo => {
  const m = loadFixtureRepo();
  if (running) {
    m.set(
      TIMER,
      'client: acme-gmbh\nproject: website\nstarted_at: 2026-11-02T09:00:00Z\nnote: Calls\n',
    );
  }
  return loadBusinessRepo(m);
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

let built: { value?: { changes: Record<string, string | null>; message: string } } & {
  ok?: boolean;
  issues?: { message: string }[];
};
const existing =
  '{"id":"01M581YW00W16BGNTZ49EKRX28","date":"2026-11-01","minutes":30,"client":"acme-gmbh","note":"Old"}\n';
/** Runs the builder against fresh state, which differs from the page state on purpose. */
const writeAgainst = (fresh: BusinessRepo, files: Record<string, string> = {}) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({
      repo: fresh,
      headSha: 'h',
      tree: [],
      read: async (p: string) => files[p] ?? null,
    });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (state: BusinessState, props: Record<string, string> = {}) => {
  hooks.state = state;
  act(() => render(<LogTimePage {...props} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T10:30:00Z'));
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

describe('LogTimePage', () => {
  it('has labels on every field and prefills client and project from the query', () => {
    show(ready(load(false)), { client: 'acme-gmbh', project: 'website' });
    for (const id of ['client', 'project', 'date', 'hours', 'note']) {
      expect(host.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(field('client').value).toBe('acme-gmbh');
    expect(field('project').value).toBe('website');
    expect(field('date').value).toBe('2026-11-10');
  });

  it('prefills from the running timer with from=timer', () => {
    show(ready(load(true)), { from: 'timer' });
    expect(field('client').value).toBe('acme-gmbh');
    expect(field('project').value).toBe('website');
    expect(field('hours').value).toBe('1:30');
    expect(field('note').value).toBe('Calls');
    expect(host.textContent).toContain('Timer stopped');
  });

  it('shows a field error for bad hours and keeps the input, writing nothing', async () => {
    show(ready(load(false)), { client: 'acme-gmbh' });
    type('hours', 'abc');
    type('note', 'Work');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('#hours-error')?.textContent).toContain('Not a duration');
    expect(field('hours').value).toBe('abc');
    expect(field('note').value).toBe('Work');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('shows an explicit error for an empty note (a stopped timer without one) and keeps the input', async () => {
    const m = loadFixtureRepo();
    m.set(TIMER, 'client: acme-gmbh\nstarted_at: 2026-11-02T09:00:00Z\n');
    show(ready(loadBusinessRepo(m)), { from: 'timer' });
    expect(field('note').value).toBe('');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('#note-error')?.textContent).toContain('note');
    expect(field('hours').value).toBe('1:30');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('logs time for a plain entry: one write, appended to the fresh month file, routes to the client', async () => {
    const page = load(false);
    writeAgainst(page, { [NOV]: existing });
    show(ready(page), { client: 'acme-gmbh' });
    type('hours', '1,5');
    type('note', ' Docs ');
    act(() => submit().click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const changes = built.value?.changes ?? {};
    expect(Object.keys(changes)).toEqual([NOV]);
    expect(changes[NOV]?.startsWith(existing)).toBe(true);
    expect(changes[NOV]).toContain('"minutes":90');
    expect(changes[NOV]).toContain('"note":"Docs"');
    expect(changes[NOV]).toContain('"date":"2026-11-10"');
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('stop flow commits the time file and the timer delete in one write', async () => {
    const page = load(true);
    writeAgainst(page);
    show(ready(page), { from: 'timer' });
    type('hours', '1:00');
    type('note', 'Calls and mail');
    act(() => submit().click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const changes = built.value?.changes ?? {};
    expect(Object.keys(changes).sort()).toEqual([NOV, TIMER].sort());
    expect(changes[TIMER]).toBeNull();
    expect(changes[NOV]).toContain('"minutes":60');
    expect(changes[NOV]).toContain('"project":"website"');
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('writes nothing when the timer was already stopped on another device', async () => {
    writeAgainst(load(false));
    show(ready(load(true)), { from: 'timer' });
    act(() => submit().click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'The timer was already stopped elsewhere.',
    );
    expect(router.route).not.toHaveBeenCalled();
  });

  it('writes nothing when the timer was stopped and restarted on another device', async () => {
    const restarted = load(true);
    const m = loadFixtureRepo();
    m.set(TIMER, 'client: acme-gmbh\nproject: website\nstarted_at: 2026-11-02T10:00:00Z\n');
    writeAgainst(loadBusinessRepo(m));
    show(ready(restarted), { from: 'timer' });
    act(() => submit().click());
    await flush();
    expect(built.ok).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'The timer changed on another device. Reload and check.',
    );
    expect(router.route).not.toHaveBeenCalled();
  });

  it('lets the hours field take 1:30 and 90m (no numeric keypad)', () => {
    show(ready(load(false)), { client: 'acme-gmbh' });
    expect(field('hours').getAttribute('inputmode')).toBe('text');
  });

  it('lists only active projects, but keeps a prefilled finished one', () => {
    const m = loadFixtureRepo();
    const P = '.kh/business/clients/acme-gmbh/projects/';
    const website = m.get(`${P}website.yaml`) ?? '';
    m.set(
      `${P}old-site.yaml`,
      website.replace(/^status: .*$/m, 'status: done').replace(/^name: .*$/m, 'name: Old site'),
    );
    const data = loadBusinessRepo(m);
    expect(data.projects.find((p) => p.slug === 'old-site')?.status).toBe('done');
    const options = () =>
      [...host.querySelectorAll('#project option')].map((o) => (o as HTMLOptionElement).value);
    show(ready(data), { client: 'acme-gmbh' });
    expect(options()).toContain('website');
    expect(options()).not.toContain('old-site');
    act(() => render(null, host)); // the form reads its query once, on mount
    show(ready(data), { client: 'acme-gmbh', project: 'old-site' });
    expect(options()).toContain('old-site');
  });

  it('shows the write error and stays on the page with the input intact', async () => {
    writes.writeBusiness.mockRejectedValue(new Error('boom'));
    show(ready(load(false)), { client: 'acme-gmbh' });
    type('hours', '2');
    type('note', 'Work');
    act(() => submit().click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Saving failed, nothing was written: boom',
    );
    expect(field('hours').value).toBe('2');
    expect(router.route).not.toHaveBeenCalled();
    expect(submit().disabled).toBe(false);
  });

  it('ignores a second submit while the first is running', async () => {
    writeAgainst(load(false));
    show(ready(load(false)), { client: 'acme-gmbh' });
    type('hours', '2');
    type('note', 'Work');
    const form = host.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
  });
});
