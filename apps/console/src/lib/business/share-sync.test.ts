import { EVENTS_PATH, type LinkRecord, type Ulid } from '@kaihuman/formats/business';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
vi.mock('./write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./write')>()),
  writeBusiness: writes.writeBusiness,
}));

import type { ShareApi, SharedEvent } from './share';
import { downloadEvents, syncDownloads } from './share-sync';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';
const link = (token: string, doc: string, id: string): LinkRecord => ({
  id: id as Ulid,
  doc,
  url: `https://docs.kaihuman.com/d/${token}#${'k'.repeat(43)}`,
  created: '2026-11-01T00:00:00.000Z',
});
const LINKS = [link(TOKEN, 'RE-2026-0001', '01M50ARQ007CHPV05AFMSY38DJ')];
const ev = (id: string, at: string, token = TOKEN): SharedEvent => ({
  id,
  token,
  label: 'RE-2026-0001',
  at,
  client: 'browser',
});
const E1 = '01M50ARQ007CHPV05AFMSY38D1';
const E2 = '01M50ARQ007CHPV05AFMSY38D2';
const EXISTING = `{"id":"${E1}","at":"2026-11-02T10:00:00.000Z","doc":"RE-2026-0001","type":"downloaded","note":"bot"}\n`;
const target = { full_name: 'me/biz', default_branch: 'main' } as never;

describe('downloadEvents', () => {
  it('maps a token to its document and keeps the client class as note', () => {
    expect(downloadEvents(null, [ev(E2, '2026-11-02T11:00:00.000Z')], LINKS)).toEqual([
      {
        id: E2,
        at: '2026-11-02T11:00:00.000Z',
        doc: 'RE-2026-0001',
        type: 'downloaded',
        note: 'browser',
      },
    ]);
  });

  it('skips ids already in the events file and repeats within the answer', () => {
    const got = downloadEvents(
      EXISTING,
      [
        ev(E1, '2026-11-02T10:00:00.000Z'),
        ev(E2, '2026-11-02T11:00:00.000Z'),
        ev(E2, '2026-11-02T11:00:00.000Z'),
      ],
      LINKS,
    );
    expect(got.map((e) => e.id)).toEqual([E2]);
  });

  it('skips events of tokens that have no link record', () => {
    expect(
      downloadEvents(null, [ev(E2, '2026-11-02T11:00:00.000Z', 'B'.repeat(22))], LINKS),
    ).toEqual([]);
  });
});

describe('syncDownloads', () => {
  const api = (events: SharedEvent[]) => {
    const fn = vi.fn(async (_since?: string) => events);
    return { api: { events: fn } as unknown as ShareApi, fn };
  };
  const run = (files: Record<string, string>) =>
    writes.writeBusiness.mockImplementation(async (_t, build) => {
      const built = await build({
        repo: { links: LINKS },
        read: async (p: string) => files[p] ?? null,
      });
      if (built.ok) {
        expect(built.value.changes[EVENTS_PATH]).toBeDefined();
        lastWrite = built.value;
      }
      return built.ok ? { ok: true, value: { commitSha: 'c' } } : built;
    });
  let lastWrite: { changes: Record<string, string>; message: string } | null;
  beforeEach(() => {
    vi.clearAllMocks();
    lastWrite = null;
  });

  it('asks from 10 minutes before the latest download, so late server commits are caught', async () => {
    run({ [EVENTS_PATH]: EXISTING });
    const { api: a, fn } = api([]);
    await syncDownloads(target, a);
    expect(fn).toHaveBeenCalledWith('2026-11-02T09:50:00.000Z');
  });

  it('asks for everything when the repo has no download yet', async () => {
    run({});
    const { api: a, fn } = api([]);
    await syncDownloads(target, a);
    expect(fn).toHaveBeenCalledWith(undefined);
  });

  it('makes no commit when nothing is new', async () => {
    run({ [EVENTS_PATH]: EXISTING });
    const { api: a } = api([ev(E1, '2026-11-02T10:00:00.000Z')]);
    expect(await syncDownloads(target, a)).toEqual({ added: 0 });
    expect(lastWrite).toBeNull();
  });

  it('appends the new events in one commit', async () => {
    run({ [EVENTS_PATH]: EXISTING });
    const { api: a } = api([
      ev(E1, '2026-11-02T10:00:00.000Z'),
      ev(E2, '2026-11-02T11:00:00.000Z'),
    ]);
    expect(await syncDownloads(target, a)).toEqual({ added: 1 });
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
    expect(lastWrite?.message).toBe('business: 1 downloads');
    const lines = (lastWrite?.changes[EVENTS_PATH] ?? '').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(EXISTING.trimEnd());
    expect(JSON.parse(lines[1] ?? '')).toMatchObject({
      id: E2,
      type: 'downloaded',
      note: 'browser',
    });
  });

  it("pages past a full page of other repositories' tokens (S9)", async () => {
    run({});
    const UNKNOWN = 'B'.repeat(22);
    const full = Array.from({ length: 500 }, (_, i) =>
      ev(
        `01M50ARQ00${String(i).padStart(16, '0')}`,
        `2026-11-02T10:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
        UNKNOWN,
      ),
    );
    const last = full[499]?.at ?? '';
    const fn = vi
      .fn<(since?: string) => Promise<SharedEvent[]>>()
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([ev(E2, '2026-11-02T12:00:00.000Z')]);
    expect(await syncDownloads(target, { events: fn } as unknown as ShareApi)).toEqual({
      added: 1,
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[1]?.[0]).toBe(new Date(Date.parse(last) - 1).toISOString());
    expect(lastWrite?.changes[EVENTS_PATH]).toContain(E2);
  });

  it('stops after 20 pages', async () => {
    run({});
    const full = Array.from({ length: 500 }, (_, i) =>
      ev(`01M50ARQ00${String(i).padStart(16, '0')}`, '2026-11-02T10:00:00.000Z', 'B'.repeat(22)),
    );
    const fn = vi.fn(async (_since?: string) => full);
    expect(await syncDownloads(target, { events: fn } as unknown as ShareApi)).toEqual({
      added: 0,
    });
    expect(fn).toHaveBeenCalledTimes(20);
  });

  it('re-reads and re-dedupes when the commit is retried after a conflict', async () => {
    const winner = `${EXISTING}{"id":"${E2}","at":"2026-11-02T11:00:00.000Z","doc":"RE-2026-0001","type":"downloaded","note":"browser"}\n`;
    const builds: (string | null)[] = [];
    writes.writeBusiness.mockImplementation(async (_t, build) => {
      for (const text of [EXISTING, winner]) {
        const built = await build({ repo: { links: LINKS }, read: async () => text });
        builds.push(built.ok ? (built.value.changes[EVENTS_PATH] ?? null) : null);
      }
      return { ok: true, value: { commitSha: 'c' } };
    });
    const { api: a, fn } = api([ev(E2, '2026-11-02T11:00:00.000Z')]);
    await syncDownloads(target, a);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(builds[0]).toContain(E2);
    expect(builds[1]).toBeNull();
  });
});
