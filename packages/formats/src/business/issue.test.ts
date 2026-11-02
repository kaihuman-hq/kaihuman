import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Slug, Ulid } from './ids.js';
import { type IssueContext, issue } from './issue.js';
import { jurisdictionFor } from './jurisdiction.js';
import {
  type BusinessProfile,
  type Client,
  type Draft,
  KEY_ORDER,
  type Project,
} from './records.js';
import { computeTotals } from './totals.js';
import { validateClient, validateDraft, validateIssued, validateProfile } from './validate.js';
import { parseYaml, stringifyYaml } from './yaml.js';

const load = <T>(path: string, validate: (raw: unknown) => { ok: boolean; value?: T }): T => {
  const parsed = parseYaml(loadFixtureRepo().get(path) ?? '');
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const r = validate(parsed.value);
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.value as T;
};

const root = '.kh/business';
const profile: BusinessProfile = load(`${root}/business.yaml`, validateProfile);
const client: Client = load(`${root}/clients/acme-gmbh/client.yaml`, (r) =>
  validateClient(r, 'acme-gmbh'),
);
const fixtureDraft: Draft = load(`${root}/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml`, validateDraft);
const entryId = '01M581YW00W16BGNTZ49EKRX27' as Ulid;
const draft: Draft = { ...fixtureDraft, time_entries: [entryId] };
const timeFile = '.kh/business/time/2026-12.jsonl';
const entry = `{"id":"${entryId}","date":"2026-12-12","minutes":450,"client":"acme-gmbh","note":"Work"}`;
const alreadyBilled = entry.replace('"note"', '"invoice":"RE-2026-0040","note"');
const { time_entries: _omit, ...withoutTime } = fixtureDraft;
const creditDraft: Draft = {
  ...withoutTime,
  kind: 'credit-note',
  corrects: 'RE-2026-0042',
};

const ctx: IssueContext = {
  draft,
  profile,
  client,
  existingNumbers: ['RE-2026-0041', 'RE-2026-0042'],
  issueDate: '2027-01-02',
  timeFiles: { [timeFile]: `${entry}\n` },
  clientLog: null,
  now: new Date(2027, 0, 2, 9, 5, 7),
};

const ok = (c: IssueContext) => {
  const r = issue(c);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

describe('issue invoice', () => {
  const { document, changes, commitMessage } = ok({ ...ctx, existingNumbers: ['RE-2026-0042'] });

  it('rolls the number over with the year of the issue date', () => {
    expect(document.number).toBe('RE-2027-0001');
    expect(document.retain_until).toBe('2035-12-31');
    expect(document.type_code).toBe(380);
    expect(document.due_date).toBe('2027-01-16');
    expect(document.draft_id).toBe(draft.id);
    expect(document.jurisdiction).toBe('de');
    expect(document.payment).toMatchObject({ means_code: '58', reference: 'RE-2027-0001' });
    expect(commitMessage).toBe('business: issue RE-2027-0001 for acme-gmbh');
  });

  it('copies seller and buyer', () => {
    expect(document.seller.name).toBe(profile.name);
    expect(document.buyer).toMatchObject({ name: client.name, vat_id: client.vat_id });
  });

  it('deletes the draft, writes the document, bills the time and logs the action', () => {
    expect(changes[`${root}/drafts/${draft.id}.yaml`]).toBeNull();
    expect(Object.keys(changes)).toContain(`${root}/invoices/2027/RE-2027-0001.yaml`);
    expect(changes[timeFile]).toContain('"invoice":"RE-2027-0001"');
    const log = changes[`${root}/clients/acme-gmbh/log.actionlog.md`];
    expect(log).toContain('- 2027-01-02 09:05:07 Issued RE-2027-0001 (1001.38 EUR) #business');
    expect(log?.endsWith('\n')).toBe(true);
  });

  it('appends to an existing log', () => {
    const first = ok(ctx).changes[`${root}/clients/acme-gmbh/log.actionlog.md`] as string;
    const second = ok({ ...ctx, clientLog: first, now: new Date(2027, 0, 3, 10, 0, 0) });
    const log = second.changes[`${root}/clients/acme-gmbh/log.actionlog.md`] as string;
    expect(log.match(/^- /gm)).toHaveLength(2);
  });

  it('round-trips through YAML and validation with matching totals', () => {
    const text = changes[`${root}/invoices/2027/RE-2027-0001.yaml`] as string;
    const parsed = parseYaml(text);
    expect(parsed.ok).toBe(true);
    const valid = validateIssued(parsed.ok ? parsed.value : null);
    expect(valid.ok ? [] : valid.issues).toEqual([]);
    if (!valid.ok) return;
    expect(valid.value.totals).toEqual(
      computeTotals(valid.value.lines, jurisdictionFor('de').exemptionReasons(profile)),
    );
    expect(stringifyYaml(valid.value, KEY_ORDER.issued)).toBe(text);
  });

  it('is pure: same input, same output', () => {
    expect(issue(ctx)).toEqual(issue(ctx));
  });

  it('prefers the draft payment terms over client and profile', () => {
    expect(ok({ ...ctx, draft: { ...draft, payment_terms_days: 30 } }).document.due_date).toBe(
      '2027-02-01',
    );
  });
});

describe('issue errors', () => {
  it('rejects a billed or missing time entry at its index', () => {
    expect(issue({ ...ctx, timeFiles: { [timeFile]: alreadyBilled } })).toMatchObject({
      ok: false,
      issues: [{ path: 'time_entries[0]' }],
    });
    expect(issue({ ...ctx, timeFiles: {} })).toMatchObject({
      ok: false,
      issues: [{ path: 'time_entries[0]' }],
    });
  });

  it('rejects a credit note that corrects another credit note', () => {
    const r = issue({
      ...ctx,
      draft: creditDraft,
      timeFiles: {},
      creditNoteNumbers: ['RE-2026-0042'],
    });
    expect(r).toMatchObject({ ok: false, issues: [{ path: 'corrects' }] });
    expect(
      ok({ ...ctx, draft: creditDraft, timeFiles: {}, creditNoteNumbers: ['RE-2026-0041'] })
        .document.corrects,
    ).toBe('RE-2026-0042');
  });

  it('rejects a credit note that corrects an unknown invoice', () => {
    expect(issue({ ...ctx, draft: { ...creditDraft, corrects: 'RE-2026-0099' } })).toMatchObject({
      ok: false,
      issues: [{ path: 'corrects' }],
    });
  });

  it('returns draft validation and jurisdiction issues together', () => {
    const r = issue({
      ...ctx,
      draft: { ...draft, lines: [] },
      profile: { ...profile, vat_id: undefined } as BusinessProfile,
    });
    expect(r.ok).toBe(false);
    const paths = r.ok ? [] : r.issues.map((i) => i.path);
    expect(paths).toContain('lines');
    expect(paths).toContain('profile.vat_id');
  });

  it('rejects a client that is not the draft client', () => {
    const other = { ...client, slug: 'other-gmbh' } as Client;
    expect(issue({ ...ctx, client: other })).toMatchObject({
      ok: false,
      issues: [{ path: 'client' }],
    });
  });
});

describe('issue credit note and offer', () => {
  it('numbers a credit note in the invoice series with no due date', () => {
    const { document, changes } = ok({ ...ctx, draft: creditDraft, timeFiles: {} });
    expect(document.number).toBe('RE-2027-0001');
    const same = ok({
      ...ctx,
      draft: creditDraft,
      issueDate: '2026-12-01',
      existingNumbers: ['RE-2026-0042', 'RE-2026-0041'],
      timeFiles: {},
    });
    expect(same.document.number).toBe('RE-2026-0043');
    expect(same.document.type_code).toBe(381);
    expect(same.document.due_date).toBeUndefined();
    expect(same.document.payment).toBeUndefined();
    expect(same.document.corrects).toBe('RE-2026-0042');
    expect(Object.keys(changes)).toContain(`${root}/invoices/2027/RE-2027-0001.yaml`);
    expect(same.changes[`${root}/clients/acme-gmbh/log.actionlog.md`]).toContain(
      'Issued credit note RE-2026-0043 for RE-2026-0042',
    );
  });

  it('numbers an offer in its own series without type code, due date or payment', () => {
    const offer: Draft = { ...withoutTime, kind: 'offer', valid_until: '2027-02-01' };
    const r = ok({ ...ctx, draft: offer, existingNumbers: ['AN-2027-001'], timeFiles: {} });
    expect(r.document).toMatchObject({ number: 'AN-2027-002', type_code: null });
    expect(r.document.due_date).toBeUndefined();
    expect(Object.keys(r.changes)).toContain(`${root}/offers/2027/AN-2027-002.yaml`);
    const text = r.changes[`${root}/offers/2027/AN-2027-002.yaml`] as string;
    const parsed = parseYaml(text);
    const valid = validateIssued(parsed.ok ? parsed.value : null);
    expect(valid.ok ? [] : valid.issues).toEqual([]);
  });

  it('rejects time entries of another client', () => {
    const other = entry.replace('"acme-gmbh"', '"other-gmbh"');
    expect(issue({ ...ctx, timeFiles: { [timeFile]: other } })).toMatchObject({
      ok: false,
      issues: [{ path: 'time_entries[0]' }],
    });
  });

  it('rejects time entries on an offer', () => {
    const offer: Draft = { ...draft, kind: 'offer', valid_until: '2027-02-01' };
    const r = issue({ ...ctx, draft: offer });
    expect(r.ok ? [] : r.issues.map((i) => i.path)).toContain('time_entries');
  });

  it('rejects an impossible issue date', () => {
    const r = issue({ ...ctx, issueDate: '2027-02-31' });
    expect(r.ok ? [] : r.issues.map((i) => i.path)).toContain('issue_date');
  });

  it('refuses to reuse a number even if the pattern is broken', () => {
    const broken = { ...profile, numbering: { invoice: 'RE-{nnnn}' } };
    expect(issue({ ...ctx, profile: broken, existingNumbers: ['RE-0001'] })).toMatchObject({
      ok: false,
      issues: [{ path: 'number' }],
    });
  });

  it('keeps an existing log byte-for-byte and adds one line', () => {
    const log =
      '---\ntags:\n  - a\n---\n\n# Kunde Acme\n\nSome prose.\n\n- a bullet without timestamp\n- 2026-12-01 10:00:00 Called #call';
    const out = ok({ ...ctx, clientLog: log }).changes[
      `${root}/clients/acme-gmbh/log.actionlog.md`
    ] as string;
    expect(out).toBe(`${log}\n- 2027-01-02 09:05:07 Issued RE-2027-0001 (1001.38 EUR) #business\n`);
  });
});

describe('issue a retainer draft', () => {
  const { time_entries: _t, ...plain } = fixtureDraft;
  const project: Project = {
    slug: 'hosting' as Slug,
    client: 'acme-gmbh' as Slug,
    name: 'Hosting',
    status: 'active',
    retainer: { amount: 1000, interval: 'monthly', next_date: '2027-01-31', description: 'Care' },
  };
  // Hand-edited: a comment, a custom nested order and a quoted date must all survive.
  const text = [
    'client: acme-gmbh',
    'name: Hosting',
    'status: active',
    '# billed on the last day',
    'retainer:',
    '  description: Care',
    '  next_date: "2027-01-31" # moves on issue',
    '  interval: monthly',
    '  amount: 1000',
    '',
  ].join('\n');
  const projectPath = `${root}/clients/acme-gmbh/projects/hosting.yaml`;
  const retainerDraft: Draft = { ...plain, project: project.slug, from_retainer: '2027-01-31' };
  const base = { ...ctx, draft: retainerDraft, timeFiles: {}, project: { value: project, text } };

  it('advances next_date in the same commit and drops from_retainer from the document', () => {
    const { document, changes } = ok(base);
    expect('from_retainer' in document).toBe(false);
    const issuedYaml = Object.entries(changes).find(([p]) => p.includes('/invoices/'))?.[1];
    expect(issuedYaml).not.toContain('from_retainer');
    expect(changes[projectPath]).toBe(
      text.replace('next_date: "2027-01-31"', 'next_date: "2027-02-28"'),
    );
  });

  it('leaves the project alone for a stale draft of an already advanced period', () => {
    const advanced: Project = {
      ...project,
      retainer: {
        ...(project.retainer as NonNullable<Project['retainer']>),
        next_date: '2027-02-28',
      },
    };
    const { changes } = ok({ ...base, project: { value: advanced, text } });
    expect(Object.keys(changes)).not.toContain(projectPath);
  });

  it('leaves the project alone without a project in the context', () => {
    const { project: _p, ...noProject } = base;
    expect(Object.keys(ok(noProject).changes)).not.toContain(projectPath);
  });

  it('advances only for an invoice', () => {
    const credit: Draft = { ...creditDraft, project: project.slug, from_retainer: '2027-01-31' };
    const { changes } = ok({ ...base, draft: credit });
    expect(Object.keys(changes)).not.toContain(projectPath);
  });
});
