import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as unknown }));
vi.mock('../lib/business/use-business-repo', () => ({ useBusinessRepo: () => hooks.state }));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));

const { BusinessPage } = await import('./BusinessPage');

const repo = { full_name: 'me/biz' } as never;
const files = (edit?: (m: Map<string, string>) => void) => {
  const m = loadFixtureRepo();
  edit?.(m);
  return m;
};
const ready = (data: BusinessRepo): BusinessState => ({
  status: 'ready',
  repo,
  data,
  contents: {},
  loadErrors: [],
});
const unpaid = () => files((m) => m.delete('.kh/business/payments/2026.jsonl'));

let host: HTMLDivElement;
const show = (state: BusinessState) => {
  hooks.state = state;
  act(() => render(<BusinessPage />, host));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('BusinessPage', () => {
  it('asks for a repository, shows loading and errors', () => {
    show({ status: 'no-repo' });
    expect(host.textContent).toContain('Select a repository');
    show({ status: 'loading' });
    expect(host.textContent).toContain('Loading');
    show({ status: 'error', message: 'boom' });
    expect(host.textContent).toContain('boom');
  });

  it('warns above the content when the repository is public, still rendering it', () => {
    const data = loadBusinessRepo(unpaid());
    show({ ...ready(data), repo: { full_name: 'me/biz', private: false } } as never);
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('This repository is public');
    expect(host.textContent).toContain('RE-2026-0001');
    show({ ...ready(data), repo: { full_name: 'me/biz', private: true } } as never);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('offers to enable business when it is not set up', () => {
    show({ status: 'disabled', repo });
    expect(host.textContent).toContain('Enable business');
    expect(host.querySelector('a[href="/business/enable"]')).not.toBeNull();
  });

  it('shows receivables, stats and links for an unpaid invoice', () => {
    show(ready(loadBusinessRepo(unpaid())));
    expect(host.textContent).toContain('RE-2026-0001');
    expect(host.textContent).toContain('1001.38 EUR');
    expect(host.textContent).toContain('overdue');
    expect(host.querySelector('a[href="/clients/acme-gmbh"]')).not.toBeNull();
    expect(host.textContent).toContain('Who owes me');
    expect(host.textContent).toContain('Pipeline');
    expect(host.querySelector('a[href="/business/pipeline"]')?.textContent).toBe('Open board');
    expect(host.textContent).not.toContain('files have problems');
  });

  it('shows muted notes for empty sections', () => {
    show(
      ready(
        loadBusinessRepo(
          files((m) => m.delete('.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml')),
        ),
      ),
    );
    expect(host.textContent).toContain('No drafts waiting to be issued.');
  });

  it('lists a broken file and still renders the rest', () => {
    const data = loadBusinessRepo(
      files((m) => m.set('.kh/business/clients/bad/client.yaml', 'name: [unclosed')),
    );
    show(ready(data));
    expect(host.textContent).toContain('1 file has problems');
    expect(host.textContent).toContain('clients/bad/client.yaml');
    expect(host.textContent).toContain('Acme GmbH');
  });

  it('links drafts to the editor and offers a new draft, even with no drafts', () => {
    show(ready(loadBusinessRepo(files())));
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27');
    expect(hrefs).toContain('/business/drafts/new');
    show(
      ready(
        loadBusinessRepo(
          files((m) => m.delete('.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml')),
        ),
      ),
    );
    expect(host.textContent).toContain('No drafts waiting');
    expect(host.textContent).toContain('New draft');
  });

  it('links to the expenses page', () => {
    show(ready(loadBusinessRepo(unpaid())));
    const link = host.querySelector('a[href="/business/expenses"]');
    expect(link?.textContent).toBe('Expenses');
  });

  it('links Record payment on an open receivable', () => {
    show(ready(loadBusinessRepo(unpaid())));
    expect(
      host.querySelector('a[href="/business/payments/new?invoice=RE-2026-0001"]'),
    ).not.toBeNull();
  });

  it('labels the VAT stats payable with the basis, and refund when negative', () => {
    show(ready(loadBusinessRepo(unpaid())));
    expect(host.textContent).toContain('VAT payable 2026-Q4 (Soll)');
    expect(host.textContent).toContain('VAT payable 2026-11 (Soll)');
    // Fixture: output 158.88 from the invoice, input 1.90 from the October expense.
    expect(host.textContent).toContain('156.98 EUR');
    show(
      ready(
        loadBusinessRepo(
          files((m) =>
            m.set(
              '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV1.yaml',
              'id: 01M55FJ500NTZ49EKRX27CHPV1\ndate: "2026-11-05"\nsupplier: X\ndescription: y\ncategory: z\nnet: 1000\nvat: 190\ngross: 1190\nvat_rate: "19"\n',
            ),
          ),
        ),
      ),
    );
    expect(host.textContent).toContain('VAT refund 2026-11 (Soll)');
    expect(host.textContent).toContain('1.90 EUR');
    show(
      ready(
        loadBusinessRepo(
          files((m) => {
            m.set(
              '.kh/business/business.yaml',
              `${m.get('.kh/business/business.yaml') ?? ''}vat_basis: cash\n`,
            );
          }),
        ),
      ),
    );
    expect(host.textContent).toContain('(Ist)');
  });

  it('shows the not-applicable text for the small-business regime', () => {
    show(
      ready(
        loadBusinessRepo(
          files((m) => {
            const p = '.kh/business/business.yaml';
            m.set(p, (m.get(p) ?? '').replace('vat_regime: regular', 'vat_regime: small-business'));
          }),
        ),
      ),
    );
    expect(host.textContent).toContain('No VAT: small-business regime (§19 UStG).');
    expect(host.textContent).not.toContain('VAT payable');
  });

  const hosting = (m: Map<string, string>) =>
    m.set(
      '.kh/business/clients/acme-gmbh/projects/hosting.yaml',
      'client: acme-gmbh\nname: Hosting\nstatus: active\nretainer:\n  amount: 120000\n  interval: monthly\n  next_date: "2026-11-12"\n  description: Hosting\n',
    );

  it('lists retainers due with Create draft', () => {
    show(ready(loadBusinessRepo(files(hosting))));
    expect(host.textContent).toContain('Retainers due');
    expect(host.textContent).toContain('Hosting');
    expect(host.textContent).toContain('2026-11-12');
    const create = [...host.querySelectorAll('a')].find(
      (a) =>
        a.getAttribute('href') ===
        '/business/drafts/new?client=acme-gmbh&kind=invoice&from=retainer&project=hosting',
    );
    expect(create?.textContent).toBe('Create draft');
  });

  it('shows Draft ready, linking the draft, when a draft bills the period', () => {
    show(
      ready(
        loadBusinessRepo(
          files((m) => {
            hosting(m);
            m.set(
              '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX28.yaml',
              'id: 01M5KA3Q00W16BGNTZ49EKRX28\nkind: invoice\nclient: acme-gmbh\nproject: hosting\nfrom_retainer: "2026-11-12"\nlines:\n  - description: Hosting\n    quantity: "1"\n    unit: month\n    unit_price: 120000\n    vat_category: S\n    vat_rate: "19"\n',
            );
          }),
        ),
      ),
    );
    expect(host.textContent).not.toContain('Create draft');
    const ready_ = host.querySelector('a[href="/business/drafts/01M5KA3Q00W16BGNTZ49EKRX28"]');
    expect(ready_?.textContent).toContain('Draft ready');
  });

  it('shows an empty note without retainers due', () => {
    show(ready(loadBusinessRepo(files())));
    expect(host.textContent).toContain('No retainers due.');
  });

  it('shows an ending contract in the reminders', () => {
    show(
      ready(
        loadBusinessRepo(
          files((m) => {
            const p = '.kh/business/clients/acme-gmbh/contracts/01M52X5E00EKRX27CHPV05AFMS.yaml';
            m.set(p, `${m.get(p) ?? ''}end: "2026-12-15"\n`);
          }),
        ),
      ),
    );
    expect(host.textContent).toContain('Rahmenvertrag Webentwicklung');
    expect(host.textContent).toContain('ends');
    expect(host.textContent).toContain('2026-12-15');
  });
});
