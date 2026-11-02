import { demoMode } from '@kaihuman/core';
import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import { businessNotice } from '../lib/business/notice';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
const router = vi.hoisted(() => ({ route: vi.fn() }));
const today = vi.hoisted(() => ({ value: '2026-11-10' }));
const attachment = vi.hoisted(() => ({ openAttachment: vi.fn(() => Promise.resolve()) }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/write')>()),
  writeBusiness: writes.writeBusiness,
}));
vi.mock('../lib/business/receipt', () => attachment);
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => today.value,
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => router);

const { ContractFormPage } = await import('./ContractFormPage');

const ID = '01M52X5E00EKRX27CHPV05AFMS';
const DIR = '.kh/business/clients/acme-gmbh/contracts';
const YAML = `${DIR}/${ID}.yaml`;
const PDF = `${DIR}/${ID}.pdf`;
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const load = (edit: (m: Map<string, string>) => void = () => {}): BusinessRepo => {
  const m = loadFixtureRepo();
  edit(m);
  return loadBusinessRepo(m);
};
const withFile = () =>
  load((m) => m.set(YAML, `${m.get(YAML) ?? ''}file: ${ID}.pdf\nend: "2026-12-31"\n`));
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo: target,
  data,
  contents: {},
  loadErrors: [],
});

type Built = {
  ok?: boolean;
  value?: { changes: Record<string, string | Uint8Array | null>; message: string };
};
let built: Built;
const writeAgainst = (fresh: BusinessRepo) =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ repo: fresh, headSha: 'h', tree: [], read: async () => null });
    built = r;
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

let host: HTMLDivElement;
const show = (state: BusinessState, props: { slug?: string; id?: string } = {}) => {
  hooks.state = state;
  act(() => render(<ContractFormPage slug="acme-gmbh" {...props} />, host));
};
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const field = (id: string) => host.querySelector(`#${id}`) as HTMLInputElement;
const type = (id: string, value: string) =>
  act(() => {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const choose = (name: string, bytes: number | Uint8Array<ArrayBuffer>) => {
  const file = new File([typeof bytes === 'number' ? new Uint8Array(bytes) : bytes], name);
  const input = field('file');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const submit = () => host.querySelector('button[type="submit"]') as HTMLButtonElement;
const click = async () => {
  act(() => submit().click());
  await flush();
};
const buttonNamed = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;
const fillValid = () => {
  type('title', 'NDA Beta');
  type('kind', 'nda');
};

beforeEach(() => {
  vi.clearAllMocks();
  today.value = '2026-11-10';
  demoMode.value = false;
  businessNotice.value = null;
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('ContractFormPage new contract', () => {
  it('labels every field, defaults the start and offers the kinds', () => {
    show(ready(load()));
    for (const id of ['kind', 'title', 'start', 'end', 'notice', 'renewal', 'file']) {
      expect(host.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
    expect(field('start').value).toBe('2026-11-10');
    const kinds = [...host.querySelectorAll('#kind-list option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(kinds).toEqual(['contract', 'nda', 'framework', 'sla', 'other']);
  });

  it('saves the YAML and the PDF in one write, then routes to the client with a notice', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    type('notice', '14');
    choose('Scan.PDF', new Uint8Array([1, 2, 3, 255]));
    await click();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const changes = built.value?.changes ?? {};
    const keys = Object.keys(changes);
    const yamlKey = keys.find((p) => p.endsWith('.yaml')) ?? '';
    const pdfKey = keys.find((p) => p.endsWith('.pdf')) ?? '';
    expect(yamlKey).toMatch(/^\.kh\/business\/clients\/acme-gmbh\/contracts\/[0-9A-Z]{26}\.yaml$/);
    expect(changes[yamlKey]).toContain('title: NDA Beta');
    expect(changes[yamlKey]).toContain('notice_period_days: 14');
    expect(changes[yamlKey]).toMatch(/file: [0-9A-Z]{26}\.pdf/);
    expect([...(changes[pdfKey] as Uint8Array)]).toEqual([1, 2, 3, 255]);
    expect(keys).toHaveLength(2);
    expect(built.value?.message).toBe('business: contract NDA Beta for acme-gmbh');
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
    expect(businessNotice.value).toEqual({
      text: 'Saved contract NDA Beta.',
      path: '/clients/acme-gmbh',
    });
  });

  it('saves without a file as YAML only', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    await click();
    expect(Object.keys(built.value?.changes ?? {})).toHaveLength(1);
  });

  it('refuses a non-PDF on select and never writes', () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    choose('scan.png', 10);
    expect(host.textContent).toContain('Contract files must be PDF.');
    expect(field('file').value).toBe('');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('refuses an 11 MB PDF on select, announces it, and still saves without a file', async () => {
    show(ready(load()));
    writeAgainst(load());
    fillValid();
    choose('big.pdf', 11 * 1024 * 1024);
    expect(host.textContent).toContain('Contract files can be up to 10 MB.');
    expect(host.querySelector('#file-error')?.getAttribute('role')).toBe('alert');
    expect(field('file').getAttribute('aria-invalid')).toBe('true');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    await click();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    const keys = Object.keys(built.value?.changes ?? {});
    expect(keys).toHaveLength(1);
    expect(built.value?.changes[keys[0] ?? '']).not.toContain('file:');
  });

  it('clears the file error when a valid file replaces the bad one', () => {
    show(ready(load()));
    choose('a.png', 10);
    choose('ok.pdf', 10);
    expect(host.textContent).not.toContain('Contract files must be PDF.');
  });

  it('shows field errors without writing', async () => {
    show(ready(load()));
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    expect(host.querySelector('#title-error')?.textContent).toBe('Enter a title.');
  });

  it('shows a failed commit and keeps the form', async () => {
    show(ready(load()));
    writes.writeBusiness.mockRejectedValue(new Error('network'));
    fillValid();
    await click();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(field('title').value).toBe('NDA Beta');
    expect(router.route).not.toHaveBeenCalled();
  });

  it('is read-only in demo mode', async () => {
    demoMode.value = true;
    show(ready(load()));
    expect(host.textContent).toContain('Saving is not available in demo mode.');
    expect(submit().disabled).toBe(true);
    expect((field('title').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    await click();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('says so for an unknown client', () => {
    show(ready(load()), { slug: 'nobody' });
    expect(host.textContent).toContain('No client nobody.');
  });
});

describe('ContractFormPage edit', () => {
  it('says so for an unknown id', () => {
    show(ready(load()), { id: '01M52X5E00EKRX27CHPV05AFMT' });
    expect(host.textContent).toContain('No contract');
  });

  it('prefills the form', () => {
    show(ready(withFile()), { id: ID });
    expect(field('title').value).toBe('Rahmenvertrag Webentwicklung');
    expect(field('kind').value).toBe('service-agreement');
    expect(field('notice').value).toBe('30');
    expect(field('end').value).toBe('2026-12-31');
    expect(host.textContent).toContain(`Current file: ${ID}.pdf`);
  });

  it('keeps the existing file when no new file is chosen: YAML only', async () => {
    show(ready(withFile()), { id: ID });
    writeAgainst(withFile());
    type('title', 'Rahmenvertrag 2');
    await click();
    expect(built.ok).toBe(true);
    expect(Object.keys(built.value?.changes ?? {})).toEqual([YAML]);
    expect(built.value?.changes[YAML]).toContain(`file: ${ID}.pdf`);
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('replaces the file with new bytes', async () => {
    show(ready(withFile()), { id: ID });
    writeAgainst(withFile());
    choose('new.pdf', new Uint8Array([9]));
    await click();
    const changes = built.value?.changes ?? {};
    expect([...(changes[PDF] as Uint8Array)]).toEqual([9]);
    expect(changes[YAML]).toContain(`file: ${ID}.pdf`);
  });

  it('removes the file and can keep it again', async () => {
    show(ready(withFile()), { id: ID });
    writeAgainst(withFile());
    act(() => buttonNamed('Remove file').click());
    expect(buttonNamed('Remove file')).toBeUndefined();
    act(() => buttonNamed('Keep file').click());
    expect(buttonNamed('Remove file')).toBeDefined();
    act(() => buttonNamed('Remove file').click());
    await click();
    const changes = built.value?.changes ?? {};
    expect(changes[PDF]).toBeNull();
    expect(changes[YAML]).not.toContain('file:');
  });

  it('opens the stored PDF', () => {
    show(ready(withFile()), { id: ID });
    act(() => buttonNamed('Open').click());
    expect(attachment.openAttachment).toHaveBeenCalledWith(target, {
      path: PDF,
      name: `${ID}.pdf`,
    });
  });

  it('offers no file controls without a file', () => {
    show(ready(load()), { id: ID });
    expect(buttonNamed('Remove file')).toBeUndefined();
    expect(buttonNamed('Open')).toBeUndefined();
  });

  it('deletes with the retention text, removing YAML and file in one write', async () => {
    show(ready(withFile()), { id: ID });
    writeAgainst(withFile());
    act(() => buttonNamed('Delete').click());
    // Contract ends 2026-12-31; fixture jurisdiction de keeps 8 years -> 2034-12-31
    expect(host.textContent).toContain(
      'This record must be kept until 2034-12-31 (retention). Delete anyway?',
    );
    expect(document.activeElement).toBe(buttonNamed('Keep it'));
    expect(writes.writeBusiness).not.toHaveBeenCalled();
    act(() => buttonNamed('Yes, delete contract').click());
    await flush();
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(built.value?.changes).toEqual({ [YAML]: null, [PDF]: null });
    expect(built.value?.message).toBe(
      'business: delete contract Rahmenvertrag Webentwicklung for acme-gmbh',
    );
    expect(router.route).toHaveBeenCalledWith('/clients/acme-gmbh');
  });

  it('shows a plain confirm after the retention period and keeps on decline', () => {
    today.value = '2035-01-01';
    show(ready(withFile()), { id: ID });
    act(() => buttonNamed('Delete').click());
    expect(host.textContent).not.toContain('(retention)');
    expect(host.textContent).toContain('Delete this contract? This cannot be undone.');
    act(() => buttonNamed('Keep it').click());
    expect(buttonNamed('Yes, delete contract')).toBeUndefined();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });
});
