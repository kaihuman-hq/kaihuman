import type { StreamsFile } from '@kaihuman/formats';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../bookmarks';
import { draftBookmark, findDuplicates, tidyTitle } from './bookmark-draft';

const fakeModel = (answer: unknown, availability = 'available') => {
  const prompts: { input: string; options?: { responseConstraint?: object } }[] = [];
  const model = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async () => ({
      prompt: async (input: string, options?: { responseConstraint?: object }) => {
        prompts.push({ input, options });
        return JSON.stringify(answer);
      },
      destroy: () => {},
    })),
  };
  vi.stubGlobal('LanguageModel', model);
  return { model, prompts };
};

const stubSettings = (enrichment = true) =>
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({ aiSettings: { enrichment } }) } },
  });

const bookmark = (id: string, url: string, title: string, tags: string[] = []): Bookmark => ({
  id,
  url,
  title,
  tags,
  createdAt: '',
  updatedAt: '',
  useCount: 0,
  lastUsedAt: '',
  pinned: false,
});

const NOW = '2026-10-15T10:00:00.000Z';
const streams = (url: string, title: string): StreamsFile => ({
  version: 1,
  updatedAt: NOW,
  invalidStreams: [],
  extra: {},
  streams: [
    {
      id: 'st_1' as never,
      name: 'Work',
      createdAt: NOW,
      invalidItems: [],
      extra: {},
      items: [{ id: 'it_1' as never, url, title, addedAt: NOW, labels: [], extra: {} }],
    },
  ],
});

beforeEach(() => stubSettings());
afterEach(() => vi.unstubAllGlobals());

describe('tidyTitle', () => {
  it('tidyTitle strips site suffixes and counters', () => {
    expect(
      tidyTitle(
        '(3) Fix auth race by x · Pull Request #12 · acme/web · GitHub',
        'https://github.com/acme/web/pull/12',
      ),
    ).toBe('Fix auth race by x · Pull Request #12 · acme/web');
    expect(tidyTitle('Intro - Vitest', 'https://vitest.dev/guide')).toBe('Intro');
    expect(tidyTitle('Release notes | Example', 'https://www.example.com/x')).toBe('Release notes');
  });

  it('keeps a suffix that is not the site', () => {
    expect(tidyTitle('Cats - Dogs', 'https://example.com')).toBe('Cats - Dogs');
  });
});

describe('draftBookmark', () => {
  const page = { url: 'https://example.com/a', title: 'Deploy guide - Example' };

  it('draft tags come only from known tags', async () => {
    const { prompts } = fakeModel({ title: 'Deploy guide', tags: ['ops', 'invented'] });
    const draft = await draftBookmark(page, ['ops', 'docs']);
    expect(draft.tags).toEqual(['ops']);
    const schema = prompts[0]?.options?.responseConstraint as any;
    expect(schema.properties.tags.items.enum).toEqual(['ops', 'docs']);
    expect(schema.properties.title.maxLength).toBe(60);
  });

  it('environment uses the rule first, then the model', async () => {
    const ruled = fakeModel({ title: 'Control', tags: [], environment: 'DEV' });
    const first = await draftBookmark({ url: 'https://x.io', title: 'Control PROD' }, []);
    expect(first.environment).toBe('PROD');
    expect((ruled.prompts[0]?.options?.responseConstraint as any).properties.environment).toBe(
      undefined,
    );
    fakeModel({ title: 'Control', tags: [], environment: 'INT' });
    const second = await draftBookmark({ url: 'https://x.io', title: 'Control' }, []);
    expect(second.environment).toBe('INT');
  });

  it('returns the rule draft for an invalid answer, no model or enrichment off', async () => {
    fakeModel({ title: 'x'.repeat(200), tags: [] });
    expect((await draftBookmark(page, [])).title).toBe('Deploy guide');
    vi.unstubAllGlobals();
    stubSettings();
    expect(await draftBookmark(page, ['ops'])).toEqual({
      title: 'Deploy guide',
      tags: [],
      environment: null,
    });
    const { model } = fakeModel({ title: 'Other', tags: [] });
    stubSettings(false);
    expect((await draftBookmark(page, [])).title).toBe('Deploy guide');
    expect(model.create).not.toHaveBeenCalled();
  });
});

describe('findDuplicates', () => {
  it('exact duplicate found by normalised URL without the model', async () => {
    const { model } = fakeModel({ same: [] });
    const found = await findDuplicates(
      { url: 'https://example.com/a/?utm_source=x#top', title: 'A' },
      {
        bookmarks: [bookmark('b1', 'https://example.com/a', 'Saved A')],
        readLater: [
          {
            id: 'r',
            url: 'https://example.com/a',
            status: 'new',
            name: 'RL',
            tags: [],
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        streams: streams('https://example.com/a', 'In stream'),
      },
    );
    expect(found.map((d) => [d.kind, d.exact])).toEqual([
      ['bookmark', true],
      ['read-later', true],
      ['stream', true],
    ]);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('near duplicate confirmed by the model from the top 5 title matches on the same host', async () => {
    const same = Array.from({ length: 7 }, (_, i) =>
      bookmark(`b${i}`, `https://example.com/p${i}`, `Deploy guide part ${i}`),
    );
    const other = bookmark('o', 'https://other.com/x', 'Deploy guide');
    const { prompts } = fakeModel({ same: ['1'] });
    const found = await findDuplicates(
      { url: 'https://example.com/new', title: 'Deploy guide' },
      { bookmarks: [...same, other], readLater: [], streams: null },
    );
    expect(found).toEqual([
      {
        kind: 'bookmark',
        title: 'Deploy guide part 0',
        url: 'https://example.com/p0',
        exact: false,
      },
    ]);
    expect((prompts[0]?.options?.responseConstraint as any).properties.same.items.enum).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);
    expect(prompts[0]?.input).not.toContain('other.com');
  });

  it('gives only exact matches when the model is missing', async () => {
    const data = { bookmarks: [], readLater: [], streams: null };
    expect(await findDuplicates({ url: 'https://a.com', title: 'A' }, data)).toEqual([]);
  });
});
