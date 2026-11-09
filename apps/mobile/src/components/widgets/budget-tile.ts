/**
 * Budget tile beyond the glance numbers: balance, per-account breakdown, recent transactions and the
 * add-transaction mutator. Rows are appended in the same `name;account;category;date;value` shape the
 * console writes, so both apps keep reading each other's files.
 */
import {
  type BudgetTransaction,
  type BudgetView,
  budgetView,
  parseBudgetCsv,
  type TileResult,
} from './tile-controllers.js';

const HEADER = 'name;account;category;date;value';

/** Same ids and order as the console's category picker. */
export const BUDGET_CATEGORIES: readonly { id: string; label: string; type: 'in' | 'out' }[] = [
  { id: 'earnings', label: 'Earnings', type: 'in' },
  { id: 'transport', label: 'Transport', type: 'out' },
  { id: 'food', label: 'Food', type: 'out' },
  { id: 'pocket-money', label: 'Pocket Money', type: 'out' },
  { id: 'education', label: 'Education', type: 'out' },
  { id: 'entertainment', label: 'Entertainment', type: 'out' },
  { id: 'savings', label: 'Savings', type: 'out' },
  { id: 'hobby', label: 'Hobby', type: 'out' },
  { id: 'running-costs', label: 'Running Costs', type: 'out' },
  { id: 'insurance', label: 'Insurance', type: 'out' },
  { id: 'loan', label: 'Loan', type: 'out' },
  { id: 'tax', label: 'Tax', type: 'out' },
  { id: 'invest', label: 'Invest', type: 'out' },
  { id: 'other-income', label: 'Other (Income)', type: 'in' },
  { id: 'other-outcome', label: 'Other (Outcome)', type: 'out' },
];

const INCOME = new Set(BUDGET_CATEGORIES.filter((c) => c.type === 'in').map((c) => c.id));

export interface BudgetDetail {
  /** Income, spending and balance (`net`) for the selected account, or for all of them. */
  summary: BudgetView;
  /** Every account with its balance, regardless of the selection. */
  accounts: BudgetView['accounts'];
  /** Newest first. */
  recent: (BudgetTransaction & { income: boolean })[];
  names: string[];
  accountNames: string[];
}

const serializeRow = (t: BudgetTransaction) =>
  `${t.name};${t.account};${t.category};${t.date};${t.value}`;

const sortedUnique = (values: string[]) => [...new Set(values)].filter(Boolean).sort();

/** `account` narrows the numbers and the recent list to one account. */
export const budgetDetail = (content: string, account: string | null, limit = 8): BudgetDetail => {
  const all = parseBudgetCsv(content);
  const scoped = account ? all.filter((t) => t.account === account) : all;
  return {
    // Rebuilt from rows so the per-account numbers follow exactly the same rules as the glance.
    summary: budgetView([HEADER, ...scoped.map(serializeRow)].join('\n')),
    accounts: budgetView(content).accounts,
    recent: scoped
      .map((t, i) => ({ t, i }))
      .sort((a, b) => b.t.date.localeCompare(a.t.date) || b.i - a.i)
      .slice(0, limit)
      .map(({ t }) => ({ ...t, income: INCOME.has(t.category) })),
    names: sortedUnique(all.map((t) => t.name)),
    accountNames: sortedUnique(all.map((t) => t.account)),
  };
};

export interface BudgetDraft {
  name: string;
  account: string;
  category: string;
  /** Raw field text; a decimal comma is accepted. */
  value: string;
  date: string;
}

export const addBudgetTransaction = (content: string, draft: BudgetDraft): TileResult => {
  const name = draft.name.trim();
  const account = draft.account.trim();
  if (!name) return { ok: false, error: 'Enter a name.' };
  if (!account) return { ok: false, error: 'Enter an account.' };
  // ';' is the column separator and newlines would split the row, so neither can appear in text.
  if (/[;\n\r]/.test(name + account)) {
    return { ok: false, error: 'Names and accounts cannot contain ";" or line breaks.' };
  }
  if (!BUDGET_CATEGORIES.some((c) => c.id === draft.category)) {
    return { ok: false, error: 'Pick a category.' };
  }
  const raw = draft.value.trim().replace(',', '.');
  const value = raw === '' ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter the amount as a number.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) {
    return { ok: false, error: 'Date must look like 2026-11-09.' };
  }
  const row = serializeRow({ name, account, category: draft.category, date: draft.date, value });
  const body = content.trim() ? content.replace(/\s+$/, '') : HEADER;
  return { ok: true, content: `${body}\n${row}` };
};
