import { isUlid } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import { clientClass } from './client-class.js';
import { makeWorld, tokenOf } from './testing/world.js';

const TOKEN = tokenOf('b');
const BLOB = `/d/${TOKEN}/blob`;
const CURL = 'curl/8.7.1';
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';

describe('GET /d/:token/blob', () => {
  it('serves the ciphertext and records exactly one event', async () => {
    const world = makeWorld();
    const cipher = new Uint8Array(64).map((_, i) => i);
    world.seedFile({ token: TOKEN, user_id: 101 }, cipher);

    const response = await world.visit('GET', BLOB, { 'User-Agent': CURL });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(cipher);
    expect(world.db.tables.events).toHaveLength(1);
    const [event] = world.db.tables.events;
    expect(event).toEqual({
      id: event?.id,
      token: TOKEN,
      user_id: 101,
      at: '2026-11-02T10:00:00.000Z',
      client: 'bot',
    });
    expect(isUlid(event?.id ?? '')).toBe(true);
  });

  it('stores only the client class, never the user agent', async () => {
    const world = makeWorld();
    world.seedFile({ token: TOKEN, user_id: 202 });

    await world.visit('GET', BLOB, { 'User-Agent': FIREFOX });
    await world.visit('GET', BLOB);

    expect(world.db.tables.events.map((e) => [e.user_id, e.client])).toEqual([
      [202, 'browser'],
      [202, 'other'],
    ]);
    expect(JSON.stringify(world.db.queries)).not.toContain('Firefox');
  });

  it('answers revoked, expired, unknown and missing objects without an event', async () => {
    const world = makeWorld();
    world.seedFile({ token: tokenOf('r'), user_id: 101, revoked_at: '2026-11-01T00:00:00.000Z' });
    world.seedFile({ token: tokenOf('e'), user_id: 101, expires_at: '2026-11-01' });
    world.seedFile({ token: tokenOf('m'), user_id: 101 }, null);

    const cases: [string, number, string][] = [
      ['r', 410, 'This link is no longer available.'],
      ['e', 410, 'This link is no longer available.'],
      ['m', 410, 'This link is no longer available.'],
      ['u', 404, 'This link does not exist.'],
    ];
    for (const [c, status, message] of cases) {
      const response = await world.visit('GET', `/d/${tokenOf(c)}/blob`, { 'User-Agent': CURL });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: message });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(world.db.tables.events).toEqual([]);
  });

  it('refuses HEAD and other methods with 405 and records nothing', async () => {
    const world = makeWorld();
    world.seedFile({ token: TOKEN, user_id: 101 });
    for (const method of ['HEAD', 'POST', 'DELETE']) {
      const response = await world.visit(method, BLOB);
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET');
    }
    expect(world.db.tables.events).toEqual([]);
  });
});

describe('clientClass', () => {
  it.each([
    [CURL, 'bot'],
    ['Wget/1.21.4', 'bot'],
    ['python-requests/2.32', 'bot'],
    ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'bot'],
    ['Mozilla/5.0 HeadlessChrome/131.0', 'bot'],
    ['Mozilla/5.0 (compatible; Barracuda Link Scanner)', 'bot'],
    ['Slack-LinkExpanding Preview', 'bot'],
    ['Mozilla/5.0 (compatible; crawler)', 'bot'],
    ['Mozilla/5.0 Spider', 'bot'],
    [FIREFOX, 'browser'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', 'browser'],
    ['okhttp/4.12', 'other'],
    ['', 'other'],
    [null, 'other'],
  ])('%s → %s', (ua, expected) => {
    expect(clientClass(ua)).toBe(expected);
  });
});
