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

const { OfferActions } = await import('./DocActions');

const target = { full_name: 'me/biz', default_branch: 'main' } as never;
const CLIENT = '.kh/business/clients/acme-gmbh/client.yaml';
const EVENTS = '.kh/business/events.jsonl';
const load = (stage: string): BusinessRepo => {
  const m = loadFixtureRepo();
  m.set(CLIENT, (m.get(CLIENT) ?? '').replace(/^stage: .*$/m, `stage: ${stage}`));
  return loadBusinessRepo(m);
};
let built: { ok?: boolean; value?: { changes: Record<string, string | null>; message: string } };
const writeAgainst = (fresh: BusinessRepo) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({
      repo: fresh,
      headSha: 'h',
      tree: [],
      read: async () => null,
    });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  hooks.state = {
    status: 'ready',
    repo: target,
    data: load('offer-sent'),
    contents: {},
    loadErrors: [],
  } as BusinessState;
  act(() => render(<OfferActions offer="AN-2026-001" />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('OfferActions', () => {
  it('Accepted writes the event and the stage change in one write', async () => {
    writeAgainst(load('offer-sent'));
    act(() => button('Accepted').click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(built.value?.message).toBe('business: accepted AN-2026-001');
    expect(Object.keys(built.value?.changes ?? {}).sort()).toEqual([CLIENT, EVENTS]);
  });

  it('Declined writes only the event', async () => {
    writeAgainst(load('offer-sent'));
    act(() => button('Declined').click());
    await flush();
    expect(Object.keys(built.value?.changes ?? {})).toEqual([EVENTS]);
  });

  it('Convert to invoice saves a draft with from_offer and routes to it', async () => {
    writeAgainst(load('active'));
    act(() => button('Convert to invoice').click());
    await flush();
    const [path, text] = Object.entries(built.value?.changes ?? {})[0] ?? [];
    expect(path).toMatch(/^\.kh\/business\/drafts\/[0-9A-Z]{26}\.yaml$/);
    expect(text).toContain('from_offer: AN-2026-001');
    const id = /drafts\/(.*)\.yaml/.exec(path ?? '')?.[1];
    expect(router.route).toHaveBeenCalledWith(`/business/drafts/${id}`);
  });

  it('shows the refusal and stays put when the offer was decided elsewhere', async () => {
    const m = loadFixtureRepo();
    m.set(
      EVENTS,
      '{"id":"01M5D6RA00AFMSY38DJQW16BGN","at":"2026-10-30T09:30:00Z","doc":"AN-2026-001","type":"declined"}\n',
    );
    writeAgainst(loadBusinessRepo(m));
    act(() => button('Accepted').click());
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('already declined');
    expect(router.route).not.toHaveBeenCalled();
  });
});
