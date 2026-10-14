import { afterEach, describe, expect, it, vi } from 'vitest';
import { markThreadDone, markThreadRead, pollNotifications, subjectKey } from './notifications.js';
import { GithubHttpError } from './repo-file.js';

const mockFetch = (res: Partial<Response> & { headers?: Headers }) => {
  const fn = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fn);
  return fn;
};

const payload = (over: Record<string, unknown> = {}) => ({
  id: '5',
  reason: 'review_requested',
  unread: true,
  updated_at: '2026-10-01T00:00:00Z',
  subject: {
    title: 'Fix it',
    type: 'PullRequest',
    url: 'https://api.github.com/repos/Acme/Web/pulls/12',
  },
  repository: { full_name: 'Acme/Web' },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('notifications', () => {
  it('maps pull and issue subjects to keys', () => {
    expect(subjectKey('https://api.github.com/repos/o/r/pulls/12')).toBe('o/r#12');
    expect(subjectKey('https://api.github.com/repos/O/R/issues/3')).toBe('o/r#3');
    expect(subjectKey('https://api.github.com/repos/o/r/commits/abc')).toBeNull();
    expect(subjectKey(null)).toBeNull();
  });

  it('keeps a discussion mention as a thread row', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [
        payload({
          id: '9',
          subject: { title: 'Q', type: 'Discussion', url: null },
          repository: { full_name: 'acme/web' },
        }),
      ],
    });
    const res = await pollNotifications('t', null);
    expect(res.status === 'changed' && res.threads[0]).toMatchObject({
      threadId: '9',
      key: 'thread:9',
      url: 'https://github.com/acme/web',
      repo: 'acme/web',
    });
  });

  it('sends If-Modified-Since and treats 304 as unchanged', async () => {
    const fn = mockFetch({ ok: false, status: 304, headers: new Headers() });
    const res = await pollNotifications('tok', 'Wed, 01 Oct 2026 00:00:00 GMT');
    expect(res).toEqual({ status: 'unchanged', pollIntervalSec: 60 });
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://api.github.com/notifications?participating=true&per_page=50');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.github+json',
      'If-Modified-Since': 'Wed, 01 Oct 2026 00:00:00 GMT',
    });
  });

  it('reads X-Poll-Interval', async () => {
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-poll-interval': '90', 'last-modified': 'LM' }),
      json: async () => [payload()],
    });
    const res = await pollNotifications('t', null);
    expect(res).toMatchObject({ status: 'changed', pollIntervalSec: 90, lastModified: 'LM' });
    expect(res.status === 'changed' && res.threads[0]).toMatchObject({
      key: 'acme/web#12',
      url: 'https://github.com/Acme/Web/pull/12',
      reason: 'review_requested',
      title: 'Fix it',
      unread: true,
    });
  });

  it('throws GithubHttpError with retryAt on a rate limit', async () => {
    mockFetch({
      ok: false,
      status: 403,
      statusText: '',
      headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1760000000' }),
      json: async () => ({ message: 'rate limited' }),
    });
    const err = await pollNotifications('t', null).catch((e) => e);
    expect(err).toBeInstanceOf(GithubHttpError);
    expect(err.retryAt).toBe(1760000000000);
  });

  it('marks a thread done and read with the right verbs', async () => {
    const fn = mockFetch({ ok: true, status: 204, headers: new Headers() });
    await markThreadDone('t', '5');
    fn.mockResolvedValue({ ok: true, status: 205, headers: new Headers() });
    await markThreadRead('t', '5');
    expect(fn.mock.calls[0][0]).toBe('https://api.github.com/notifications/threads/5');
    expect(fn.mock.calls[0][1].method).toBe('DELETE');
    expect(fn.mock.calls[1][1].method).toBe('PATCH');
  });
});
