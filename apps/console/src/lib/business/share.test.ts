import { KEY_ORDER, LINKS_PATH, type LinkRecord, type Ulid } from '@kaihuman/formats/business';
import { decryptShareBlob, parseShareUrl } from '@kaihuman/formats/share';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kaihuman/core', () => {
  class ConflictError extends Error {}
  return {
    ConflictError,
    githubService: { getHeadSha: vi.fn(), getFileBytes: vi.fn() },
  };
});
const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
vi.mock('./write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./write')>()),
  writeBusiness: writes.writeBusiness,
}));

import { githubService } from '@kaihuman/core';
import {
  acceptShareConsent,
  createShareLink,
  customShareHost,
  hasShareConsent,
  revokeShareLink,
  type ShareApi,
  ShareError,
  ShareUnavailableError,
  shareApi,
  shareServiceUrl,
} from './share';

const BASE = 'https://share.example';
const GH_TOKEN = 'gho_secret';
const target = { full_name: 'me/biz', default_branch: 'main' } as never;
const PDF = new TextEncoder().encode('%PDF-1.7 invoice');
const ISSUED = '.kh/business/invoices/2026/RE-2026-0001.yaml';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Every byte of every request: URL, header values and body, as one string. */
const everythingSent = (fetchImpl: { mock: { calls: Parameters<typeof fetch>[] } }): string =>
  fetchImpl.mock.calls
    .map(([url, init]) => {
      const headers = Object.values((init?.headers ?? {}) as Record<string, string>).join('\n');
      const body =
        init?.body && ArrayBuffer.isView(init.body)
          ? new TextDecoder('latin1').decode(init.body)
          : String(init?.body ?? '');
      return `${String(url)}\n${headers}\n${body}`;
    })
    .join('\n');

/** The writeBusiness double: runs the builder against `links`, records what it built. */
let links: string | null;
let built: { changes: Record<string, string | null>; message: string } | undefined;
const commitSucceeds = () =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ headSha: 'head-1', tree: [], repo: {}, read: async () => links });
    if (r.ok) built = r.value;
    return r.ok ? { ok: true, value: { commitSha: 'c1' } } : r;
  });

beforeEach(() => {
  vi.clearAllMocks();
  links = null;
  built = undefined;
  vi.mocked(githubService.getHeadSha).mockResolvedValue('head-1');
  vi.mocked(githubService.getFileBytes).mockResolvedValue(PDF);
});
afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('shareServiceUrl', () => {
  it('falls back to VITE_SHARE_URL, then to docs.kaihuman.com', () => {
    vi.stubEnv('VITE_SHARE_URL', 'https://env.example');
    expect(shareServiceUrl()).toBe('https://env.example');
    vi.stubEnv('VITE_SHARE_URL', '');
    expect(shareServiceUrl()).toBe('https://docs.kaihuman.com');
  });

  it('prefers a valid https override in localStorage and ignores anything else', () => {
    vi.stubEnv('VITE_SHARE_URL', 'https://env.example');
    localStorage.setItem('lifeos_share_url', 'https://self.example');
    expect(shareServiceUrl()).toBe('https://self.example');
    localStorage.setItem('lifeos_share_url', 'http://plain.example');
    expect(shareServiceUrl()).toBe('https://env.example');
    localStorage.setItem('lifeos_share_url', 'not a url');
    expect(shareServiceUrl()).toBe('https://env.example');
  });

  it('keeps only the origin of an override', () => {
    localStorage.setItem('lifeos_share_url', 'https://host.example/share?x=1#frag');
    expect(shareServiceUrl()).toBe('https://host.example');
  });

  it('names only a service that is not the configured default', () => {
    vi.stubEnv('VITE_SHARE_URL', '');
    expect(customShareHost()).toBeNull();
    vi.stubEnv('VITE_SHARE_URL', 'https://env.example');
    expect(customShareHost()).toBeNull();
    localStorage.setItem('lifeos_share_url', 'https://docs.kaihuman.com/');
    expect(customShareHost()).toBeNull();
    localStorage.setItem('lifeos_share_url', 'https://self.example/x');
    expect(customShareHost()).toBe('self.example');
  });

  it('survives a localStorage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(shareServiceUrl()).toMatch(/^https:\/\//);
    expect(hasShareConsent()).toBe(false);
    spy.mockRestore();
  });
});

describe('share consent', () => {
  it('is off until accepted, then remembered', () => {
    expect(hasShareConsent()).toBe(false);
    acceptShareConsent();
    expect(hasShareConsent()).toBe(true);
    expect(localStorage.getItem('lifeos_share_consent_v1')).not.toBeNull();
  });
});

describe('shareApi', () => {
  it('uploads with Bearer auth and the metadata headers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        { token: TOKEN, size: 3, created: '2026-11-02T10:00:00.000Z', expires: null },
        201,
      ),
    );
    const api = shareApi(`${BASE}/`, GH_TOKEN, fetchImpl);
    const res = await api.upload(new Uint8Array([1, 2, 3]), {
      kind: 'pdf',
      label: 'RE-2026-0001',
      business: 'Müller & Söhne',
      expires: '2026-12-01',
    });
    expect(res).toEqual({ token: TOKEN, created: '2026-11-02T10:00:00.000Z' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/files`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${GH_TOKEN}`,
      'Content-Type': 'application/octet-stream',
      'X-KH-Kind': 'pdf',
      'X-KH-Label': 'RE-2026-0001',
      'X-KH-Business': encodeURIComponent('Müller & Söhne'),
      'X-KH-Expires': '2026-12-01',
    });
  });

  it('lists, revokes, reads events and deletes the account', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (String(url).includes('/api/events')) {
        return jsonResponse({
          events: [{ id: 'e1', token: TOKEN, label: 'X', at: 'now', client: 'browser' }],
        });
      }
      return jsonResponse({ files: [], used: 0, quota: 10 });
    });
    const api = shareApi(BASE, GH_TOKEN, fetchImpl);
    expect(await api.list()).toEqual({ files: [], used: 0, quota: 10 });
    await api.revoke(TOKEN);
    expect(await api.events('2026-11-01T00:00:00.000Z')).toHaveLength(1);
    await api.deleteAccount();
    expect(fetchImpl.mock.calls.map(([u, i]) => `${i?.method ?? 'GET'} ${u}`)).toEqual([
      `GET ${BASE}/api/files`,
      `DELETE ${BASE}/api/files/${TOKEN}`,
      `GET ${BASE}/api/events?since=2026-11-01T00%3A00%3A00.000Z`,
      `DELETE ${BASE}/api/account`,
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${GH_TOKEN}`);
    }
  });

  it('maps a network failure to ShareUnavailableError', async () => {
    const api = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('x'))),
    );
    const err = await api.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShareUnavailableError);
    expect((err as Error).message).toBe('The share service is not reachable.');
  });

  it('maps a JSON error to ShareError with its message and status', async () => {
    const api = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () =>
        jsonResponse({ error: 'Storage limit reached (500 MB).' }, 413),
      ),
    );
    const err = await api
      .upload(new Uint8Array([1]), { kind: 'pdf', label: 'A', business: 'B' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ShareError);
    expect(err).not.toBeInstanceOf(ShareUnavailableError);
    expect((err as ShareError).message).toBe('Storage limit reached (500 MB).');
    expect((err as ShareError).status).toBe(413);
  });

  it('gives a generic message when the error body is not JSON', async () => {
    const api = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () => new Response('oops', { status: 502 })),
    );
    await expect(api.list()).rejects.toThrow('The share service answered 502.');
  });
});

describe('createShareLink', () => {
  const fetchFor = (uploadStatus = 201) =>
    vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return uploadStatus === 201
        ? jsonResponse({ token: TOKEN, size: 1, created: 'c', expires: null }, 201)
        : jsonResponse({ error: 'Too many uploads. Try again later.' }, uploadStatus);
    });

  it('encrypts the PDF read at the head, uploads it and commits a link that parses back', async () => {
    commitSucceeds();
    links = '{"id":"01M50ARQ007CHPV05AFMSY38DJ","doc":"AN-2026-001","url":"x","created":"c"}\n';
    const fetchImpl = fetchFor();
    const api = shareApi(BASE, GH_TOKEN, fetchImpl);
    const { url } = await createShareLink(
      target,
      { number: 'RE-2026-0001', path: ISSUED },
      { api, baseUrl: BASE, business: 'Acme Studio', now: () => new Date('2026-11-02T10:00:00Z') },
    );

    expect(githubService.getFileBytes).toHaveBeenCalledWith(
      'me',
      'biz',
      '.kh/business/invoices/2026/RE-2026-0001.pdf',
      { ref: 'head-1' },
    );
    const parsed = parseShareUrl(url);
    expect(parsed?.token).toBe(TOKEN);
    expect(parsed?.host).toBe(BASE);

    // The uploaded body is the PDF, encrypted with the key in the link.
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as Uint8Array;
    // Compared as arrays: jsdom and Node each have their own Uint8Array.
    expect([...(await decryptShareBlob(body, parsed?.key ?? ''))]).toEqual([...PDF]);

    // Review Focus 1: the key is in no request.
    expect(everythingSent(fetchImpl)).not.toContain(parsed?.key);

    expect(built?.message).toBe('business: share link for RE-2026-0001');
    const lines = (built?.changes[LINKS_PATH] ?? '').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    const record = JSON.parse(lines[1] ?? '') as LinkRecord;
    expect(Object.keys(record)).toEqual(KEY_ORDER.link.filter((k) => k in record));
    expect(record).toMatchObject({
      doc: 'RE-2026-0001',
      url,
      created: '2026-11-02T10:00:00.000Z',
    });
    expect(record.expires).toBeUndefined();
    expect(record.id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it('sends and records the expiry when one is given', async () => {
    commitSucceeds();
    const fetchImpl = fetchFor();
    await createShareLink(
      target,
      {
        number: 'AN-2026-001',
        path: '.kh/business/offers/2026/AN-2026-001.yaml',
        expires: '2026-12-01',
      },
      { api: shareApi(BASE, GH_TOKEN, fetchImpl), baseUrl: BASE, business: 'Acme' },
    );
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['X-KH-Expires']).toBe('2026-12-01');
    expect(JSON.parse(built?.changes[LINKS_PATH] ?? '{}').expires).toBe('2026-12-01');
  });

  it('revokes the upload again when the commit fails (Review Focus 4)', async () => {
    writes.writeBusiness.mockRejectedValue(new Error('GitHub said no'));
    const api: ShareApi = {
      upload: vi.fn(async () => ({ token: TOKEN, created: 'c' })),
      list: vi.fn(),
      revoke: vi.fn(async () => {}),
      events: vi.fn(),
      deleteAccount: vi.fn(),
    };
    const err = await createShareLink(
      target,
      { number: 'RE-2026-0001', path: ISSUED },
      { api, baseUrl: BASE, business: 'Acme' },
    ).catch((e: unknown) => e);
    expect(api.revoke).toHaveBeenCalledWith(TOKEN);
    expect(err).toBeInstanceOf(ShareError);
    expect((err as Error).message).toBe(
      'The link could not be saved in the repository and was removed again.',
    );
  });

  it('still reports the commit failure when the compensating revoke fails too', async () => {
    writes.writeBusiness.mockResolvedValue({ ok: false, issues: [{ path: '', message: 'bad' }] });
    const api: ShareApi = {
      upload: vi.fn(async () => ({ token: TOKEN, created: 'c' })),
      list: vi.fn(),
      revoke: vi.fn(async () => Promise.reject(new ShareUnavailableError())),
      events: vi.fn(),
      deleteAccount: vi.fn(),
    };
    await expect(
      createShareLink(
        target,
        { number: 'RE-2026-0001', path: ISSUED },
        { api, baseUrl: BASE, business: 'A' },
      ),
    ).rejects.toThrow('The link could not be saved in the repository and was removed again.');
    expect(api.revoke).toHaveBeenCalledWith(TOKEN);
  });

  it('refuses a malformed token from the service before committing', async () => {
    commitSucceeds();
    const api: ShareApi = {
      upload: vi.fn(async () => ({ token: '../../evil', created: 'c' })),
      list: vi.fn(),
      revoke: vi.fn(async () => {}),
      events: vi.fn(),
      deleteAccount: vi.fn(),
    };
    await expect(
      createShareLink(
        target,
        { number: 'RE-2026-0001', path: ISSUED },
        { api, baseUrl: BASE, business: 'A' },
      ),
    ).rejects.toThrow(
      'The share service sent an answer that could not be used. Nothing was saved.',
    );
    expect(api.revoke).toHaveBeenCalledWith('../../evil');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('commits nothing when the upload fails', async () => {
    commitSucceeds();
    const api = shareApi(BASE, GH_TOKEN, fetchFor(429));
    await expect(
      createShareLink(
        target,
        { number: 'RE-2026-0001', path: ISSUED },
        { api, baseUrl: BASE, business: 'A' },
      ),
    ).rejects.toThrow('Too many uploads. Try again later.');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('commits nothing and says so when the service is down', async () => {
    commitSucceeds();
    const api = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('down'))),
    );
    await expect(
      createShareLink(
        target,
        { number: 'RE-2026-0001', path: ISSUED },
        { api, baseUrl: BASE, business: 'A' },
      ),
    ).rejects.toThrow('The share service is not reachable.');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });
});

describe('revokeShareLink', () => {
  const KEY = 'k'.repeat(43);
  const link = (id: string, doc: string): LinkRecord => ({
    id: id as Ulid,
    doc,
    url: `${BASE}/d/${TOKEN}#${KEY}`,
    created: '2026-11-01T00:00:00.000Z',
  });
  const A = link('01M50ARQ007CHPV05AFMSY38DA', 'RE-2026-0001');
  const B = link('01M50ARQ007CHPV05AFMSY38DB', 'RE-2026-0001');
  const linesOf = (...ls: LinkRecord[]) => ls.map((l) => `${JSON.stringify(l)}\n`).join('');
  beforeEach(() => vi.stubEnv('VITE_SHARE_URL', BASE));

  it('refuses a link from another service: nothing sent, nothing committed (S8)', async () => {
    commitSucceeds();
    vi.stubEnv('VITE_SHARE_URL', 'https://b.test');
    const onA = { ...A, url: `https://a.test/d/${TOKEN}#${KEY}` };
    links = linesOf(onA);
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));
    await expect(
      revokeShareLink(target, onA, { api: shareApi('https://b.test', GH_TOKEN, fetchImpl) }),
    ).rejects.toThrow(
      'This link was created on a.test. Switch the share service to a.test to revoke it.',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('treats a 404 as already revoked and sets revoked on the right line only', async () => {
    commitSucceeds();
    links = linesOf(A, B);
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: 'Not found.' }, 404));
    await revokeShareLink(target, B, {
      api: shareApi(BASE, GH_TOKEN, fetchImpl),
      now: () => new Date('2026-11-02T12:00:00Z'),
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${BASE}/api/files/${TOKEN}`);
    expect(everythingSent(fetchImpl)).not.toContain(KEY);
    expect(built?.message).toBe('business: revoke share link for RE-2026-0001');
    const [first, second] = (built?.changes[LINKS_PATH] ?? '').trimEnd().split('\n');
    expect(first).toBe(JSON.stringify(A));
    expect(JSON.parse(second ?? '')).toEqual({ ...B, revoked: '2026-11-02T12:00:00.000Z' });
  });

  it('commits nothing when the service refuses or is down', async () => {
    commitSucceeds();
    links = linesOf(A);
    const down = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('x'))),
    );
    await expect(revokeShareLink(target, A, { api: down })).rejects.toThrow(
      'The share service is not reachable.',
    );
    const refused = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () => jsonResponse({ error: 'No.' }, 500)),
    );
    await expect(revokeShareLink(target, A, { api: refused })).rejects.toThrow('No.');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('refuses when the link is no longer in the repository', async () => {
    commitSucceeds();
    links = linesOf(A);
    const api = shareApi(
      BASE,
      GH_TOKEN,
      vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
    );
    const result = await revokeShareLink(target, B, { api });
    expect(result.ok).toBe(false);
    expect(built).toBeUndefined();
  });
});
