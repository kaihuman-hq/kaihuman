import { describe, expect, it } from 'vitest';
import type { FileRow } from './db.js';
import { CONSOLE, countingStream, makeWorld, type World } from './testing/world.js';

const MAX = 10_485_760;
const QUOTA = 524_288_000;
const MINUTE = 60_000;

interface Created {
  token: string;
  size: number;
  created: string;
  expires: string | null;
}

interface Listed {
  files: {
    token: string;
    label: string;
    kind: string;
    size: number;
    created: string;
    expires: string | null;
    revoked: string | null;
    downloads: number;
  }[];
  used: number;
  quota: number;
}

async function created(response: Response): Promise<Created> {
  expect(response.status).toBe(201);
  return (await response.json()) as Created;
}

async function list(world: World, token: 'gho_alice' | 'gho_bob' = 'gho_alice'): Promise<Listed> {
  const response = await world.call('GET', '/api/files', { token });
  expect(response.status).toBe(200);
  return (await response.json()) as Listed;
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: string }).error;
}

function seed(world: World, row: Partial<FileRow> & Pick<FileRow, 'token' | 'user_id' | 'size'>) {
  world.db.tables.files.push({
    label: 'seed.pdf',
    business: 'Seed',
    kind: 'pdf',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: null,
    revoked_at: null,
    ...row,
  });
}

describe('POST /api/files', () => {
  it('stores the ciphertext under user/token and lists it with no downloads', async () => {
    const world = makeWorld();
    const body = new Uint8Array([1, 2, 3, ...new Uint8Array(40)]);

    const response = await world.upload(0, {
      body,
      headers: { 'X-KH-Expires': '2026-12-31', 'X-KH-Label': 'RE-2026-001.pdf' },
    });
    const file = await created(response);

    expect(file.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(file).toEqual({
      token: file.token,
      size: 43,
      created: '2026-11-02T10:00:00.000Z',
      expires: '2026-12-31',
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(CONSOLE);
    expect(world.files.objects.get(`101/${file.token}`)).toEqual(body);
    expect(world.db.tables.files[0]).toMatchObject({ business: 'Acme GmbH', user_id: 101 });

    expect(await list(world)).toEqual({
      files: [
        {
          token: file.token,
          label: 'RE-2026-001.pdf',
          kind: 'pdf',
          size: 43,
          created: '2026-11-02T10:00:00.000Z',
          expires: '2026-12-31',
          revoked: null,
          downloads: 0,
        },
      ],
      used: 43,
      quota: QUOTA,
    });
  });

  it('accepts xml and stores no expiry when none is given', async () => {
    const world = makeWorld();
    const file = await created(await world.upload(100, { headers: { 'X-KH-Kind': 'xml' } }));
    expect(file.expires).toBeNull();
    expect((await list(world)).files[0]?.kind).toBe('xml');
  });

  it('decodes a percent-encoded business name', async () => {
    const world = makeWorld();
    await created(
      await world.upload(100, {
        headers: { 'X-KH-Business': encodeURIComponent('Müller & Söhne €') },
      }),
    );
    expect(world.db.tables.files[0]?.business).toBe('Müller & Söhne €');
  });

  it('accepts exactly MAX_BYTES + 28 and refuses one byte more', async () => {
    const world = makeWorld();
    await created(await world.upload(MAX + 28));

    const tooBig = await world.upload(MAX + 29);
    expect(tooBig.status).toBe(413);
    expect(await errorOf(tooBig)).toBe('File too large (max 10 MB).');
    expect(world.files.objects.size).toBe(1);
  });

  it('refuses an oversized Content-Length before reading the body', async () => {
    const world = makeWorld();
    const response = await world.upload(10, { headers: { 'Content-Length': String(MAX + 29) } });
    expect(response.status).toBe(413);
  });

  it.each([
    ['missing', undefined],
    ['non-numeric', 'abc'],
    ['negative', '-5'],
    ['fractional', '100.5'],
  ])('refuses a %s Content-Length with 411 without reading the body', async (_, length) => {
    const world = makeWorld();
    const { stream, counter } = countingStream(4, 100);
    const headers: Record<string, string> =
      length === undefined ? {} : { 'Content-Length': length };

    const response = await world.upload(0, { body: stream, headers });

    expect(response.status).toBe(411);
    expect(await errorOf(response)).toBe('Content length required.');
    expect(counter.pulls).toBe(0);
    expect(world.files.objects.size).toBe(0);
    expect(world.db.tables.files).toHaveLength(0);
  });

  it('stops reading with 413 when the stream runs past the limit despite a small Content-Length', async () => {
    const world = makeWorld();
    const chunk = 1_048_576;
    const { stream, counter } = countingStream(20, chunk);

    const response = await world.upload(0, { body: stream, headers: { 'Content-Length': '100' } });

    expect(response.status).toBe(413);
    expect(await errorOf(response)).toBe('File too large (max 10 MB).');
    // 11 chunks pass MAX + 28; the rest is never pulled.
    expect(counter.pulls).toBe(11);
    expect(world.files.objects.size).toBe(0);
    expect(world.db.tables.files).toHaveLength(0);
  });

  it('refuses a body that does not match its Content-Length', async () => {
    const world = makeWorld();
    const { stream } = countingStream(1, 100);
    const response = await world.upload(0, { body: stream, headers: { 'Content-Length': '200' } });
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe('The upload does not match its Content-Length.');
    expect(world.files.objects.size).toBe(0);
  });

  it('refuses an over-quota upload by its Content-Length without reading the body', async () => {
    const world = makeWorld();
    seed(world, { token: 'seed-a', user_id: 101, size: QUOTA - 999 });
    const { stream, counter } = countingStream(10, 100);

    const response = await world.upload(0, { body: stream, headers: { 'Content-Length': '1000' } });

    expect(response.status).toBe(413);
    expect(await errorOf(response)).toBe('Storage limit reached (500 MB).');
    expect(counter.pulls).toBe(0);
  });

  it('refuses a rate-limited upload without reading the body', async () => {
    const world = makeWorld();
    for (let i = 0; i < 30; i++) await created(await world.upload(100));
    const { stream, counter } = countingStream(1, 100);

    const response = await world.upload(0, { body: stream, headers: { 'Content-Length': '100' } });

    expect(response.status).toBe(429);
    expect(counter.pulls).toBe(0);
  });

  it('stores a streamed upload whose length matches its Content-Length', async () => {
    const world = makeWorld();
    const { stream } = countingStream(3, 100);
    const file = await created(
      await world.upload(0, { body: stream, headers: { 'Content-Length': '300' } }),
    );
    expect(file.size).toBe(300);
    expect(world.files.objects.get(`101/${file.token}`)?.byteLength).toBe(300);
  });

  it('accepts an upload that fills the quota exactly and refuses one byte more', async () => {
    const world = makeWorld();
    seed(world, { token: 'seed-a', user_id: 101, size: QUOTA - 1000 });

    await created(await world.upload(1000));

    const fresh = makeWorld();
    seed(fresh, { token: 'seed-a', user_id: 101, size: QUOTA - 999 });
    const over = await fresh.upload(1000);
    expect(over.status).toBe(413);
    expect(await errorOf(over)).toBe('Storage limit reached (500 MB).');
    expect(fresh.files.objects.size).toBe(0);
    expect(fresh.db.tables.files).toHaveLength(1);
  });

  it('counts neither revoked files nor other users against the quota', async () => {
    const world = makeWorld();
    seed(world, { token: 'seed-a', user_id: 101, size: QUOTA - 1000 });
    seed(world, { token: 'seed-r', user_id: 101, size: 5000, revoked_at: '2026-10-01T00:00:00Z' });
    seed(world, { token: 'seed-b', user_id: 202, size: QUOTA - 1000 });

    await created(await world.upload(1000));
    expect((await list(world)).used).toBe(QUOTA);
    await created(await world.upload(1000, { token: 'gho_bob' }));
    expect((await list(world, 'gho_bob')).used).toBe(QUOTA);
  });

  it('refuses the 31st upload within an hour and allows one 61 minutes later', async () => {
    const world = makeWorld();
    for (let i = 0; i < 30; i++) {
      await created(await world.upload(100));
      world.clock.now += 1000;
    }

    const limited = await world.upload(100);
    expect(limited.status).toBe(429);
    expect(await errorOf(limited)).toBe('Too many uploads. Try again later.');
    // Another user has their own allowance.
    await created(await world.upload(100, { token: 'gho_bob' }));

    world.clock.now += 61 * MINUTE;
    await created(await world.upload(100));
  });

  it('counts revoked uploads against the rate limit', async () => {
    const world = makeWorld();
    for (let i = 0; i < 30; i++) {
      const file = await created(await world.upload(100));
      expect((await world.call('DELETE', `/api/files/${file.token}`)).status).toBe(204);
    }
    expect((await world.upload(100)).status).toBe(429);
  });

  it.each([
    [{ 'X-KH-Kind': 'docx' }, 'Unsupported kind (pdf or xml).'],
    [{ 'X-KH-Kind': '' }, 'Unsupported kind (pdf or xml).'],
    [{ 'X-KH-Label': '../evil/x' }, 'Invalid label.'],
    [{ 'X-KH-Label': 'with space.pdf' }, 'Invalid label.'],
    [{ 'X-KH-Label': 'a'.repeat(81) }, 'Invalid label.'],
    [{ 'X-KH-Business': '' }, 'Invalid business name.'],
    [{ 'X-KH-Business': 'x'.repeat(121) }, 'Invalid business name.'],
    [{ 'X-KH-Business': 'Line%0Abreak' }, 'Invalid business name.'],
    [{ 'X-KH-Business': '100%' }, 'Invalid business name.'],
    [{ 'X-KH-Expires': '2026-13-01' }, 'Invalid expiry date.'],
    [{ 'X-KH-Expires': '2026-02-30' }, 'Invalid expiry date.'],
    [{ 'X-KH-Expires': 'tomorrow' }, 'Invalid expiry date.'],
    [{ 'X-KH-Expires': '2026-12-31T00:00:00Z' }, 'Invalid expiry date.'],
  ])('refuses bad headers %o with 400', async (headers, message) => {
    const world = makeWorld();
    const response = await world.upload(100, { headers });
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe(message);
    expect(world.files.objects.size).toBe(0);
    expect(world.db.tables.files).toHaveLength(0);
  });

  it('accepts labels and business names at their maximum length', async () => {
    const world = makeWorld();
    await created(
      await world.upload(100, {
        headers: { 'X-KH-Label': 'a'.repeat(80), 'X-KH-Business': 'b'.repeat(120) },
      }),
    );
  });

  it('refuses a body too short to be an encrypted file', async () => {
    const world = makeWorld();
    const response = await world.upload(28);
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toBe('The upload is not an encrypted file.');
  });

  it('never stores the GitHub token', async () => {
    const world = makeWorld();
    const file = await created(await world.upload(100));
    await world.call('DELETE', `/api/files/${file.token}`);
    await created(await world.upload(100));

    const stored = JSON.stringify({
      tables: world.db.tables,
      params: world.db.queries,
      keys: [...world.files.objects.keys()],
    });
    expect(stored).not.toContain('gho_alice');
    expect(stored).not.toContain('alice');
  });
});

describe('GET /api/files', () => {
  it('lists own files only, newest first', async () => {
    const world = makeWorld();
    const first = await created(await world.upload(100));
    world.clock.now += MINUTE;
    const second = await created(await world.upload(200));
    seed(world, { token: 'bobs-file', user_id: 202, size: 10 });

    const listed = await list(world);
    expect(listed.files.map((f) => f.token)).toEqual([second.token, first.token]);
    expect(listed.used).toBe(300);
  });

  it('counts download events per file', async () => {
    const world = makeWorld();
    const file = await created(await world.upload(100));
    for (const id of ['e1', 'e2']) {
      world.db.tables.events.push({
        id,
        token: file.token,
        user_id: 101,
        at: '2026-11-02T11:00:00Z',
        client: 'browser',
      });
    }
    expect((await list(world)).files[0]?.downloads).toBe(2);
  });
});

describe('DELETE /api/files/:token', () => {
  it('revokes: deletes the R2 object, marks the record and frees the quota', async () => {
    const world = makeWorld();
    const file = await created(await world.upload(100));
    world.clock.now += MINUTE;

    const response = await world.call('DELETE', `/api/files/${file.token}`);

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(world.files.objects.size).toBe(0);
    const listed = await list(world);
    expect(listed.files[0]?.revoked).toBe('2026-11-02T10:01:00.000Z');
    expect(listed.used).toBe(0);

    // A second revoke is harmless and keeps the first time.
    world.clock.now += MINUTE;
    expect((await world.call('DELETE', `/api/files/${file.token}`)).status).toBe(204);
    expect((await list(world)).files[0]?.revoked).toBe('2026-11-02T10:01:00.000Z');
  });

  it('returns 404 for an unknown token', async () => {
    const world = makeWorld();
    const response = await world.call('DELETE', '/api/files/AAAAAAAAAAAAAAAAAAAAAA');
    expect(response.status).toBe(404);
    expect(await errorOf(response)).toBe('Not found');
  });

  it('returns 404 for a malformed token', async () => {
    const world = makeWorld();
    expect((await world.call('DELETE', '/api/files/short')).status).toBe(404);
  });
});

describe('isolation between users', () => {
  it('user B can neither list, revoke nor count against user A', async () => {
    const world = makeWorld();
    const file = await created(await world.upload(1000));

    const bobs = await list(world, 'gho_bob');
    expect(bobs).toEqual({ files: [], used: 0, quota: QUOTA });

    const revoke = await world.call('DELETE', `/api/files/${file.token}`, { token: 'gho_bob' });
    expect(revoke.status).toBe(404);
    expect(world.files.objects.has(`101/${file.token}`)).toBe(true);
    expect((await list(world)).files[0]?.revoked).toBeNull();
  });
});

describe('auth, CORS and routing', () => {
  it('answers a preflight from an allowed origin', async () => {
    const world = makeWorld();
    const response = await world.call('OPTIONS', '/api/files', {
      token: null,
      headers: {
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, x-kh-label',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(CONSOLE);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, DELETE');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Authorization, Content-Type, X-KH-Label, X-KH-Business, X-KH-Kind, X-KH-Expires',
    );
    expect(response.headers.get('Vary')).toBe('Origin');
    expect(world.gitHub).not.toHaveBeenCalled();
  });

  it('allows every origin in the comma-separated list', async () => {
    const world = makeWorld();
    const response = await world.call('OPTIONS', '/api/files', {
      token: null,
      headers: { Origin: 'http://localhost:4300' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4300');
  });

  it('gives other origins no Access-Control-Allow-Origin', async () => {
    const world = makeWorld();
    const preflight = await world.call('OPTIONS', '/api/files', {
      token: null,
      headers: { Origin: 'https://evil.example' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const get = await world.call('GET', '/api/files', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(get.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('returns 401 without a token, with CORS headers so the console can read it', async () => {
    const world = makeWorld();
    const response = await world.call('GET', '/api/files', { token: null });
    expect(response.status).toBe(401);
    expect(await errorOf(response)).toBe('Sign in to kaihuman again.');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(CONSOLE);
  });

  it('returns 401 when GitHub refuses the token', async () => {
    const world = makeWorld();
    const response = await world.upload(100, { token: 'gho_unknown' });
    expect(response.status).toBe(401);
    expect(world.files.objects.size).toBe(0);
  });

  it('returns 502 when GitHub fails', async () => {
    const world = makeWorld();
    const response = await world.call('GET', '/api/files', { token: 'gho_down' });
    expect(response.status).toBe(502);
    expect(await errorOf(response)).toBe('GitHub is not reachable.');
  });

  it('returns 404 Not found for unknown paths', async () => {
    const world = makeWorld();
    for (const path of ['/', '/api', '/api/other', '/api/files/x/y']) {
      const response = await world.call('GET', path);
      expect(response.status).toBe(404);
      expect(await errorOf(response)).toBe('Not found');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('returns 405 for another method on a known path', async () => {
    const world = makeWorld();
    expect((await world.call('PUT', '/api/files')).status).toBe(405);
  });
});
