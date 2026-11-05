import { afterEach, describe, expect, it, vi } from 'vitest';
import { csvBlob, downloadBlob } from './download';

afterEach(() => vi.restoreAllMocks());

describe('downloadBlob', () => {
  it('clicks a link with the file name and revokes the URL', () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this;
      // Still valid while the click runs.
      expect(revoke).not.toHaveBeenCalled();
    });
    const blob = new Blob(['a']);
    downloadBlob('expenses-2026.csv', blob);
    expect(create).toHaveBeenCalledWith(blob);
    expect(clicked?.download).toBe('expenses-2026.csv');
    expect(clicked?.getAttribute('href')).toBe('blob:x');
    expect(revoke).toHaveBeenCalledWith('blob:x');
    vi.unstubAllGlobals();
  });

  it('revokes the URL even if the click throws', () => {
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:y', revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => downloadBlob('a.csv', new Blob([]))).toThrow('blocked');
    expect(revoke).toHaveBeenCalledWith('blob:y');
    vi.unstubAllGlobals();
  });
});

describe('csvBlob', () => {
  it('keeps the BOM as the first three bytes', async () => {
    const bytes = new Uint8Array(await csvBlob('﻿a;b\r\n').arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
