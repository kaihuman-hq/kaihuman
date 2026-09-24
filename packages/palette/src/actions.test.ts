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
  tsugaUrl,
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

  it('opens Tsuga from >l, with the term in quotes when there is one', () => {
    const logs = mode('l');
    if (!('link' in logs)) throw new Error('l is not a link');
    expect(logs.link('')).toMatchObject({ title: 'Tsuga logs', url: tsugaUrl('') });
    expect(logs.link('search term')).toMatchObject({
      title: 'Tsuga logs “search term”',
      url: tsugaUrl('search term'),
    });
  });

  it('builds exactly the Tsuga links the team uses', () => {
    expect(tsugaUrl('')).toBe(
      'https://app.tsuga.com/explorer?query=context.cloud.camunda.io%2Fowner-team%3Aconsole+&extraColumns=%5B%22file%22%2C%22fn%22%2C%22service%22%5D&clusterIds=8v5j-x2k0n-dzk4',
    );
    expect(tsugaUrl(' search term ')).toBe(
      'https://app.tsuga.com/explorer?query=context.cloud.camunda.io%2Fowner-team%3Aconsole+AND+%22search+term%22&extraColumns=%5B%22file%22%2C%22fn%22%2C%22service%22%5D&clusterIds=8v5j-x2k0n-dzk4',
    );
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

  it('is the d: prefix', () => {
    expect(dumpMode(fakePort).prefix).toBe('d');
  });

  it('lists a new dump first, then the saved ones by their first line', async () => {
    const updatedAt = new Date(2026, 8, 23, 10, 30).getTime();
    answers.LIST_DUMPS = {
      dumps: [{ id: '1', text: '\n  first line  \nsecond', updatedAt }],
    };
    const [fresh, saved] = await load();
    expect(fresh).toMatchObject({ id: 'dump:new', title: 'New dump' });
    expect(saved).toMatchObject({
      id: 'dump:1',
      title: 'first line',
      subtitle: '2026-09-23 10:30 · 3 lines',
      keywords: '\n  first line  \nsecond',
    });
    expect(saved?.edit?.()).toMatchObject({
      title: 'first line',
      text: '\n  first line  \nsecond',
    });
  });

  it('shortens a long first line', async () => {
    answers.LIST_DUMPS = { dumps: [{ id: '1', text: 'x'.repeat(80), updatedAt: 0 }] };
    const [, saved] = await load();
    expect(saved?.title).toBe(`${'x'.repeat(59)}…`);
  });

  it('creates a new dump on its first save and keeps writing to it', async () => {
    answers.LIST_DUMPS = { dumps: [] };
    answers.SAVE_DUMP = { id: '42' };
    const [fresh] = await load();
    const editor = fresh?.edit?.();
    await editor?.save('a');
    await editor?.save('ab');
    expect(sent.slice(-2)).toEqual([
      { type: 'SAVE_DUMP', text: 'a' },
      { type: 'SAVE_DUMP', id: '42', text: 'ab' },
    ]);
  });

  it('starts over with a new file once emptied, which deleted the old one', async () => {
    answers.LIST_DUMPS = { dumps: [{ id: '7', text: 'x', updatedAt: 0 }] };
    const [, saved] = await load();
    const editor = saved?.edit?.();
    answers.SAVE_DUMP = {};
    await editor?.save('');
    answers.SAVE_DUMP = { id: '8' };
    await editor?.save('again');
    expect(sent.slice(-2)).toEqual([
      { type: 'SAVE_DUMP', id: '7', text: '' },
      { type: 'SAVE_DUMP', text: 'again' },
    ]);
  });

  it('suggests a dated file in ~/Documents and exports there', async () => {
    answers.LIST_DUMPS = { dumps: [] };
    answers.EXPORT_DUMP = { path: '/home/me/Documents/x.txt' };
    const [fresh] = await load();
    const saveAs = fresh?.edit?.().saveAs;
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
  it('lists each account’s rows, under its own heading', async () => {
    answers.GET_CLAUDE_USAGE = {
      accounts: [
        { name: 'default', usage: { five_hour: { utilization: 5 } } },
        { name: 'work', error: 'no credentials' },
      ],
    };
    const mode = claudeUsageMode(fakePort);
    if (!('load' in mode)) throw new Error('u does not load');
    const rows = await mode.load();
    expect(mode.prefix).toBe('u');
    expect(rows.map((row) => row.group)).toEqual(['default', 'work']);
    expect(rows[1]?.title).toBe('Could not load usage');
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
