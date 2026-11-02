import { type BusinessRepo, loadBusinessRepo } from '@kaihuman/formats/business';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from '../lib/business/fixture.test-helper';
import type { BusinessState } from '../lib/business/use-business-repo';

const hooks = vi.hoisted(() => ({
  state: { status: 'loading' } as unknown,
  backlinks: {} as Record<string, string> | null,
  enabled: [] as boolean[],
}));
vi.mock('../lib/business/use-business-repo', () => ({
  useBusinessRepo: () => hooks.state,
  useBacklinkContents: (enabled: boolean) => {
    hooks.enabled.push(enabled);
    return hooks.backlinks;
  },
}));
vi.mock('../lib/business/dates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/business/dates')>()),
  todayLocal: () => '2026-11-10',
}));
vi.mock('@kaihuman/ui', () => ({ StatusBar: () => <div data-testid="status-bar" /> }));
vi.mock('preact-router', () => ({ route: vi.fn() }));
// Stands in for the share buttons so the tests can read what the page hands them.
vi.mock('../components/business/ShareActions', () => ({
  ShareActions: (props: object) => <span data-share={JSON.stringify(props)} />,
}));

const { ClientPage } = await import('./ClientPage');

const repo = { full_name: 'me/biz' } as never;
const dir = '.kh/business/clients/acme-gmbh/';
const ready = (data: BusinessRepo, contents: Record<string, string> = {}): BusinessState => ({
  status: 'ready',
  repo,
  data,
  contents,
  loadErrors: [],
});
const load = (edit?: (m: Map<string, string>) => void) => {
  const m = loadFixtureRepo();
  edit?.(m);
  return loadBusinessRepo(m);
};

let host: HTMLDivElement;
const show = (state: BusinessState, slug = 'acme-gmbh') => {
  hooks.state = state;
  act(() => render(<ClientPage slug={slug} />, host));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  hooks.backlinks = {};
  hooks.enabled = [];
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const buttons = () => [...host.querySelectorAll('button')].map((b) => b.textContent);
const unpaid = (m: Map<string, string>) => m.delete('.kh/business/payments/2026.jsonl');
/** Adds RE-2026-0002, a credit note for the whole of RE-2026-0001. */
const fullyCredited = (m: Map<string, string>) => {
  const invoice = m.get('.kh/business/invoices/2026/RE-2026-0001.yaml') ?? '';
  m.set(
    '.kh/business/invoices/2026/RE-2026-0002.yaml',
    invoice
      .replaceAll('RE-2026-0001', 'RE-2026-0002')
      .replace(/^draft_id: .*$/m, 'draft_id: 01M50ARQ007CHPV05AFMSY38DK')
      .replace('type_code: 380', 'type_code: 381')
      .replace(/^due_date: .*\n/m, '')
      .replace('kind: invoice', 'kind: credit-note\ncorrects: RE-2026-0001'),
  );
};

describe('ClientPage actions', () => {
  it('offers Accepted, Declined and Convert to invoice for an undecided offer, and no payment link for a paid invoice', () => {
    show(ready(load()));
    expect(buttons()).toEqual(
      expect.arrayContaining(['Accepted', 'Declined', 'Convert to invoice']),
    );
    expect(host.querySelector('a[href^="/business/payments/new"]')).toBeNull();
  });

  it('links a new offer always, and an invoice from unbilled time only when there is some', () => {
    const hrefs = () => [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    show(ready(load()));
    expect(hrefs()).toContain('/business/drafts/new?client=acme-gmbh&kind=offer');
    expect(hrefs()).not.toContain(
      '/business/drafts/new?client=acme-gmbh&kind=invoice&from=unbilled',
    );
    show(
      ready(
        load((m) =>
          m.set(
            '.kh/business/time/2026-11.jsonl',
            '{"id":"01M5AMBK0038DJQW16BGNTZ4A1","date":"2026-11-03","minutes":90,"client":"acme-gmbh","note":"a"}\n',
          ),
        ),
      ),
    );
    expect(hrefs()).toContain('/business/drafts/new?client=acme-gmbh&kind=invoice&from=unbilled');
  });

  it('hides the unbilled-time link when all unbilled time is already in a draft', () => {
    const entry =
      '{"id":"01M5AMBK0038DJQW16BGNTZ4A1","date":"2026-11-03","minutes":90,"client":"acme-gmbh","note":"a"}\n';
    const draft = (ids: string) =>
      `id: 01M5AMBK0038DJQW16BGNTZ4B1\nkind: invoice\nclient: acme-gmbh\nlines:\n  - description: x\n    quantity: "1"\n    unit: C62\n    unit_price: 100\n    vat_category: S\n    vat_rate: "19"\ntime_entries:\n  - ${ids}\n`;
    const hrefs = () => [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    const link = '/business/drafts/new?client=acme-gmbh&kind=invoice&from=unbilled';
    const withDraft = (ids: string) =>
      ready(
        load((m) => {
          m.set('.kh/business/time/2026-11.jsonl', entry);
          m.set('.kh/business/drafts/01M5AMBK0038DJQW16BGNTZ4B1.yaml', draft(ids));
        }),
      );
    show(withDraft('01M5AMBK0038DJQW16BGNTZ4A1'));
    expect(hrefs()).not.toContain(link);
    show(withDraft('01M581YW00W16BGNTZ49EKRX27'));
    expect(hrefs()).toContain(link);
  });

  it('links a new invoice from a retainer', () => {
    const key = `${dir}projects/website.yaml`;
    const retainer =
      'retainer:\n  amount: 120000\n  interval: monthly\n  next_date: "2026-12-01"\n  description: Hosting\n';
    show(ready(load((m) => m.set(key, `${m.get(key) ?? ''}${retainer}`))));
    const hrefs = [...host.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(
      '/business/drafts/new?client=acme-gmbh&kind=invoice&from=retainer&project=website',
    );
  });

  it('links Record payment for an open invoice', () => {
    show(ready(load(unpaid)));
    expect(
      host.querySelector('a[href="/business/payments/new?invoice=RE-2026-0001"]')?.textContent,
    ).toBe('Record payment');
  });

  const event = (type: string) =>
    `{"id":"01M5D6RA00AFMSY38DJQW16BGN","at":"2026-10-30T09:30:00Z","doc":"AN-2026-001","type":"${type}"}\n`;

  it('leaves only Convert to invoice for an accepted offer', () => {
    show(ready(load((m) => m.set('.kh/business/events.jsonl', event('accepted')))));
    expect(buttons()).toContain('Convert to invoice');
    expect(buttons()).not.toContain('Accepted');
    expect(buttons()).not.toContain('Declined');
  });

  it('offers Credit note… for an invoice, and none once it is fully credited', () => {
    show(ready(load()));
    expect(buttons()).toContain('Credit note…');
    show(ready(load(fullyCredited)));
    expect(buttons()).not.toContain('Credit note…');
  });

  it('hides Convert to invoice once an invoice was issued from the offer', () => {
    const invoiced = (m: Map<string, string>) => {
      const path = '.kh/business/invoices/2026/RE-2026-0001.yaml';
      m.set(path, `${m.get(path) ?? ''}from_offer: AN-2026-001\n`);
    };
    show(ready(load(invoiced)));
    expect(buttons()).not.toContain('Convert to invoice');
    const acceptedAndInvoiced = (m: Map<string, string>) => {
      invoiced(m);
      m.set('.kh/business/events.jsonl', event('accepted'));
    };
    show(ready(load(acceptedAndInvoiced)));
    expect(buttons()).not.toContain('Convert to invoice');
  });

  it('shows no offer buttons for a declined offer', () => {
    show(ready(load((m) => m.set('.kh/business/events.jsonl', event('declined')))));
    expect(buttons()).not.toContain('Convert to invoice');
    expect(buttons()).not.toContain('Accepted');
  });
});

describe('ClientPage', () => {
  it('says so and links back for an unknown client, without fetching backlinks', () => {
    show(ready(load()), 'nope');
    expect(host.textContent).toContain('No client nope');
    expect(host.querySelector('code')?.textContent).toBe('nope');
    expect(host.querySelector('a[href="/clients"]')?.textContent).toBe('Back to clients');
    expect(hooks.enabled.every((e) => e === false)).toBe(true);
  });

  it('offers to enable business when it is not set up', () => {
    show({ status: 'disabled', repo });
    expect(host.textContent).toContain('Enable business');
  });

  it('renders header, timeline, documents and fetches backlinks', () => {
    show(ready(load()));
    for (const text of ['Acme GmbH', 'RE-2026-0001', 'AN-2026-001', 'PDF missing', 'Timeline']) {
      expect(host.textContent).toContain(text);
    }
    expect(host.textContent).toContain('1001.38 EUR');
    expect(hooks.enabled.at(-1)).toBe(true);
  });

  it('links the first contact by mail', () => {
    show(ready(load()));
    expect(host.querySelector('header a[href="mailto:erika@acme.example"]')).not.toBeNull();
  });

  it('shows the first 20 timeline entries, then all', () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `- 2026-10-${String((i % 28) + 1).padStart(2, '0')} 10:00:00 entry-${i}`,
    ).join('\n');
    const logPath = `${dir}log.actionlog.md`;
    const content = `# Log\n\n${lines}\n`;
    show(
      ready(
        load((m) => m.set(logPath, content)),
        { [logPath]: content },
      ),
    );
    const items = () => host.querySelectorAll('[data-testid="timeline"] li').length;
    expect(items()).toBe(20);
    const button = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Show all'),
    ) as HTMLButtonElement;
    // 30 log entries plus the fixture's offer, invoice, payment, event and contract items.
    const total = Number(/\((\d+)\)/.exec(button.textContent ?? '')?.[1]);
    expect(total).toBeGreaterThan(30);
    act(() => button.click());
    expect(items()).toBe(total);
    expect(host.textContent).not.toContain('Show all');
  });

  it('shows budget used in hours, falling back to billed amount', () => {
    show(ready(load()));
    expect(host.textContent).toContain('7.5 of 100.0 h');
    const key = `${dir}projects/website.yaml`;
    show(
      ready(
        load((m) =>
          m.set(key, (m.get(key) ?? '').replace('budget_minutes: 6000', 'budget_amount: 500000')),
        ),
      ),
    );
    expect(host.textContent).toContain('1001.38 EUR of 5000.00 EUR');
  });

  it('summarises a retainer', () => {
    const key = `${dir}projects/website.yaml`;
    const retainer =
      'retainer:\n  amount: 120000\n  interval: monthly\n  next_date: "2026-12-01"\n  description: Hosting\n';
    show(ready(load((m) => m.set(key, `${m.get(key) ?? ''}${retainer}`))));
    expect(host.textContent).toContain('1200.00 EUR monthly, next 2026-12-01');
  });

  it('shows the last 8 ISO weeks only', () => {
    // today 2026-11-10 is in W46; W39 is the 8th week, W38 is older.
    const entry = (id: string, date: string, note: string) =>
      `{"id":"${id}","date":"${date}","minutes":60,"client":"acme-gmbh","project":"website","note":"${note}"}`;
    const key = '.kh/business/time/2026-10.jsonl';
    const data = load((m) =>
      m.set(
        key,
        `${m.get(key)?.trimEnd()}\n${entry('01M581YW00W16BGNTZ49EKRX28', '2026-09-22', 'a')}\n${entry('01M581YW00W16BGNTZ49EKRX29', '2026-09-14', 'b')}\n`,
      ),
    );
    show(ready(data));
    const text = host.textContent ?? '';
    expect(text).toContain('2026-W39');
    expect(text).not.toContain('2026-W38');
    expect(text).toContain('2026-W42');
  });

  it('links the phone with non-digits stripped and a leading plus kept', () => {
    const key = `${dir}client.yaml`;
    const data = load((m) =>
      m.set(
        key,
        (m.get(key) ?? '').replace(
          'email: erika@acme.example',
          'email: erika@acme.example\n    phone: "+49 (89) 123-456"',
        ),
      ),
    );
    show(ready(data));
    expect(host.querySelector('header a[href="tel:+4989123456"]')).not.toBeNull();
  });

  it('renders todos read-only and the action log', () => {
    const todos = `${dir}todos.todos.md`;
    const log = `${dir}log.actionlog.md`;
    const todoText = '- [x] Ship it\n- [ ] Call back\n';
    const logText = '# Log\n\n- 2026-10-02 09:00:00 Kickoff call\n';
    const data = load((m) => {
      m.set(todos, todoText);
      m.set(log, logText);
    });
    show(ready(data, { [todos]: todoText, [log]: logText }));
    expect(host.textContent).toContain('Ship it');
    expect(host.textContent).toContain('Call back');
    expect(host.textContent).toContain('Kickoff call');
    const boxes = [...host.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes.length).toBe(2);
    expect(boxes.every((b) => b.disabled)).toBe(true);
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    expect(boxes[0]?.getAttribute('aria-label')).toContain('Ship it');
  });

  it('shows notes and linked wiki pages', () => {
    const notes = `${dir}notes.md`;
    const data = load((m) => m.set(notes, 'Prefers email.'));
    hooks.backlinks = {
      '.kh/wiki/a.md': 'see [[client:acme-gmbh]]',
      '.kh/wiki/b.md': 'nothing',
    };
    show(ready(data, { [notes]: 'Prefers email.' }));
    expect(host.textContent).toContain('Prefers email.');
    expect(host.textContent).toContain('.kh/wiki/a.md');
    expect(host.textContent).not.toContain('.kh/wiki/b.md');
    expect(host.querySelector('a[href="/wiki"]')).not.toBeNull();
  });

  it('shows load errors of this client and the profile, not of others', () => {
    show({
      ...ready(load()),
      loadErrors: [
        `${dir}projects/p.yaml: offline`,
        '.kh/business/business.yaml: rate limited',
        '.kh/business/clients/other/client.yaml: offline',
      ],
    } as BusinessState);
    expect(host.textContent).toContain('2 files have problems');
    expect(host.textContent).toContain(`${dir}projects/p.yaml: offline`);
    expect(host.textContent).toContain('.kh/business/business.yaml: rate limited');
    expect(host.textContent).not.toContain('clients/other');
    expect(host.textContent).not.toContain('could not be loaded');
  });

  it('counts a file with a finding and a load error once', () => {
    const data = load((m) => m.set(`${dir}projects/broken.yaml`, 'name: [unclosed'));
    show({ ...ready(data), loadErrors: [`${dir}projects/broken.yaml: offline`] } as BusinessState);
    expect(host.textContent).toContain('1 file has problems');
  });

  it('says it is looking for links while backlinks load, then shows the result', () => {
    hooks.backlinks = null as never;
    show(ready(load()));
    expect(host.textContent).toContain('Looking for links');
    expect(host.textContent).not.toContain('No wiki or idea page links here.');
    hooks.backlinks = {};
    show(ready(load()));
    expect(host.textContent).not.toContain('Looking for links');
    expect(host.textContent).toContain('No wiki or idea page links here.');
  });

  it("lists only this client's problems", () => {
    const data = load((m) => {
      m.set('.kh/business/clients/other/client.yaml', 'name: [unclosed');
      m.set(`${dir}projects/broken.yaml`, 'name: [unclosed');
    });
    show(ready(data));
    expect(host.textContent).toContain('1 file has problems');
    expect(host.textContent).toContain('projects/broken.yaml');
    expect(host.textContent).not.toContain('clients/other');
  });
});

describe('ClientPage share wiring', () => {
  const LINKS = '.kh/business/links.jsonl';
  const shareOf = (number: string) => {
    const el = [...host.querySelectorAll<HTMLElement>('[data-share]')].find(
      (e) => JSON.parse(e.dataset.share ?? '{}').doc.number === number,
    );
    return JSON.parse(el?.dataset.share ?? 'null') as {
      doc: { number: string; path: string; pdf: boolean; expires?: string };
      link: { id: string } | null;
    } | null;
  };

  it('passes the active link, and none once it expired (so Share… shows)', () => {
    show(ready(load()));
    expect(shareOf('RE-2026-0001')?.link?.id).toBe('01M5FS5100HPV05AFMSY38DJQW');
    expect(shareOf('RE-2026-0001')?.doc).toEqual({
      number: 'RE-2026-0001',
      path: '.kh/business/invoices/2026/RE-2026-0001.yaml',
      pdf: false,
    });
    show(
      ready(
        load((m) =>
          m.set(
            LINKS,
            (m.get(LINKS) ?? '').replace('2026-11-26T09:31:00Z', '2026-11-01T09:31:00Z'),
          ),
        ),
      ),
    );
    expect(shareOf('RE-2026-0001')?.link).toBeNull();
  });

  it("passes an offer's future valid_until as expiry, and none when it is past", () => {
    const OFFER = '.kh/business/offers/2026/AN-2026-001.yaml';
    show(ready(load()));
    expect(shareOf('AN-2026-001')?.doc.expires).toBeUndefined();
    show(
      ready(
        load((m) => {
          m.set(
            OFFER,
            (m.get(OFFER) ?? '').replace('valid_until: "2026-10-15"', 'valid_until: "2026-12-01"'),
          );
          m.set('.kh/business/offers/2026/AN-2026-001.pdf', '');
        }),
      ),
    );
    expect(shareOf('AN-2026-001')?.doc).toMatchObject({ expires: '2026-12-01', pdf: true });
  });
});
