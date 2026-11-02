import { githubService } from '@kaihuman/core';
import { type Expense, receiptPath } from '@kaihuman/formats/business';
import type { KBRepo } from '../github-kb';

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const receiptMime = (file: string): string =>
  MIME[file.slice(file.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/** How long the new tab has to read the blob before its URL is freed. */
export const RECEIPT_URL_LIFETIME_MS = 60_000;

/**
 * Fetches the receipt's bytes and shows them in a new tab through a short-lived blob URL. The tab
 * is opened first, inside the click, because browsers block a tab opened after the network wait.
 */
export async function openReceipt(target: KBRepo, expense: Expense): Promise<void> {
  if (!expense.receipt) return;
  const tab = window.open('', '_blank');
  if (!tab) throw new Error('Your browser blocked the new tab. Allow pop-ups and try again.');
  try {
    const [owner = '', name = ''] = target.full_name.split('/');
    const ext = expense.receipt.slice(expense.receipt.lastIndexOf('.') + 1);
    const path = receiptPath(expense.date.slice(0, 4), expense.id, ext);
    const bytes = await githubService.getFileBytes(owner, name, path, {
      ref: target.default_branch,
    });
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: receiptMime(path) }));
    setTimeout(() => URL.revokeObjectURL(url), RECEIPT_URL_LIFETIME_MS);
    tab.location.href = url;
  } catch (e) {
    tab.close();
    throw e;
  }
}
