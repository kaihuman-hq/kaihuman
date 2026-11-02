import type { Ulid } from '../ids.js';
import type { FileChanges, TextChanges } from '../issue.js';
import { ATTACHMENT_MAX_BYTES, expensePath, RECEIPT_EXTENSIONS, receiptPath } from '../paths.js';
import { type Expense, KEY_ORDER } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateExpense } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

const refuse = (path: string, message: string) => ({
  ok: false as const,
  issues: [{ path, message }],
});

const yearOf = (date: string): string => date.slice(0, 4);

/** The validator guarantees `receipt` is `<id>.<ext>`. */
const receiptFile = (e: Expense & { receipt: string }): string =>
  receiptPath(yearOf(e.date), e.id, e.receipt.slice(e.id.length + 1));

/**
 * Creates or replaces an expense; with `receipt`, its bytes go into the same commit as
 * `expenses/<yyyy>/<id>.<ext>`. A receipt the expense no longer names is deleted.
 */
export const saveExpense = (
  repo: BusinessRepo,
  expense: Expense,
  receipt?: { ext: string; bytes: Uint8Array },
): Result<{ changes: FileChanges; message: string }> => {
  let record = expense;
  if (receipt) {
    // Size and type first: they are what the user can fix, and no work is done for a refused file.
    if (receipt.bytes.length > ATTACHMENT_MAX_BYTES) {
      return refuse('receipt', 'Receipts can be up to 10 MB.');
    }
    const ext = receipt.ext.toLowerCase();
    if (!(RECEIPT_EXTENSIONS as readonly string[]).includes(ext)) {
      return refuse('receipt', 'Receipts must be PDF, JPG, PNG, WEBP or HEIC.');
    }
    const named = expense.receipt ?? '';
    const dot = named.lastIndexOf('.');
    if (named.slice(0, dot) !== expense.id || named.slice(dot + 1).toLowerCase() !== ext) {
      return refuse('receipt', `The receipt must be named ${expense.id}.${ext}.`);
    }
    record = { ...expense, receipt: `${expense.id}.${ext}` };
  }
  if (record.client !== undefined && !repo.clients.some((c) => c.slug === record.client)) {
    return refuse('client', `unknown client "${record.client}"`);
  }
  const checked = validateExpense(record);
  if (!checked.ok) return checked;
  const value = checked.value;
  const year = yearOf(value.date);

  const changes: FileChanges = {};
  const old = repo.expenses.find((e) => e.id === value.id);
  // A name with no bytes must be the file already stored, or the expense would point at nothing.
  if (!receipt && value.receipt !== undefined && old?.receipt !== value.receipt) {
    return refuse('receipt', 'Upload the receipt file.');
  }
  if (old) {
    const oldYear = yearOf(old.date);
    if (old.receipt !== undefined) {
      // Same name and no new bytes: the stored file stays. A re-upload overwrites it below.
      const kept = !receipt && old.receipt === value.receipt;
      // The receipt's bytes are not at hand here, so it cannot follow the expense to a new folder.
      if (kept && oldYear !== year) {
        return refuse('date', 'Upload the receipt again to move the expense to another year.');
      }
      if (!kept) changes[receiptFile({ ...old, receipt: old.receipt })] = null;
    }
    if (oldYear !== year) changes[expensePath(oldYear, old.id)] = null;
  }
  changes[expensePath(year, value.id)] = stringifyYaml(value, KEY_ORDER.expense);
  if (receipt && value.receipt)
    changes[receiptFile({ ...value, receipt: value.receipt })] = receipt.bytes;
  return {
    ok: true,
    value: { changes, message: `business: expense ${value.supplier} ${value.date}` },
  };
};

/** Removes the expense and its receipt in one commit. The retention warning is the caller's (see `retentionEnd`). */
export const deleteExpense = (
  repo: BusinessRepo,
  id: Ulid,
): Result<{ changes: TextChanges; message: string }> => {
  const expense = repo.expenses.find((e) => e.id === id);
  if (!expense) return refuse('id', 'This expense does not exist any more.');
  const changes: TextChanges = { [expensePath(yearOf(expense.date), id)]: null };
  if (expense.receipt !== undefined)
    changes[receiptFile({ ...expense, receipt: expense.receipt })] = null;
  return {
    ok: true,
    value: { changes, message: `business: delete expense ${expense.supplier} ${expense.date}` },
  };
};
