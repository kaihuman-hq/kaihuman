import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from './fixture-repo.test-helper.js';
import type { Slug, Ulid } from './ids.js';
import type { Contract, Draft, Project } from './records.js';
import {
  contractDates,
  contractReminders,
  nextRetainerDate,
  retainersDue,
  retentionEnd,
} from './reminders.js';
import { type BusinessRepo, loadBusinessRepo } from './repo.js';

const base = loadBusinessRepo(loadFixtureRepo());
const acme = 'acme-gmbh' as Slug;
const retainer = (next_date: string, interval: 'monthly' | 'quarterly' = 'monthly') => ({
  amount: 1000,
  interval,
  next_date,
  description: 'Care',
});
const project = (slug: string, next_date?: string): Project => ({
  slug: slug as Slug,
  client: acme,
  name: slug,
  status: 'active',
  ...(next_date ? { retainer: retainer(next_date) } : {}),
});

describe('nextRetainerDate', () => {
  it('adds one or three months, clamped to the month end', () => {
    expect(nextRetainerDate(retainer('2026-01-31'))).toBe('2026-02-28');
    expect(nextRetainerDate(retainer('2026-12-01'))).toBe('2027-01-01');
    expect(nextRetainerDate(retainer('2026-11-30', 'quarterly'))).toBe('2027-02-28');
    expect(nextRetainerDate(retainer('2026-10-01', 'quarterly'))).toBe('2027-01-01');
  });
});

describe('retainersDue', () => {
  const draft = (p: string, from_retainer?: string): Draft => ({
    id: '01M5AMBK0038DJQW16BGNTZ49F' as Ulid,
    kind: 'invoice',
    client: acme,
    project: p as Slug,
    lines: [],
    ...(from_retainer ? { from_retainer } : {}),
  });
  const repo: BusinessRepo = {
    ...base,
    projects: [
      project('late', '2026-12-16'),
      project('edge', '2026-11-16'),
      project('past', '2026-10-01'),
      project('none'),
    ],
    drafts: [draft('edge', '2026-11-16'), draft('past', '2026-09-01'), draft('late')],
  };

  it('lists retainers due within the window, sorted, overdue included', () => {
    expect(
      retainersDue(repo, '2026-11-02').map((r) => [r.project.slug, r.date, r.hasDraft]),
    ).toEqual([
      ['past', '2026-10-01', false],
      ['edge', '2026-11-16', true],
    ]);
    expect(retainersDue(repo, '2026-11-01').map((r) => r.project.slug)).toEqual(['past']);
    expect(retainersDue(repo, '2026-11-02', 60).map((r) => r.project.slug)).toEqual([
      'past',
      'edge',
      'late',
    ]);
  });
});

describe('contractReminders', () => {
  const c = (over: Partial<Contract>): Contract => ({
    id: '01M5AMBK0038DJQW16BGNTZ49F' as Ulid,
    client: acme,
    kind: 'service',
    title: 'Service',
    start: '2026-01-01',
    ...over,
  });

  it('gives the notice date before the renewal, the renewal and the end', () => {
    const contract = c({ renewal_date: '2026-12-31', notice_period_days: 30, end: '2027-06-30' });
    expect(contractDates(contract)).toEqual([
      { date: '2026-12-31', what: 'renewal' },
      { date: '2026-12-01', what: 'notice' },
      { date: '2027-06-30', what: 'end' },
    ]);
    const repo = { ...base, contracts: [contract] };
    expect(contractReminders(repo, '2026-11-02')).toEqual([
      { contract, date: '2026-12-01', what: 'notice' },
      { contract, date: '2026-12-31', what: 'renewal' },
    ]);
    expect(contractReminders(repo, '2026-12-02').map((r) => r.what)).toEqual(['renewal']);
    expect(contractReminders(repo, '2027-05-01').map((r) => r.what)).toEqual(['end']);
  });

  it('counts the notice from the end without a renewal date', () => {
    const contract = c({ end: '2026-12-31', notice_period_days: 30 });
    expect(contractReminders({ ...base, contracts: [contract] }, '2026-11-02')).toEqual([
      { contract, date: '2026-12-01', what: 'notice' },
      { contract, date: '2026-12-31', what: 'end' },
    ]);
  });
});

describe('retentionEnd', () => {
  it('ends on 31 Dec of the year plus the retention years', () => {
    expect(retentionEnd(base, '2026-03-04')).toBe('2034-12-31');
    expect(retentionEnd({ ...base, profile: null }, '2026-03-04')).toBe('2036-12-31');
  });
});
