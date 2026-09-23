import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { Bookmark } from './bookmarks.js';
import {
  type CommandPalette,
  createCommandPalette,
  filterModeItems,
  type ModeItem,
  PALETTE_HOST_ID,
  type PaletteAction,
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
  modes = [
    { prefix: 'p', title: 'Prompts', placeholder: 'Search prompts', load: loadPrompts },
    { prefix: 't', title: 'Translate', placeholder: 'Text to translate', submit: translate },
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
      'Search Reddit for “bookmark”',
    ]);
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
    type('p:');
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
    type('p:');
    await settle();
    type(' hooks');
    expect(input().value).toBe('hooks');
  });

  it('keeps what follows the prefix as the query', async () => {
    type('p: hooks');
    await settle();
    expect(input().value).toBe('hooks');
    expect(rowTitles()).toEqual(['Refactor to hooks']);
  });

  it('copies the chosen entry and closes', async () => {
    type('p:');
    await settle();
    press('Enter');
    await settle();
    expect(copy).toHaveBeenCalledWith('Write it');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('stays open and says so when copying fails', async () => {
    copy.mockRejectedValueOnce(new Error('No clipboard here'));
    type('p:');
    await settle();
    press('Enter');
    await settle();
    expect(statusText()).toBe('No clipboard here');
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });

  it('shows a load failure', async () => {
    loadPrompts.mockRejectedValueOnce(new Error('No .prompts.md files'));
    type('p:');
    await settle();
    expect(statusText()).toBe('No .prompts.md files');
  });

  it('opens a child list on Tab and walks back out with Escape, then leaves the mode', async () => {
    type('p: repo');
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
    type('p: repo');
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
    type('p:');
    await settle();
    press('Backspace');
    expect(crumbText()).toBeNull();
    expect(input().value).toBe('p:');
  });

  it('does not treat an unknown prefix or a url as a mode', () => {
    type('x: thing');
    expect(crumbText()).toBeNull();
    type('https://vitest.dev');
    expect(crumbText()).toBeNull();
  });

  it('submits only on Enter, then Enter copies the selected answer', async () => {
    type('t: Guten Morgen');
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
    type('t: one');
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
    expect(hintText()).toContain('p: prompts · t: translate');
  });

  it('starts outside any mode each time it opens', async () => {
    type('p:');
    await settle();
    palette.close();
    palette.open();
    await settle();
    expect(crumbText()).toBeNull();
  });
});
