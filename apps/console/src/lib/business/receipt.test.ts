import { githubService } from '@kaihuman/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openReceipt, RECEIPT_URL_LIFETIME_MS, receiptMime } from './receipt';

vi.mock('@kaihuman/core', () => ({ githubService: { getFileBytes: vi.fn() } }));

const target = { full_name: 'me/biz', default_branch: 'main' } as never;
const expense = {
  id: '01M55FJ500NTZ49EKRX27CHPV0',
  date: '2026-10-03',
  receipt: '01M55FJ500NTZ49EKRX27CHPV0.png',
} as never;

let tab: { location: { href: string }; close: ReturnType<typeof vi.fn> };
let revoke: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  tab = { location: { href: '' }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(tab as never);
  revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:r'), revokeObjectURL: revoke });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('receiptMime', () => {
  it('maps the allowed extensions', () => {
    expect(receiptMime('a.PDF')).toBe('application/pdf');
    expect(receiptMime('a.jpeg')).toBe('image/jpeg');
    expect(receiptMime('a.heic')).toBe('image/heic');
    expect(receiptMime('a.bin')).toBe('application/octet-stream');
  });
});

describe('openReceipt', () => {
  it('reads the bytes at the receipt path, shows them via a blob URL and revokes it later', async () => {
    vi.mocked(githubService.getFileBytes).mockResolvedValue(new Uint8Array([1, 2]));
    await openReceipt(target, expense);
    expect(githubService.getFileBytes).toHaveBeenCalledWith(
      'me',
      'biz',
      '.kh/business/expenses/2026/01M55FJ500NTZ49EKRX27CHPV0.png',
      { ref: 'main' },
    );
    expect(tab.location.href).toBe('blob:r');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RECEIPT_URL_LIFETIME_MS);
    expect(revoke).toHaveBeenCalledWith('blob:r');
  });

  it('closes the tab when the bytes cannot be read', async () => {
    vi.mocked(githubService.getFileBytes).mockRejectedValue(new Error('Not found'));
    await expect(openReceipt(target, expense)).rejects.toThrow('Not found');
    expect(tab.close).toHaveBeenCalled();
  });

  it('says so when the browser blocks the tab, without any network call', async () => {
    vi.mocked(githubService.getFileBytes).mockClear();
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openReceipt(target, expense)).rejects.toThrow(/blocked/);
    expect(githubService.getFileBytes).not.toHaveBeenCalled();
  });
});
