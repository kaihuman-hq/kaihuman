import { type GithubRef, githubKey } from '@kaihuman/formats';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkQueries, parseWorkResponses, runWorkQueries } from './graphql.js';
import type { WorkItemStatus } from './types.js';

const ref = (owner: string, repo: string, number: number): GithubRef => ({
  kind: 'github-pr',
  owner,
  repo,
  number,
  key: githubKey(owner, repo, number),
});

const prNode = (over: Record<string, unknown> = {}) => ({
  __typename: 'PullRequest',
  number: 7,
  title: 'Fix it',
  url: 'https://github.com/Acme/Web/pull/7',
  state: 'MERGED',
  updatedAt: '2026-10-01T00:00:00Z',
  isDraft: true,
  reviewDecision: 'CHANGES_REQUESTED',
  mergeable: 'CONFLICTING',
  repository: { owner: { login: 'Acme' }, name: 'Web' },
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
  ...over,
});

const issueNode = {
  __typename: 'Issue',
  number: 3,
  title: 'Bug',
  url: 'https://github.com/Acme/Web/issues/3',
  state: 'OPEN',
  updatedAt: '2026-10-02T00:00:00Z',
  repository: { owner: { login: 'Acme' }, name: 'Web' },
};

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('buildWorkQueries', () => {
  it('puts viewer, six searches and the lookups in the first query', () => {
    const [first, ...rest] = buildWorkQueries([ref('a', 'b', 1), ref('c', 'd', 2)]);
    expect(rest).toEqual([]);
    expect(first.query).toContain('viewer { login }');
    expect(count(first.query, /search\(/g)).toBe(6);
    expect(count(first.query, /first: 50/g)).toBe(6);
    expect(count(first.query, /type: ISSUE/g)).toBe(6);
    expect(count(first.query, /\bp\d+: repository\(/g)).toBe(2);
    expect(first.variables).toEqual({ o0: 'a', r0: 'b', n0: 1, o1: 'c', r1: 'd', n1: 2 });
  });

  it('passes owner, repo and number as variables', () => {
    const [q] = buildWorkQueries([ref('a"b', 'r}', 5)]);
    expect(q.query).not.toContain('a"b');
    expect(q.query).not.toContain('r}');
    expect(q.query).toContain('$o0');
    expect(q.variables).toMatchObject({ o0: 'a"b', r0: 'r}', n0: 5 });
  });

  it('splits more than 50 pinned refs into several queries', () => {
    const refs = Array.from({ length: 120 }, (_, i) => ref('o', 'r', i + 1));
    const qs = buildWorkQueries(refs);
    expect(qs.map((q) => count(q.query, /: repository\(/g))).toEqual([50, 50, 20]);
    expect(qs.map((q) => q.query.includes('search('))).toEqual([true, false, false]);
    expect(qs[1].variables.n0).toBe(51);
  });
});

describe('parseWorkResponses', () => {
  const searchData = (nodes: unknown[]) => ({ nodes });

  it('maps PR and issue fields', () => {
    const pinned = [ref('acme', 'web', 7)];
    const out = parseWorkResponses(
      [
        {
          data: {
            viewer: { login: 'me' },
            reviewRequested: searchData([prNode(), {}]),
            assigned: searchData([issueNode]),
            p0: { issueOrPullRequest: prNode() },
          },
        },
      ],
      pinned,
    );
    expect(out.login).toBe('me');
    const expected: WorkItemStatus = {
      key: githubKey('Acme', 'Web', 7),
      url: 'https://github.com/Acme/Web/pull/7',
      repo: 'Acme/Web',
      number: 7,
      kind: 'pr',
      title: 'Fix it',
      state: 'merged',
      isDraft: true,
      review: 'changes_requested',
      ci: 'failure',
      conflict: true,
      updatedAt: '2026-10-01T00:00:00Z',
    };
    expect(out.searches['review-requested']).toEqual([expected]);
    expect(out.searches.assigned).toEqual([
      {
        key: githubKey('Acme', 'Web', 3),
        url: 'https://github.com/Acme/Web/issues/3',
        repo: 'Acme/Web',
        number: 3,
        kind: 'issue',
        title: 'Bug',
        state: 'open',
        isDraft: false,
        review: null,
        ci: null,
        conflict: false,
        updatedAt: '2026-10-02T00:00:00Z',
      },
    ]);
    expect(out.searches.failing).toEqual([]);
    expect(out.searches.mine).toEqual([]);
    expect(out.pinned[pinned[0].key]).toEqual(expected);
  });

  it('maps CI states', () => {
    const ci = (state?: string) =>
      parseWorkResponses(
        [
          {
            data: {
              mine: searchData([
                prNode({
                  mergeable: 'MERGEABLE',
                  commits: { nodes: [{ commit: { statusCheckRollup: state ? { state } : null } }] },
                }),
              ]),
            },
          },
        ],
        [],
      ).searches.mine[0].ci;
    expect([ci('SUCCESS'), ci('ERROR'), ci('EXPECTED'), ci('PENDING'), ci()]).toEqual([
      'success',
      'failure',
      'pending',
      'pending',
      null,
    ]);
  });

  it('marks missing pinned items not-found', () => {
    const pinned = [ref('a', 'b', 1), ref('a', 'b', 2)];
    const out = parseWorkResponses(
      [
        {
          data: { p0: null, p1: null },
          errors: [
            { type: 'NOT_FOUND', path: ['p0', 'repository'], message: 'nope' },
            { type: 'NOT_FOUND', path: ['p1'], message: 'nope' },
          ],
        },
      ],
      pinned,
    );
    expect(out.pinned[pinned[0].key]).toEqual({
      key: pinned[0].key,
      error: 'not-found',
      org: 'a',
    });
    expect(out.pinned[pinned[1].key]).toEqual({
      key: pinned[1].key,
      error: 'not-found',
      org: 'a',
    });
    expect(out.login).toBe('');
  });

  it('reports a forbidden org once, with the oauth fix', () => {
    const pinned = [ref('Corp', 'a', 1), ref('Corp', 'b', 2)];
    const out = parseWorkResponses(
      [
        {
          data: { p0: null, p1: null },
          errors: [
            { type: 'FORBIDDEN', path: ['p0'], message: 'Resource not accessible' },
            { type: 'FORBIDDEN', path: ['p1'], message: 'Resource not accessible' },
          ],
        },
      ],
      pinned,
    );
    expect(out.pinned[pinned[0].key]).toEqual({
      key: pinned[0].key,
      error: 'forbidden',
      org: 'Corp',
    });
    expect(out.orgProblems).toEqual([
      { org: 'Corp', fix: 'oauth', url: 'https://github.com/settings/applications' },
    ]);
  });

  it('reports a forbidden org once, with the sso fix when the message says SAML', () => {
    const pinned = [ref('Corp', 'a', 1)];
    const out = parseWorkResponses(
      [
        {
          data: { p0: null },
          errors: [
            {
              type: 'FORBIDDEN',
              path: ['p0'],
              message: 'Resource protected by organization SAML enforcement',
            },
          ],
        },
      ],
      pinned,
    );
    expect(out.orgProblems).toEqual([
      { org: 'Corp', fix: 'sso', url: 'https://github.com/orgs/Corp/sso' },
    ]);
  });

  it('keeps the data of a partial response', () => {
    const pinned = [ref('Acme', 'Web', 7), ref('x', 'y', 2)];
    const out = parseWorkResponses(
      [
        {
          data: {
            viewer: { login: 'me' },
            p0: { issueOrPullRequest: prNode() },
            p1: null,
          },
          errors: [{ type: 'FORBIDDEN', path: ['p1'], message: 'no' }],
        },
      ],
      pinned,
    );
    expect('error' in out.pinned[pinned[0].key]).toBe(false);
    expect(out.pinned[pinned[1].key]).toMatchObject({ error: 'forbidden', org: 'x' });
  });

  it('reads later responses with their own alias numbering offset', () => {
    const pinned = Array.from({ length: 51 }, (_, i) => ref('o', 'r', i + 1));
    const out = parseWorkResponses(
      [
        { data: { viewer: { login: 'me' } } },
        { data: { p0: null }, errors: [{ type: 'NOT_FOUND', path: ['p0'], message: 'x' }] },
      ],
      pinned,
    );
    expect(out.login).toBe('me');
    expect(out.pinned[pinned[50].key]).toMatchObject({ error: 'not-found' });
  });
});

describe('failures', () => {
  it('leaves a pinned item out on a transient lookup error', () => {
    const pinned = [ref('a', 'b', 1), ref('a', 'b', 2)];
    const out = parseWorkResponses(
      [
        {
          data: { viewer: { login: 'me' }, p0: null, p1: null },
          errors: [{ type: 'RESOURCE_LIMITS_EXCEEDED', path: ['p0'], message: 'slow' }],
        },
      ],
      pinned,
    );
    expect(out.pinned).toEqual({});
  });

  it('throws when the response has errors and no data', () => {
    expect(() =>
      parseWorkResponses([{ errors: [{ type: 'RATE_LIMITED', message: 'slow down' }] }], []),
    ).toThrow('GitHub GraphQL failed: slow down');
    expect(() => parseWorkResponses([{ data: null, errors: [{ message: 'boom' }] }], [])).toThrow(
      'boom',
    );
  });

  it('throws when a search fails', () => {
    expect(() =>
      parseWorkResponses(
        [
          {
            data: { viewer: { login: 'me' }, assigned: null },
            errors: [{ type: 'INTERNAL', path: ['assigned'], message: 'oops' }],
          },
        ],
        [],
      ),
    ).toThrow('GitHub GraphQL failed: oops');
  });

  it('ignores a forbidden search', () => {
    const out = parseWorkResponses(
      [
        {
          data: { viewer: { login: 'me' }, assigned: null },
          errors: [{ type: 'FORBIDDEN', path: ['assigned'], message: 'no' }],
        },
      ],
      [],
    );
    expect(out.searches.assigned).toEqual([]);
    expect(out.login).toBe('me');
  });

  it('reads issue state from an alias so the fragments do not conflict', () => {
    const [q] = buildWorkQueries([ref('a', 'b', 1)]);
    const issueFragment = q.query.split('... on Issue {')[1].split('}')[0];
    expect(issueFragment).not.toMatch(/(?<!issueState: )\bstate\b/);
    expect(q.query).toContain('issueState: state');
    const out = parseWorkResponses(
      [{ data: { mine: { nodes: [{ ...issueNode, state: undefined, issueState: 'CLOSED' }] } } }],
      [],
    );
    expect(out.searches.mine[0].state).toBe('closed');
  });
});

describe('query and parser agree', () => {
  it('reads a pinned lookup in the shape GitHub returns for the alias', () => {
    const pinned = [ref('Acme', 'Web', 7), ref('Acme', 'Web', 8)];
    const [q] = buildWorkQueries(pinned);
    const aliases = [...q.query.matchAll(/\b(p\d+): repository\(/g)].map((m) => m[1]);
    expect(aliases).toEqual(['p0', 'p1']);
    // GitHub answers `alias: repository(...) { issueOrPullRequest(...) }` as data[alias].issueOrPullRequest.
    const data = Object.fromEntries(
      aliases.map((a, i) => [a, { issueOrPullRequest: prNode({ number: 7 + i }) }]),
    );
    const out = parseWorkResponses([{ data }], pinned);
    expect(Object.keys(out.pinned)).toEqual(pinned.map((r) => r.key));
    expect(out.pinned[pinned[1].key]).toMatchObject({ number: 8, kind: 'pr' });
  });
});

describe('runWorkQueries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts each query and parses the bodies', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { viewer: { login: 'me' } } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await runWorkQueries('tok', []);
    expect(out.login).toBe('me');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/graphql');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'Content-Type': 'application/json',
    });
  });

  it('throws GithubHttpError for a non-2xx answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: '',
        headers: new Headers(),
        json: async () => ({ message: 'Bad credentials' }),
      })),
    );
    await expect(runWorkQueries('tok', [])).rejects.toMatchObject({
      name: 'GithubHttpError',
      status: 401,
    });
  });
});
