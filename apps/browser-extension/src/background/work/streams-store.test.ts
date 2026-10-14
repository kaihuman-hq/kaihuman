import type { ItemId, StreamId, StreamOp } from '@kaihuman/formats';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Res = { status: number; body?: unknown; etag?: string };
let store: Record<string, unknown>;
let responses: Array<Res | (() => Promise<Res>)>;
let calls: Array<{ method: string; init?: any }>;

const enc = (s: string) => btoa(s);
const dec = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
const fileBody = (content: string, sha = 'sha1') => ({ content: enc(content), sha });
const streamsJson = JSON.stringify({
  version: 1,
  updatedAt: '2026-09-01T00:00:00.000Z',
  streams: [{ id: 'st_a', name: 'A', createdAt: '2026-09-01T00:00:00.000Z', items: [] }],
});

const pin = (url = 'https://github.com/o/r/pull/1'): StreamOp => ({
  op: 'pin',
  streamId: 'st_a' as StreamId,
  itemId: 'it_1' as ItemId,
  url,
  title: 'T',
  labels: [],
  at: '2026-10-01T00:00:00.000Z',
});

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  store = { lifeos_token: 't', lifeos_repo: 'o/r' };
  responses = [];
  calls = [];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter((k) => k in store)
              .map((k) => [k, store[k]]),
          ),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
        remove: async (key: string) => {
          delete store[key];
        },
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: any) => {
      calls.push({ method: init?.method ?? 'GET', init });
      const next = responses.shift();
      if (!next) throw new Error('unscripted fetch');
      const r = typeof next === 'function' ? await next() : next;
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        statusText: '',
        headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? (r.etag ?? null) : null) },
        json: async () => r.body ?? {},
      };
    }),
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const load = () => import('./streams-store');
const puts = () => calls.filter((c) => c.method === 'PUT');
const putBody = (i = 0) => JSON.parse(puts()[i].init.body);

describe('streams store', () => {
  it('reads the file once and serves the cache for 15 minutes', async () => {
    responses.push({ status: 200, body: fileBody(streamsJson), etag: 'e1' });
    const { loadStreams } = await load();
    const a = await loadStreams();
    const b = await loadStreams();
    expect(calls).toHaveLength(1);
    expect(a?.sha).toBe('sha1');
    expect(b).toEqual(a);
  });

  it('replays the ETag and keeps the cache on 304', async () => {
    responses.push({ status: 200, body: fileBody(streamsJson), etag: 'e1' }, { status: 304 });
    const { loadStreams } = await load();
    const first = await loadStreams();
    const second = await loadStreams({ force: true });
    expect(calls[1].init.headers['If-None-Match']).toBe('e1');
    expect(second?.state).toEqual(first?.state);
    expect(second?.sha).toBe('sha1');
  });

  it('treats a missing file as empty streams', async () => {
    responses.push({ status: 404 });
    const { loadStreams } = await load();
    const cache = await loadStreams();
    expect(cache?.sha).toBeNull();
    expect(cache?.state.ok && cache.state.file.streams).toEqual([]);
  });

  it('returns undefined and refuses ops when signed out', async () => {
    delete store.lifeos_token;
    const { loadStreams, enqueueStreamOps } = await load();
    expect(await loadStreams()).toBeUndefined();
    await expect(enqueueStreamOps([pin()])).rejects.toThrow('Sign in to kaihuman to save streams');
  });

  it('marks a broken file read-only and refuses ops', async () => {
    responses.push({ status: 200, body: fileBody('{ nope') });
    const { enqueueStreamOps, loadStreams } = await load();
    await expect(enqueueStreamOps([pin()])).rejects.toThrow(
      'The streams file is read-only until it is valid JSON again',
    );
    expect((await loadStreams())?.state.ok).toBe(false);
    expect(store.streamsWriteQueue).toBeUndefined();
  });

  it('flushes queued ops in one commit against the sha', async () => {
    responses.push(
      { status: 200, body: fileBody(streamsJson, 'sha1') },
      { status: 200, body: fileBody(streamsJson, 'sha1') },
      { status: 200, body: { content: { sha: 'sha2' } } },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([pin()]);
    expect(await flushStreams()).toEqual({ saved: true });
    expect(puts()).toHaveLength(1);
    const body = putBody();
    expect(body.sha).toBe('sha1');
    expect(dec(body.content)).toContain('https://github.com/o/r/pull/1');
    expect(store.streamsWriteQueue).toEqual([]);
    expect((store.streamsCache as any).sha).toBe('sha2');
  });

  it('survives a worker restart', async () => {
    responses.push({ status: 200, body: fileBody(streamsJson) });
    const first = await load();
    await first.enqueueStreamOps([pin()]);
    vi.resetModules();
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: { content: { sha: 's2' } } },
    );
    const second = await load();
    expect(await second.flushStreams()).toEqual({ saved: true });
    expect(dec(putBody().content)).toContain('pull/1');
  });

  it('rereads and reapplies after a conflict', async () => {
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson, 'sha1') },
      { status: 409 },
      { status: 200, body: fileBody(streamsJson, 'sha9') },
      { status: 200, body: { content: { sha: 'sha10' } } },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([pin()]);
    expect(await flushStreams()).toEqual({ saved: true });
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(3);
    expect(putBody(1).sha).toBe('sha9');
    expect(store.streamsWriteQueue).toEqual([]);
  });

  it('keeps the queue after three conflicts', async () => {
    responses.push({ status: 200, body: fileBody(streamsJson) });
    for (let i = 0; i < 4; i++)
      responses.push({ status: 200, body: fileBody(streamsJson) }, { status: 409 });
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([pin()]);
    expect(await flushStreams()).toEqual({ saved: false });
    expect(store.streamsWriteQueue).toEqual([pin()]);
    expect(store.streamsSaveError).toEqual(expect.any(String));
  });

  it('applies the rest of the queue when one op no longer matches', async () => {
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: { content: { sha: 's2' } } },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([
      { op: 'markDone', itemId: 'it_missing' as ItemId, at: '2026-10-01T00:00:00.000Z' },
      pin(),
    ]);
    expect(await flushStreams()).toEqual({ saved: true });
    expect(dec(putBody().content)).toContain('pull/1');
  });

  it('drops an op that cannot be applied and saves the rest', async () => {
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: { content: { sha: 's2' } } },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([pin('javascript:alert(1)'), pin()]);
    expect(await flushStreams()).toEqual({ saved: true });
    const content = dec(putBody().content);
    expect(content).toContain('pull/1');
    expect(content).not.toContain('javascript:');
    expect(store.streamsWriteQueue).toEqual([]);
    expect(store.streamsSaveError).toEqual(expect.any(String));
  });

  it('does not commit when no op changes the file, and clears those ops', async () => {
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson, 'sha7') },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([
      { op: 'markDone', itemId: 'it_missing' as ItemId, at: '2026-10-01T00:00:00.000Z' },
    ]);
    expect(await flushStreams()).toEqual({ saved: true });
    expect(puts()).toHaveLength(0);
    expect(store.streamsWriteQueue).toEqual([]);
    expect((store.streamsCache as any).sha).toBe('sha7');
  });

  it('keeps ops queued during a flush', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson) },
      async () => {
        await gate;
        return { status: 200, body: { content: { sha: 's2' } } };
      },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    await enqueueStreamOps([pin()]);
    const flush = flushStreams();
    await vi.waitFor(() => expect(puts()).toHaveLength(1));
    const second = { ...pin('https://github.com/o/r/pull/2'), itemId: 'it_2' as ItemId };
    await enqueueStreamOps([second]);
    release();
    expect(await flush).toEqual({ saved: true });
    expect(store.streamsWriteQueue).toEqual([second]);
  });

  it('flushes on its own three seconds after the last op', async () => {
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: { content: { sha: 's2' } } },
    );
    const { enqueueStreamOps } = await load();
    await enqueueStreamOps([pin()]);
    expect(puts()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(puts()).toHaveLength(1);
  });

  it('keeps both ops of two concurrent enqueues', async () => {
    // Both calls miss the cache and read the file.
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson) },
    );
    const { enqueueStreamOps } = await load();
    const a = pin();
    const b = { ...pin('https://github.com/o/r/pull/2'), itemId: 'it_2' as ItemId };
    await Promise.all([enqueueStreamOps([a]), enqueueStreamOps([b])]);
    expect(store.streamsWriteQueue).toEqual([a, b]);
  });

  it('neither loses nor repeats an op enqueued while the commit finishes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    responses.push(
      { status: 200, body: fileBody(streamsJson) },
      { status: 200, body: fileBody(streamsJson) },
      async () => {
        await gate;
        return { status: 200, body: { content: { sha: 's2' } } };
      },
    );
    const { enqueueStreamOps, flushStreams } = await load();
    const a = pin();
    const b = { ...pin('https://github.com/o/r/pull/2'), itemId: 'it_2' as ItemId };
    await enqueueStreamOps([a]);
    const flush = flushStreams();
    await vi.waitFor(() => expect(puts()).toHaveLength(1));
    release();
    await Promise.all([flush, enqueueStreamOps([b])]);
    expect(store.streamsWriteQueue).toEqual([b]);
  });
});
