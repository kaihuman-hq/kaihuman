import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyOp,
  applyOps,
  emptyStreams,
  findItemByUrl,
  type ItemId,
  isSafeUrl,
  itemRefOf,
  newItemId,
  newStreamId,
  normalizeItemUrl,
  parseStreams,
  type StreamId,
  type StreamOp,
  type StreamsFile,
  serializeStreams,
  streamLabels,
} from './streams.js';

describe('itemRefOf', () => {
  it('reads PRs and issues, with any suffix', () => {
    expect(itemRefOf('https://github.com/acme/api/pull/412/files')).toEqual({
      kind: 'github-pr',
      owner: 'acme',
      repo: 'api',
      number: 412,
      key: 'acme/api#412',
    });
    expect(itemRefOf('https://github.com/acme/api/issues/7#issuecomment-1')?.kind).toBe(
      'github-issue',
    );
  });

  it('treats Slack, Claude and other pages as links', () => {
    expect(itemRefOf('https://acme.slack.com/archives/C04/p1728896')).toEqual({
      kind: 'link',
      host: 'acme.slack.com',
    });
    expect(itemRefOf('https://claude.ai/code/session_01')).toEqual({
      kind: 'link',
      host: 'claude.ai',
    });
    expect(itemRefOf('https://github.com/acme/api')).toEqual({
      kind: 'link',
      host: 'github.com',
    });
  });

  it('refuses javascript:, file: and garbage', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
      expect(itemRefOf(url)).toBeNull();
    }
  });
});

describe('isSafeUrl', () => {
  it('accepts only http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('normalizeItemUrl', () => {
  it('normalizes every spelling of one PR to the same key', () => {
    const spellings = [
      'https://github.com/acme/api/pull/12',
      'https://github.com/acme/api/pull/12/',
      'https://github.com/acme/api/pull/12/files',
      'https://github.com/acme/api/pull/12#discussion_r1',
      'https://github.com/acme/api/pull/12?w=1',
      'https://www.github.com/Acme/API/pull/12',
    ];
    expect(new Set(spellings.map(normalizeItemUrl))).toEqual(
      new Set(['https://github.com/acme/api/pull/12']),
    );
  });

  it('drops the fragment, tracking parameters and a trailing slash from links', () => {
    expect(normalizeItemUrl('https://example.com/a/?utm_source=x&id=3&fbclid=y#top')).toBe(
      'https://example.com/a?id=3',
    );
  });

  it('keeps route-like fragments so hash-routed pages stay distinct', () => {
    const a = 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQ1';
    const b = 'https://mail.google.com/mail/u/0/#inbox/FMfcgzQ2';
    expect(normalizeItemUrl(a)).toBe(a);
    expect(normalizeItemUrl(b)).toBe(b);
    expect(normalizeItemUrl('https://app.example.com/#!/board/7')).toBe(
      'https://app.example.com/#!/board/7',
    );
  });

  it('still drops plain anchors', () => {
    expect(normalizeItemUrl('https://example.com/docs#section-2')).toBe('https://example.com/docs');
  });

  it('keeps Slack thread parameters', () => {
    const url = 'https://acme.slack.com/archives/C04/p1728896?thread_ts=1728896.1&cid=C04';
    expect(normalizeItemUrl(url)).toBe(url);
  });

  it('returns unsafe URLs unchanged', () => {
    expect(normalizeItemUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('parseStreams / serializeStreams', () => {
  it('round-trips the example from the spec', () => {
    const text = readFileSync(new URL('../fixtures/streams/example.json', import.meta.url), 'utf8');
    const parsed = parseStreams(text);
    expect(parsed.ok).toBe(true);
    // Compared with the canonical layout rather than the file bytes: Biome keeps short arrays
    // on one line in the fixture, JSON.stringify expands them.
    expect(serializeStreams((parsed as { ok: true; file: StreamsFile }).file)).toBe(
      `${JSON.stringify(JSON.parse(text), null, 2)}\n`,
    );
  });

  it('keeps unknown fields and invalid entries', () => {
    const text = JSON.stringify({
      version: 1,
      updatedAt: 'T',
      future: 1,
      streams: [
        {
          id: 'st_a',
          name: 'A',
          createdAt: 'T',
          color: 'red',
          items: [
            { id: 'it_1', url: 'javascript:alert(1)', title: 'x', addedAt: 'T', labels: [] },
            {
              id: 'it_2',
              url: 'https://x.dev',
              title: 'y',
              addedAt: 'T',
              labels: [],
              pinnedBy: 'me',
            },
          ],
        },
        { name: 'no id' },
      ],
    });
    const { file } = parseStreams(text) as { ok: true; file: StreamsFile };
    expect(file.streams[0]?.items.map((i) => i.id)).toEqual(['it_2']);
    const again = JSON.parse(serializeStreams(file));
    expect(again.future).toBe(1);
    expect(again.streams[0].color).toBe('red');
    expect(again.streams[0].items).toHaveLength(2);
    expect(again.streams[0].items[0].pinnedBy).toBe('me');
    expect(again.streams).toHaveLength(2);
  });

  it('reports invalid JSON and a wrong version instead of repairing them', () => {
    expect(parseStreams('{ nope')).toEqual({
      ok: false,
      error: '.kh/browser.streams.json is not valid JSON',
    });
    expect(parseStreams('{"version":2,"streams":[]}')).toEqual({
      ok: false,
      error: '.kh/browser.streams.json has version 2; this extension reads version 1',
    });
  });

  it('makes ids with the right prefixes', () => {
    expect(newStreamId()).toMatch(/^st_[a-z0-9]{8}$/);
    expect(newItemId()).toMatch(/^it_[a-z0-9]{8}$/);
  });

  it('keeps the rejected entries verbatim, after the valid ones', () => {
    const bad = [
      { id: 'it_bad1', url: 'javascript:alert(1)', title: 'x', addedAt: 'T', labels: [] },
      { id: 'it_bad2', url: 'https://x.dev', title: 'x', addedAt: 'T', labels: [1] },
      { id: 'it_bad3', url: 'https://x.dev', title: 'x', addedAt: 'T', labels: [], doneAt: 5 },
      { id: 'it_bad4', url: 'https://x.dev', title: 7, addedAt: 'T', labels: [] },
    ];
    const good = { id: 'it_ok', url: 'https://x.dev', title: 'y', addedAt: 'T', labels: [] };
    const badStreams = [
      { id: 'st_noitems', name: 'N', createdAt: 'T' },
      { id: 'st_name', name: 5, createdAt: 'T', items: [] },
      { id: 'st_created', name: 'N', createdAt: { a: 1 }, items: [] },
      { name: 'no id', createdAt: 'T', items: [] },
      'junk',
    ];
    const text = JSON.stringify({
      version: 1,
      updatedAt: 'T',
      streams: [
        { id: 'st_a', name: 'A', createdAt: 'T', items: [bad[0], good, ...bad.slice(1)] },
        ...badStreams,
      ],
    });
    const { file } = parseStreams(text) as { ok: true; file: StreamsFile };
    expect(file.streams.map((s) => s.id)).toEqual(['st_a']);
    expect(file.invalidStreams).toEqual(badStreams);
    expect(file.streams[0]?.invalidItems).toEqual(bad);
    const again = JSON.parse(serializeStreams(file));
    expect(again.streams[0].items).toEqual([good, ...bad]);
    expect(again.streams.slice(1)).toEqual(badStreams);
  });

  it('refuses a file without a streams array or an updatedAt instead of rewriting it', () => {
    expect(parseStreams('{"version":1,"updatedAt":"T"}')).toEqual({
      ok: false,
      error: '.kh/browser.streams.json is missing a "streams" array',
    });
    expect(parseStreams('{"version":1,"updatedAt":"T","streams":{"a":1}}')).toMatchObject({
      ok: false,
    });
    expect(parseStreams('{"version":1,"updatedAt":3,"streams":[]}')).toEqual({
      ok: false,
      error: '.kh/browser.streams.json is missing "updatedAt"',
    });
  });

  it('builds an empty file', () => {
    expect(emptyStreams('T')).toEqual({
      version: 1,
      updatedAt: 'T',
      streams: [],
      invalidStreams: [],
      extra: {},
    });
  });
});

describe('stream operations', () => {
  const T0 = '2026-10-14T00:00:00Z';
  const A = 'st_a' as StreamId;
  const B = 'st_b' as StreamId;
  const I1 = 'it_1' as ItemId;
  const PR = 'https://github.com/Acme/API/pull/1/';

  const base = (): StreamsFile =>
    applyOps(
      emptyStreams(T0),
      [
        { op: 'addStream', streamId: A, name: ' Alpha ', at: T0 },
        { op: 'addStream', streamId: B, name: 'Beta', at: T0 },
        { op: 'pin', streamId: A, itemId: I1, url: PR, title: 'PR one', labels: ['x'], at: T0 },
      ],
      T0,
    );

  const deepFreeze = <T>(value: T): T => {
    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) deepFreeze(v);
      Object.freeze(value);
    }
    return value;
  };

  const everyOp = (): StreamOp[] => [
    { op: 'addStream', streamId: 'st_c' as StreamId, name: 'C', at: T0 },
    { op: 'renameStream', streamId: A, name: 'Renamed' },
    { op: 'reorderStreams', order: [B, A] },
    {
      op: 'pin',
      streamId: B,
      itemId: 'it_2' as ItemId,
      url: 'https://x.dev/a',
      title: 't',
      labels: [],
      at: T0,
    },
    {
      op: 'pin',
      streamId: B,
      itemId: 'it_9' as ItemId,
      url: PR,
      title: 't',
      labels: ['y'],
      at: T0,
    },
    { op: 'move', itemId: I1, streamId: A, index: 0 },
    { op: 'setLabels', itemId: I1, labels: ['q', 'q', ' '] },
    { op: 'markDone', itemId: I1, at: T0 },
    { op: 'undone', itemId: I1 },
    { op: 'markDone', itemId: I1, at: T0 },
    { op: 'prune', now: '2027-01-01T00:00:00Z' },
    { op: 'remove', itemId: I1 },
    { op: 'deleteStream', streamId: B },
  ];

  it('pins a page into a stream with a normalised url', () => {
    const file = base();
    expect(file.streams[0]?.name).toBe('Alpha');
    expect(file.streams[0]?.items).toEqual([
      {
        id: I1,
        url: 'https://github.com/acme/api/pull/1',
        title: 'PR one',
        addedAt: T0,
        labels: ['x'],
        extra: {},
      },
    ]);
  });

  it('moves an already pinned url instead of duplicating it', () => {
    const next = applyOp(base(), {
      op: 'pin',
      streamId: B,
      itemId: 'it_new' as ItemId,
      url: 'https://github.com/acme/api/pull/1/files',
      title: 'again',
      labels: ['y', 'x'],
      at: '2026-10-15T00:00:00Z',
    });
    const all = next.streams.flatMap((s) => s.items);
    expect(all).toHaveLength(1);
    expect(next.streams[1]?.items[0]).toMatchObject({ id: I1, addedAt: T0, labels: ['x', 'y'] });
    expect(next.streams[1]?.items[0]?.doneAt).toBeUndefined();
    const done = applyOp(base(), { op: 'markDone', itemId: I1, at: T0 });
    const repinned = applyOp(done, {
      op: 'pin',
      streamId: A,
      itemId: I1,
      url: PR,
      title: 't',
      labels: [],
      at: T0,
    });
    expect(repinned.streams[0]?.items[0]?.doneAt).toBeUndefined();
  });

  it('keeps extra, invalidItems and invalidStreams through every op', () => {
    const file = base();
    file.extra = { k: 1 };
    file.invalidStreams = ['s'];
    const s0 = file.streams[0];
    if (!s0) throw new Error('setup');
    s0.invalidItems = ['i'];
    s0.extra = { z: 2 };
    const item = s0.items[0];
    if (!item) throw new Error('setup');
    item.extra = { e: 3 };
    let out = file;
    for (const op of everyOp().filter(
      (o) => o.op !== 'deleteStream' && o.op !== 'remove' && o.op !== 'prune',
    )) {
      out = applyOp(out, op);
    }
    expect(out.extra).toEqual({ k: 1 });
    expect(out.invalidStreams).toEqual(['s']);
    const a = out.streams.find((s) => s.id === A);
    expect(a?.invalidItems).toEqual(['i']);
    expect(a?.extra).toEqual({ z: 2 });
    expect(findItemByUrl(out, PR)?.item.extra).toEqual({ e: 3 });
  });

  it('ignores operations on missing ids', () => {
    const file = base();
    const ghost = 'it_ghost' as ItemId;
    const none = 'st_none' as StreamId;
    for (const op of [
      { op: 'move', itemId: ghost, streamId: A },
      { op: 'move', itemId: I1, streamId: none },
      { op: 'setLabels', itemId: ghost, labels: ['a'] },
      { op: 'markDone', itemId: ghost, at: T0 },
      { op: 'undone', itemId: ghost },
      { op: 'remove', itemId: ghost },
      { op: 'renameStream', streamId: none, name: 'n' },
      { op: 'deleteStream', streamId: none },
      {
        op: 'pin',
        streamId: none,
        itemId: ghost,
        url: 'https://x.dev',
        title: 't',
        labels: [],
        at: T0,
      },
    ] satisfies StreamOp[]) {
      expect(applyOp(file, op)).toEqual(file);
    }
  });

  it('is idempotent', () => {
    for (const op of everyOp()) {
      const once = applyOp(base(), op);
      expect(applyOp(once, op)).toEqual(once);
    }
  });

  it('keeps the first doneAt', () => {
    const first = applyOp(base(), { op: 'markDone', itemId: I1, at: '2026-10-14T01:00:00Z' });
    const second = applyOp(first, { op: 'markDone', itemId: I1, at: '2026-10-14T09:00:00Z' });
    expect(second.streams[0]?.items[0]?.doneAt).toBe('2026-10-14T01:00:00Z');
  });

  it('prunes only items done more than 14 days ago', () => {
    let file = base();
    file = applyOps(
      file,
      [
        {
          op: 'pin',
          streamId: A,
          itemId: 'it_old' as ItemId,
          url: 'https://x.dev/old',
          title: 'o',
          labels: [],
          at: T0,
        },
        {
          op: 'pin',
          streamId: A,
          itemId: 'it_edge' as ItemId,
          url: 'https://x.dev/edge',
          title: 'e',
          labels: [],
          at: T0,
        },
        { op: 'markDone', itemId: 'it_old' as ItemId, at: '2026-09-29T00:00:00Z' },
        { op: 'markDone', itemId: 'it_edge' as ItemId, at: '2026-09-30T00:00:02Z' },
      ],
      T0,
    );
    const pruned = applyOp(file, { op: 'prune', now: '2026-10-14T00:00:01Z' });
    expect(pruned.streams[0]?.items.map((i) => i.id)).toEqual([I1, 'it_edge']);
  });

  it('applyOps prunes at updatedAt and stamps it', () => {
    const file = applyOps(
      base(),
      [{ op: 'markDone', itemId: I1, at: '2026-09-01T00:00:00Z' }],
      '2026-10-14T00:00:01Z',
    );
    expect(file.updatedAt).toBe('2026-10-14T00:00:01Z');
    expect(file.streams[0]?.items).toEqual([]);
  });

  it('reorders listed streams first', () => {
    const c = applyOp(base(), { op: 'addStream', streamId: 'st_c' as StreamId, name: 'C', at: T0 });
    const out = applyOp(c, {
      op: 'reorderStreams',
      order: ['st_c' as StreamId, 'st_x' as StreamId, B],
    });
    expect(out.streams.map((s) => s.id)).toEqual(['st_c', B, A]);
  });

  it('moves to an index within the target stream', () => {
    let file = base();
    file = applyOp(file, {
      op: 'pin',
      streamId: A,
      itemId: 'it_2' as ItemId,
      url: 'https://x.dev/2',
      title: 't',
      labels: [],
      at: T0,
    });
    file = applyOp(file, { op: 'move', itemId: 'it_2' as ItemId, streamId: A, index: 0 });
    expect(file.streams[0]?.items.map((i) => i.id)).toEqual(['it_2', I1]);
  });

  it('refuses an empty stream name and an unsafe url', () => {
    expect(() =>
      applyOp(base(), { op: 'addStream', streamId: 'st_c' as StreamId, name: '  ', at: T0 }),
    ).toThrow(new Error('Give the stream a name'));
    expect(() =>
      applyOp(base(), {
        op: 'pin',
        streamId: A,
        itemId: 'it_2' as ItemId,
        url: 'javascript:alert(1)',
        title: 't',
        labels: [],
        at: T0,
      }),
    ).toThrow(new Error('Only http and https pages can be pinned'));
  });

  it('lists labels across streams, sorted and unique', () => {
    let file = base();
    file = applyOp(file, {
      op: 'pin',
      streamId: B,
      itemId: 'it_2' as ItemId,
      url: 'https://x.dev/2',
      title: 't',
      labels: ['b', 'x', ' a '],
      at: T0,
    });
    expect(streamLabels(file)).toEqual(['a', 'b', 'x']);
  });

  it('finds an item by any spelling of its url', () => {
    expect(findItemByUrl(base(), 'https://github.com/acme/api/pull/1/files')?.stream.id).toBe(A);
    expect(findItemByUrl(base(), 'https://x.dev/none')).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const frozen = deepFreeze(structuredClone(base()));
    for (const op of everyOp()) expect(() => applyOp(frozen, op)).not.toThrow();
    expect(() => applyOps(frozen, everyOp(), T0)).not.toThrow();
  });
});
