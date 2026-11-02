import type { BusinessRepo, Contract, TimeEntry } from '@kaihuman/formats/business';
import { loadBusinessRepo } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture.test-helper.js';
import {
  businessDashboard,
  clientOverview,
  clientSummaries,
  hoursSummary,
  invoiceRows,
  offerRows,
} from './overview.js';

const repo = loadBusinessRepo(loadFixtureRepo());

const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error('fixture is missing a record');
  return value;
};
const fixtureInvoice = () => must(repo.issued.find((i) => i.doc.kind === 'invoice'));

const withTime = (r: BusinessRepo, entries: { date: string; minutes: number }[]): BusinessRepo => ({
  ...r,
  time: entries.map(
    (e, i): TimeEntry => ({
      id: `01M581YW00W16BGNTZ49EKRX2${i}` as TimeEntry['id'],
      client: 'acme-gmbh' as TimeEntry['client'],
      note: 'x',
      ...e,
    }),
  ),
});

describe('fixture sanity', () => {
  it('loads without findings', () => {
    expect(repo.findings.filter((f) => f.level === 'error')).toEqual([]);
  });
});

describe('invoiceRows / offerRows', () => {
  it('describes the fixture invoice', () => {
    const rows = invoiceRows(repo, '2026-10-27');
    expect(rows[0]).toMatchObject({
      number: 'RE-2026-0001',
      kind: 'invoice',
      client: 'acme-gmbh',
      issueDate: '2026-10-26',
      dueDate: '2026-11-09',
      gross: 100138,
      currency: 'EUR',
      pdf: false,
      link: 'active',
    });
  });

  it('classifies the latest link', () => {
    expect(invoiceRows(repo, '2026-12-01')[0]?.link).toBe('expired');
    const revoked = {
      ...repo,
      links: [
        ...repo.links,
        {
          ...must(repo.links[0]),
          id: must(repo.links[0]).id,
          created: '2026-10-27T00:00:00Z',
          revoked: '2026-10-28T00:00:00Z',
        },
      ],
    };
    expect(invoiceRows(revoked, '2026-10-29')[0]?.link).toBe('revoked');
    expect(invoiceRows({ ...repo, links: [] }, '2026-10-29')[0]?.link).toBeNull();
  });

  it('marks a pdf present in the tree', () => {
    const withPdf = loadBusinessRepo(loadFixtureRepo(), [
      '.kh/business/invoices/2026/RE-2026-0001.pdf',
    ]);
    expect(invoiceRows(withPdf, '2026-10-27')[0]?.pdf).toBe(true);
  });

  it('derives offer status from the date', () => {
    expect(offerRows(repo, '2026-10-27')[0]).toMatchObject({
      number: 'AN-2026-001',
      validUntil: '2026-10-15',
      status: 'expired',
    });
  });
});

describe('businessDashboard', () => {
  it('has no receivables once paid', () => {
    expect(businessDashboard(repo, '2026-11-10').receivables).toEqual([]);
  });

  it('counts open and overdue amounts; the due day is not overdue', () => {
    const unpaid = { ...repo, payments: [] };
    expect(businessDashboard(unpaid, '2026-11-10')).toMatchObject({
      openTotal: 100138,
      overdueTotal: 100138,
    });
    expect(businessDashboard(unpaid, '2026-11-09').overdueTotal).toBe(0);
    expect(businessDashboard(unpaid, '2026-11-09').receivables).toHaveLength(1);
  });

  it('sums VAT of the month and quarter, minus credit notes', () => {
    expect(businessDashboard(repo, '2026-10-27').vat).toEqual({
      month: { period: '2026-10', due: 15888 },
      quarter: { period: '2026-Q4', due: 15888 },
    });
    expect(businessDashboard(repo, '2026-11-02').vat).toEqual({
      month: { period: '2026-11', due: 0 },
      quarter: { period: '2026-Q4', due: 15888 },
    });
    const inv = fixtureInvoice();
    const credit = {
      path: 'x',
      doc: {
        ...inv.doc,
        kind: 'credit-note' as const,
        number: 'GS-2026-0001',
        corrects: inv.doc.number,
        issue_date: '2026-10-28',
        totals: {
          ...inv.doc.totals,
          breakdown: inv.doc.totals.breakdown.map((b) => ({ ...b, tax: 1000 })),
        },
      },
    };
    const credited = { ...repo, issued: [...repo.issued, credit] };
    expect(businessDashboard(credited, '2026-10-29').vat.month.due).toBe(
      15888 - 1000 * inv.doc.totals.breakdown.length,
    );
  });

  it('lists unbilled minutes per client', () => {
    const r = withTime(repo, [{ date: '2026-10-12', minutes: 90 }]);
    expect(businessDashboard(r, '2026-10-27').unbilled).toEqual([
      { client: 'acme-gmbh', minutes: 90 },
    ]);
    expect(businessDashboard(repo, '2026-10-27').unbilled).toEqual([]);
  });

  it('lists contracts whose notice date falls in the next 60 days', () => {
    const contract: Contract = {
      ...must(repo.contracts[0]),
      end: '2026-12-31',
      notice_period_days: 30,
    };
    const r = { ...repo, contracts: [contract] };
    expect(businessDashboard(r, '2026-10-27').contractsDue).toEqual([
      { contract, date: '2026-12-01', what: 'notice' },
    ]);
    expect(businessDashboard(r, '2026-09-01').contractsDue).toEqual([]);
    expect(businessDashboard(r, '2026-12-02').contractsDue).toEqual([
      { contract, date: '2026-12-31', what: 'end' },
    ]);
    // With a renewal date the notice counts back from it: 2026-10-16, already past.
    const renewing = { ...repo, contracts: [{ ...contract, renewal_date: '2026-11-15' }] };
    expect(businessDashboard(renewing, '2026-10-27').contractsDue.map((c) => c.what)).toEqual([
      'renewal',
    ]);
  });

  it('groups clients by stage and passes drafts and currency', () => {
    const d = businessDashboard(repo, '2026-10-27');
    expect(d.pipeline.active.map((c) => c.slug)).toEqual(['acme-gmbh']);
    expect(d.pipeline.lead).toEqual([]);
    expect(d.drafts).toEqual(repo.drafts);
    expect(d.currency).toBe('EUR');
    expect(businessDashboard({ ...repo, profile: null }, '2026-10-27').currency).toBe('EUR');
  });

  it('treats an invoice due on the last day of last month as overdue on the 1st', () => {
    const inv = fixtureInvoice();
    const r = {
      ...repo,
      payments: [],
      issued: [{ ...inv, doc: { ...inv.doc, due_date: '2026-10-31' } }],
    };
    expect(businessDashboard(r, '2026-11-01').overdueTotal).toBe(100138);
    expect(businessDashboard(r, '2026-10-31').overdueTotal).toBe(0);
  });
});

describe('clientSummaries', () => {
  it('counts minutes of this month in local-date terms', () => {
    const r = withTime(repo, [
      { date: '2026-10-31', minutes: 60 },
      { date: '2026-11-01', minutes: 30 },
    ]);
    const s = clientSummaries(r, '2026-11-01');
    expect(s[0]).toMatchObject({ minutesThisMonth: 30, unbilledMinutes: 90 });
  });

  it('sums billed this year and open', () => {
    expect(clientSummaries({ ...repo, payments: [] }, '2026-10-27')[0]).toMatchObject({
      slug: 'acme-gmbh',
      name: 'Acme GmbH',
      stage: 'active',
      billedThisYear: 100138,
      open: 100138,
      currency: 'EUR',
    });
    expect(clientSummaries(repo, '2027-01-02')[0]).toMatchObject({ billedThisYear: 0, open: 0 });
  });

  it('sorts by name', () => {
    const second = { ...must(repo.clients[0]), slug: 'aaa' as never, name: 'Aaa' };
    expect(
      clientSummaries({ ...repo, clients: [...repo.clients, second] }, '2026-10-27').map(
        (s) => s.name,
      ),
    ).toEqual(['Aaa', 'Acme GmbH']);
  });
});

describe('clientOverview', () => {
  it('is null for an unknown client', () => {
    expect(clientOverview(repo, 'nope', '2026-10-27')).toBeNull();
  });

  it('builds a newest-first timeline including log lines', () => {
    const o = clientOverview(
      repo,
      'acme-gmbh',
      '2026-10-27',
      '- 2026-10-20 10:00:00 Kickoff call #business\n',
    );
    const dates = (o?.timeline ?? []).map((t) => t.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(o?.timeline.some((t) => t.kind === 'log' && t.title.includes('Kickoff'))).toBe(true);
    for (const kind of ['offer', 'invoice', 'payment', 'event', 'contract'] as const) {
      expect(o?.timeline.some((t) => t.kind === kind)).toBe(true);
    }
    expect(o?.invoices[0]).toMatchObject({ number: 'RE-2026-0001', pdf: false });
    expect(o?.offers[0]?.number).toBe('AN-2026-001');
  });

  it('adds future renewal, notice and end dates to the timeline', () => {
    const contract: Contract = {
      ...must(repo.contracts[0]),
      end: '2026-12-31',
      notice_period_days: 30,
      renewal_date: '2026-11-15',
    };
    const o = clientOverview({ ...repo, contracts: [contract] }, 'acme-gmbh', '2026-10-27');
    expect(
      o?.timeline
        .filter((t) => ['Renewal due', 'Notice deadline', 'Contract ends'].includes(t.title))
        .map((t) => [t.date, t.title]),
    ).toEqual([
      ['2026-12-31', 'Contract ends'],
      ['2026-11-15', 'Renewal due'],
    ]);
    const past = clientOverview({ ...repo, contracts: [contract] }, 'acme-gmbh', '2027-02-01');
    expect(past?.timeline.some((t) => t.title === 'Renewal due')).toBe(false);
  });

  it('caps the timeline at 100 items', () => {
    const log = Array.from(
      { length: 150 },
      (_, i) => `- 2026-09-${String((i % 28) + 1).padStart(2, '0')} 10:00:00 Entry ${i}`,
    ).join('\n');
    expect(clientOverview(repo, 'acme-gmbh', '2026-10-27', log)?.timeline).toHaveLength(100);
  });

  it('totals time per project and per ISO week', () => {
    const r = {
      ...withTime(repo, [
        { date: '2026-10-12', minutes: 60 },
        { date: '2026-10-13', minutes: 30 },
        { date: '2026-10-20', minutes: 15 },
      ]),
    };
    r.time[0] = { ...must(r.time[0]), project: 'website' as never };
    r.time[1] = { ...must(r.time[1]), project: 'website' as never };
    const o = clientOverview(r, 'acme-gmbh', '2026-10-27');
    expect(o?.projects[0]).toMatchObject({ minutesUsed: 90, amountBilled: 100138 });
    expect(o?.timeByWeek).toEqual([
      { week: '2026-W42', project: 'website', minutes: 90 },
      { week: '2026-W43', project: null, minutes: 15 },
    ]);
  });

  it('lists the client files by kind', () => {
    const r = {
      ...repo,
      clientFiles: [
        {
          client: 'acme-gmbh' as never,
          kind: 'notes' as const,
          path: '.kh/business/clients/acme-gmbh/notes.md',
        },
      ],
    };
    expect(clientOverview(r, 'acme-gmbh', '2026-10-27')?.files).toEqual({
      notes: '.kh/business/clients/acme-gmbh/notes.md',
    });
  });
});

describe('hoursSummary', () => {
  // 2026-11-02 is a Monday.
  const r = withTime(repo, [
    { date: '2026-11-01', minutes: 600 }, // Sunday before: previous week
    { date: '2026-11-02', minutes: 60 },
    { date: '2026-11-04', minutes: 30 },
    { date: '2026-11-05', minutes: 15 }, // after today: ignored
  ]);

  it('counts today and the Monday-based week', () => {
    expect(hoursSummary(r, '2026-11-04')).toEqual({ todayMinutes: 30, weekMinutes: 90 });
  });

  it('starts the week on Monday itself and leaves out the Sunday before', () => {
    expect(hoursSummary(r, '2026-11-02')).toEqual({ todayMinutes: 60, weekMinutes: 60 });
  });

  it('counts a Sunday in the week that began the Monday before', () => {
    expect(hoursSummary(r, '2026-11-08')).toEqual({ todayMinutes: 0, weekMinutes: 105 });
  });
});
