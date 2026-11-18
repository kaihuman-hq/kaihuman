import { loadBusinessRepo, type Slug } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleDocument } from '../lib/business/documents';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
const print = vi.hoisted(() => ({ printHtml: vi.fn(async () => {}) }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/print/print-frame', () => print);
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { DocumentsPage } = await import('./DocumentsPage');
const { DocumentPage } = await import('./DocumentPage');

const DOC = '.kh/business/documents/offer-acme.md';
const target = { full_name: 'me/biz', default_branch: 'main', private: true } as never;
const ready = (doc: string): BusinessState => {
  const m = new Map([...loadFixtureRepo(), [DOC, doc]]);
  return {
    status: 'ready',
    repo: target,
    data: loadBusinessRepo(m),
    contents: Object.fromEntries(m),
    loadErrors: [],
  };
};
const good = sampleDocument('acme-gmbh' as Slug, '2026-11-18');

let host: HTMLDivElement;
const flush = () => act(() => new Promise((r) => setTimeout(r, 50)));
beforeEach(() => {
  host = document.createElement('div');
  document.body.replaceChildren(host);
});

describe('DocumentsPage', () => {
  it('lists documents and offers print settings', () => {
    hooks.state = ready(good);
    act(() => render(<DocumentsPage />, host));
    const link = host.querySelector('a[href="/business/documents/offer-acme"]');
    expect(link?.textContent).toBe('offer-acme');
    expect(host.textContent).toContain('acme-gmbh');
    expect(host.querySelector('#print-letterhead')).not.toBeNull();
    expect(host.textContent).toContain('Save print settings');
  });
});

// The first render loads the narro chunk, which takes a while on a busy machine.
describe('DocumentPage', { timeout: 15000 }, () => {
  it('previews the rendered document and prints it', async () => {
    hooks.state = ready(good);
    act(() => render(<DocumentPage slug="offer-acme" />, host));
    for (let i = 0; i < 200 && !host.querySelector('iframe'); i++) await flush();
    const frame = host.querySelector('iframe');
    expect(frame?.getAttribute('title')).toBe('Preview: Angebot AN-2026-0001');
    expect(frame?.getAttribute('srcdoc')).toContain('Acme GmbH');
    const button = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Print / Save as PDF'),
    );
    act(() => button?.click());
    await flush();
    expect(print.printHtml).toHaveBeenCalledWith(expect.stringContaining('<!doctype html>'));
  });

  it('shows problems with field names instead of a preview', async () => {
    hooks.state = ready(good.replace('client: acme-gmbh', 'client: nobody'));
    act(() => render(<DocumentPage slug="offer-acme" />, host));
    for (let i = 0; i < 200 && !host.textContent?.includes('has problems'); i++) await flush();
    expect(host.querySelector('iframe')).toBeNull();
    expect(host.textContent).toContain('client: no client "nobody"');
  });
});
