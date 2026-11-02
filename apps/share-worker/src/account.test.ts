import { describe, expect, it, vi } from 'vitest';
import { CONSOLE, makeWorld, tokenOf } from './testing/world.js';

describe('DELETE /api/account', () => {
  it("removes the caller's R2 objects, files and events and leaves other users alone", async () => {
    const world = makeWorld();
    world.seedFile({ token: tokenOf('a'), user_id: 101 });
    // Revoked: its object is already gone, which must not stop the deletion.
    world.seedFile(
      { token: tokenOf('r'), user_id: 101, revoked_at: '2026-11-01T00:00:00.000Z' },
      null,
    );
    world.seedFile({ token: tokenOf('b'), user_id: 202 });
    world.seedEvent({ id: '01A', token: tokenOf('a'), user_id: 101 });
    world.seedEvent({ id: '01B', token: tokenOf('b'), user_id: 202 });

    const response = await world.call('DELETE', '/api/account');

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(CONSOLE);
    expect([...world.files.objects.keys()]).toEqual([`202/${tokenOf('b')}`]);
    expect(world.db.tables.files.map((f) => f.token)).toEqual([tokenOf('b')]);
    expect(world.db.tables.events.map((e) => e.id)).toEqual(['01B']);

    const list = await world.call('GET', '/api/files');
    expect(((await list.json()) as { files: unknown[] }).files).toEqual([]);
    expect((await world.visit('GET', `/d/${tokenOf('a')}`)).status).toBe(404);
  });

  it('deletes objects in batches R2 accepts', async () => {
    const world = makeWorld();
    for (let i = 0; i < 1001; i++) {
      world.seedFile({ token: `t${String(i).padStart(21, '0')}`, user_id: 101 });
    }
    const remove = vi.spyOn(world.files, 'delete');

    expect((await world.call('DELETE', '/api/account')).status).toBe(204);

    expect(world.files.objects.size).toBe(0);
    expect(remove.mock.calls.map(([keys]) => keys.length)).toEqual([1000, 1]);
  });

  it('succeeds for a user without files', async () => {
    const world = makeWorld();
    expect((await world.call('DELETE', '/api/account', { token: 'gho_bob' })).status).toBe(204);
  });

  it('needs a GitHub token', async () => {
    const world = makeWorld();
    world.seedFile({ token: tokenOf('a'), user_id: 101 });
    expect((await world.call('DELETE', '/api/account', { token: null })).status).toBe(401);
    expect((await world.call('GET', '/api/account')).status).toBe(405);
    expect(world.db.tables.files).toHaveLength(1);
  });
});
