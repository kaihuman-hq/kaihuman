import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  emptyStreams,
  isSafeUrl,
  itemRefOf,
  newItemId,
  newStreamId,
  normalizeItemUrl,
  parseStreams,
  type StreamsFile,
  serializeStreams,
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
