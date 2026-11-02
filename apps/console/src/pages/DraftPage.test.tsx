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

const { DraftPage } = await import('./DraftPage');

const FIXTURE_DRAFT = '01M5KA3Q00W16BGNTZ49EKRX27';
const DRAFT_PATH = `.kh/business/drafts/${FIXTURE_DRAFT}.yaml`;
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const TIME =
  '{"id":"01M5AMBK0038DJQW16BGNTZ4A1","date":"2026-11-03","minutes":90,"client":"acme-gmbh","project":"website","note":"a"}\n' +
  '{"id":"01M5AMBK0038DJQW16BGNTZ4A2","date":"2026-11-04","minutes":30,"client":"acme-gmbh","project":"website","note":"b"}\n';
const load = (edit?: (m: Map<string, string>) => void): BusinessRepo => {
  const m = loadFixtureRepo();
  m.set('.kh/business/time/2026-11.jsonl', TIME);
  edit?.(m);
  return loadBusinessRepo(m);
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

type Built = { ok?: boolean; value?: { changes: Record<string, string | null>; message: string } };
let built: Built | undefined;
const writeAgainst = (fresh: BusinessRepo) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ repo: fresh, headSha: 'h', tree: [], read: async () => null });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (state: BusinessState, props: Record<string, string>) => {
  hooks.state = state;
  act(() => render(<DraftPage {...props} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;
const click = async (text: string) => {
  const b = button(text);
  if (!b) throw new Error(`no button ${text}`);
  act(() => b.click());
  await flush();
};

beforeEach(() => {
  vi.clearAllMocks();
  built = undefined;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const UNBILLED = { client: 'acme-gmbh', kind: 'invoice', from: 'unbilled' };

describe('DraftPage from unbilled time', () => {
  it('prefills the hours line and shows live totals', () => {
    show(ready(load()), UNBILLED);
    expect(field('line-0-description').value).toBe('Website relaunch');
    expect(field('line-0-quantity').value).toBe('2.00');
    expect(field('line-0-unitPrice').value).toBe('95.00');
    expect(field('service-start').value).toBe('2026-11-03');
    expect(host.querySelector('[aria-label="Totals"]')?.textContent).toContain('226.10 EUR');
    for (const id of ['line-0-description', 'line-0-quantity', 'line-0-unit', 'line-0-unitPrice']) {
      expect(host.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
  });

  it('updates the totals when a quantity changes, with a comma', () => {
    show(ready(load()), UNBILLED);
    type('line-0-quantity', '1,5');
    expect(host.querySelector('[aria-label="Totals"]')?.textContent).toContain('169.58 EUR');
  });

  it('says so when nothing is unbilled', () => {
    show(ready(load((m) => m.delete('.kh/business/time/2026-11.jsonl'))), UNBILLED);
    expect(host.textContent).toContain('no unbilled time');
    expect(button('Save draft')).toBeUndefined();
  });

  it('saves one draft file with the time entries and goes to the client', async () => {
    const data = load();
    show(ready(data), UNBILLED);
    writeAgainst(data);
    await click('Save draft');
    const [path, text] = Object.entries(built?.value?.changes ?? {})[0] ?? [];
    expect(path).toMatch(/^\.kh\/business\/drafts\/[0-9A-Z]{26}\.yaml$/);
    expect(text).toContain('time_entries:');
    expect(text).toContain('quantity: "2.00"');
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('keeps the input and shows a field error for an empty description, writing nothing', async () => {
    show(ready(load()), UNBILLED);
    type('line-0-description', '');
    type('line-0-quantity', '3');
    await click('Save draft');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Enter a description.');
    expect(field('line-0-description').getAttribute('aria-invalid')).toBe('true');
    expect(field('line-0-quantity').value).toBe('3');
  });

  it('saves first and then routes to the issue page', async () => {
    const data = load();
    show(ready(data), UNBILLED);
    writeAgainst(data);
    await click('Issue…');
    const id = Object.keys(built?.value?.changes ?? {})[0]?.match(/drafts\/(.+)\.yaml/)?.[1];
    expect(router.route).toHaveBeenCalledWith(`/business/drafts/${id}/issue`);
  });

  it('does not route to the issue page when the save fails', async () => {
    show(ready(load()), UNBILLED);
    writes.writeBusiness.mockRejectedValue(new Error('boom'));
    await click('Issue…');
    expect(router.route).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Saving failed, nothing was written');
  });
});

describe('DraftPage on an existing draft', () => {
  const props = { id: FIXTURE_DRAFT };

  it('keeps the id and time entries when saved', async () => {
    const data = load();
    show(ready(data), props);
    writeAgainst(data);
    type('notes', 'Thanks');
    await click('Save draft');
    expect(Object.keys(built?.value?.changes ?? {})).toEqual([DRAFT_PATH]);
    const text = built?.value?.changes[DRAFT_PATH] ?? '';
    expect(text).toContain(`id: ${FIXTURE_DRAFT}`);
    expect(text).toContain('01M581YW00W16BGNTZ49EKRX27');
    expect(text).toContain('notes: Thanks');
  });

  it('asks before deleting, then deletes the file', async () => {
    const data = load();
    show(ready(data), props);
    writeAgainst(data);
    await click('Delete');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Delete this draft?');
    await click('Keep it');
    expect(host.textContent).not.toContain('Delete this draft?');
    await click('Delete');
    await click('Yes, delete draft');
    expect(built?.value?.changes).toEqual({ [DRAFT_PATH]: null });
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('adds and removes line rows', () => {
    show(ready(load()), props);
    expect(host.querySelectorAll('fieldset fieldset')).toHaveLength(3);
    act(() => button('Add line')?.click());
    expect(host.querySelectorAll('fieldset fieldset')).toHaveLength(4);
    act(() => (host.querySelector('[aria-label="Remove line 4"]') as HTMLButtonElement).click());
    expect(host.querySelectorAll('fieldset fieldset')).toHaveLength(3);
  });

  it('shows Z, E, K and O disabled with the hint under de regular, and S and AE enabled', () => {
    show(ready(load()), props);
    const options = [...host.querySelectorAll('#line-0-vatCategory option')] as HTMLOptionElement[];
    expect(options.filter((o) => o.disabled).map((o) => o.value)).toEqual(['Z', 'E', 'K', 'O']);
    expect(host.textContent).toContain('needs an exemption note — not supported yet');
  });

  it('has no disabled categories on an offer', () => {
    show(ready(load()), { client: 'acme-gmbh', kind: 'offer' });
    const options = [...host.querySelectorAll('#line-0-vatCategory option')] as HTMLOptionElement[];
    expect(options.some((o) => o.disabled)).toBe(false);
    expect(field('valid-until').value).toBe('2026-12-10');
    expect(button('Delete')).toBeUndefined();
  });

  it('says so for an unknown draft', () => {
    show(ready(load()), { id: '01M5AMBK0038DJQW16BGNTZ49Z' });
    expect(host.textContent).toContain('No draft');
  });
});

describe('DraftPage new', () => {
  it('says so, with a link to add one, when there are no clients', () => {
    const data = load((m) => {
      for (const k of [...m.keys()])
        if (k.includes('/clients/') || k.includes('/drafts/')) m.delete(k);
    });
    show(ready(data), {});
    expect(host.textContent).toContain('No clients yet.');
    expect(host.querySelector('a[href="/clients/new"]')).not.toBeNull();
    expect(button('Start draft')).toBeUndefined();
  });

  it('starts new lines as E at 0 for a small-business profile', () => {
    const data = load((m) => {
      const key = '.kh/business/business.yaml';
      m.set(key, (m.get(key) ?? '').replace('vat_regime: regular', 'vat_regime: small-business'));
    });
    show(ready(data), { client: 'acme-gmbh', kind: 'invoice' });
    expect(field('line-0-vatCategory').value).toBe('E');
    expect(field('line-0-vatRate').value).toBe('0');
    act(() => button('Add line')?.click());
    expect(field('line-1-vatCategory').value).toBe('E');
    expect(field('line-1-vatRate').value).toBe('0');
  });

  it('shows a service period error under both date fields', async () => {
    show(ready(load()), { client: 'acme-gmbh', kind: 'invoice' });
    type('line-0-description', 'x');
    type('line-0-unitPrice', '1');
    type('service-start', '2026-11-05');
    type('service-end', '2026-11-01');
    await click('Save draft');
    expect(field('service-start').getAttribute('aria-describedby')).toBe('service-start-error');
    expect(field('service-end').getAttribute('aria-describedby')).toBe('service-end-error');
    expect(host.textContent).toContain('The end is before the start.');
  });

  it('lets the user pick a client first', () => {
    show(ready(load()), {});
    act(() => button('Start draft')?.click());
    expect(router.route).toHaveBeenCalledWith('/business/drafts/new?client=acme-gmbh&kind=invoice');
  });

  it('starts an empty offer and saves it with valid_until', async () => {
    const data = load();
    show(ready(data), { client: 'acme-gmbh', kind: 'offer' });
    writeAgainst(data);
    type('line-0-description', 'Workshop');
    type('line-0-unitPrice', '1.200,50');
    await click('Save draft');
    const text = Object.values(built?.value?.changes ?? {})[0] ?? '';
    expect(text).toContain('kind: offer');
    expect(text).toContain('valid_until: 2026-12-10');
    expect(text).toContain('unit_price: 120050');
  });

  it('builds a retainer draft from the project', () => {
    const data = load((m) =>
      m.set(
        '.kh/business/clients/acme-gmbh/projects/hosting.yaml',
        'client: acme-gmbh\nname: Hosting\nstatus: active\nretainer:\n  amount: 120000\n  interval: monthly\n  next_date: "2026-12-01"\n  description: Hosting Dec\n',
      ),
    );
    show(ready(data), {
      client: 'acme-gmbh',
      kind: 'invoice',
      from: 'retainer',
      project: 'hosting',
    });
    expect(field('line-0-description').value).toBe('Hosting Dec');
    expect(field('service-end').value).toBe('2026-12-31');
  });
});
