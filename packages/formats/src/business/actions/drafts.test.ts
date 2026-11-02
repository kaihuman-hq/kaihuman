import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug, Ulid } from '../ids.js';
import { draftPath } from '../paths.js';
import type { Project } from '../records.js';
import { loadBusinessRepo } from '../repo.js';
import { validateDraft } from '../validate.js';
import { parseYaml } from '../yaml.js';
import {
  defaultVat,
  deleteDraft,
  draftFromRetainer,
  draftFromUnbilled,
  saveDraft,
} from './drafts.js';

const id = '01M5AMBK0038DJQW16BGNTZ49F' as Ulid;
const E1 = '01M5AMBK0038DJQW16BGNTZ4A1' as Ulid;
const E2 = '01M5AMBK0038DJQW16BGNTZ4A2' as Ulid;
const E3 = '01M5AMBK0038DJQW16BGNTZ4A3' as Ulid;
const client = 'acme-gmbh' as Slug;
const today = '2026-11-02';

const entry = (eid: Ulid, date: string, minutes: number, project?: string) =>
  `${JSON.stringify({ id: eid, date, minutes, client, ...(project ? { project } : {}), note: 'x' })}\n`;

const withTime = (lines: string, edit: (m: Map<string, string>) => void = () => {}) => {
  const files = loadFixtureRepo();
  files.set('.kh/business/time/2026-11.jsonl', lines);
  edit(files);
  return loadBusinessRepo(files);
};
const ok = <T>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.issues)}`);
  return r.value;
};

describe('draftFromUnbilled', () => {
  it('makes one hourly line per project from the unbilled entries', () => {
    const repo = withTime(
      entry(E1, '2026-11-03', 90, 'website') + entry(E2, '2026-11-01', 30, 'website'),
    );
    const d = ok(draftFromUnbilled(repo, client, {}, id, today));
    expect(d.lines).toEqual([
      {
        description: 'Website relaunch',
        quantity: '2.00',
        unit: 'HUR',
        unit_price: 9500,
        vat_category: 'S',
        vat_rate: '19',
      },
    ]);
    expect(d.time_entries).toEqual([E1, E2]);
    expect(d).toMatchObject({ id, kind: 'invoice', client, project: 'website' });
    expect(d.service_period).toEqual({ start: '2026-11-01', end: '2026-11-03' });
  });

  it('leaves out entries that are already billed', () => {
    const d = ok(
      draftFromUnbilled(withTime(entry(E1, '2026-11-03', 60, 'website')), client, {}, id, today),
    );
    expect(d.time_entries).toEqual([E1]);
  });

  it('puts entries without a project or rate in one zero-price line', () => {
    const repo = withTime(entry(E1, '2026-11-03', 60) + entry(E2, '2026-11-04', 30, 'nope'));
    const d = ok(draftFromUnbilled(repo, client, {}, id, today));
    expect(d.lines).toEqual([
      {
        description: 'Time without rate — set a price',
        quantity: '1.50',
        unit: 'HUR',
        unit_price: 0,
        vat_category: 'S',
        vat_rate: '19',
      },
    ]);
  });

  it('rounds hours half up from integer minutes', () => {
    const one = (m: number) =>
      ok(draftFromUnbilled(withTime(entry(E1, '2026-11-03', m, 'website')), client, {}, id, today))
        .lines[0]?.quantity;
    expect([one(120), one(90), one(100), one(1), one(7)]).toEqual([
      '2.00',
      '1.50',
      '1.67',
      '0.02',
      '0.12',
    ]);
  });

  it('uses DAY and minutes/480 for day rates', () => {
    const repo = withTime(
      entry(E1, '2026-11-03', 480).replace('"note"', '"project":"dev","note"') +
        entry(E2, '2026-11-04', 240).replace('"note"', '"project":"dev","note"'),
      (m) =>
        m.set(
          '.kh/business/clients/acme-gmbh/projects/dev.yaml',
          'client: acme-gmbh\nname: Dev days\nstatus: active\nrate:\n  per: day\n  amount: 80000\n',
        ),
    );
    const d = ok(draftFromUnbilled(repo, client, {}, id, today));
    expect(d.lines[0]).toMatchObject({
      description: 'Dev days',
      quantity: '1.50',
      unit: 'DAY',
      unit_price: 80000,
    });
    const rounded = withTime(
      entry(E1, '2026-11-03', 100).replace('"note"', '"project":"dev","note"'),
      (m) =>
        m.set(
          '.kh/business/clients/acme-gmbh/projects/dev.yaml',
          'client: acme-gmbh\nname: Dev days\nstatus: active\nrate:\n  per: day\n  amount: 80000\n',
        ),
    );
    expect(ok(draftFromUnbilled(rounded, client, {}, id, today)).lines[0]?.quantity).toBe('0.21');
  });

  it('narrows to a project or to chosen entries', () => {
    const repo = withTime(
      entry(E1, '2026-11-03', 60, 'website') +
        entry(E2, '2026-11-04', 30) +
        entry(E3, '2026-11-05', 30),
    );
    expect(
      ok(draftFromUnbilled(repo, client, { project: 'website' as Slug }, id, today)).time_entries,
    ).toEqual([E1]);
    expect(
      ok(draftFromUnbilled(repo, client, { entryIds: [E2, E3] }, id, today)).time_entries,
    ).toEqual([E2, E3]);
  });

  it('refuses when nothing is unbilled', () => {
    const r = draftFromUnbilled(loadBusinessRepo(loadFixtureRepo()), client, {}, id, today);
    expect(r).toEqual({
      ok: false,
      issues: [{ path: 'time_entries', message: expect.any(String) }],
    });
  });
});

describe('draftFromUnbilled, drafts and regimes', () => {
  const twoEntries =
    entry(E1, '2026-11-03', 60, 'website') + entry(E2, '2026-11-04', 30, 'website');
  const draftWith = (ids: Ulid[]) => (m: Map<string, string>) =>
    m.set(
      '.kh/business/drafts/01M5AMBK0038DJQW16BGNTZ4B1.yaml',
      `id: 01M5AMBK0038DJQW16BGNTZ4B1\nkind: invoice\nclient: acme-gmbh\nlines:\n  - description: x\n    quantity: "1"\n    unit: C62\n    unit_price: 100\n    vat_category: S\n    vat_rate: "19"\ntime_entries:\n${ids.map((i) => `  - ${i}`).join('\n')}\n`,
    );

  it('leaves out entries that are already in a draft', () => {
    const d = ok(draftFromUnbilled(withTime(twoEntries, draftWith([E1])), client, {}, id, today));
    expect(d.time_entries).toEqual([E2]);
  });

  it('refuses when all unbilled time is in drafts', () => {
    const r = draftFromUnbilled(withTime(twoEntries, draftWith([E1, E2])), client, {}, id, today);
    expect(r).toEqual({
      ok: false,
      issues: [{ path: 'time_entries', message: 'All unbilled time is already in a draft.' }],
    });
  });

  it('takes explicitly named entries even when they are in a draft', () => {
    const d = ok(
      draftFromUnbilled(
        withTime(twoEntries, draftWith([E1])),
        client,
        { entryIds: [E1] },
        id,
        today,
      ),
    );
    expect(d.time_entries).toEqual([E1]);
  });

  it('uses E at 0 for a small-business profile', () => {
    const repo = withTime(twoEntries, (m) => {
      const key = '.kh/business/business.yaml';
      m.set(key, (m.get(key) ?? '').replace('vat_regime: regular', 'vat_regime: small-business'));
    });
    const d = ok(draftFromUnbilled(repo, client, {}, id, today));
    expect(d.lines[0]).toMatchObject({ vat_category: 'E', vat_rate: '0' });
  });

  it('bills at least 0.01 for a one-minute day-rate entry', () => {
    const repo = withTime(entry(E1, '2026-11-03', 1, 'dev'), (m) =>
      m.set(
        '.kh/business/clients/acme-gmbh/projects/dev.yaml',
        'client: acme-gmbh\nname: Dev days\nstatus: active\nrate:\n  per: day\n  amount: 80000\n',
      ),
    );
    expect(ok(draftFromUnbilled(repo, client, {}, id, today)).lines[0]?.quantity).toBe('0.01');
  });
});

describe('draftFromRetainer', () => {
  const project = (retainer?: Project['retainer']): Project => ({
    slug: 'hosting' as Slug,
    client,
    name: 'Hosting',
    status: 'active',
    ...(retainer ? { retainer } : {}),
  });
  const repo = loadBusinessRepo(loadFixtureRepo());
  const r = (interval: 'monthly' | 'quarterly', next_date: string) =>
    ok(
      draftFromRetainer(
        repo,
        project({ amount: 120000, interval, next_date, description: 'Hosting' }),
        id,
        today,
      ),
    );

  it('builds one line and the monthly period', () => {
    const d = r('monthly', '2026-12-01');
    expect(d.lines).toEqual([
      {
        description: 'Hosting',
        quantity: '1',
        unit: 'C62',
        unit_price: 120000,
        vat_category: 'S',
        vat_rate: '19',
      },
    ]);
    expect(d.service_period).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    expect(d).toMatchObject({
      kind: 'invoice',
      client,
      project: 'hosting',
      from_retainer: '2026-12-01',
    });
  });

  it('ends a monthly period on the last day of that month, leap years included', () => {
    expect(r('monthly', '2028-02-01').service_period?.end).toBe('2028-02-29');
    expect(r('monthly', '2026-11-15').service_period).toEqual({
      start: '2026-11-15',
      end: '2026-11-30',
    });
  });

  it('ends a quarterly period the day before next_date plus three months', () => {
    expect(r('quarterly', '2026-12-01').service_period).toEqual({
      start: '2026-12-01',
      end: '2027-02-28',
    });
    expect(r('quarterly', '2026-10-01').service_period?.end).toBe('2026-12-31');
    expect(r('quarterly', '2026-11-30').service_period?.end).toBe('2027-02-27');
  });

  it('refuses a project without a retainer', () => {
    const res = draftFromRetainer(repo, project(), id, today);
    expect(res).toEqual({
      ok: false,
      issues: [{ path: 'retainer', message: 'Hosting has no retainer.' }],
    });
  });

  it('uses E at 0 for a small-business profile', () => {
    const files = loadFixtureRepo();
    const key = '.kh/business/business.yaml';
    files.set(
      key,
      (files.get(key) ?? '').replace('vat_regime: regular', 'vat_regime: small-business'),
    );
    const d = ok(
      draftFromRetainer(
        loadBusinessRepo(files),
        project({ amount: 5000, interval: 'monthly', next_date: '2026-12-01', description: 'H' }),
        id,
        today,
      ),
    );
    expect(d.lines[0]).toMatchObject({ vat_category: 'E', vat_rate: '0' });
  });
});

describe('defaultVat', () => {
  it('is S at the profile rate when regular, E at 0 for small business', () => {
    expect(defaultVat({ vat_regime: 'regular', default_vat_rate: '19' })).toEqual({
      vat_category: 'S',
      vat_rate: '19',
    });
    expect(defaultVat({ vat_regime: 'small-business', default_vat_rate: '19' })).toEqual({
      vat_category: 'E',
      vat_rate: '0',
    });
  });
});

describe('saveDraft and deleteDraft', () => {
  const repo = loadBusinessRepo(loadFixtureRepo());
  const existing = repo.drafts[0];

  it('writes YAML that validateDraft accepts', () => {
    const d = ok(
      draftFromRetainer(
        repo,
        {
          slug: 'hosting' as Slug,
          client,
          name: 'H',
          status: 'active',
          retainer: {
            amount: 5000,
            interval: 'monthly',
            next_date: '2026-12-01',
            description: 'Hosting',
          },
        },
        id,
        today,
      ),
    );
    const v = ok(saveDraft(repo, d));
    const text = v.changes[draftPath(id)];
    expect(text).toBeTypeOf('string');
    const parsed = parseYaml(text ?? '');
    expect(parsed.ok && validateDraft(parsed.value)).toEqual({ ok: true, value: d });
  });

  it('replaces an existing draft under the same id', () => {
    if (!existing) throw new Error('fixture');
    const v = ok(saveDraft(repo, { ...existing, notes: 'changed' }));
    expect(Object.keys(v.changes)).toEqual([draftPath(existing.id)]);
    expect(v.changes[draftPath(existing.id)]).toContain('notes: changed');
  });

  it('deletes by setting the path to null, and only for a known, unissued draft', () => {
    if (!existing) throw new Error('fixture');
    expect(ok(deleteDraft(repo, existing.id)).changes).toEqual({ [draftPath(existing.id)]: null });
    expect(deleteDraft(repo, id)).toEqual({
      ok: false,
      issues: [{ path: 'id', message: 'This draft does not exist any more.' }],
    });
    const issuedDraftId = repo.issued[0]?.doc.draft_id;
    if (!issuedDraftId) throw new Error('fixture');
    expect(deleteDraft(repo, issuedDraftId)).toEqual({
      ok: false,
      issues: [{ path: 'id', message: 'This draft was already issued.' }],
    });
  });
});
