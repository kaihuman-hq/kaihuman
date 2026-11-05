import { describe, expect, it } from 'vitest';
import { CONSOLE, makeWorld, tokenOf, type World } from './testing/world.js';

interface Listed {
  events: { id: string; token: string; label: string; at: string; client: string }[];
}

async function events(world: World, query = '', token: 'gho_alice' | 'gho_bob' = 'gho_alice') {
  const response = await world.call('GET', `/api/events${query}`, { token });
  expect(response.status).toBe(200);
  return ((await response.json()) as Listed).events;
}

function seed(world: World) {
  world.seedFile({ token: tokenOf('a'), user_id: 101, label: 'A-1' });
  world.seedFile({ token: tokenOf('b'), user_id: 202, label: 'B-1' });
  world.seedEvent({ id: '01A', token: tokenOf('a'), user_id: 101, at: '2026-11-01T12:00:00.000Z' });
  world.seedEvent({
    id: '01C',
    token: tokenOf('a'),
    user_id: 101,
    at: '2026-11-01T08:00:00.000Z',
    client: 'bot',
  });
  world.seedEvent({ id: '01B', token: tokenOf('b'), user_id: 202, at: '2026-11-01T09:00:00.000Z' });
}

describe('GET /api/events', () => {
  it("lists only the caller's events, oldest first, with the file label", async () => {
    const world = makeWorld();
    seed(world);

    expect(await events(world)).toEqual([
      {
        id: '01C',
        token: tokenOf('a'),
        label: 'A-1',
        at: '2026-11-01T08:00:00.000Z',
        client: 'bot',
      },
      {
        id: '01A',
        token: tokenOf('a'),
        label: 'A-1',
        at: '2026-11-01T12:00:00.000Z',
        client: 'browser',
      },
    ]);
    expect(await events(world, '', 'gho_bob')).toEqual([
      {
        id: '01B',
        token: tokenOf('b'),
        label: 'B-1',
        at: '2026-11-01T09:00:00.000Z',
        client: 'browser',
      },
    ]);
  });

  it('returns only events after since, normalised to an ISO instant', async () => {
    const world = makeWorld();
    seed(world);

    expect((await events(world, '?since=2026-11-01T08:00:00.000Z')).map((e) => e.id)).toEqual([
      '01A',
    ]);
    // Without milliseconds, and with an offset: still the same instant.
    expect((await events(world, '?since=2026-11-01T08:00:00Z')).map((e) => e.id)).toEqual(['01A']);
    expect((await events(world, '?since=2026-11-01T13:00:00%2B01:00')).map((e) => e.id)).toEqual(
      [],
    );
    expect((await events(world, '?since=2026-11-01T12:00:00.000Z')).map((e) => e.id)).toEqual([]);
  });

  it('caps the list at 500', async () => {
    const world = makeWorld();
    world.seedFile({ token: tokenOf('a'), user_id: 101 });
    for (let i = 0; i < 501; i++) {
      const at = new Date(Date.UTC(2026, 9, 1) + i * 1000).toISOString();
      world.seedEvent({
        id: `E${String(i).padStart(4, '0')}`,
        token: tokenOf('a'),
        user_id: 101,
        at,
      });
    }
    const listed = await events(world);
    expect(listed).toHaveLength(500);
    expect(listed[499]?.id).toBe('E0499');
  });

  it('refuses an invalid since with 400', async () => {
    const world = makeWorld();
    for (const since of ['yesterday', '2026-13-01T00:00:00Z', '2026-11-01', '']) {
      const response = await world.call('GET', `/api/events?since=${since}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid since.' });
    }
  });

  it('needs a GitHub token and answers with CORS headers', async () => {
    const world = makeWorld();
    const anonymous = await world.call('GET', '/api/events', { token: null });
    expect(anonymous.status).toBe(401);
    const ok = await world.call('GET', '/api/events');
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(CONSOLE);
    expect((await world.call('POST', '/api/events')).status).toBe(405);
  });
});
