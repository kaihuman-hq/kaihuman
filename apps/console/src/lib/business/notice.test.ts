import { beforeEach, describe, expect, it } from 'vitest';
import { businessNotice, noticeAfterRoute, showNotice } from './notice';

beforeEach(() => {
  businessNotice.value = null;
});

describe('businessNotice', () => {
  it('stays for the page it was meant for, then clears on the next navigation', () => {
    showNotice('Issued RE-2026-0043.', '/clients/acme-gmbh');
    noticeAfterRoute('/clients/acme-gmbh');
    expect(businessNotice.value?.text).toBe('Issued RE-2026-0043.');
    noticeAfterRoute('/business');
    expect(businessNotice.value).toBeNull();
    noticeAfterRoute('/clients/acme-gmbh');
    expect(businessNotice.value).toBeNull();
  });

  it('ignores the query string and hash of the target', () => {
    showNotice('Saved.', '/clients/acme-gmbh');
    noticeAfterRoute('/clients/acme-gmbh?tab=1#x');
    expect(businessNotice.value?.text).toBe('Saved.');
  });

  it('does nothing without a notice', () => {
    noticeAfterRoute('/business');
    expect(businessNotice.value).toBeNull();
  });
});
