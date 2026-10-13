import { newIdea, parseIdea, setIdeaStatus } from '@kaihuman/formats';
import { beforeEach, describe, expect, it } from 'vitest';
import { paletteModes } from './actions.js';
import type { ModeItem, PaletteMode } from './command-palette.js';
import { ideaItems, ideasMode, listedIdeas, parseIdeaQuery } from './ideas.js';
import type { ActionPort, IdeaFile, PaletteRequest } from './protocol.js';

const NOW = new Date(2026, 9, 13, 9, 30);
const now = () => NOW;

let sent: PaletteRequest<'SAVE_IDEA'>[];
let files: IdeaFile[];

const port: ActionPort = {
  send: async (request) => {
    if (request.type === 'LIST_IDEAS') return { ideas: files } as never;
    if (request.type === 'SAVE_IDEA') {
      const save = request as PaletteRequest<'SAVE_IDEA'>;
      sent.push(save);
      return { url: `https://console.example/files/${save.path}` } as never;
    }
    throw new Error(`no answer for ${request.type}`);
  },
};

/** An idea file created `daysAgo` before NOW, with the given status. */
const file = (title: string, daysAgo: number, status?: 'parked'): IdeaFile => {
  const created = new Date(NOW.getTime() - daysAgo * 86_400_000);
  let { path, content } = newIdea(
    { title, product: 'kaihuman' },
    { author: 'claude', now: created },
  );
  if (status) content = setIdeaStatus(content, status, { author: 'claude', now: created });
  return { path, sha: `sha-${path}`, text: content, url: `https://console.example/files/${path}` };
};

const items = (query: string) => ideaItems(port, listedIdeas(files), query, now);
const titles = (list: ModeItem[]) => list.map((item) => item.title);

const run = async (item: ModeItem | undefined) => {
  if (!item?.action?.run) throw new Error(`${item?.title} does not run`);
  return item.action.run([]);
};

beforeEach(() => {
  sent = [];
  files = [
    file('Palette sync', 3),
    file('Voice capture', 1),
    file('Old thing', 0, 'parked'),
    { path: '.kh/ideas/sub/x.md', sha: 's', text: '# Not an idea', url: '' },
  ];
});

describe('parseIdeaQuery', () => {
  const known = new Set(['palette-sync']);

  it('reads `slug: text` as a log line only for a known slug', () => {
    expect(parseIdeaQuery('palette-sync: tried CRDTs', known)).toEqual({
      kind: 'log',
      slug: 'palette-sync',
      text: 'tried CRDTs',
    });
    expect(parseIdeaQuery('  Palette-Sync:  too heavy ', known)).toEqual({
      kind: 'log',
      slug: 'palette-sync',
      text: 'too heavy',
    });
  });

  it('reads anything else as words to search or a new title', () => {
    expect(parseIdeaQuery('', known)).toEqual({ kind: 'list' });
    expect(parseIdeaQuery('other: text', known)).toEqual({ kind: 'search', text: 'other: text' });
    expect(parseIdeaQuery('palette-sync:', known)).toEqual({
      kind: 'search',
      text: 'palette-sync:',
    });
    expect(parseIdeaQuery('palette sync', known)).toEqual({ kind: 'search', text: 'palette sync' });
  });
});

describe('ideaItems', () => {
  it('lists the open ideas by last activity with nothing typed, and leaves non-ideas out', () => {
    const list = items('');
    expect(titles(list)).toEqual(['Voice capture', 'Palette sync']);
    expect(list[0]).toMatchObject({
      id: 'idea:voice-capture',
      subtitle: 'seed · voice-capture · kaihuman',
      url: 'https://console.example/files/.kh/ideas/voice-capture.md',
    });
  });

  it('offers a new idea first, then the matches, closed ones included', () => {
    expect(titles(items('thing sync'))).toEqual([
      'New idea: thing sync',
      'Old thing',
      'Palette sync',
    ]);
  });

  it('offers no new idea when the query is an idea’s slug or title', () => {
    expect(titles(items('palette-sync'))).toEqual(['Palette sync']);
    expect(titles(items('voice CAPTURE'))).toEqual(['Voice capture']);
  });

  it('creates a seed idea, create-only, as human', async () => {
    expect(await run(items('Offline palette')[0])).toBe('New idea offline-palette');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.path).toBe('.kh/ideas/offline-palette.md');
    expect(sent[0]?.sha).toBeUndefined();
    const idea = parseIdea(sent[0]?.content ?? '');
    expect(idea).toMatchObject({ title: 'Offline palette', status: 'seed' });
    expect(idea.log[0]).toEqual({ at: '2026-10-13 09:30', author: 'human', text: 'Created.' });
  });

  it('refuses a new idea whose slug is taken, and says how to log on it', async () => {
    await expect(run(items('Palette sync!')[0])).rejects.toThrow(
      'There is an idea palette-sync already — “palette-sync: …” logs on it',
    );
    expect(sent).toEqual([]);
  });

  it('offers a log line for `slug: text`, written over the version listed', async () => {
    const list = items('palette-sync: Researched CRDTs: too heavy.');
    expect(titles(list)).toEqual([
      'Log on palette-sync: Researched CRDTs: too heavy.',
      'Palette sync',
    ]);
    expect(await run(list[0])).toBe('Logged on palette-sync');
    expect(sent[0]).toMatchObject({
      type: 'SAVE_IDEA',
      path: '.kh/ideas/palette-sync.md',
      sha: 'sha-.kh/ideas/palette-sync.md',
    });
    expect(parseIdea(sent[0]?.content ?? '').log[0]).toEqual({
      at: '2026-10-13 09:30',
      author: 'human',
      text: 'Researched CRDTs: too heavy.',
    });
  });
});

describe('ideasMode', () => {
  const search = (mode: PaletteMode, query: string) => {
    if (!('load' in mode) || !mode.search) throw new Error('>id does not search');
    return mode.search(query);
  };

  it('is >id on every surface, leaving >i to the IMDb link tool', () => {
    const mode = paletteModes(port).find((candidate) => candidate.prefix === 'id');
    expect(mode?.title).toBe('Ideas');
    expect(paletteModes(port).map((candidate) => candidate.prefix)).not.toContain('i');
  });

  it('searches what LIST_IDEAS answered', async () => {
    const mode = ideasMode(port, now);
    if (!('load' in mode)) throw new Error('>id does not load');
    expect(search(mode, 'voice')).toEqual([expect.objectContaining({ title: 'New idea: voice' })]);
    await mode.load();
    expect(titles(search(mode, ''))).toEqual(['Voice capture', 'Palette sync']);
  });
});
