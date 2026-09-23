import { beforeEach, describe, expect, it } from 'vitest';
import { portHandlers, repoActions, splitTags } from './actions.js';
import type { PaletteAction } from './command-palette.js';
import type { ActionPort, PaletteProtocol, PaletteRequestType } from './protocol.js';

type Answers = { [K in PaletteRequestType]?: PaletteProtocol[K]['response'] };

let sent: { type: string }[];
let answers: Answers;

/** Records every request and answers from `answers`, as a backend would. */
const fakePort: ActionPort = {
  send: async (request) => {
    sent.push(request);
    const answer = answers[request.type];
    if (!answer) throw new Error(`no answer for ${request.type}`);
    return answer as never;
  },
};

const action = (actions: PaletteAction[], id: string) => {
  const found = actions.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
};

beforeEach(() => {
  sent = [];
  answers = {};
});

describe('splitTags', () => {
  it('splits on spaces and commas and drops the hash', () => {
    expect(splitTags('#work, deep  #focus')).toEqual(['work', 'deep', 'focus']);
    expect(splitTags('  ')).toEqual([]);
  });
});

describe('repoActions', () => {
  it('offers the dump and every quick-note file, once each', async () => {
    answers.FETCH_QUICK_NOTES = { quickNotes: ['.lifeos/dump.md', 'log.actionlog.md'] };
    const targets = await action(repoActions(fakePort), 'note').children?.();
    expect(targets?.map((target) => target.title)).toEqual(['.lifeos/dump.md', 'log.actionlog.md']);
  });

  it('writes a plain note to its file', async () => {
    answers.FETCH_QUICK_NOTES = {};
    answers.DUMP_NOTE = {};
    const [dump] = (await action(repoActions(fakePort), 'note').children?.()) ?? [];
    expect(await dump?.run?.(['remember this'])).toBe('Added to .lifeos/dump.md');
    expect(sent.at(-1)).toEqual({
      type: 'DUMP_NOTE',
      path: '.lifeos/dump.md',
      note: 'remember this',
    });
  });

  it('splits an action-log entry into a description and its tags', async () => {
    answers.FETCH_QUICK_NOTES = { quickNotes: ['log.actionlog.md'] };
    answers.ADD_ACTION_LOG = {};
    const targets = (await action(repoActions(fakePort), 'note').children?.()) ?? [];
    await action(targets, 'note:log.actionlog.md').run?.(['Shipped the palette #work #extension']);
    expect(sent.at(-1)).toEqual({
      type: 'ADD_ACTION_LOG',
      path: 'log.actionlog.md',
      description: 'Shipped the palette',
      tags: ['work', 'extension'],
    });
  });

  it('refuses an empty note without asking the backend', async () => {
    answers.FETCH_QUICK_NOTES = {};
    const [dump] = (await action(repoActions(fakePort), 'note').children?.()) ?? [];
    await expect(dump?.run?.(['  '])).rejects.toThrow('Nothing to add');
    expect(sent.map((request) => request.type)).toEqual(['FETCH_QUICK_NOTES']);
  });

  it('lists the repositories and switches to the one picked', async () => {
    answers.GET_REPOS = { repo: 'o/a', repos: [{ full_name: 'o/a' }, { full_name: 'o/b' }] };
    answers.SET_REPO = {};
    const repos = (await action(repoActions(fakePort), 'switch-repo').children?.()) ?? [];
    expect(repos.map((repo) => [repo.title, repo.subtitle])).toEqual([
      ['o/a', 'current'],
      ['o/b', ''],
    ]);
    expect(await action(repos, 'repo:o/b').run?.([])).toBe('Now using o/b');
    expect(sent.at(-1)).toEqual({ type: 'SET_REPO', repo: 'o/b' });
  });

  it('forces a sync and reports what it fetched', async () => {
    answers.SYNC_NOW = { synced: true, bookmarks: 12 };
    expect(await action(repoActions(fakePort), 'sync-now').run?.([])).toBe('Synced 12 bookmarks');
    expect(sent).toEqual([{ type: 'SYNC_NOW', force: true }]);
  });

  it('passes a backend failure through to the palette', async () => {
    await expect(
      action(repoActions(fakePort), 'import-chrome-bookmarks').run?.([]),
    ).rejects.toThrow('no answer for IMPORT_CHROME_BOOKMARKS');
  });
});

describe('portHandlers', () => {
  it('reads bookmarks, repo hits and recents from their responses', async () => {
    answers.GET_BOOKMARKS = { bookmarks: [] };
    answers.SEARCH_REPO = { results: [{ path: 'a/b.md', name: 'b.md', url: 'https://x/b' }] };
    answers.GET_RECENTS = { recents: [{ id: 'sync-now', title: 'Sync' }] };
    const handlers = portHandlers(fakePort);

    expect(await handlers.loadBookmarks()).toEqual([]);
    expect((await handlers.searchRepo('b')).map((hit) => hit.name)).toEqual(['b.md']);
    expect(await handlers.loadRecents()).toEqual([{ id: 'sync-now', title: 'Sync' }]);
    expect(sent.find((request) => request.type === 'SEARCH_REPO')).toEqual({
      type: 'SEARCH_REPO',
      query: 'b',
    });
  });
});
