import { describe, expect, it } from 'vitest';
import {
  CONTRACT_KINDS,
  checkContractFile,
  contractFieldErrors,
  contractFormFromContract,
  contractFromForm,
  emptyContractForm,
} from './contract-form';

const ID = '01M52X5E00EKRX27CHPV05AFMS';
const form = {
  id: ID,
  kind: 'nda',
  title: ' NDA Acme ',
  start: '2026-01-01',
  end: '2026-12-31',
  notice: '30',
  renewal: '',
  file: '',
};

describe('emptyContractForm', () => {
  it('starts with today and a fresh id', () => {
    const f = emptyContractForm('2026-11-10');
    expect(f).toMatchObject({ start: '2026-11-10', kind: 'contract', title: '', file: '' });
    expect(f.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it('offers the documented kinds', () => {
    expect(CONTRACT_KINDS).toEqual(['contract', 'nda', 'framework', 'sla', 'other']);
  });
});

describe('contractFromForm', () => {
  it('builds a contract, trimming text and reading the notice as a number', () => {
    expect(contractFromForm('acme-gmbh', form)).toEqual({
      ok: true,
      value: {
        id: ID,
        client: 'acme-gmbh',
        kind: 'nda',
        title: 'NDA Acme',
        start: '2026-01-01',
        end: '2026-12-31',
        notice_period_days: 30,
      },
    });
  });
  it('omits empty optional fields and keeps the file name', () => {
    const r = contractFromForm('acme-gmbh', {
      ...form,
      end: '',
      notice: '',
      renewal: '2027-01-01',
      file: `${ID}.pdf`,
    });
    expect(r).toMatchObject({
      ok: true,
      value: { renewal_date: '2027-01-01', file: `${ID}.pdf` },
    });
    expect(r.ok && 'end' in r.value).toBe(false);
    expect(r.ok && 'notice_period_days' in r.value).toBe(false);
  });
  it('reports each bad field', () => {
    const r = contractFromForm('acme-gmbh', {
      ...form,
      title: ' ',
      kind: '',
      start: '2026-13-01',
      end: 'x',
      notice: '-3',
      renewal: '2026-02-30',
    });
    expect(r.ok).toBe(false);
    expect(Object.keys(contractFieldErrors(r)).sort()).toEqual([
      'end',
      'kind',
      'notice',
      'renewal',
      'start',
      'title',
    ]);
  });
  it('refuses an end before the start', () => {
    const r = contractFromForm('acme-gmbh', { ...form, end: '2025-12-31' });
    expect(contractFieldErrors(r).end).toBe('The end must not be before the start.');
  });
});

describe('contractFormFromContract', () => {
  it('round-trips a stored contract', () => {
    const contract = {
      id: ID,
      client: 'acme-gmbh',
      kind: 'nda',
      title: 'NDA',
      start: '2026-01-01',
      notice_period_days: 30,
      file: `${ID}.pdf`,
    } as never;
    const f = contractFormFromContract(contract);
    expect(f).toMatchObject({ notice: '30', end: '', renewal: '', file: `${ID}.pdf` });
    expect(contractFromForm('acme-gmbh', f)).toEqual({ ok: true, value: contract });
  });
});

describe('checkContractFile', () => {
  it('accepts a PDF in any case up to 10 MB', () => {
    expect(checkContractFile({ name: 'A.PDF', size: 10485760 })).toEqual({ ok: true, value: {} });
  });
  it('refuses 10 MB + 1 and other types with the write messages', () => {
    expect(checkContractFile({ name: 'a.pdf', size: 10485761 })).toMatchObject({
      ok: false,
      issues: [{ path: 'file', message: 'Contract files can be up to 10 MB.' }],
    });
    expect(checkContractFile({ name: 'a.png', size: 1 })).toMatchObject({
      ok: false,
      issues: [{ path: 'file', message: 'Contract files must be PDF.' }],
    });
    expect(checkContractFile({ name: 'pdf', size: 1 }).ok).toBe(false);
  });
});
