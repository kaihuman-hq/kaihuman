import { githubService } from '@kaihuman/core';
import { type Expense, receiptPath } from '@kaihuman/formats/business';
import type { KBRepo } from '../github-kb';
import { downloadBlob } from './download';

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
 * HEIC is saved as a file instead: browsers mostly cannot display it, so a tab would stay blank.
 */
export async function openReceipt(target: KBRepo, expense: Expense): Promise<void> {
  const file = expense.receipt;
  if (!file) return;
  const saveAs = receiptMime(file) === 'image/heic';
  const tab = saveAs ? null : window.open('', '_blank');
  if (!saveAs && !tab) {
    throw new Error('Your browser blocked the new tab. Allow pop-ups and try again.');
  }
  try {
    const [owner = '', name = ''] = target.full_name.split('/');
    const path = receiptPath(
      expense.date.slice(0, 4),
      expense.id,
      file.slice(file.lastIndexOf('.') + 1),
    );
    const bytes = await githubService.getFileBytes(owner, name, path, {
      ref: target.default_branch,
    });
    const blob = new Blob([bytes as BlobPart], { type: receiptMime(path) });
    if (saveAs) {
      downloadBlob(file, blob);
      return;
    }
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), RECEIPT_URL_LIFETIME_MS);
    if (tab) tab.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
