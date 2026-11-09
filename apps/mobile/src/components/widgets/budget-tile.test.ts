import { describe, expect, it } from 'vitest';
import { addBudgetTransaction, budgetDetail } from './budget-tile.js';

const HEADER = 'name;account;category;date;value';
const FILE = [
  HEADER,
  'Salary;Bank;earnings;2026-11-01;2000',
  'Rent;Bank;running-costs;2026-11-02;800',
  'Lunch;Cash;food;2026-11-05;12.5',
  'Bus;Cash;transport;2026-11-06;3',
].join('\n');

describe('budgetDetail', () => {
  it('reports the total balance, per-account balances and newest-first recent rows', () => {
    const d = budgetDetail(FILE, null);
    expect(d.summary.net).toBeCloseTo(1184.5);
    expect(d.accounts).toEqual([
      { id: 'Bank', value: 1200 },
      { id: 'Cash', value: -15.5 },
    ]);
    expect(d.recent.map((t) => t.name)).toEqual(['Bus', 'Lunch', 'Rent', 'Salary']);
    expect(d.recent[3]?.income).toBe(true);
    expect(d.names).toEqual(['Bus', 'Lunch', 'Rent', 'Salary']);
    expect(d.accountNames).toEqual(['Bank', 'Cash']);
  });

  it('lists every spending category, not only five', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(
      (c, i) => `x${i};Bank;${c};2026-11-01;${i + 1}`,
    );
    const d = budgetDetail([HEADER, ...rows].join('\n'), null);
    expect(d.summary.categories).toHaveLength(7);
  });

  it('narrows numbers and recent rows to one account', () => {
    const d = budgetDetail(FILE, 'Cash');
    expect(d.summary.net).toBeCloseTo(-15.5);
    expect(d.recent.map((t) => t.name)).toEqual(['Bus', 'Lunch']);
    expect(d.accounts).toHaveLength(2);
  });

  it('copes with an empty file', () => {
    const d = budgetDetail('', null);
    expect(d.summary.net).toBe(0);
    expect(d.recent).toEqual([]);
  });
});

describe('addBudgetTransaction', () => {
  const draft = {
    name: 'Tea',
    account: 'Cash',
    category: 'food',
    value: '2,5',
    date: '2026-11-09',
  };

  it('appends a row in the console format', () => {
    expect(addBudgetTransaction(`${FILE}\n`, draft)).toEqual({
      ok: true,
      content: `${FILE}\nTea;Cash;food;2026-11-09;2.5`,
    });
  });

  it('starts a header for an empty file', () => {
    expect(addBudgetTransaction('', draft)).toEqual({
      ok: true,
      content: `${HEADER}\nTea;Cash;food;2026-11-09;2.5`,
    });
  });

  it.each([
    [{ name: ' ' }, 'name'],
    [{ account: '' }, 'account'],
    [{ name: 'a;b' }, ';'],
    [{ category: 'nope' }, 'category'],
    [{ value: 'abc' }, 'number'],
    [{ value: '' }, 'number'],
    [{ date: '09.11.2026' }, 'Date'],
  ])('rejects %j', (patch, hint) => {
    const r = addBudgetTransaction(FILE, { ...draft, ...patch });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(hint);
  });
});
