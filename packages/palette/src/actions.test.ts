import { type BraindumpId, DEFAULT_PALETTE_SETTINGS } from '@lifosy/formats';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  claudeCodeMode,
  claudeCodeUrl,
  claudeUsageMode,
  commandsMode,
  dumpMode,
  fileChoices,
  formatStamp,
  GITHUB_REPO_VIEWS,
  githubSearchUrl,
  paletteModes,
  portHandlers,
  repoActions,
  splitTags,
} from './actions.js';
import type { PaletteAction, PaletteMode } from './command-palette.js';
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

  it('adds to a widget file the way its widget does, over the version read', async () => {
    answers.FETCH_QUICK_NOTES = { quickNotes: ['log.actionlog.md'] };
    answers.READ_ENTRY_FILE = { content: '', sha: 'v1' };
    answers.WRITE_ENTRY_FILE = {};
    const targets = (await action(repoActions(fakePort), 'note').children?.()) ?? [];
    const target = action(targets, 'note:log.actionlog.md');
    expect(target.prompts).toEqual([{ label: 'What happened? #tags' }]);
    await target.run?.(['Shipped the palette #work']);
    expect(sent.at(-1)).toMatchObject({
      type: 'WRITE_ENTRY_FILE',
      path: 'log.actionlog.md',
      sha: 'v1',
    });
    expect((sent.at(-1) as { content?: string }).content).toMatch(
      /\n- \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Shipped the palette #work$/,
    );
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

  it('reads the settings file, with the defaults when the repository has none', async () => {
    const handlers = portHandlers(fakePort);
    answers.GET_PALETTE_SETTINGS = { content: null };
    expect(await handlers.loadSettings?.()).toEqual(DEFAULT_PALETTE_SETTINGS);

    answers.GET_PALETTE_SETTINGS = {
      content: JSON.stringify({
        searchEngines: [
          { name: 'Amazon.de', url: 'https://www.amazon.de/s?k={query}' },
          { name: 'Bad', url: 'javascript:x' },
        ],
        assistants: [],
        tools: [],
      }),
    };
    expect(await handlers.loadSettings?.()).toEqual({
      searchEngines: [{ name: 'Amazon.de', url: 'https://www.amazon.de/s?k={query}', params: [] }],
      assistants: [],
      tools: [],
    });
  });
});

const mode = (prefix: string) => {
  const found = paletteModes(fakePort).find((candidate) => candidate.prefix === prefix);
  if (!found) throw new Error(`no mode ${prefix}`);
  return found;
};
const load = (found: PaletteMode) => {
  if (!('load' in found)) throw new Error(`${found.prefix} does not load`);
  return found.load();
};
const submit = (found: PaletteMode, query: string) => {
  if (!('submit' in found)) throw new Error(`${found.prefix} does not submit`);
  return found.submit(query);
};

describe('fileChoices', () => {
  const todos = { path: 'work/inbox.todos.md', name: 'inbox.todos.md', url: 'https://x/inbox' };

  it('offers nothing for a file no widget adds to, so it simply opens', () => {
    expect(fileChoices(fakePort, { path: 'a/b.ts', name: 'b.ts', url: 'https://x/b' })).toEqual([]);
  });

  it('opens the file in the console, or adds an entry over the version read', async () => {
    const [open, add] = fileChoices(fakePort, todos);
    expect(open).toMatchObject({
      title: 'Open inbox.todos.md in Kaihuman',
      url: 'https://x/inbox',
    });
    expect(add?.title).toBe('Add a todo…');
    expect(add?.action?.prompts).toEqual([{ label: 'What needs to be done? #tags' }]);

    answers.READ_ENTRY_FILE = { content: '- [ ] Old\n', sha: 'v1' };
    answers.WRITE_ENTRY_FILE = {};
    expect(await add?.action?.run?.(['Call the bank #admin'])).toBe(
      'Added a todo to work/inbox.todos.md',
    );
    expect(sent[0]).toEqual({ type: 'READ_ENTRY_FILE', path: 'work/inbox.todos.md' });
    expect(sent[1]).toMatchObject({
      type: 'WRITE_ENTRY_FILE',
      path: 'work/inbox.todos.md',
      sha: 'v1',
    });
    expect((sent[1] as { content?: string }).content).toMatch(
      /^- \[ \] Old\n- \[ \] Call the bank #admin\n::updated:: \d+ ::created:: /,
    );
  });

  it('creates a file that is not there yet, and writes nothing when the answer does not fit', async () => {
    const [, add] = fileChoices(fakePort, { path: 'x.events.csv', name: 'x', url: 'https://x' });
    answers.READ_ENTRY_FILE = { content: '' };
    answers.WRITE_ENTRY_FILE = {};
    await add?.action?.run?.(['Trip', 'general', '2026-10-01', '']);
    expect(sent[1]).toEqual({
      type: 'WRITE_ENTRY_FILE',
      path: 'x.events.csv',
      content: 'name;type;start iso date;end iso date\nTrip;general;2026-10-01;2026-10-01\n',
    });

    sent = [];
    await expect(add?.action?.run?.(['', 'general', '2026-10-01', ''])).rejects.toThrow(
      'needs a name',
    );
    expect(sent.map((request) => request.type)).toEqual(['READ_ENTRY_FILE']);
  });
});

describe('paletteModes', () => {
  const work = (url: string, over: object = {}) => ({
    repo: 'o/r',
    number: Number(url.split('/').at(-1)),
    title: `Item ${url.split('/').at(-1)}`,
    url,
    pullRequest: true,
    updatedAt: '2026-09-24T08:00:00Z',
    ...over,
  });

  it('>w lists what waits on you on GitHub, each once, under the first search that found it', async () => {
    const byFilter = {
      'review-requested': [work('https://github.com/o/r/pull/1')],
      assigned: [
        work('https://github.com/o/r/pull/1'),
        work('https://github.com/o/r/issues/2', { pullRequest: false }),
      ],
      failing: [work('https://github.com/o/r/pull/3')],
    };
    const port: ActionPort = {
      send: async (request) => {
        sent.push(request);
        if (request.type !== 'LIST_GITHUB_WORK') throw new Error(`no answer for ${request.type}`);
        const { filter } = request as { filter: keyof typeof byFilter };
        return { items: byFilter[filter] } as never;
      },
    };
    const found = paletteModes(port).find((candidate) => candidate.prefix === 'w');
    if (!found) throw new Error('no mode w');
    const items = await load(found);
    expect(sent).toEqual([
      { type: 'LIST_GITHUB_WORK', filter: 'review-requested' },
      { type: 'LIST_GITHUB_WORK', filter: 'assigned' },
      { type: 'LIST_GITHUB_WORK', filter: 'failing' },
    ]);
    expect(items.map((item) => [item.group, item.title, item.url])).toEqual([
      ['Review requested', 'Item 1', 'https://github.com/o/r/pull/1'],
      ['Assigned to you', 'Item 2', 'https://github.com/o/r/issues/2'],
      ['Your pull requests with failing checks', 'Item 3', 'https://github.com/o/r/pull/3'],
    ]);
    expect(items[1]?.subtitle).toBe('o/r#2 · issue · updated 2026-09-24');
  });

  it('>w says so when nothing waits on you', async () => {
    answers.LIST_GITHUB_WORK = { items: [] };
    await expect(load(mode('w'))).rejects.toThrow('Nothing on GitHub is waiting on you');
  });

  it('>k converts what is typed, >s lists symbols to copy', async () => {
    const convert = mode('k');
    if (!('links' in convert)) throw new Error('>k lists no links');
    expect(convert.links('0x1f').map((item) => item.copy)).toEqual(['31', '0b11111', '0o37']);
    const symbols = await load(mode('s'));
    expect(symbols.find((item) => item.title === '→  Right arrow')).toMatchObject({
      copy: '→',
      group: 'Arrows',
    });
    expect(symbols.find((item) => item.copy === '\u00a0')?.title).toBe('␣  Non-breaking space');
  });

  it('>f lists the files widgets add to, each leading to its choices', async () => {
    answers.LIST_ENTRY_FILES = {
      files: [{ path: 'a/b.actionlog.md', name: 'b.actionlog.md', url: 'https://x/b' }],
    };
    const [item] = await load(mode('f'));
    expect(item).toMatchObject({ title: 'b.actionlog.md', subtitle: 'a/b.actionlog.md' });
    expect(item?.action?.choices?.([]).map((choice) => choice.title)).toEqual([
      'Open b.actionlog.md in Kaihuman',
      'Add an action…',
    ]);
  });

  it('>f says so when there are no such files', async () => {
    answers.LIST_ENTRY_FILES = { files: [] };
    await expect(load(mode('f'))).rejects.toThrow('No todo lists');
  });

  it('lists the prompts of every prompts file, copying the body', async () => {
    answers.LIST_PROMPT_FILES = {
      files: [
        { path: 'a.prompts.md', content: '## Commit #git\n\nWrite it.\nThen stop.' },
        { path: 'b/c.prompts.md', content: '## Review\nLook closely.' },
      ],
    };
    const items = await load(mode('p'));
    expect(items).toEqual([
      {
        id: 'prompt:a.prompts.md:0',
        title: 'Commit',
        subtitle: '#git Write it.',
        keywords: 'git Write it.\nThen stop.',
        copy: 'Write it.\nThen stop.',
      },
      {
        id: 'prompt:b/c.prompts.md:0',
        title: 'Review',
        subtitle: 'Look closely.',
        keywords: 'Look closely.',
        copy: 'Look closely.',
      },
    ]);
  });

  it('says so when the repository has no prompts file', async () => {
    answers.LIST_PROMPT_FILES = { files: [] };
    await expect(load(mode('p'))).rejects.toThrow('No .prompts.md files');
  });

  it('translates into the default targets and drops the one the text is already in', async () => {
    answers.TRANSLATE = {
      translations: [
        { target: 'EN-US', text: 'Good morning', detectedSource: 'DE' },
        { target: 'DE', text: 'Guten Morgen', detectedSource: 'DE' },
      ],
    };
    answers.ADD_TRANSLATION_HISTORY = { texts: ['Guten Morgen'] };
    const items = await submit(mode('t'), 'Guten Morgen');
    expect(sent.at(-2)).toEqual({
      type: 'TRANSLATE',
      text: 'Guten Morgen',
      targets: ['EN-US', 'DE'],
    });
    expect(items).toEqual([
      {
        id: 'translation:EN-US',
        title: 'Good morning',
        subtitle: 'DE → EN-US · ⏎ copies',
        copy: 'Good morning',
      },
    ]);
  });

  it('asks for one language when the text names it', async () => {
    answers.TRANSLATE = { translations: [] };
    answers.ADD_TRANSLATION_HISTORY = { texts: [] };
    await submit(mode('t'), 'fr: good morning');
    expect(sent.at(-2)).toEqual({ type: 'TRANSLATE', text: 'good morning', targets: ['FR'] });
    // Remembered as typed, so choosing it again asks for French again.
    expect(sent.at(-1)).toEqual({ type: 'ADD_TRANSLATION_HISTORY', text: 'fr: good morning' });
  });

  it('still answers when the history cannot be written', async () => {
    answers.TRANSLATE = {
      translations: [{ target: 'DE', text: 'Hallo', detectedSource: 'EN' }],
    };
    expect(await submit(mode('t'), 'Hello')).toHaveLength(1);
  });

  it('does not remember a translation that failed', async () => {
    await expect(submit(mode('t'), 'Hello')).rejects.toThrow('no answer for TRANSLATE');
    expect(sent.map((request) => request.type)).toEqual(['TRANSLATE']);
  });

  it('reads the translation history from the backend', async () => {
    answers.GET_TRANSLATION_HISTORY = { texts: ['b', 'a'] };
    const translate = mode('t');
    if (!('submit' in translate)) throw new Error('t does not submit');
    expect(await translate.history?.()).toEqual(['b', 'a']);
  });

  it('captures to the knowledge base and offers to open the new file', async () => {
    answers.CAPTURE_KNOWLEDGE = { url: 'https://app.kaihuman.com/files/x' };
    const [item] = await submit(mode('q'), 'Read about CRDTs\nlater');
    const request = sent.at(-1) as { type: string; path: string; content: string };
    expect(request.type).toBe('CAPTURE_KNOWLEDGE');
    expect(request.path).toMatch(/^\.kh\/raw\/\d+-read-about-crdts\.md$/);
    expect(request.content).toContain('\n\nRead about CRDTs\nlater\n');
    expect(item).toEqual({
      id: `capture:${request.path}`,
      title: 'Captured “Read about CRDTs”',
      subtitle: `${request.path} · ⏎ opens it in Kaihuman`,
      url: 'https://app.kaihuman.com/files/x',
    });
  });

  it('lists repositories with their GitHub pages as children', async () => {
    answers.LIST_GITHUB_REPOS = { repos: [{ fullName: 'o/r', description: 'A repo' }] };
    const [repo] = await load(mode('r'));
    expect(repo).toMatchObject({ title: 'o/r', subtitle: 'A repo', url: 'https://github.com/o/r' });
    expect(repo?.children).toHaveLength(GITHUB_REPO_VIEWS.length);
    expect(repo?.children?.[0]).toEqual({
      id: 'github:o/r/issues',
      title: 'o/r · Issues',
      url: 'https://github.com/o/r/issues',
    });
  });

  it('searches a repository: >g lists it, then issues or pull requests, then asks the term', async () => {
    answers.LIST_GITHUB_REPOS = { repos: [{ fullName: 'o/r', description: 'A repo' }] };
    const [repo] = await load(mode('g'));
    // No url of its own, so ⏎ on the repository lists what to search in it.
    expect(repo).toMatchObject({ title: 'o/r', subtitle: 'A repo' });
    expect(repo?.url).toBeUndefined();
    expect(repo?.children?.map((child) => child.title)).toEqual(['Issues', 'Pull requests']);
    const pulls = repo?.children?.[1]?.action;
    expect(pulls?.prompts).toEqual([{ label: 'Search term' }]);
    expect(pulls?.opens?.([' flaky test '])).toEqual({
      id: 'github-search:o/r/pulls:flaky test',
      title: 'Pull requests “flaky test”',
      subtitle: 'o/r',
      url: 'https://github.com/o/r/pulls?q=is%3Apr+flaky+test',
    });
  });

  it('builds GitHub search links, and the plain list without a term', () => {
    expect(githubSearchUrl('o/r', 'issues', 'login bug')).toBe(
      'https://github.com/o/r/issues?q=is%3Aissue+login+bug',
    );
    expect(githubSearchUrl('o/r', 'issues', '  ')).toBe('https://github.com/o/r/issues');
  });

  it('leaves link tools to the settings', () => {
    expect(paletteModes(fakePort).map((candidate) => candidate.prefix)).not.toContain('l');
  });

  it('stores or forgets the DeepL key', async () => {
    answers.SET_TRANSLATION_KEY = {};
    const setKey = action(repoActions(fakePort), 'set-translation-key');
    expect(await setKey.run?.([' abc:fx '])).toBe('Saved the DeepL API key');
    expect(sent.at(-1)).toEqual({ type: 'SET_TRANSLATION_KEY', key: 'abc:fx' });
    expect(await setKey.run?.([''])).toBe('Forgot the DeepL API key');
  });
});

describe('dumpMode', () => {
  const load = async () => {
    const mode = dumpMode(fakePort);
    if (!('load' in mode)) throw new Error('d does not load');
    return mode.load();
  };
  const noDumps = () => {
    answers.LIST_BRAINDUMPS = { braindumps: [] };
    answers.LIST_DUMPS = { dumps: [] };
  };

  it('is the d: prefix', () => {
    expect(dumpMode(fakePort).prefix).toBe('d');
  });

  it('lists a new braindump first, then the braindumps by their first line', async () => {
    const updatedAt = new Date(2026, 8, 23, 10, 30).getTime();
    answers.LIST_BRAINDUMPS = {
      braindumps: [
        { id: '1' as BraindumpId, text: '\n# Plan  \nsecond', updatedAt, synced: true },
        { id: '2' as BraindumpId, text: 'draft', updatedAt, synced: false },
      ],
    };
    answers.LIST_DUMPS = { dumps: [] };
    const [fresh, synced, unsynced] = await load();
    expect(fresh).toMatchObject({ id: 'braindump:new', title: 'New braindump' });
    expect(synced).toMatchObject({
      id: 'braindump:1',
      title: 'Plan',
      subtitle: '2026-09-23 10:30 · 3 lines',
      keywords: '\n# Plan  \nsecond',
    });
    expect(unsynced?.subtitle).toBe('2026-09-23 10:30 · 1 line · not synced yet');
  });

  it('opens a new or an existing braindump in the window and closes the palette', async () => {
    noDumps();
    answers.LIST_BRAINDUMPS = {
      braindumps: [{ id: '7' as BraindumpId, text: 'x', updatedAt: 0, synced: true }],
    };
    answers.OPEN_BRAINDUMP = {};
    const [fresh, existing] = await load();
    expect(fresh?.action?.closes).toBe(true);
    await fresh?.action?.run?.([]);
    await existing?.action?.run?.([]);
    expect(sent.slice(-2)).toEqual([
      { type: 'OPEN_BRAINDUMP' },
      { type: 'OPEN_BRAINDUMP', id: '7' },
    ]);
    expect(existing?.action?.recent).toBe(false);
  });

  it('lists old local dumps below, under their own heading, to edit in place', async () => {
    answers.LIST_BRAINDUMPS = { braindumps: [] };
    answers.LIST_DUMPS = { dumps: [{ id: '3', text: 'x'.repeat(80), updatedAt: 0 }] };
    const [, old] = await load();
    expect(old).toMatchObject({ id: 'dump:3', group: 'Old dumps — on this machine only' });
    expect(old?.title).toBe(`${'x'.repeat(59)}…`);
    expect(old?.edit?.()).toMatchObject({ text: 'x'.repeat(80) });
  });

  it('clears an old dump by emptying it', async () => {
    answers.LIST_BRAINDUMPS = { braindumps: [] };
    answers.LIST_DUMPS = { dumps: [{ id: '7', text: 'x', updatedAt: 0 }] };
    const [, old] = await load();
    answers.SAVE_DUMP = {};
    await old?.edit?.().save('');
    expect(sent.at(-1)).toEqual({ type: 'SAVE_DUMP', id: '7', text: '' });
  });

  it('suggests a dated file in ~/Documents for an old dump and exports there', async () => {
    answers.LIST_BRAINDUMPS = { braindumps: [] };
    answers.LIST_DUMPS = { dumps: [{ id: '7', text: 'x', updatedAt: 0 }] };
    answers.EXPORT_DUMP = { path: '/home/me/Documents/x.txt' };
    const [, old] = await load();
    const saveAs = old?.edit?.().saveAs;
    expect(saveAs?.suggestedPath()).toMatch(/^~\/Documents\/dump-\d{4}-\d\d-\d\d-\d\d-\d\d\.txt$/);
    expect(await saveAs?.save('~/Documents/x.txt', 'text')).toBe('/home/me/Documents/x.txt');
    expect(sent.at(-1)).toEqual({ type: 'EXPORT_DUMP', path: '~/Documents/x.txt', text: 'text' });
  });

  it('formats stamps in local time', () => {
    expect(formatStamp(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02 03:04');
  });
});

describe('claudeCodeMode', () => {
  const load = async () => {
    const mode = claudeCodeMode(fakePort);
    if (!('load' in mode)) throw new Error('c does not load');
    return mode.load();
  };

  it('encodes the link as omarchy does: + for spaces, the repo slash kept', () => {
    expect(claudeCodeUrl('o/r', 'fix the bug & ship')).toBe(
      'https://claude.ai/code?prompt=fix+the+bug+%26+ship&repo=o/r&branch=main',
    );
  });

  it('lists the repositories, each asking for a prompt and then opening Claude Code', async () => {
    answers.LIST_CLAUDE_CODE_REPOS = { repos: ['o/r'] };
    const [item] = await load();
    expect(claudeCodeMode(fakePort).prefix).toBe('c');
    expect(item).toMatchObject({ id: 'claude-code:o/r', title: 'o/r' });
    expect(item?.action?.prompts).toEqual([{ label: 'Prompt' }]);
    expect(item?.action?.opens?.([' add tests '])).toEqual({
      id: 'claude-code:o/r:add tests',
      title: 'Claude Code: add tests',
      subtitle: 'o/r',
      url: 'https://claude.ai/code?prompt=add+tests&repo=o/r&branch=main',
    });
    expect(() => item?.action?.opens?.(['  '])).toThrow('Type a prompt');
  });
});

describe('claudeUsageMode', () => {
  const MINUTE = 60 * 1000;
  const accounts = [
    { name: 'default', usage: { five_hour: { utilization: 5 } } },
    { name: 'work', error: 'no credentials' },
  ];

  /** Answers the cache from `cache` and a fetch from `fresh`, recording which was asked. */
  const usagePort = (
    cache: { accounts: typeof accounts; fetchedAt?: number },
    fresh: () => Promise<{ accounts: typeof accounts; fetchedAt?: number }>,
  ) => {
    const asked: string[] = [];
    const port: ActionPort = {
      send: async (request) => {
        const cached = (request as { cached?: boolean }).cached;
        asked.push(cached ? 'cache' : 'fetch');
        return (cached ? cache : await fresh()) as never;
      },
    };
    const mode = claudeUsageMode(port);
    if (!('load' in mode)) throw new Error('u does not load');
    return { mode, asked };
  };

  it('fetches when nothing is cached, then lists each account under its own heading', async () => {
    const { mode, asked } = usagePort({ accounts: [] }, async () => ({
      accounts,
      fetchedAt: Date.now(),
    }));
    const rows = await mode.load();
    expect(asked).toEqual(['cache', 'fetch']);
    expect(rows[0]).toMatchObject({ title: 'Usage synced just now', tone: 'good' });
    expect(rows.slice(1).map((row) => row.group)).toEqual(['default', 'work']);
    expect(rows[2]?.title).toBe('Could not load usage');
    expect(mode.recents).toBe(false);
  });

  it('shows a cache younger than 5 minutes as it is, without syncing', async () => {
    const { mode, asked } = usagePort(
      { accounts, fetchedAt: Date.now() - 3 * MINUTE },
      async () => ({ accounts }),
    );
    const rows = await mode.load();
    expect(rows[0]).toMatchObject({
      title: 'Cached usage from 3 min ago',
      subtitle: 'Fresh — synced again once it is 5 min old',
      tone: 'good',
    });
    expect(mode.refresh?.()).toBeNull();
    expect(asked).toEqual(['cache']);
  });

  it('shows an older cache first, then the synced usage in its place', async () => {
    const { mode } = usagePort({ accounts, fetchedAt: Date.now() - 30 * MINUTE }, async () => ({
      accounts,
      fetchedAt: Date.now(),
    }));
    const rows = await mode.load();
    expect(rows[0]).toMatchObject({
      title: 'Cached usage from 30 min ago',
      subtitle: 'Syncing in the background…',
      tone: 'warn',
    });
    const synced = await mode.refresh?.();
    expect(synced?.[0]).toMatchObject({ title: 'Usage synced just now', tone: 'good' });
    expect(synced?.length).toBe(rows.length);
  });

  it('keeps the cached usage when the sync fails, and says why', async () => {
    const { mode } = usagePort({ accounts, fetchedAt: Date.now() - 2 * 60 * MINUTE }, async () => {
      throw new Error('offline');
    });
    const rows = await mode.load();
    expect(rows[0]?.tone).toBe('bad');
    const after = await mode.refresh?.();
    expect(after?.[0]).toMatchObject({
      title: 'Cached usage from 2h 0m ago',
      subtitle: 'Sync failed: offline',
      tone: 'bad',
    });
    expect(after?.slice(1)).toEqual(rows.slice(1));
  });
});

describe('commandsMode', () => {
  const FILE =
    '## List a folder #files\n```sh\nls -la {{folder}}\n```\n\n## Wi-Fi on\nnmcli radio wifi on';
  const load = async (canRun: boolean) => {
    answers.LIST_COMMAND_FILES = { files: [{ path: 'ops.commands.md', content: FILE }] };
    const mode = commandsMode(fakePort, { canRun });
    if (!('load' in mode)) throw new Error('x does not load');
    return mode.load();
  };

  it('is >x, and lists each command with its tags and first line', async () => {
    const [list, wifi] = await load(true);
    expect(commandsMode(fakePort, { canRun: true }).prefix).toBe('x');
    expect(list).toMatchObject({ title: 'List a folder', subtitle: '#files ls -la {{folder}}' });
    expect(list?.action?.prompts).toEqual([{ label: 'folder' }]);
    expect(wifi?.action?.prompts).toEqual([]);
  });

  it('fills the values in and offers copy first, then running, then the command itself', async () => {
    const [list] = await load(true);
    const choices = list?.action?.choices?.(['/tmp']) ?? [];
    expect(choices.map((choice) => choice.title)).toEqual([
      'Copy',
      'Run in terminal',
      'Run in the background',
      'ls -la /tmp',
    ]);
    expect(choices[0]?.copy).toBe('ls -la /tmp');
    expect(choices[3]).toMatchObject({ group: 'The command', copy: 'ls -la /tmp' });
  });

  it('runs through the backend, closing the palette and staying out of Recent', async () => {
    answers.RUN_COMMAND = {};
    const [list] = await load(true);
    const terminal = list?.action?.choices?.(['/tmp'])[1]?.action;
    expect(terminal).toMatchObject({ closes: true, recent: false });
    expect(await terminal?.run?.([])).toBe('Running in ghostty');
    expect(sent.at(-1)).toEqual({ type: 'RUN_COMMAND', command: 'ls -la /tmp', where: 'terminal' });
  });

  it('only copies where it cannot run', async () => {
    const [list] = await load(false);
    const titles = list?.action?.choices?.(['x']).map((choice) => choice.title);
    expect(titles).toEqual(['Copy', 'ls -la x']);
  });

  it('says so when the repository has no commands file', async () => {
    answers.LIST_COMMAND_FILES = { files: [] };
    const mode = commandsMode(fakePort, { canRun: true });
    if (!('load' in mode)) throw new Error('x does not load');
    await expect(mode.load()).rejects.toThrow('No .commands.md files');
  });
});
