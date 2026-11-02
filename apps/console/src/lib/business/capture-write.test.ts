import { loadBusinessRepo } from '@kaihuman/formats/business';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFixtureRepo } from './fixture.test-helper';

const writes = vi.hoisted(() => ({ writeBusiness: vi.fn() }));
vi.mock('./write', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./write')>()),
  writeBusiness: writes.writeBusiness,
}));

const { businessClientSlugs } = await import('./load');
const { runBusinessCapture } = await import('./capture-write');

const target = { full_name: 'me/biz', default_branch: 'main' };
const repo = loadBusinessRepo(loadFixtureRepo());
const blob = (path: string) => ({ path, type: 'blob' as const, sha: 's', url: '' });

/** Runs the builder against the fixture repo and reports what would be committed. */
const runBuilder = () =>
  writes.writeBusiness.mockImplementation(async (_t, build) => {
    const r = await build({ repo, headSha: 'h', tree: [], read: async () => null });
    return r.ok ? { ok: true, value: { commitSha: 'c' } } : r;
  });

beforeEach(() => vi.clearAllMocks());

describe('businessClientSlugs', () => {
  it('lists each client folder once, from paths alone', () => {
    const tree = [
      blob('.kh/business/clients/beta-ag/client.yaml'),
      blob('.kh/business/clients/acme-gmbh/client.yaml'),
      blob('.kh/business/clients/acme-gmbh/todos.todos.md'),
      blob('.kh/business/business.yaml'),
      blob('notes/clients/other/x.md'),
    ];
    expect(businessClientSlugs(tree as never)).toEqual(['acme-gmbh', 'beta-ag']);
  });
});

describe('runBusinessCapture', () => {
  it('stop-timer opens the prefilled form and writes nothing', async () => {
    const navigate = vi.fn();
    const out = await runBusinessCapture(target, { kind: 'stop-timer' }, navigate);
    expect(out.ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/business/time/new?from=timer');
    expect(writes.writeBusiness).not.toHaveBeenCalled();
  });

  it('writes a client todo through writeBusiness', async () => {
    runBuilder();
    const out = await runBusinessCapture(
      target,
      { kind: 'todo', client: 'acme-gmbh' as never, text: 'send draft' },
      vi.fn(),
    );
    expect(out).toEqual({ ok: true, message: 'Todo added for acme-gmbh' });
    expect(writes.writeBusiness).toHaveBeenCalledTimes(1);
  });

  it('starts a timer, and reports a refusal without throwing', async () => {
    runBuilder();
    const started = await runBusinessCapture(
      target,
      { kind: 'start-timer', client: 'acme-gmbh' as never },
      vi.fn(),
    );
    expect(started).toEqual({ ok: true, message: 'Timer started for acme-gmbh' });

    writes.writeBusiness.mockResolvedValue({
      ok: false,
      issues: [{ path: 'timer', message: 'A timer is already running for acme-gmbh.' }],
    });
    const refused = await runBusinessCapture(
      target,
      { kind: 'start-timer', client: 'acme-gmbh' as never },
      vi.fn(),
    );
    expect(refused).toEqual({ ok: false, message: 'A timer is already running for acme-gmbh.' });
  });

  it('turns a thrown write error into the write error message', async () => {
    writes.writeBusiness.mockRejectedValue(new Error('offline'));
    const out = await runBusinessCapture(
      target,
      { kind: 'log', client: 'acme-gmbh' as never, text: 'x' },
      vi.fn(),
    );
    expect(out).toEqual({ ok: false, message: 'Saving failed, nothing was written: offline' });
  });
});
