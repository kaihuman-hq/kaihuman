import {
  type CommandPaletteSettings,
  DEFAULT_PALETTE_SETTINGS,
  type PaletteToolSetting,
} from '@kaihuman/formats';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Bookmark } from './bookmarks.js';
import {
  type CommandPalette,
  createCommandPalette,
  type EditableText,
  filterModeItems,
  type ModeItem,
  PALETTE_HOST_ID,
  type PaletteAction,
  type PaletteHandlers,
  type PaletteMode,
  type RecentEntry,
  type RepoResult,
} from './command-palette.js';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (title: string, url: string, tags: string[] = []): Bookmark => ({
  id: title,
  title,
  url,
  tags,
  createdAt: NOW,
  updatedAt: NOW,
  useCount: 0,
  lastUsedAt: '',
  pinned: false,
});

const BOOKMARKS = [
  bookmark('Vitest guide', 'https://vitest.dev/guide', ['testing']),
  bookmark('Zulip', 'https://zulip.example/', ['chat']),
];

let palette: CommandPalette;
let open: ReturnType<typeof vi.fn>;
let searchRepo: ReturnType<typeof vi.fn>;
let loadBookmarks: ReturnType<typeof vi.fn>;
let loadRecents: ReturnType<typeof vi.fn>;
let rememberRecent: ReturnType<typeof vi.fn>;
let countBookmarkUse: ReturnType<typeof vi.fn>;
let bookmarkRun: Mock<(inputs: string[]) => Promise<string>>;
let renameRun: Mock<(inputs: string[]) => Promise<string>>;
let guidedRun: Mock<(inputs: string[]) => Promise<string>>;
let children: Mock<() => Promise<PaletteAction[]>>;
let actions: PaletteAction[];
let copy: Mock<(text: string) => Promise<void>>;
let loadPrompts: Mock<() => Promise<ModeItem[]>>;
let translate: Mock<(query: string) => Promise<ModeItem[]>>;
let history: Mock<() => Promise<string[]>>;
let modes: PaletteMode[];

const PROMPTS: ModeItem[] = [
  {
    id: 'p1',
    title: 'Commit message',
    subtitle: '#git',
    keywords: 'staged diff',
    copy: 'Write it',
  },
  { id: 'p2', title: 'Refactor to hooks', subtitle: '#react', copy: 'Convert it' },
  {
    id: 'r1',
    title: 'o/repo',
    url: 'https://github.com/o/repo',
    children: [
      { id: 'r1:issues', title: 'o/repo · Issues', url: 'https://github.com/o/repo/issues' },
      { id: 'r1:pulls', title: 'o/repo · Pull requests', url: 'https://github.com/o/repo/pulls' },
    ],
  },
];

const shadow = () => {
  const host = document.getElementById(PALETTE_HOST_ID);
  if (!host?.shadowRoot) throw new Error('palette is not mounted');
  return host.shadowRoot;
};

const input = () => shadow().querySelector('input') as HTMLInputElement;
const rowTitles = () =>
  Array.from(shadow().querySelectorAll('.row .title')).map((r) => r.textContent);
/** The rows under one group heading, in order. */
const groupRows = (label: string) => {
  const titles: string[] = [];
  let inside = false;
  for (const element of Array.from(shadow().querySelector('.rows')?.children ?? [])) {
    if (element.classList.contains('group')) inside = element.textContent === label;
    else if (inside && element.classList.contains('row'))
      titles.push(element.querySelector('.title')?.textContent ?? '');
  }
  return titles;
};
const groupLabels = () => Array.from(shadow().querySelectorAll('.group')).map((g) => g.textContent);
const selectedTitle = () =>
  shadow().querySelector('.row[data-selected="true"] .title')?.textContent ?? null;
const statusText = () => {
  const status = shadow().querySelector('.status') as HTMLElement;
  return status.hidden ? null : status.textContent;
};
const hintText = () => shadow().querySelector('.hint')?.textContent ?? '';
const crumbText = () => {
  const crumb = shadow().querySelector('.crumb') as HTMLElement;
  return crumb.hidden ? null : crumb.textContent;
};

const type = (value: string) => {
  input().value = value;
  input().dispatchEvent(new Event('input'));
};
const press = (key: string) =>
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Walks down to the row with this title and activates it. */
const activateRow = async (title: string) => {
  const index = rowTitles().indexOf(title);
  if (index === -1) throw new Error(`no row titled ${title}, have: ${rowTitles().join(', ')}`);
  const row = shadow().querySelectorAll('.row')[index] as HTMLElement;
  row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await settle();
};

beforeEach(async () => {
  document.body.replaceChildren();
  open = vi.fn();
  searchRepo = vi.fn(async (): Promise<RepoResult[]> => []);
  loadBookmarks = vi.fn(async () => BOOKMARKS);
  loadRecents = vi.fn(async (): Promise<RecentEntry[]> => []);
  rememberRecent = vi.fn();
  countBookmarkUse = vi.fn();
  bookmarkRun = vi.fn(async () => 'Bookmarked “This page”');
  renameRun = vi.fn(async ([input]: string[]) => `Renamed to ${input}`);
  guidedRun = vi.fn(async ([url]: string[]) => `Bookmarked ${url}`);
  children = vi.fn(
    async (): Promise<PaletteAction[]> => [
      { id: 'group:work:load', title: 'Load Work', run: async () => 'Work: pinned 2' },
      {
        id: 'group:work:rename',
        title: 'Rename Work…',
        prompts: [{ label: 'New name', initial: () => 'Work' }],
        run: renameRun,
      },
    ],
  );
  actions = [
    { id: 'bookmark-page', title: 'Bookmark this page', subtitle: 'A page', run: bookmarkRun },
    {
      id: 'bookmark-guided',
      title: 'Bookmark this page…',
      prompts: [
        { label: 'URL', initial: () => 'https://page.example/' },
        { label: 'Title', initial: () => 'The page' },
        { label: 'Tags' },
      ],
      run: guidedRun,
    },
    { id: 'tabs', title: 'Pinned tab groups…', children },
  ];

  copy = vi.fn(async () => {});
  loadPrompts = vi.fn(async () => PROMPTS);
  translate = vi.fn(async (query: string) => [
    { id: 't:en', title: `EN ${query}`, copy: `EN ${query}` },
    { id: 't:fr', title: `FR ${query}`, copy: `FR ${query}` },
  ]);
  history = vi.fn(async () => [] as string[]);
  modes = [
    {
      prefix: 'p',
      title: 'Prompts',
      placeholder: 'Search prompts',
      description: 'Find a prompt',
      load: loadPrompts,
    },
    {
      prefix: 't',
      title: 'Translate',
      description: 'Translate text',
      placeholder: 'Text to translate',
      submit: translate,
      history,
    },
  ];

  palette = createCommandPalette({
    loadBookmarks: loadBookmarks as any,
    searchRepo: searchRepo as any,
    open: open as any,
    actions: () => actions,
    loadRecents: loadRecents as any,
    rememberRecent: rememberRecent as any,
    countBookmarkUse: countBookmarkUse as any,
    modes,
    copy: copy as any,
  });
  palette.toggle();
  await settle();
});

describe('toggle', () => {
  it('mounts with the bookmarks and the actions, and focuses the input', () => {
    expect(rowTitles()).toEqual([
      'Vitest guide',
      'Zulip',
      'Bookmark this page',
      'Bookmark this page…',
      'Pinned tab groups…',
    ]);
    expect(shadow().activeElement).toBe(input());
  });

  it('closes on Escape and on a second toggle', () => {
    press('Escape');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
    palette.toggle();
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
    palette.toggle();
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });
});

describe('isOpen and refresh', () => {
  it('tells whether it is open, and refresh redraws a row whose text changed', () => {
    expect(palette.isOpen()).toBe(true);
    const first = actions[0];
    if (first) first.subtitle = 'Already saved';
    expect(shadow().querySelector('.row .subtitle')?.textContent).not.toBe('Already saved');
    palette.refresh();
    const subtitles = Array.from(shadow().querySelectorAll('.row .subtitle')).map(
      (element) => element.textContent,
    );
    expect(subtitles).toContain('Already saved');
    palette.close();
    expect(palette.isOpen()).toBe(false);
    // Closed, there is nothing to redraw and nothing is mounted again.
    palette.refresh();
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });
});

describe('open', () => {
  it('opens a closed palette and leaves an open one open', async () => {
    palette.close();
    palette.open();
    await settle();
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
    palette.open();
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
    expect(shadow().activeElement).toBe(input());
  });

  it('types a given query into the input, as if by hand', async () => {
    palette.close();
    palette.open('zul');
    await settle();
    expect(input().value).toBe('zul');
    expect(rowTitles()[0]).toBe('Zulip');
  });
});

describe('options', () => {
  const handlers = () => ({
    loadBookmarks: async () => BOOKMARKS,
    searchRepo: async () => [],
    open: () => {},
    actions: () => [],
    loadRecents: async () => [],
    rememberRecent: () => {},
    countBookmarkUse: () => {},
    modes: [],
    copy: async () => {},
  });

  beforeEach(() => palette.destroy());

  it('hangs the panel from the top unless asked to center it', async () => {
    const backdrop = () => shadow().querySelector('.backdrop') as HTMLElement;
    const top = createCommandPalette(handlers());
    top.open();
    expect(backdrop().dataset.placement).toBe('top');
    top.destroy();

    const centered = createCommandPalette(handlers(), { placement: 'center' });
    centered.open();
    expect(backdrop().dataset.placement).toBe('center');
    centered.destroy();
  });

  it('reports every close once — Esc, and after opening a bookmark', async () => {
    const onClose = vi.fn();
    const desktop = createCommandPalette(handlers(), { onClose });
    desktop.open();
    await settle();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);

    desktop.close();
    expect(onClose).toHaveBeenCalledTimes(1);

    desktop.open();
    await settle();
    press('Enter');
    expect(onClose).toHaveBeenCalledTimes(2);
    desktop.destroy();
  });
});

describe('bookmark search', () => {
  it('filters bookmarks and actions locally, without touching the repo search', () => {
    type('zul');
    expect(groupLabels()).toEqual(['Bookmarks', 'Web', 'Translate']);
    expect(groupRows('Bookmarks')).toEqual(['Zulip']);
    expect(searchRepo).not.toHaveBeenCalled();
  });

  it('opens the selected bookmark on Enter, records it, counts it and closes', () => {
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://vitest.dev/guide');
    // The count is what makes an unused bookmark findable later.
    expect(countBookmarkUse).toHaveBeenCalledWith('Vitest guide');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'bookmark:Vitest guide',
      title: 'Vitest guide',
      subtitle: 'https://vitest.dev/guide',
      url: 'https://vitest.dev/guide',
    });
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });
});

describe('recent actions', () => {
  it('lists them first, above the bookmarks', async () => {
    loadRecents.mockResolvedValue([
      {
        id: 'bookmark:Zulip',
        title: 'Zulip',
        subtitle: 'https://zulip.example/',
        url: 'https://zulip.example/',
      },
    ]);
    palette.toggle();
    palette.toggle();
    await settle();

    expect(groupLabels()).toEqual(['Recent', 'Bookmarks', 'Actions']);
    expect(rowTitles()[0]).toBe('Zulip');
    expect(selectedTitle()).toBe('Zulip');
  });

  it('opens a recent that has a url', async () => {
    loadRecents.mockResolvedValue([
      { id: 'bookmark:Zulip', title: 'Zulip', url: 'https://zulip.example/' },
    ]);
    palette.toggle();
    palette.toggle();
    await settle();

    press('Enter');
    expect(open).toHaveBeenCalledWith('https://zulip.example/');
  });

  it('replays a recent action by id', async () => {
    loadRecents.mockResolvedValue([{ id: 'bookmark-page', title: 'Bookmark this page' }]);
    palette.toggle();
    palette.toggle();
    await settle();

    press('Enter');
    await settle();
    expect(bookmarkRun).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('says so when a recorded action no longer exists', async () => {
    loadRecents.mockResolvedValue([{ id: 'gone', title: 'Something removed' }]);
    palette.toggle();
    palette.toggle();
    await settle();

    press('Enter');
    await settle();
    expect(statusText()).toContain('no longer available');
  });

  it('filters with the query like everything else', async () => {
    loadRecents.mockResolvedValue([{ id: 'bookmark-page', title: 'Bookmark this page' }]);
    palette.toggle();
    palette.toggle();
    await settle();

    type('zul');
    expect(groupLabels()).toEqual(['Bookmarks', 'Web', 'Translate']);
  });
});

describe('running an action', () => {
  it('runs it, shows the result, records it and stays open', async () => {
    await activateRow('Bookmark this page');

    expect(bookmarkRun).toHaveBeenCalledWith([]);
    expect(statusText()).toBe('Bookmarked “This page”');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'bookmark-page',
      title: 'Bookmark this page',
      subtitle: 'A page',
    });
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });

  it('shows a rejected action instead of failing silently', async () => {
    bookmarkRun.mockRejectedValue(new Error('That page is already bookmarked'));
    await activateRow('Bookmark this page');
    expect(statusText()).toBe('That page is already bookmarked');
  });

  it('reloads the bookmarks afterwards, so a new one shows up', async () => {
    await activateRow('Bookmark this page');
    // Once on open, once after the action.
    expect(loadBookmarks).toHaveBeenCalledTimes(2);
  });

  it('masks a secret field and leaves it out of the answers so far', async () => {
    const join = vi.fn(async () => 'Joined');
    actions = [
      {
        id: 'join',
        title: 'Join…',
        prompts: [{ label: 'Password', secret: true }, { label: 'Name' }],
        run: join,
      },
    ];
    type('');
    await activateRow('Join…');
    expect(input().type).toBe('password');
    type('hunter2');
    press('Enter');
    expect(input().type).toBe('text');
    expect(shadow().querySelector('.empty')?.textContent).toBe('Join…');
    type('Ada');
    press('Enter');
    await settle();
    expect(join).toHaveBeenCalledWith(['hunter2', 'Ada']);
  });
});

describe('submenus', () => {
  it('replaces the list with the children and shows where you are', async () => {
    await activateRow('Pinned tab groups…');

    expect(children).toHaveBeenCalledTimes(1);
    expect(crumbText()).toBe('Pinned tab groups…');
    expect(rowTitles()).toEqual(['Load Work', 'Rename Work…']);
    // Bookmarks are out of the way while inside a submenu.
    expect(groupLabels()).toEqual(['Pinned tab groups…']);
  });

  it('runs a child action', async () => {
    await activateRow('Pinned tab groups…');
    await activateRow('Load Work');
    expect(statusText()).toBe('Work: pinned 2');
  });

  it('does not double the ellipsis a submenu title already ends with', async () => {
    await activateRow('Pinned tab groups…');
    expect(input().placeholder).toBe('Search Pinned tab groups…');
  });

  it('filters the children by the query', async () => {
    await activateRow('Pinned tab groups…');
    type('rename');
    expect(rowTitles()).toEqual(['Rename Work…']);
  });

  it('Escape steps back out rather than closing the palette', async () => {
    await activateRow('Pinned tab groups…');
    press('Escape');

    expect(crumbText()).toBeNull();
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
    expect(rowTitles()).toContain('Vitest guide');

    press('Escape');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('surfaces a submenu that cannot be loaded', async () => {
    children.mockRejectedValue(new Error('No token found'));
    await activateRow('Pinned tab groups…');
    expect(statusText()).toBe('No token found');
    expect(crumbText()).toBeNull();
  });
});

describe('actions that take an argument', () => {
  const enterPrompt = async () => {
    await activateRow('Pinned tab groups…');
    await activateRow('Rename Work…');
  };

  it('asks for the argument instead of running straight away', async () => {
    await enterPrompt();

    expect(renameRun).not.toHaveBeenCalled();
    expect(input().placeholder).toBe('New name');
    expect(hintText()).toContain('⏎ next');
    expect(rowTitles()).toEqual([]);
  });

  it('runs with what was typed', async () => {
    await enterPrompt();
    type('Reading');
    press('Enter');
    await settle();

    expect(renameRun).toHaveBeenCalledWith(['Reading']);
    expect(statusText()).toBe('Renamed to Reading');
  });

  it('Escape cancels the prompt and goes back to the submenu', async () => {
    await enterPrompt();
    press('Escape');

    expect(renameRun).not.toHaveBeenCalled();
    expect(rowTitles()).toEqual(['Load Work', 'Rename Work…']);
  });
});

describe('repo search', () => {
  it('only runs on Tab, and only for the typed query', async () => {
    searchRepo.mockResolvedValue([
      {
        path: 'apps/console/vite.config.ts',
        name: 'vite.config.ts',
        url: 'https://console.test/1',
      },
    ]);
    type('vite');
    expect(searchRepo).not.toHaveBeenCalled();

    press('Tab');
    await settle();

    expect(searchRepo).toHaveBeenCalledExactlyOnceWith('vite');
    expect(rowTitles()).toContain('vite.config.ts');
  });

  it('opens a repo hit and records it', async () => {
    searchRepo.mockResolvedValue([{ path: 'a/b.ts', name: 'b.ts', url: 'https://console.test/b' }]);
    type('nothing here');
    press('Tab');
    await settle();

    await activateRow('b.ts');
    expect(open).toHaveBeenCalledWith('https://console.test/b');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'repo:a/b.ts',
      title: 'b.ts',
      subtitle: 'a/b.ts',
      url: 'https://console.test/b',
    });
  });

  it('offers what else a hit can do before opening it, when there is something', async () => {
    const addRun = vi.fn(async ([text]: string[]) => `Added ${text}`);
    const fileChoices = vi.fn((file: RepoResult): ModeItem[] =>
      file.path.endsWith('.todos.md')
        ? [
            { id: 'open', title: `Open ${file.name} in Kaihuman`, url: file.url },
            {
              id: 'add',
              title: 'Add a todo…',
              action: {
                id: 'add',
                title: 'Add a todo',
                prompts: [{ label: 'Todo' }],
                recent: false,
                run: addRun,
              },
            },
          ]
        : [],
    );
    palette.destroy();
    palette = createCommandPalette({
      loadBookmarks: loadBookmarks as any,
      searchRepo: searchRepo as any,
      fileChoices,
      open: open as any,
      actions: () => actions,
      loadRecents: loadRecents as any,
      rememberRecent: rememberRecent as any,
      countBookmarkUse: countBookmarkUse as any,
      modes,
      copy: copy as any,
    });
    palette.toggle();
    await settle();
    searchRepo.mockResolvedValue([
      { path: 'a/inbox.todos.md', name: 'inbox.todos.md', url: 'https://console.test/inbox' },
      { path: 'a/b.ts', name: 'b.ts', url: 'https://console.test/b' },
    ]);
    type('inbox');
    press('Tab');
    await settle();

    await activateRow('inbox.todos.md');
    expect(open).not.toHaveBeenCalled();
    expect(crumbText()).toBe('inbox.todos.md');
    expect(rowTitles()).toEqual(['Open inbox.todos.md in Kaihuman', 'Add a todo…']);

    await activateRow('Add a todo…');
    type('Call the bank');
    press('Enter');
    await settle();
    expect(addRun).toHaveBeenCalledExactlyOnceWith(['Call the bank']);
    expect(statusText()).toBe('Added Call the bank');
    expect(rememberRecent).not.toHaveBeenCalled();

    // A file with nothing to add to opens straight away, as before.
    type('inbox');
    press('Tab');
    await settle();
    await activateRow('b.ts');
    expect(open).toHaveBeenCalledWith('https://console.test/b');
  });

  it('does not search the repo from inside a submenu', async () => {
    await activateRow('Pinned tab groups…');
    type('anything');
    press('Tab');
    await settle();
    expect(searchRepo).not.toHaveBeenCalled();
  });

  it('surfaces a rate limit', async () => {
    searchRepo.mockRejectedValue(new Error('GitHub search is rate limited'));
    type('vite');
    press('Tab');
    await settle();
    expect(statusText()).toContain('rate limited');
  });

  it('drops stale repo results once the query changes', async () => {
    searchRepo.mockResolvedValue([{ path: 'a/b.ts', name: 'b.ts', url: 'https://console.test/b' }]);
    type('vite');
    press('Tab');
    await settle();
    expect(rowTitles()).toContain('b.ts');

    type('zul');
    expect(groupLabels()).toEqual(['Bookmarks', 'Web', 'Translate']);
  });
});

describe('web search', () => {
  it('runs a matching action on Enter rather than searching the web for its name', async () => {
    type('bookmark this');
    press('Enter');
    await settle();
    expect(bookmarkRun).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('searches the web on Enter when nothing else matches', () => {
    type('rust async book');
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://www.google.com/search?q=rust+async+book');
  });

  it('offers every engine for the query, below the actions', () => {
    type('bookmark');
    expect(groupLabels()).toEqual(['Actions', 'Web', 'Translate']);
    expect(groupRows('Web')).toEqual([
      'Search Google for “bookmark”',
      'Search DuckDuckGo for “bookmark”',
      'Search Ecosia for “bookmark”',
      'Search Amazon for “bookmark”',
      'Search Amazon.de for “bookmark”',
      'Search Reddit for “bookmark”',
      'Search Bing for “bookmark”',
      'Search Brave Search for “bookmark”',
      'Search Startpage for “bookmark”',
      'Search Wikipedia for “bookmark”',
      'Search YouTube for “bookmark”',
      'Search GitHub for “bookmark”',
      'Search Stack Overflow for “bookmark”',
      'Search Yahoo for “bookmark”',
      'Search Qwant for “bookmark”',
    ]);
  });

  it('converts a sum, a color or a timestamp above the web search, and ⏎ copies it', async () => {
    type('12*7');
    expect(groupRows('Convert')).toEqual(['84']);
    expect(groupLabels().indexOf('Convert')).toBeLessThan(groupLabels().indexOf('Web'));
    press('Enter');
    await settle();
    expect(copy).toHaveBeenCalledWith('84');
    expect(open).not.toHaveBeenCalled();
  });

  it('converts nothing for plain text or a plain number', () => {
    type('rust book');
    expect(groupLabels()).not.toContain('Convert');
    type('2024');
    expect(groupLabels()).not.toContain('Convert');
  });

  it('shows nothing to search for until something is typed', () => {
    expect(groupLabels()).not.toContain('Web');
  });

  it('opens the engine’s results page with the query encoded, and records it', async () => {
    type('c++ & rust');
    await activateRow('Search DuckDuckGo for “c++ & rust”');

    expect(open).toHaveBeenCalledWith('https://duckduckgo.com/?q=c%2B%2B+%26+rust');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'web:duckduckgo:c++ & rust',
      title: 'DuckDuckGo: c++ & rust',
      subtitle: 'https://duckduckgo.com/?q=c%2B%2B+%26+rust',
      url: 'https://duckduckgo.com/?q=c%2B%2B+%26+rust',
    });
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('is not offered inside a submenu', async () => {
    await activateRow('Pinned tab groups…');
    type('work');
    expect(groupLabels()).not.toContain('Web');
  });
});

describe('settings', () => {
  const reopenWith = async (settings: CommandPaletteSettings) => {
    palette.destroy();
    palette = createCommandPalette({
      loadBookmarks: loadBookmarks as any,
      searchRepo: searchRepo as any,
      open: open as any,
      actions: () => actions,
      loadRecents: loadRecents as any,
      rememberRecent: rememberRecent as any,
      countBookmarkUse: countBookmarkUse as any,
      modes,
      copy: copy as any,
      loadSettings: async () => settings,
    });
    palette.toggle();
    await settle();
  };

  const kibana: PaletteToolSetting = {
    prefix: 'k',
    name: 'Kibana',
    description: 'Search the logs',
    url: 'https://kibana.example/app',
    params: [{ key: 'q', value: 'level:error AND {query}', empty: 'level:error' }],
  };

  it('offers the settings’ engines in their order, the first on Enter', async () => {
    await reopenWith({
      searchEngines: [
        { name: 'Amazon.de', url: 'https://www.amazon.de/s?k={query}', params: [] },
        { name: 'Google', url: 'https://www.google.com/search?q={query}', params: [] },
      ],
      assistants: [],
      tools: [],
    });
    type('usb kabel');
    expect(groupRows('Web')).toEqual([
      'Search Amazon.de for “usb kabel”',
      'Search Google for “usb kabel”',
    ]);
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://www.amazon.de/s?k=usb+kabel');
  });

  it('turns each tool into a prefix that opens its link', async () => {
    await reopenWith({ searchEngines: [], assistants: [], tools: [kibana] });
    type('>k');
    expect(crumbText()).toContain('Kibana');
    expect(rowTitles()).toEqual(['Kibana']);
    type('timeout');
    expect(rowTitles()).toEqual(['Kibana “timeout”']);
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://kibana.example/app?q=level%3Aerror+AND+timeout');
  });

  it('drops the default >l tool when the settings have other tools', async () => {
    await reopenWith({ searchEngines: [], assistants: [], tools: [kibana] });
    type('>l');
    expect(crumbText()).toBeNull();
  });

  it('leaves out a tool whose prefix a mode of the surface claims', async () => {
    await reopenWith({ searchEngines: [], assistants: [], tools: [{ ...kibana, prefix: 'p' }] });
    type('>p');
    expect(crumbText()).toContain('Prompts');
  });

  it('offers the question to each assistant under >a, and copies it on opening one', async () => {
    type('>a');
    expect(crumbText()).toContain('Ask AI');
    expect(rowTitles()).toEqual(['ChatGPT', 'Claude', 'Gemini', 'GitHub Copilot', 'Perplexity']);
    type('what is rust');
    expect(rowTitles()).toEqual([
      'Ask ChatGPT “what is rust”',
      'Ask Claude “what is rust”',
      'Ask Gemini “what is rust”',
      'Ask GitHub Copilot “what is rust”',
      'Ask Perplexity “what is rust”',
    ]);
    press('ArrowDown');
    press('Enter');
    await settle();
    expect(copy).toHaveBeenCalledWith('what is rust');
    expect(open).toHaveBeenCalledWith('https://claude.ai/new?q=what+is+rust');
  });

  it('still opens the assistant when the question cannot be copied', async () => {
    copy.mockRejectedValueOnce(new Error('No clipboard'));
    type('>a');
    type('hi');
    press('Enter');
    await settle();
    expect(open).toHaveBeenCalledWith('https://chatgpt.com/?q=hi');
  });

  it('has no >a without assistants', async () => {
    await reopenWith({ searchEngines: [], assistants: [], tools: [] });
    type('>a');
    expect(crumbText()).toBeNull();
  });

  it('waits for a space after a prefix that a longer one starts with', async () => {
    await reopenWith({
      searchEngines: [],
      assistants: [],
      tools: [kibana, { ...kibana, prefix: 'ki', name: 'Kibana infra' }],
    });
    type('>k');
    expect(crumbText()).toBeNull();
    expect(hintText()).toContain('space enters >k Kibana');
    type('>k ');
    expect(crumbText()).toContain('Kibana');
    expect(crumbText()).not.toContain('infra');
  });

  it('enters the longer prefix as soon as it is typed', async () => {
    await reopenWith({
      searchEngines: [],
      assistants: [],
      tools: [kibana, { ...kibana, prefix: 'ki', name: 'Kibana infra' }],
    });
    type('>ki');
    expect(crumbText()).toContain('Kibana infra');
  });

  it('enters a prefix no other one starts with right away', async () => {
    await reopenWith({
      searchEngines: [],
      assistants: [],
      tools: [kibana, { ...kibana, prefix: 'ki', name: 'Kibana infra' }],
    });
    type('>p');
    expect(crumbText()).toContain('Prompts');
  });

  it('enters a surface’s >id at once and the default >i IMDb tool after a space', async () => {
    modes.push({
      prefix: 'id',
      title: 'Ideas',
      placeholder: 'Search ideas',
      description: 'Ideas',
      load: async () => [],
    });
    await reopenWith(DEFAULT_PALETTE_SETTINGS);
    type('>i');
    expect(crumbText()).toBeNull();
    type('>i ');
    expect(crumbText()).toContain('IMDb');
    await reopenWith(DEFAULT_PALETTE_SETTINGS);
    type('>id');
    expect(crumbText()).toContain('Ideas');
  });

  it('keeps the tools listed in the help', async () => {
    await reopenWith({ searchEngines: [], assistants: [], tools: [kibana] });
    type('?');
    await settle();
    expect(rowTitles()).toContain('>k  Kibana');
  });
});

describe('bookmark loading', () => {
  it('shows the sync hint when nothing is cached', async () => {
    palette.toggle();
    loadBookmarks.mockResolvedValue([]);
    palette.toggle();
    await settle();
    expect(shadow().querySelector('.empty')?.textContent).toContain('No bookmarks cached');
  });

  it('surfaces a load failure but still offers the actions', async () => {
    palette.toggle();
    loadBookmarks.mockRejectedValue(new Error('No token found'));
    palette.toggle();
    await settle();
    expect(statusText()).toBe('No token found');
    expect(rowTitles()).toContain('Bookmark this page');
  });
});

describe('actions that walk through several fields', () => {
  const start = () => activateRow('Bookmark this page…');

  it('opens on the first field, prefilled, and says where it is', async () => {
    await start();

    expect(guidedRun).not.toHaveBeenCalled();
    expect(input().placeholder).toBe('URL');
    expect(input().value).toBe('https://page.example/');
    expect(crumbText()).toBe('Bookmark this page · URL (1/3)');
  });

  it('moves on with Enter, carrying each answer', async () => {
    await start();
    press('Enter');
    expect(crumbText()).toBe('Bookmark this page · Title (2/3)');
    expect(input().value).toBe('The page');

    type('A better title');
    press('Enter');
    expect(crumbText()).toBe('Bookmark this page · Tags (3/3)');
    // The last field has nothing to prefill.
    expect(input().value).toBe('');

    type('dev docs');
    press('Enter');
    await settle();

    expect(guidedRun).toHaveBeenCalledWith(['https://page.example/', 'A better title', 'dev docs']);
    expect(statusText()).toBe('Bookmarked https://page.example/');
  });

  it('lets a prefilled field be replaced outright', async () => {
    await start();
    type('https://corrected.example/');
    press('Enter');
    press('Enter');
    press('Enter');
    await settle();

    expect(guidedRun.mock.calls[0]?.[0][0]).toBe('https://corrected.example/');
  });

  // A typo two fields back is the whole reason Escape steps rather than cancels.
  it('Escape walks back a field, restoring what was typed there', async () => {
    await start();
    type('https://first.example/');
    press('Enter');
    type('Second');
    press('Enter');
    expect(crumbText()).toBe('Bookmark this page · Tags (3/3)');

    press('Escape');
    expect(crumbText()).toBe('Bookmark this page · Title (2/3)');
    expect(input().value).toBe('Second');

    press('Escape');
    expect(crumbText()).toBe('Bookmark this page · URL (1/3)');
    expect(input().value).toBe('https://first.example/');
    expect(hintText()).toContain('esc cancel');
  });

  it('Escape on the first field cancels the whole walk', async () => {
    await start();
    press('Escape');

    expect(guidedRun).not.toHaveBeenCalled();
    expect(crumbText()).toBeNull();
    expect(rowTitles()).toContain('Vitest guide');
  });

  it('shows what has been answered so far', async () => {
    await start();
    press('Enter');
    type('A title');
    press('Enter');

    expect(shadow().querySelector('.empty')?.textContent).toBe('https://page.example/  ·  A title');
  });
});

describe('filterModeItems', () => {
  it('needs every word somewhere, and ranks items whose title has them all first', () => {
    const items: ModeItem[] = [
      { id: 'a', title: 'Review', keywords: 'commit message' },
      { id: 'b', title: 'Commit message' },
      { id: 'c', title: 'Commit', subtitle: 'unrelated' },
    ];
    expect(filterModeItems(items, 'commit message').map((item) => item.id)).toEqual(['b', 'a']);
    expect(filterModeItems(items, '  ').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('prefix modes', () => {
  it('enters a mode on its prefix, loads it once, and filters as you type', async () => {
    type('>p');
    await settle();

    expect(crumbText()).toBe('Prompts');
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('Search prompts');
    expect(groupLabels()).toEqual(['Prompts']);
    expect(rowTitles()).toEqual(['Commit message', 'Refactor to hooks', 'o/repo']);

    type('staged');
    expect(rowTitles()).toEqual(['Commit message']);
    type('nothing like it');
    expect(shadow().querySelector('.empty')?.textContent).toBe('No matches.');
    expect(loadPrompts).toHaveBeenCalledTimes(1);
  });

  it('drops the space typed right after the prefix', async () => {
    type('>p');
    await settle();
    type(' hooks');
    expect(input().value).toBe('hooks');
  });

  it('keeps what follows the prefix as the query', async () => {
    type('>p hooks');
    await settle();
    expect(input().value).toBe('hooks');
    expect(rowTitles()).toEqual(['Refactor to hooks']);
  });

  it('copies the chosen entry and closes', async () => {
    type('>p');
    await settle();
    press('Enter');
    await settle();
    expect(copy).toHaveBeenCalledWith('Write it');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('stays open and says so when copying fails', async () => {
    copy.mockRejectedValueOnce(new Error('No clipboard here'));
    type('>p');
    await settle();
    press('Enter');
    await settle();
    expect(statusText()).toBe('No clipboard here');
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });

  it('shows a load failure', async () => {
    loadPrompts.mockRejectedValueOnce(new Error('No .prompts.md files'));
    type('>p');
    await settle();
    expect(statusText()).toBe('No .prompts.md files');
  });

  it('opens a child list on Tab and walks back out with Escape, then leaves the mode', async () => {
    type('>p repo');
    await settle();
    expect(hintText()).toContain('⇥ more');
    press('Tab');

    expect(crumbText()).toBe('Prompts › o/repo');
    expect(rowTitles()).toEqual(['o/repo · Issues', 'o/repo · Pull requests']);
    type('pull');
    await activateRow('o/repo · Pull requests');
    expect(open).toHaveBeenCalledWith('https://github.com/o/repo/pulls');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'r1:pulls',
      title: 'o/repo · Pull requests',
      subtitle: undefined,
      url: 'https://github.com/o/repo/pulls',
    });
  });

  it('Escape goes from the child list to the mode, and from the mode to the top', async () => {
    type('>p repo');
    await settle();
    press('ArrowRight');
    expect(crumbText()).toBe('Prompts › o/repo');
    press('Escape');
    expect(crumbText()).toBe('Prompts');
    press('Escape');
    expect(crumbText()).toBeNull();
    expect(rowTitles()).toContain('Vitest guide');
  });

  it('Backspace on an empty input leaves the mode and gives the prefix back', async () => {
    type('>p');
    await settle();
    press('Backspace');
    expect(crumbText()).toBeNull();
    expect(input().value).toBe('>p');
  });

  it('does not treat an unknown prefix or a url as a mode', () => {
    type('>x thing');
    expect(crumbText()).toBeNull();
    type('https://vitest.dev');
    expect(crumbText()).toBeNull();
  });

  it('submits only on Enter, then Enter copies the selected answer', async () => {
    type('>t Guten Morgen');
    await settle();
    // Text typed with the prefix is submitted at once — it was typed to be translated.
    expect(translate).toHaveBeenCalledWith('Guten Morgen');
    expect(rowTitles()).toEqual(['EN Guten Morgen', 'FR Guten Morgen']);

    type('Guten Abend');
    expect(rowTitles()).toEqual([]);
    expect(hintText()).toContain('⏎ translate');
    expect(translate).toHaveBeenCalledTimes(1);

    press('Enter');
    await settle();
    expect(translate).toHaveBeenLastCalledWith('Guten Abend');
    press('ArrowDown');
    press('Enter');
    await settle();
    expect(copy).toHaveBeenCalledWith('FR Guten Abend');
  });

  it('drops an answer that arrives after the text changed', async () => {
    let finish: (items: ModeItem[]) => void = () => {};
    translate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    type('>t one');
    type('two');
    finish([{ id: 'late', title: 'late', copy: 'late' }]);
    await settle();
    expect(rowTitles()).toEqual([]);
  });

  it('offers typed text to a mode that submits, and switches into it', async () => {
    type('Guten Morgen');
    expect(groupRows('Translate')).toEqual(['Translate “Guten Morgen”']);

    await activateRow('Translate “Guten Morgen”');
    expect(crumbText()).toBe('Translate');
    expect(translate).toHaveBeenCalledWith('Guten Morgen');
  });

  it('lists the prefixes in the hint of an empty palette', () => {
    expect(hintText()).toBe(
      '↑↓ navigate · ⏎ select · ? help · >b >p >t >a >l >e >m >n >i · esc close',
    );
  });

  it('starts outside any mode each time it opens', async () => {
    type('>p');
    await settle();
    palette.close();
    palette.open();
    await settle();
    expect(crumbText()).toBeNull();
  });
});

describe('submit history', () => {
  it('lists earlier queries while nothing is typed, and hides them once something is', async () => {
    history.mockResolvedValue(['Guten Morgen', 'fr: good night']);
    type('>t');
    await settle();

    expect(groupLabels()).toEqual(['Recent']);
    expect(rowTitles()).toEqual(['Guten Morgen', 'fr: good night']);
    expect(hintText()).toContain('⏎ translate again');

    type('Hallo');
    expect(rowTitles()).toEqual([]);
    type('');
    expect(rowTitles()).toEqual(['Guten Morgen', 'fr: good night']);
  });

  it('submits the chosen one again, with ⏎ as with a click', async () => {
    history.mockResolvedValue(['Guten Morgen', 'fr: good night']);
    type('>t');
    await settle();
    press('ArrowDown');
    press('Enter');
    await settle();

    expect(translate).toHaveBeenCalledWith('fr: good night');
    expect(input().value).toBe('fr: good night');
    expect(rowTitles()).toEqual(['EN fr: good night', 'FR fr: good night']);
  });

  it('reads the history again after a submit, so the new query is there next time', async () => {
    type('>t Hallo');
    await settle();
    expect(history).toHaveBeenCalledTimes(2);
  });

  it('does not submit an empty input', async () => {
    type('>t');
    await settle();
    press('Enter');
    await settle();
    expect(translate).not.toHaveBeenCalled();
  });

  it('shows no history when there is none to read', async () => {
    history.mockRejectedValue(new Error('offline'));
    type('>t');
    await settle();
    expect(rowTitles()).toEqual([]);
    expect(statusText()).toBeNull();
  });
});

describe('the editor', () => {
  let save: Mock<(text: string) => Promise<void>>;
  let saveAs: Mock<(path: string, text: string) => Promise<string>>;
  let loadDumps: Mock<() => Promise<ModeItem[]>>;

  const editorArea = () => shadow().querySelector('.editor') as HTMLTextAreaElement;
  const edit = (value: string) => {
    editorArea().value = value;
    editorArea().dispatchEvent(new Event('input'));
  };
  const pressInEditor = (key: string, init: KeyboardEventInit = {}) =>
    editorArea().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    );
  const doc = (text: string): EditableText => ({
    title: 'Notes',
    text,
    save,
    saveAs: { suggestedPath: () => '~/Documents/dump.txt', save: saveAs },
  });

  beforeEach(async () => {
    save = vi.fn(async () => {});
    saveAs = vi.fn(async (path: string) => `/home/me/${path.slice(2)}`);
    loadDumps = vi.fn(async () => [{ id: 'd1', title: 'Notes', edit: () => doc('hello') }]);
    modes.push({
      prefix: 'd',
      title: 'Dump',
      placeholder: 'Search dumps',
      description: 'Scratch text',
      load: loadDumps,
    });
    type('>d');
    await settle();
    press('Enter');
    await settle();
  });

  it('opens the chosen entry in place of the list, with its text', () => {
    expect(editorArea().hidden).toBe(false);
    expect(editorArea().value).toBe('hello');
    expect(shadow().querySelector('.rows')?.hasAttribute('hidden')).toBe(true);
    expect(input().hidden).toBe(true);
    expect(crumbText()).toBe('Dump › Notes');
    expect(hintText()).toContain('⌃S save as file');
    expect(shadow().activeElement).toBe(editorArea());
  });

  it('saves a pause after typing, once', async () => {
    vi.useFakeTimers();
    try {
      edit('hello w');
      edit('hello world');
      expect(save).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith('hello world');
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves on Escape, goes back to the list and loads it again', async () => {
    edit('hello there');
    pressInEditor('Escape');
    await settle();
    await settle();

    expect(save).toHaveBeenCalledWith('hello there');
    expect(editorArea().hidden).toBe(true);
    expect(crumbText()).toBe('Dump');
    expect(loadDumps).toHaveBeenCalledTimes(2);
  });

  it('does not save text that did not change', async () => {
    pressInEditor('Escape');
    await settle();
    expect(save).not.toHaveBeenCalled();
  });

  it('lands saves in order, one after the other', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    save.mockImplementationOnce(
      (text) =>
        new Promise<void>((resolve) => {
          release = () => {
            order.push(text);
            resolve();
          };
        }),
    );
    save.mockImplementation(async (text) => {
      order.push(text);
    });
    edit('one');
    pressInEditor('Escape');
    press('Enter');
    await settle();
    edit('two');
    pressInEditor('Escape');
    await settle();
    expect(order).toEqual([]);
    release();
    await settle();
    await settle();
    expect(order).toEqual(['one', 'two']);
  });

  it('saves as a file on ⌃S, at the path typed over the suggestion', async () => {
    edit('keep me');
    pressInEditor('s', { ctrlKey: true });
    expect(input().hidden).toBe(false);
    expect(input().value).toBe('~/Documents/dump.txt');
    expect(crumbText()).toBe('Dump › Notes · Save as');

    type('~/Documents/keep.txt');
    press('Enter');
    await settle();
    expect(saveAs).toHaveBeenCalledWith('~/Documents/keep.txt', 'keep me');
    expect(statusText()).toBe('Saved to /home/me/Documents/keep.txt');
    expect(input().hidden).toBe(true);
    expect(shadow().activeElement).toBe(editorArea());
  });

  it('Escape in the path goes back to the text without saving', () => {
    pressInEditor('s', { ctrlKey: true });
    press('Escape');
    expect(saveAs).not.toHaveBeenCalled();
    expect(editorArea().hidden).toBe(false);
  });

  it('shows why a save as failed', async () => {
    saveAs.mockRejectedValueOnce(new Error('/x already exists'));
    pressInEditor('s', { ctrlKey: true });
    press('Enter');
    await settle();
    expect(statusText()).toBe('/x already exists');
  });

  it('copies everything on ⌃⏎, saves, and closes', async () => {
    edit('copy me');
    pressInEditor('Enter', { ctrlKey: true });
    await settle();
    expect(copy).toHaveBeenCalledWith('copy me');
    expect(save).toHaveBeenCalledWith('copy me');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('saves when the palette closes with the editor open', async () => {
    edit('unsaved');
    palette.close();
    await settle();
    expect(save).toHaveBeenCalledWith('unsaved');
  });

  it('opens on the list again, not in the editor', async () => {
    palette.close();
    palette.open();
    await settle();
    expect(editorArea().hidden).toBe(true);
    expect(crumbText()).toBeNull();
  });
});

describe('help', () => {
  it('opens on ? and lists the prefixes, searching and keys, and the actions', async () => {
    type('?');
    await settle();

    expect(crumbText()).toBe('Help');
    expect(input().value).toBe('');
    expect(groupLabels()).toEqual([
      'Prefixes — ⏎ switches to one',
      'Searching and keys',
      'Actions — ⏎ runs one',
    ]);
    expect(groupRows('Prefixes — ⏎ switches to one')).toEqual([
      '>b  Bookmarks',
      '>p  Prompts',
      '>t  Translate',
      // The default settings' assistants and tools, since this surface loads none.
      '>a  Ask AI',
      '>l  Tsuga logs',
      '>e  LEO',
      '>m  Google Maps',
      '>n  npm',
      '>i  IMDb',
    ]);
    expect(groupRows('Actions — ⏎ runs one')).toEqual([
      'Bookmark this page',
      'Bookmark this page…',
      'Pinned tab groups…',
    ]);
    expect(rowTitles()).toContain('⇥  Search the repo');
    expect(shadow().querySelectorAll('.row .subtitle')[1]?.textContent).toBe('Find a prompt');
  });

  it('is offered in the empty palette’s hint', () => {
    expect(hintText()).toContain('? help · >b >p');
  });

  it('filters, keeping each section under its heading', async () => {
    type('? translate');
    await settle();
    expect(input().value).toBe('translate');
    expect(rowTitles()).toEqual(['>t  Translate']);

    type('bookmark');
    expect(groupLabels()).toEqual([
      'Prefixes — ⏎ switches to one',
      'Searching and keys',
      'Actions — ⏎ runs one',
    ]);
  });

  it('switches to the chosen prefix', async () => {
    type('?');
    await settle();
    await activateRow('>p  Prompts');
    await settle();
    expect(crumbText()).toBe('Prompts');
    expect(rowTitles()).toEqual(['Commit message', 'Refactor to hooks', 'o/repo']);
  });

  it('runs the chosen action as if picked from the list', async () => {
    type('?');
    await settle();
    await activateRow('Bookmark this page');
    await settle();
    expect(bookmarkRun).toHaveBeenCalledTimes(1);
    expect(crumbText()).toBeNull();
  });

  it('walks an action through its fields', async () => {
    type('?');
    await settle();
    await activateRow('Bookmark this page…');
    expect(crumbText()).toBe('Bookmark this page · URL (1/3)');
  });

  it('gives the ? back on Backspace, like any prefix', async () => {
    type('?');
    await settle();
    press('Backspace');
    expect(crumbText()).toBeNull();
    expect(input().value).toBe('?');
  });

  it('is only a prefix at the start', () => {
    type('what?');
    expect(crumbText()).toBeNull();
  });
});

describe('long lists', () => {
  it('wraps the help’s descriptions and nothing else', async () => {
    const rowsElement = () => shadow().querySelector('.rows') as HTMLElement;
    expect(rowsElement().dataset.wrap).toBe('false');
    type('?');
    await settle();
    expect(rowsElement().dataset.wrap).toBe('true');
  });

  it('scrolls the selected row into view as the selection moves', () => {
    const scrolled: string[] = [];
    const prototype = HTMLElement.prototype as any;
    prototype.scrollIntoView = function (this: HTMLElement) {
      scrolled.push(this.querySelector('.title')?.textContent ?? '');
    };
    try {
      press('ArrowDown');
      expect(scrolled.at(-1)).toBe('Zulip');
    } finally {
      delete prototype.scrollIntoView;
    }
  });
});

describe('mode entries that run an action', () => {
  const opens = vi.fn(([prompt = '']: string[]) => {
    if (!prompt) throw new Error('Type a prompt');
    return {
      id: `cc:${prompt}`,
      title: `CC: ${prompt}`,
      url: `https://claude.ai/code?p=${prompt}`,
    };
  });

  beforeEach(async () => {
    opens.mockClear();
    modes.push({
      prefix: 'c',
      title: 'Claude Code',
      placeholder: 'Search',
      description: 'Start a session',
      load: async () => [
        {
          id: 'repo',
          title: 'o/r',
          action: { id: 'cc', title: 'Claude Code: o/r', prompts: [{ label: 'Prompt' }], opens },
        },
      ],
    });
    type('>c');
    await settle();
    press('Enter');
    await settle();
  });

  it('asks for the action’s fields in the input, outside the mode', () => {
    expect(crumbText()).toBe('Claude Code: o/r · Prompt (1/1)');
  });

  it('opens where the answers lead, remembers it like a bookmark, and closes', async () => {
    type('add tests');
    press('Enter');
    await settle();
    expect(open).toHaveBeenCalledWith('https://claude.ai/code?p=add tests');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'cc:add tests',
      title: 'CC: add tests',
      url: 'https://claude.ai/code?p=add tests',
    });
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('stays open and says why when the answers are refused', async () => {
    press('Enter');
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(statusText()).toBe('Type a prompt');
  });
});

describe('the > prefix', () => {
  it('switches as soon as the letter is typed', async () => {
    type('>');
    expect(crumbText()).toBeNull();
    type('>p');
    await settle();
    expect(crumbText()).toBe('Prompts');
  });

  it('leaves a longer word alone, and the old colon form too', () => {
    type('>prompt');
    expect(crumbText()).toBeNull();
    type('p: hooks');
    expect(crumbText()).toBeNull();
  });

  it('offers typed text to a submitting mode under its new prefix', () => {
    type('Guten Morgen');
    expect(shadow().textContent).toContain('or type >t first');
  });
});

describe('>b', () => {
  it('lists only bookmarks, ranked as the main search ranks them', async () => {
    type('>b');
    await settle();
    expect(crumbText()).toBe('Bookmarks');
    expect(groupLabels()).toEqual(['Bookmarks']);
    expect(rowTitles()).toEqual(['Vitest guide', 'Zulip']);

    type('chat');
    expect(rowTitles()).toEqual(['Zulip']);
    expect(shadow().querySelector('.row .subtitle')?.textContent).toBe(
      'https://zulip.example/  #chat',
    );
  });

  it('shows no actions, web search or translate offer for what is typed', async () => {
    type('>b bookmark');
    await settle();
    expect(groupLabels()).toEqual([]);
    expect(shadow().querySelector('.empty')?.textContent).toBe('No matches.');
  });

  it('opens a bookmark as the main list does: counted, remembered, closed', async () => {
    type('>b zul');
    await settle();
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://zulip.example/');
    expect(countBookmarkUse).toHaveBeenCalledWith('Zulip');
    expect(rememberRecent).toHaveBeenCalledWith({
      id: 'bookmark:Zulip',
      title: 'Zulip',
      subtitle: 'https://zulip.example/',
      url: 'https://zulip.example/',
    });
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('gives >b back on Backspace', async () => {
    type('>b');
    await settle();
    press('Backspace');
    expect(input().value).toBe('>b');
  });
});

describe('actions that end in choices', () => {
  const runCommand = vi.fn(async () => 'Running');

  beforeEach(async () => {
    runCommand.mockClear();
    modes.push({
      prefix: 'x',
      title: 'Commands',
      placeholder: 'Search commands',
      description: 'Commands',
      load: async () => [
        {
          id: 'ls',
          title: 'List a folder',
          action: {
            id: 'ls',
            title: 'List a folder',
            recent: false,
            prompts: [{ label: 'folder' }],
            choices: ([value = '']: string[]) => [
              { id: 'copy', title: 'Copy', group: 'Choose', copy: `ls ${value}` },
              {
                id: 'run',
                title: 'Run in terminal',
                group: 'Choose',
                action: {
                  id: 'run',
                  title: 'Run in terminal',
                  closes: true,
                  recent: false,
                  run: runCommand,
                },
              },
              { id: 'text', title: `ls ${value}`, group: 'The command', copy: `ls ${value}` },
            ],
          },
        },
      ],
    });
    type('>x');
    await settle();
    press('Enter');
    await settle();
    type('/tmp');
    press('Enter');
    await settle();
  });

  it('lists the choices with the filled-in command below them', () => {
    expect(crumbText()).toBe('List a folder');
    expect(groupLabels()).toEqual(['Choose', 'The command']);
    expect(rowTitles()).toEqual(['Copy', 'Run in terminal', 'ls /tmp']);
    expect(selectedTitle()).toBe('Copy');
  });

  it('copies on ⏎ and closes', async () => {
    press('Enter');
    await settle();
    expect(copy).toHaveBeenCalledWith('ls /tmp');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('runs a chosen action, closes, and keeps it out of Recent', async () => {
    await activateRow('Run in terminal');
    await settle();
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(rememberRecent).not.toHaveBeenCalled();
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('stays open and says why when running fails', async () => {
    runCommand.mockRejectedValueOnce(new Error('ghostty is not installed'));
    await activateRow('Run in terminal');
    await settle();
    expect(statusText()).toBe('ghostty is not installed');
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });

  it('leaves the choices with Escape, and Backspace gives no prefix back', () => {
    press('Backspace');
    expect(crumbText()).toBeNull();
    expect(input().value).toBe('');
  });
});

describe('filling in an action', () => {
  it('shows the action’s subtitle while its first field is empty', async () => {
    actions.push({
      id: 'cmd',
      title: 'List',
      subtitle: 'ls -la {{folder}}',
      prompts: [{ label: 'folder' }],
      run: async () => '',
    });
    type('List');
    await activateRow('List');
    expect(shadow().querySelector('.empty')?.textContent).toBe('ls -la {{folder}}');
  });
});

describe('modes that link to what is typed', () => {
  beforeEach(async () => {
    modes.push({
      prefix: 'l',
      title: 'Logs',
      placeholder: 'Search logs',
      description: 'Open the logs',
      link: (term) => ({
        id: `logs:${term}`,
        title: term ? `Logs “${term}”` : 'Logs',
        url: `https://logs.example/?q=${term}`,
      }),
    });
    type('>l');
    await settle();
  });

  it('opens the page for nothing typed', async () => {
    expect(rowTitles()).toEqual(['Logs']);
    press('Enter');
    await settle();
    expect(open).toHaveBeenCalledWith('https://logs.example/?q=');
  });

  it('follows the input, and opens the page for what is typed', async () => {
    type('  timeout ');
    expect(rowTitles()).toEqual(['Logs “timeout”']);
    press('Enter');
    await settle();
    expect(open).toHaveBeenCalledWith('https://logs.example/?q=timeout');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });
});

describe('mode entries whose children run an action', () => {
  beforeEach(async () => {
    modes.push({
      prefix: 'g',
      title: 'GitHub search',
      placeholder: 'Search',
      description: 'Search a repository',
      load: async () => [
        {
          id: 'o/r',
          title: 'o/r',
          children: [
            {
              id: 'o/r/issues',
              title: 'Issues',
              action: {
                id: 'o/r/issues',
                title: 'o/r · Issues',
                prompts: [{ label: 'Search term' }],
                opens: ([term = '']: string[]) => ({
                  id: `issues:${term}`,
                  title: `Issues “${term}”`,
                  url: `https://github.com/o/r/issues?q=${term}`,
                }),
              },
            },
            { id: 'o/r/pulls', title: 'Pull requests' },
          ],
        },
      ],
    });
    type('>g');
    await settle();
  });

  it('lists the children on ⏎, then asks for the field and opens the answer', async () => {
    press('Enter');
    await settle();
    expect(rowTitles()).toEqual(['Issues', 'Pull requests']);
    press('Enter');
    await settle();
    expect(crumbText()).toBe('o/r · Issues · Search term (1/1)');
    type('login');
    press('Enter');
    await settle();
    expect(open).toHaveBeenCalledWith('https://github.com/o/r/issues?q=login');
  });
});

describe('recently chosen entries in a mode', () => {
  let stored: Record<string, string[]>;
  let rememberModeRecent: Mock<(prefix: string, id: string) => void>;

  /** A palette that keeps each mode's recents in `stored`, as a backend would. */
  const reopen = async () => {
    palette.destroy();
    palette = createCommandPalette({
      loadBookmarks: loadBookmarks as any,
      searchRepo: searchRepo as any,
      open: open as any,
      actions: () => actions,
      loadRecents: loadRecents as any,
      rememberRecent: rememberRecent as any,
      countBookmarkUse: countBookmarkUse as any,
      modes,
      copy: copy as any,
      loadModeRecents: async (prefix) => stored[prefix] ?? [],
      rememberModeRecent,
    });
    palette.toggle();
    await settle();
  };

  beforeEach(async () => {
    stored = {};
    rememberModeRecent = vi.fn((prefix: string, id: string) => {
      stored[prefix] = [id, ...(stored[prefix] ?? []).filter((known) => known !== id)];
    });
    modes.push({
      prefix: 'l',
      title: 'Logs',
      placeholder: 'Search logs',
      description: 'Open the logs',
      link: (term) => ({ id: `logs:${term}`, title: term ? `Logs “${term}”` : 'Logs', url: 'u' }),
    });
    await reopen();
  });

  it('lists the last chosen entries first, under Recent, while nothing is typed', async () => {
    stored.p = ['p2', 'gone'];
    type('>p');
    await settle();
    expect(groupRows('Recent')).toEqual(['Refactor to hooks']);
    expect(rowTitles()).toEqual(['Refactor to hooks', 'Commit message', 'o/repo']);
    expect(selectedTitle()).toBe('Refactor to hooks');

    type('commit');
    expect(groupLabels()).not.toContain('Recent');
  });

  it('remembers what is chosen, and lists it first next time', async () => {
    type('>p');
    await settle();
    await activateRow('Commit message');
    expect(rememberModeRecent).toHaveBeenCalledExactlyOnceWith('p', 'p1');

    rememberModeRecent.mockClear();
    palette.toggle();
    await settle();
    type('>p');
    await settle();
    expect(groupRows('Recent')).toEqual(['Commit message']);
    // Listing a repository's pages (⇥) is not using it; opening one of them is.
    press('ArrowDown');
    press('ArrowDown');
    press('Tab');
    expect(rememberModeRecent).not.toHaveBeenCalled();
    press('Enter');
    await settle();
    expect(rememberModeRecent).toHaveBeenCalledExactlyOnceWith('p', 'r1:issues');
  });

  it('keeps a link mode’s queries and builds their entries again', async () => {
    type('>l');
    await settle();
    type('timeout');
    press('Enter');
    await settle();
    expect(rememberModeRecent).toHaveBeenCalledWith('l', 'timeout');

    palette.toggle();
    await settle();
    type('>l');
    await settle();
    expect(rowTitles()).toEqual(['Logs “timeout”', 'Logs']);
    expect(groupRows('Recent')).toEqual(['Logs “timeout”']);
  });

  it('lists recent bookmarks in >b', async () => {
    stored.b = ['bookmark:Zulip'];
    type('>b');
    await settle();
    expect(groupRows('Recent')).toEqual(['Zulip']);
    expect(rowTitles()[0]).toBe('Zulip');
  });

  it('leaves a mode that opts out alone', async () => {
    modes.push({
      prefix: 'u',
      title: 'Usage',
      placeholder: '',
      description: '',
      recents: false,
      load: async () => [{ id: 'u1', title: 'Usage row', url: 'u' }],
    });
    stored.u = ['u1'];
    await reopen();
    type('>u');
    await settle();
    expect(groupLabels()).toEqual(['Usage']);
    await activateRow('Usage row');
    expect(rememberModeRecent).not.toHaveBeenCalled();
  });
});

describe('modes that search what they loaded', () => {
  it('lists what `search` builds for the query instead of filtering, once loaded', async () => {
    const search = vi.fn((query: string): ModeItem[] => [
      { id: `new:${query}`, title: `New: ${query}`, copy: query },
      { id: 'a', title: 'Alpha' },
    ]);
    modes.push({
      prefix: 'y',
      title: 'Ideas',
      placeholder: '',
      description: '',
      load: async () => [{ id: 'a', title: 'Alpha' }],
      search,
    });
    type('>y');
    await settle();
    expect(rowTitles()).toEqual(['New: ', 'Alpha']);
    type('zzz');
    expect(rowTitles()).toEqual(['New: zzz', 'Alpha']);
    expect(search).toHaveBeenLastCalledWith('zzz');
  });
});

describe('modes that refresh what they loaded', () => {
  it('shows the loaded entries, then the refreshed ones, each with its tone', async () => {
    let finish: (items: ModeItem[]) => void = () => {};
    modes.push({
      prefix: 'u',
      title: 'Usage',
      placeholder: '',
      description: '',
      load: async () => [{ id: 's', title: 'Cached 30 min ago', tone: 'warn' }],
      refresh: () =>
        new Promise<ModeItem[]>((resolve) => {
          finish = resolve;
        }),
    });
    type('>u');
    await settle();
    expect(rowTitles()).toEqual(['Cached 30 min ago']);
    expect((shadow().querySelector('.row') as HTMLElement).dataset.tone).toBe('warn');

    finish([{ id: 's', title: 'Synced just now', tone: 'good' }]);
    await settle();
    expect(rowTitles()).toEqual(['Synced just now']);
    expect((shadow().querySelector('.row') as HTMLElement).dataset.tone).toBe('good');
  });

  it('asks nothing more of a mode whose refresh has nothing to fetch', async () => {
    const load = vi.fn(async () => [{ id: 'a', title: 'A' }]);
    modes.push({
      prefix: 'u',
      title: 'U',
      placeholder: '',
      description: '',
      load,
      refresh: () => null,
    });
    type('>u');
    await settle();
    expect(rowTitles()).toEqual(['A']);
    expect(load).toHaveBeenCalledOnce();
  });

  it('loads and refreshes again, staying in the mode, when an entry reloads it', async () => {
    let scans = 0;
    const refresh = vi.fn(async () => [
      { id: 'again', title: 'Scan again', reloads: true as const },
      { id: 'n', title: `Scan ${scans}` },
    ]);
    const load = vi.fn(async () => {
      scans++;
      return [{ id: 'again', title: 'Scan again', reloads: true as const }];
    });
    modes.push({ prefix: 'u', title: 'U', placeholder: '', description: '', load, refresh });
    type('>u');
    await settle();
    expect(rowTitles()).toEqual(['Scan again', 'Scan 1']);

    type('scan');
    press('Enter');
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(input().value).toBe('');
    expect(crumbText()).toBe('U');
    expect(rowTitles()).toEqual(['Scan again', 'Scan 2']);
  });
});

describe('ask', () => {
  let ask: Mock<(query: string) => Promise<ModeItem | null>>;
  let askRun: Mock<(inputs: string[]) => Promise<string>>;

  beforeEach(async () => {
    palette.destroy();
    document.body.replaceChildren();
    askRun = vi.fn(async () => 'Logged');
    ask = vi.fn(async (query: string) => ({
      id: `ask:${query}`,
      title: 'Log: 30m on payments',
      subtitle: 'Ask kaihuman',
      action: { id: 'ask', title: 'Log: 30m on payments', recent: false, run: askRun },
    }));
    palette = createCommandPalette({
      loadBookmarks: loadBookmarks as any,
      searchRepo: searchRepo as any,
      open: open as any,
      actions: () => actions,
      loadRecents: loadRecents as any,
      rememberRecent: rememberRecent as any,
      countBookmarkUse: countBookmarkUse as any,
      modes,
      copy: copy as any,
      ask,
    });
    palette.toggle();
    await settle();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ask row appears for 3+ words without a prefix and not for URLs', async () => {
    type('log payments');
    await vi.advanceTimersByTimeAsync(300);
    expect(ask).not.toHaveBeenCalled();

    type('https://example.com/a b c');
    await vi.advanceTimersByTimeAsync(300);
    expect(ask).not.toHaveBeenCalled();

    type('>p log 30m payments');
    await vi.advanceTimersByTimeAsync(300);
    expect(ask).not.toHaveBeenCalled();
    press('Escape');

    type('log 30m on');
    type('log 30m on payments');
    await vi.advanceTimersByTimeAsync(299);
    expect(ask).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    // Only once typing stops: the earlier text was never asked about.
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('log 30m on payments');
    expect(rowTitles()[0]).toBe('Log: 30m on payments');
    expect(groupLabels()[0]).toBe('Ask kaihuman');

    type('log 30m on payments today');
    expect(rowTitles()).not.toContain('Log: 30m on payments');
  });

  it('Enter on the ask row runs its action', async () => {
    type('log 30m on payments');
    await vi.advanceTimersByTimeAsync(300);
    // The web rows are listed too, so the ask row is reached by arrowing up to it.
    press('ArrowUp');
    expect(selectedTitle()).toBe('Log: 30m on payments');
    press('Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(askRun).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe('Logged');
  });

  it('a late ask row does not take Enter from the row that was selected', async () => {
    loadBookmarks.mockResolvedValue([bookmark('log 30m on payments', 'https://pay.example/')]);
    palette.toggle();
    palette.toggle();
    await vi.advanceTimersByTimeAsync(0);
    type('log 30m on payments');
    // The bookmark row is listed and selected before the answer lands.
    expect(selectedTitle()).toBe('log 30m on payments');
    await vi.advanceTimersByTimeAsync(300);
    expect(rowTitles()[0]).toBe('Log: 30m on payments');
    expect(selectedTitle()).toBe('log 30m on payments');
    press('Enter');
    await vi.advanceTimersByTimeAsync(0);
    expect(askRun).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('keeps one ask in flight and sends only the newest waiting query after it', async () => {
    let finishFirst: (item: ModeItem | null) => void = () => {};
    ask.mockImplementationOnce(
      () =>
        new Promise<ModeItem | null>((resolve) => {
          finishFirst = resolve;
        }),
    );
    type('log 30m on payments');
    await vi.advanceTimersByTimeAsync(300);
    expect(ask).toHaveBeenCalledTimes(1);
    type('log 45m on payments');
    await vi.advanceTimersByTimeAsync(300);
    type('log 60m on payments');
    await vi.advanceTimersByTimeAsync(300);
    // Both wait for the one in flight; only the newer is kept.
    expect(ask).toHaveBeenCalledTimes(1);
    finishFirst(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask).toHaveBeenLastCalledWith('log 60m on payments');
    expect(rowTitles()[0]).toBe('Log: 30m on payments');
  });

  it('drops a waiting ask once the palette closes', async () => {
    let finishFirst: (item: ModeItem | null) => void = () => {};
    ask.mockImplementationOnce(
      () =>
        new Promise<ModeItem | null>((resolve) => {
          finishFirst = resolve;
        }),
    );
    type('log 30m on payments');
    await vi.advanceTimersByTimeAsync(300);
    type('log 45m on payments');
    await vi.advanceTimersByTimeAsync(300);
    palette.close();
    finishFirst(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it('shows no row when ask has nothing', async () => {
    ask.mockResolvedValueOnce(null);
    type('what is this even');
    await vi.advanceTimersByTimeAsync(300);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(groupLabels()).not.toContain('Ask kaihuman');
  });
});

describe('business capture', () => {
  let captureRun: Mock<(inputs: string[]) => Promise<string>>;

  const create = (loadCapture: PaletteHandlers['loadCapture']) => {
    palette.destroy();
    document.body.replaceChildren();
    palette = createCommandPalette({
      loadBookmarks: loadBookmarks as any,
      searchRepo: searchRepo as any,
      open: open as any,
      actions: () => actions,
      loadRecents: loadRecents as any,
      rememberRecent: rememberRecent as any,
      countBookmarkUse: countBookmarkUse as any,
      modes,
      copy: copy as any,
      ...(loadCapture ? { loadCapture } : {}),
    });
  };

  beforeEach(() => {
    captureRun = vi.fn(async () => 'Todo added for acme');
    create(
      async () => (query) =>
        query.startsWith('todo acme:')
          ? {
              id: 'business:todo',
              title: `Add todo for acme: ${query.slice(10).trim()}`,
              action: { id: 'business:todo', title: 'Add todo', recent: false, run: captureRun },
            }
          : null,
    );
  });

  it('lists the capture first and Enter writes it', async () => {
    palette.toggle();
    await settle();
    type('todo acme: send draft');
    expect(rowTitles()[0]).toBe('Add todo for acme: send draft');
    expect(groupLabels()[0]).toBe('Business');
    press('Enter');
    await settle();
    expect(captureRun).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe('Todo added for acme');
  });

  it('offers nothing for other text, or when business is not set up', async () => {
    palette.toggle();
    await settle();
    type('send draft');
    expect(groupLabels()).not.toContain('Business');
    create(async () => null);
    palette.toggle();
    await settle();
    type('todo acme: send draft');
    expect(groupLabels()).not.toContain('Business');
  });
});
