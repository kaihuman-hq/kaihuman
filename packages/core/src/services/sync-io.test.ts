import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '../stores/auth.store.js';
import { GithubService } from './github.service.js';
import { InMemoryGithubService } from './github.service.memory.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const headerOf = (call: unknown[] | undefined, name: string) => {
  const first = call?.[0];
  const init = call?.[1] as RequestInit | undefined;
  const h = new Headers(first instanceof Request ? first.headers : init?.headers);
  return h.get(name);
};

describe('GithubService cache bypass', () => {
  const fetchMock = vi.fn();
  let prevToken: string | null;

  beforeEach(() => {
    prevToken = authStore.token.value;
    authStore.token.value = 'test-token';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    authStore.token.value = prevToken;
    vi.unstubAllGlobals();
  });

  const file = { type: 'file', sha: 's1', content: btoa('hi'), encoding: 'base64' };

  it('reads a file without ref with cache: no-store', async () => {
    fetchMock.mockResolvedValue(json(file));
    const res = await new GithubService().getFileContent('o', 'r', 'a.md');
    expect(res).toEqual({ content: 'hi', sha: 's1' });
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('leaves a commit-sha ref read cacheable', async () => {
    fetchMock.mockResolvedValue(json(file));
    await new GithubService().getFileContent('o', 'r', 'a.md', { ref: 'abc' });
    expect(fetchMock.mock.calls[0]?.[1]?.cache).not.toBe('no-store');
  });

  it('reads the branch head in fetchRepoTree with cache: no-store', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ object: { sha: 'head1' } }))
      .mockResolvedValueOnce(json({ sha: 'head1', tree: [], truncated: false }));
    await new GithubService().fetchRepoTree('o', 'r', 'main');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('git/ref');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('reads the branch head in renameFolder with cache: no-store', async () => {
    // A cached head (e.g. from before a CLI commit) made the migration commit a non-fast-forward.
    fetchMock
      .mockResolvedValueOnce(json({ object: { sha: 'head1' } }))
      .mockResolvedValueOnce(json({ sha: 'head1', tree: { sha: 't1' } }))
      .mockResolvedValueOnce(json({ sha: 't2' }))
      .mockResolvedValueOnce(json({ sha: 'c2' }))
      .mockResolvedValueOnce(json({ object: { sha: 'c2' } }));
    await new GithubService().renameFolder('o', 'r', 'main', '.lifeos', '.kh', [
      { path: '.lifeos/a.todos.md', mode: '100644', type: 'blob', sha: 'b1' },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('git/ref');
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('revalidates the branch head with If-None-Match and serves the cached sha on 304', async () => {
    const svc = new GithubService();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ object: { sha: 'head1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json', etag: '"abc"' },
      }),
    );
    expect(await svc.getHeadSha('o', 'r', 'main')).toBe('head1');
    expect(headerOf(fetchMock.mock.calls[0], 'if-none-match')).toBeNull();

    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 304, headers: { etag: '"abc"' } }),
    );
    expect(await svc.getHeadSha('o', 'r', 'main')).toBe('head1');
    expect(headerOf(fetchMock.mock.calls[1], 'if-none-match')).toBe('"abc"');
    expect(fetchMock.mock.calls[1]?.[1]?.cache).toBe('no-store');
  });

  it('still reports a real error and keeps ETags per branch', async () => {
    const svc = new GithubService();
    fetchMock.mockResolvedValueOnce(json({ message: 'Not Found' }, 404));
    await expect(svc.getHeadSha('o', 'r', 'main')).rejects.toMatchObject({ status: 404 });
  });
});

describe('InMemoryGithubService write semantics', () => {
  let svc: InMemoryGithubService;
  beforeEach(() => {
    svc = new InMemoryGithubService();
  });

  it('refuses a stale sha with 409 and a missing sha for an existing file with 422', async () => {
    const v1 = await svc.saveFile('o', 'r', 'a.md', 'one', 'm');
    await svc.saveFile('o', 'r', 'a.md', 'two', 'm', v1.content.sha);
    await expect(
      svc.saveFile('o', 'r', 'a.md', 'three', 'm', v1.content.sha),
    ).rejects.toMatchObject({ status: 409 });
    await expect(svc.saveFile('o', 'r', 'a.md', 'three', 'm')).rejects.toMatchObject({
      status: 422,
    });
    await expect(svc.saveFile('o', 'r', 'a.md', 'three', 'm', '')).rejects.toMatchObject({
      status: 422,
    });
    expect((await svc.getFileContent('o', 'r', 'a.md')).content).toBe('two');
  });

  it('serves an overwritten blob by its old sha', async () => {
    const v1 = await svc.saveFile('o', 'r', 'a.md', 'one', 'm');
    await svc.saveFile('o', 'r', 'a.md', 'two', 'm', v1.content.sha);
    const bytes = await svc.getBlobBytes('o', 'r', v1.content.sha);
    expect(new TextDecoder().decode(bytes)).toBe('one');
  });

  it('serves stale by-path reads while setStaleReads is on', async () => {
    const v1 = await svc.saveFile('o', 'r', 'a.md', 'one', 'm');
    svc.setStaleReads(true);
    await svc.saveFile('o', 'r', 'a.md', 'two', 'm', v1.content.sha);
    expect((await svc.getFileContent('o', 'r', 'a.md')).content).toBe('one');
    svc.setStaleReads(false);
    expect((await svc.getFileContent('o', 'r', 'a.md')).content).toBe('two');
  });
});

describe('upsertRepoFile', () => {
  it('memory: a function merges into a concurrent write and drops nothing', async () => {
    const svc = new InMemoryGithubService();
    await svc.saveFile('o', 'r', 'c.json', 'a', 'm');
    const realSave = svc.saveFile.bind(svc);
    let raced = false;
    vi.spyOn(svc, 'saveFile').mockImplementation(async (o, r, p, c, m, sha) => {
      if (!raced) {
        raced = true;
        // Another device writes between our read and our PUT.
        await realSave(o, r, p, 'a+b', 'other', sha);
      }
      return realSave(o, r, p, c, m, sha);
    });
    const seen: (string | null)[] = [];
    await svc.upsertRepoFile(
      'o',
      'r',
      'c.json',
      (cur) => {
        seen.push(cur);
        return `${cur}+c`;
      },
      'm',
    );
    expect(seen).toEqual(['a', 'a+b']);
    expect((await svc.getFileContent('o', 'r', 'c.json')).content).toBe('a+b+c');
  });

  it('memory: a string overwrites, creates, and skips an unchanged PUT', async () => {
    const svc = new InMemoryGithubService();
    await svc.upsertRepoFile('o', 'r', 'g.txt', 'x', 'm');
    await svc.upsertRepoFile('o', 'r', 'g.txt', 'y', 'm');
    expect((await svc.getFileContent('o', 'r', 'g.txt')).content).toBe('y');
    const save = vi.spyOn(svc, 'saveFile');
    await svc.upsertRepoFile('o', 'r', 'g.txt', 'y', 'm');
    expect(save).not.toHaveBeenCalled();
  });

  it('real: retries on 409 with a recomputed merge, gives up after 3 attempts', async () => {
    const svc = new GithubService();
    let remote = 'a';
    let n = 0;
    vi.spyOn(svc, 'getFileContent').mockImplementation(async () => ({
      content: remote,
      sha: `s${++n}`,
    }));
    const save = vi
      .spyOn(svc, 'saveFile')
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
      .mockResolvedValue({} as never);
    // The first attempt loses the race; by the second the other writer's change is visible.
    const origGet = svc.getFileContent as unknown as ReturnType<typeof vi.fn>;
    origGet.mockImplementationOnce(async () => ({ content: 'a', sha: 's0' }));
    origGet.mockImplementationOnce(async () => ({ content: 'a+b', sha: 's1' }));
    await svc.upsertRepoFile('o', 'r', 'p', (cur) => `${cur}+c`, 'm');
    expect(save.mock.calls.map((c) => [c[3], c[5]])).toEqual([
      ['a+c', 's0'],
      ['a+b+c', 's1'],
    ]);
    remote = 'z';

    save.mockReset().mockRejectedValue(Object.assign(new Error('x'), { status: 422 }));
    await expect(svc.upsertRepoFile('o', 'r', 'p', 'new', 'm')).rejects.toMatchObject({
      status: 422,
    });
    expect(save).toHaveBeenCalledTimes(3);
  });
});
