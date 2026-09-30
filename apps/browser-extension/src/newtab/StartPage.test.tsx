import { PALETTE_HOST_ID } from '@lifosy/palette';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bookmark } from '../background/bookmarks';
import type { TodaySummary } from '../background/today';
import { StartPage } from './StartPage';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (title: string, lastUsedAt: string, pinned = false): Bookmark => ({
  id: title,
  title,
  url: `https://${title}.example/page`,
  tags: [],
  createdAt: NOW,
  updatedAt: NOW,
  useCount: 0,
  lastUsedAt,
  pinned,
});

let BOOKMARKS: Bookmark[];
let GROUPS: {
  id: string;
  name: string;
  createdAt: string;
  tabCount: number;
  favorite: boolean;
}[];
/** What the worker says to a favourite; a string is answered as an error. */
let favoriteReply: string | null;
let activeGroup: string | null;
/** What the worker says to a pin; a string is answered as an error. */
let pinReply: string | null;
let TODAY: TodaySummary | undefined;

const emptyToday = (): TodaySummary => ({
  events: [],
  inProgress: [],
  overdue: [],
  inbox: { path: '.kh/inbox.todos.md', count: 0 },
  readLater: [],
  unreadCount: 0,
  habits: [],
  timers: [],
  clocks: [],
  actionLogPath: '.kh/daily.actionlog.md',
  braindumps: [],
  braindumpCount: 0,
  fetchedAt: 0,
});

/** What the worker says to a delete: a summary, a refusal with one, or an error. */
let deleteReply: { error: string } | { refused: string } | null;
/** What a refresh behind the cached page brings; `null` when the cache was fresh enough. */
let FRESHER: TodaySummary | null;

type Listener = (
  message: unknown,
  sender: unknown,
  respond: (response: unknown) => void,
) => unknown;

let host: HTMLDivElement;
let store: Record<string, unknown>;
let sent: Record<string, unknown>[];
let listeners: Listener[];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// preact runs effects off requestAnimationFrame, so the mount's fetches land a few ticks after
// render; polling keeps that independent of jsdom's timer resolution.
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error('Timed out waiting for the start page to settle');
};

const reply = (message: { type?: string; bookmarkId?: string; pinned?: boolean }) => {
  if (message.type === 'GET_BOOKMARKS') return { bookmarks: BOOKMARKS };
  if (message.type === 'SET_BOOKMARK_PINNED') {
    if (pinReply) return { error: pinReply };
    return {
      bookmarks: BOOKMARKS.map((b) =>
        b.id === message.bookmarkId ? { ...b, pinned: message.pinned === true } : b,
      ),
    };
  }
  if (message.type === 'LIST_PINNED_TAB_GROUPS') return { groups: GROUPS, activeId: activeGroup };
  if (message.type === 'FAVORITE_PINNED_TAB_GROUP') {
    if (favoriteReply) return { error: favoriteReply };
    const { groupId, favorite } = message as { groupId: string; favorite: boolean };
    GROUPS = GROUPS.map((g) => (g.id === groupId ? { ...g, favorite } : g));
    return { groups: GROUPS, activeId: activeGroup };
  }
  if (message.type === 'LOAD_PINNED_TAB_GROUP') {
    activeGroup = (message as { groupId: string }).groupId;
    return { opened: 1, unpinned: 0, name: 'Work' };
  }
  if (message.type === 'GET_RECENTS') return { recents: [] };
  if (message.type === 'GET_TODAY') return TODAY ? { today: TODAY } : { error: 'offline' };
  if (message.type === 'GET_SYNC_STATUS')
    return { syncedAt: Date.now() - 12.5 * 60_000, pendingOpens: 2 };
  if (message.type === 'TODAY_CHECK_IN' && TODAY) {
    TODAY = {
      ...TODAY,
      habits: TODAY.habits.map((h) => ({ ...h, checkedToday: true, streak: h.streak + 1 })),
    };
    return { today: TODAY };
  }
  if (message.type === 'REFRESH_TODAY') return { today: FRESHER };
  if (message.type === 'DELETE_BRAINDUMP' && TODAY) {
    if (deleteReply && 'error' in deleteReply) return deleteReply;
    if (deleteReply) return { today: TODAY, ...deleteReply };
    const { path } = message as { path: string };
    TODAY = { ...TODAY, braindumps: TODAY.braindumps.filter((dump) => dump.path !== path) };
    return { today: TODAY };
  }
  if (message.type === 'ADD_TODO' && TODAY) {
    TODAY = { ...TODAY, inbox: { ...TODAY.inbox, count: TODAY.inbox.count + 1 } };
    return { today: TODAY };
  }
  return { success: true };
};

const buttons = () => [...host.querySelectorAll('button')];

const click = (label: string) => {
  const button = buttons().find((b) => (b.textContent || '').includes(label));
  if (!button) throw new Error(`No button labelled "${label}"`);
  button.click();
};

const mount = async (settled: () => boolean) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<StartPage />, host);
  await waitFor(settled);
};

const titlesIn = (list: string) =>
  [
    ...host.querySelectorAll(
      `ul[aria-label="${list}"] > li > button:first-child > span:last-child > span:first-child`,
    ),
  ].map((span) => span.textContent);
const pinnedTitles = () => titlesIn('Pinned');
const recentTitles = () => titlesIn('Recently used');

/** The capture box's own button, not the tab of the same name. */
const clickSubmit = (label: string) => {
  const button = buttons().find((b) => b.textContent === label && !b.hasAttribute('aria-pressed'));
  if (!button) throw new Error(`No submit button labelled "${label}"`);
  button.click();
};

const type = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
};

const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

const search = () => host.querySelector('input[aria-label="Search"]') as HTMLInputElement;

const habit = (name: string, checkedToday: boolean, streak: number) => ({
  path: `.kh/${name}.habit.csv`,
  name,
  checkedToday,
  streak,
  week: [true, false, true, true, false, true, checkedToday],
});

const pinButton = (title: string) => {
  const button = host.querySelector<HTMLButtonElement>(
    `button[aria-label="Pin ${title}"], button[aria-label="Unpin ${title}"]`,
  );
  if (!button) throw new Error(`No pin button for "${title}"`);
  return button;
};

beforeEach(() => {
  BOOKMARKS = [
    bookmark('older', '2026-09-01T10:00:00.000Z'),
    bookmark('newer', '2026-09-03T10:00:00.000Z'),
  ];
  GROUPS = [
    { id: 'work', name: 'Work', createdAt: NOW, tabCount: 3, favorite: false },
    { id: 'home', name: 'Home', createdAt: NOW, tabCount: 1, favorite: false },
  ];
  favoriteReply = null;
  activeGroup = 'home';
  pinReply = null;
  TODAY = undefined;
  deleteReply = null;
  FRESHER = null;
  store = { lifeos_token: 'token', lifeos_repo: 'owner/repo' };
  sent = [];
  listeners = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (_keys: string[], respond: (result: Record<string, unknown>) => void) =>
          respond(store),
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        },
      },
    },
    runtime: {
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        respond?.(reply(message));
      },
      onMessage: {
        addListener: (listener: Listener) => listeners.push(listener),
        removeListener: (listener: Listener) => {
          listeners = listeners.filter((candidate) => candidate !== listener);
        },
      },
      lastError: undefined,
    },
  };
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('StartPage', () => {
  it('asks for a login when there is no token', async () => {
    store = {};
    await mount(() => host.textContent?.includes('Log in to the console') ?? false);

    expect(host.querySelector('a[href="https://app.kaihuman.com"]')).not.toBeNull();
    expect(sent.some((message) => message.type === 'GET_BOOKMARKS')).toBe(false);
  });

  it('links the title to the app and names the active repo', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    const title = host.querySelector('a[href="https://app.kaihuman.com"]');
    expect(title?.textContent).toBe('kaihuman');
    expect(host.textContent).toContain('owner/repo');
  });

  it('lists the bookmarks used most recently first', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    expect(recentTitles()).toEqual(['newer', 'older']);
    expect(host.textContent).toContain('newer.example');
    expect(host.textContent).toContain('2 links');
  });

  it('puts a pinned bookmark first, whatever was used since', async () => {
    BOOKMARKS = [
      bookmark('older', '2026-09-01T10:00:00.000Z', true),
      bookmark('newer', '2026-09-03T10:00:00.000Z'),
    ];
    await mount(() => host.textContent?.includes('newer') ?? false);

    expect(pinnedTitles()).toEqual(['older']);
    expect(recentTitles()).toEqual(['newer']);
    expect(host.textContent).toContain('press 1 to open');
    expect(pinButton('older').getAttribute('aria-pressed')).toBe('true');
    expect(pinButton('newer').getAttribute('aria-pressed')).toBe('false');
  });

  it('pins from the card, moving it to the top and committing the pin', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    pinButton('older').click();
    await waitFor(() => pinnedTitles()[0] === 'older');
    expect(recentTitles()).toEqual(['newer']);

    expect(sent.find((message) => message.type === 'SET_BOOKMARK_PINNED')).toEqual({
      type: 'SET_BOOKMARK_PINNED',
      bookmarkId: 'older',
      pinned: true,
    });
    await waitFor(() => pinButton('older').getAttribute('aria-pressed') === 'true');
    // The pin is not an open: nothing was counted and the tab stays put.
    expect(sent.some((message) => message.type === 'RECORD_BOOKMARK_USE')).toBe(false);
    expect(sent.some((message) => message.type === 'OPEN_URL')).toBe(false);
  });

  it('unpins from the card', async () => {
    BOOKMARKS = [bookmark('older', '', true), bookmark('newer', '2026-09-03T10:00:00.000Z')];
    await mount(() => host.textContent?.includes('newer') ?? false);

    pinButton('older').click();
    await waitFor(() => pinnedTitles().length === 0);
    expect(recentTitles()).toEqual(['newer', 'older']);

    expect(sent.find((message) => message.type === 'SET_BOOKMARK_PINNED')).toMatchObject({
      bookmarkId: 'older',
      pinned: false,
    });
  });

  it('puts the card back and says why when the pin cannot be saved', async () => {
    pinReply = 'That bookmark is no longer in the repo — sync and try again';
    await mount(() => host.textContent?.includes('newer') ?? false);

    pinButton('older').click();
    await waitFor(() => host.textContent?.includes('no longer in the repo') ?? false);

    expect(pinnedTitles()).toEqual([]);
    expect(recentTitles()).toEqual(['newer', 'older']);
    expect(pinButton('older').getAttribute('aria-pressed')).toBe('false');
  });

  it('counts the open and takes this tab over for the bookmark', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    click('newer');
    await waitFor(() => sent.some((message) => message.type === 'RECORD_BOOKMARK_USE'));

    expect(sent.find((message) => message.type === 'RECORD_BOOKMARK_USE')).toMatchObject({
      bookmarkId: 'newer',
    });
    await waitFor(() => sent.some((message) => message.type === 'OPEN_URL'));
    expect(sent.find((message) => message.type === 'OPEN_URL')).toEqual({
      type: 'OPEN_URL',
      url: 'https://newer.example/page',
      reuse: true,
    });
  });

  it('lists the tab groups between the pinned and the recent bookmarks, marking the loaded one', async () => {
    await mount(() => host.textContent?.includes('Work') ?? false);

    const groups = host.querySelector('ul[aria-label="Pinned tab groups"]');
    expect(groups?.textContent).toContain('3 tabs');
    expect(groups?.textContent).toContain('1 tab');
    const headings = [...host.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.indexOf('Pinned')).toBeLessThan(headings.indexOf('Tab groups'));
    expect(headings.indexOf('Tab groups')).toBeLessThan(headings.indexOf('Recently used'));
    const current = groups?.querySelectorAll('button[aria-current="true"]');
    expect([...(current ?? [])].map((b) => b.textContent)).toEqual(['Home1 tab']);
  });

  it('marks a tab group as a favourite, moving it first and highlighting it', async () => {
    await mount(() => host.textContent?.includes('Work') ?? false);
    const chipNames = () =>
      [...host.querySelectorAll('ul[aria-label="Pinned tab groups"] li > button:first-child')].map(
        (button) => button.querySelector('span')?.textContent,
      );
    const star = (name: string) =>
      host.querySelector<HTMLButtonElement>(
        `button[aria-label="Add ${name} to favourites"], button[aria-label="Remove ${name} from favourites"]`,
      ) as HTMLButtonElement;
    expect(chipNames()).toEqual(['Work', 'Home']);

    star('Home').click();
    await waitFor(() => chipNames()[0] === 'Home');

    expect(sent.find((message) => message.type === 'FAVORITE_PINNED_TAB_GROUP')).toEqual({
      type: 'FAVORITE_PINNED_TAB_GROUP',
      groupId: 'home',
      favorite: true,
    });
    expect(star('Home').getAttribute('aria-pressed')).toBe('true');
    expect(star('Home').textContent).toBe('★');
    const chip = star('Home').previousElementSibling as HTMLElement;
    expect(chip.className).toContain('bg-nt-pin-hover');
    // The star is not a load: the window's pinned tabs stay as they are.
    expect(sent.some((message) => message.type === 'LOAD_PINNED_TAB_GROUP')).toBe(false);

    star('Home').click();
    await waitFor(() => chipNames()[0] === 'Work');
    expect(star('Home').textContent).toBe('☆');
  });

  it('takes the favourite back and says why when it cannot be saved', async () => {
    favoriteReply = 'Failed to write .kh/browser.pinnedtabs.json';
    await mount(() => host.textContent?.includes('Work') ?? false);

    (
      host.querySelector('button[aria-label="Add Home to favourites"]') as HTMLButtonElement
    ).click();
    await waitFor(() => host.textContent?.includes('Failed to write') ?? false);

    expect(
      host
        .querySelector('button[aria-label="Add Home to favourites"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('loads a tab group from its card and marks it loaded', async () => {
    await mount(() => host.textContent?.includes('Work') ?? false);

    click('Work');
    await waitFor(
      () =>
        host.querySelector('button[aria-current="true"]')?.textContent?.includes('Work') ?? false,
    );

    expect(sent.find((message) => message.type === 'LOAD_PINNED_TAB_GROUP')).toEqual({
      type: 'LOAD_PINNED_TAB_GROUP',
      groupId: 'work',
    });
    // The start page stays: loading pins tabs beside it rather than navigating away.
    expect(sent.some((message) => message.type === 'OPEN_URL')).toBe(false);
  });

  it('writes the note box to the dump file and clears it', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await type(textarea, 'remember this');

    clickSubmit('Add note');
    await waitFor(() => sent.some((message) => message.type === 'DUMP_NOTE'));

    expect(sent.find((message) => message.type === 'DUMP_NOTE')).toMatchObject({
      path: '.lifeos/dump.md',
      note: 'remember this',
    });
    await waitFor(() => textarea.value === '');
  });

  it('shows what is coming up, in progress, the trackers, read later and the clocks', async () => {
    TODAY = {
      ...emptyToday(),
      events: [
        {
          name: 'Offsite',
          type: 'general',
          date: '2026-09-25',
          daysUntil: 2,
          path: 'e.events.csv',
        },
        { name: 'Anna', type: 'birthday', date: '2026-09-24', daysUntil: 1, path: 'e.events.csv' },
      ],
      milestone: {
        name: 'Launch',
        dueDate: '2026-09-30',
        daysUntil: 7,
        open: 2,
        path: 'p.todos.md',
      },
      inProgress: [{ text: 'Implement demo mode', path: 'p.todos.md' }],
      overdue: [{ text: 'Fix alpha', path: 'p.todos.md', milestone: 'Alpha' }],
      inbox: { path: '.kh/inbox.todos.md', count: 3 },
      habits: [habit('health', false, 4)],
      timers: [
        { path: '.kh/work.timetracking.csv', name: 'work', running: false, closedMinutes: 125 },
      ],
      readLater: [
        {
          id: 'r1',
          url: 'https://read.example/',
          name: 'Long read',
          createdAt: 0,
          path: 'r.readitlater.json',
        },
      ],
      unreadCount: 7,
      clocks: [{ zone: 'Asia/Tokyo', label: 'Tokyo' }],
    };
    await mount(() => host.textContent?.includes('Implement demo mode') ?? false);

    const text = host.textContent ?? '';
    expect(text).toContain('in 2 days');
    expect(text).toContain("Anna's birthday");
    expect(text).toContain('Launch');
    expect(text).toContain('3 in the inbox');
    expect(text).toContain('! Fix alpha');
    expect(text).toContain('4d');
    expect(host.querySelector('[aria-label="4 of the last 7 days"]')).not.toBeNull();
    expect(text).toContain('work today');
    expect(text).toContain('2h 05m');
    expect(text).toContain('▶ start');
    expect(text).toContain('Long read');
    expect(text).toContain('7 unread');
    expect(host.querySelector('ul[aria-label="World clocks"]')?.textContent).toMatch(
      /Tokyo \d\d:\d\d/,
    );

    click('Implement demo mode');
    await waitFor(() => sent.some((message) => message.type === 'OPEN_URL'));
    expect(sent.find((message) => message.type === 'OPEN_URL')).toEqual({
      type: 'OPEN_URL',
      url: 'https://app.kaihuman.com/files/p.todos.md?repo=owner%2Frepo',
      reuse: true,
    });
  });

  it('checks a habit in from its card', async () => {
    TODAY = {
      ...emptyToday(),
      habits: [habit('health', false, 4)],
    };
    await mount(() => host.textContent?.includes('4d') ?? false);

    (
      host.querySelector('button[aria-label="Check in health for today"]') as HTMLButtonElement
    ).click();
    await waitFor(() => host.textContent?.includes('5d') ?? false);
    const done = host.querySelector('button[aria-label="health is done for today"]');
    expect(done?.hasAttribute('disabled')).toBe(true);

    expect(sent.find((message) => message.type === 'TODAY_CHECK_IN')).toEqual({
      type: 'TODAY_CHECK_IN',
      path: '.kh/health.habit.csv',
    });
  });

  it('marks a read-later item read', async () => {
    TODAY = {
      ...emptyToday(),
      readLater: [
        {
          id: 'r1',
          url: 'https://read.example/',
          name: 'Long read',
          createdAt: 0,
          path: 'r.readitlater.json',
        },
      ],
    };
    await mount(() => host.textContent?.includes('Long read') ?? false);

    (
      host.querySelector('button[aria-label="Mark Long read as read"]') as HTMLButtonElement
    ).click();
    await waitFor(() => sent.some((message) => message.type === 'READ_LATER_DONE'));

    expect(sent.find((message) => message.type === 'READ_LATER_DONE')).toEqual({
      type: 'READ_LATER_DONE',
      path: 'r.readitlater.json',
      id: 'r1',
    });
  });

  describe('braindumps', () => {
    const withBraindump = (): TodaySummary => ({
      ...emptyToday(),
      braindumps: [
        {
          path: '.kh/braindumps/1.md',
          sha: 'v1',
          title: 'Call the bank',
          text: 'Call the bank\nabout the card\nthen the trip',
          createdAt: Date.now() - 12 * 60_000,
        },
      ],
      braindumpCount: 1,
    });
    const deleteButton = () =>
      host.querySelector('button[aria-label$="Call the bank"]') as HTMLButtonElement;

    it('lists each with its next lines and age, and opens to the whole text', async () => {
      TODAY = withBraindump();
      await mount(() => host.textContent?.includes('Call the bank') ?? false);
      const list = host.querySelector('ul[aria-label="Braindumps"]') as HTMLElement;
      expect(list.textContent).toContain('about the card · then the trip');
      expect(list.textContent).toContain('12m ago');

      (list.querySelector('button[aria-expanded]') as HTMLButtonElement).click();
      await waitFor(() => list.querySelector('.whitespace-pre-wrap') !== null);
      expect(list.querySelector('.whitespace-pre-wrap')?.textContent).toBe(
        'Call the bank\nabout the card\nthen the trip',
      );
    });

    it('asks once more, then deletes the version it showed', async () => {
      TODAY = withBraindump();
      await mount(() => host.textContent?.includes('Call the bank') ?? false);
      deleteButton().click();
      await waitFor(() => deleteButton()?.textContent === 'delete?');
      expect(sent.some((message) => message.type === 'DELETE_BRAINDUMP')).toBe(false);

      deleteButton().click();
      await waitFor(() => !host.textContent?.includes('Call the bank'));
      expect(sent.find((message) => message.type === 'DELETE_BRAINDUMP')).toEqual({
        type: 'DELETE_BRAINDUMP',
        path: '.kh/braindumps/1.md',
        sha: 'v1',
      });
      expect(host.textContent).toContain('Nothing waiting.');
    });

    it('puts it back with the reason when the delete fails', async () => {
      TODAY = withBraindump();
      deleteReply = { error: 'Failed to delete: 500' };
      await mount(() => host.textContent?.includes('Call the bank') ?? false);
      deleteButton().click();
      await waitFor(() => deleteButton()?.textContent === 'delete?');
      deleteButton().click();
      await waitFor(() => host.textContent?.includes('Failed to delete: 500') ?? false);
      expect(host.textContent).toContain('Call the bank');
    });

    it('shows why a delete was refused, with the newer text', async () => {
      TODAY = withBraindump();
      deleteReply = { refused: 'It changed since — this is the new text.' };
      await mount(() => host.textContent?.includes('Call the bank') ?? false);
      deleteButton().click();
      await waitFor(() => deleteButton()?.textContent === 'delete?');
      deleteButton().click();
      await waitFor(() => host.textContent?.includes('It changed since') ?? false);
      expect(host.textContent).toContain('Call the bank');
    });

    it('takes a fresher summary once the page has drawn from the cache', async () => {
      TODAY = emptyToday();
      FRESHER = withBraindump();
      await mount(() => host.textContent?.includes('Call the bank') ?? false);
      expect(sent.map((message) => message.type)).toContain('REFRESH_TODAY');
    });
  });

  it('turns the note box into a todo for the inbox or an action log entry', async () => {
    TODAY = emptyToday();
    await mount(() => host.textContent?.includes('newer') ?? false);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;

    click('Todo');
    await waitFor(() => host.textContent?.includes('.kh/inbox.todos.md') ?? false);
    await type(textarea, 'Buy milk #home');
    clickSubmit('Add todo');
    await waitFor(() => sent.some((message) => message.type === 'ADD_TODO'));
    expect(sent.find((message) => message.type === 'ADD_TODO')).toEqual({
      type: 'ADD_TODO',
      text: 'Buy milk #home',
    });
    await waitFor(() => textarea.value === '');

    click('Log');
    await waitFor(() => host.textContent?.includes('.kh/daily.actionlog.md') ?? false);
    await type(textarea, 'Shipped it #work #milestone');
    clickSubmit('Log');
    await waitFor(() => sent.some((message) => message.type === 'ADD_ACTION_LOG'));
    expect(sent.find((message) => message.type === 'ADD_ACTION_LOG')).toEqual({
      type: 'ADD_ACTION_LOG',
      path: '.kh/daily.actionlog.md',
      description: 'Shipped it',
      tags: ['work', 'milestone'],
    });
  });

  it('says how fresh the data is and syncs on request', async () => {
    await mount(() => host.textContent?.includes('synced 12m ago') ?? false);
    expect(host.textContent).toContain('2 opens to push');

    const before = sent.filter((message) => message.type === 'GET_BOOKMARKS').length;
    click('sync');
    await waitFor(() => sent.filter((message) => message.type === 'GET_BOOKMARKS').length > before);
    expect(sent.find((message) => message.type === 'SYNC_NOW')).toEqual({
      type: 'SYNC_NOW',
      force: true,
    });
  });

  it('opens the palette when the worker relays the shortcut', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();

    for (const listener of listeners) {
      listener({ type: 'TOGGLE_COMMAND_PALETTE' }, null, () => {});
    }
    await tick();

    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });

  it('hands the search to the palette on Enter', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    await type(search(), 'deploy notes');
    press(search(), 'Enter');
    await tick();

    const palette = document.getElementById(PALETTE_HOST_ID);
    expect(palette).not.toBeNull();
    expect(palette?.shadowRoot?.querySelector('input')?.value).toBe('deploy notes');
  });

  it('filters the pinned and recent bookmarks as the search is typed', async () => {
    BOOKMARKS = [
      bookmark('mail', '', true),
      bookmark('chat', '', true),
      bookmark('mailbox', '2026-09-01T10:00:00.000Z'),
      bookmark('docs', '2026-09-02T10:00:00.000Z'),
    ];
    await mount(() => host.textContent?.includes('docs') ?? false);

    await type(search(), 'MAIL');
    expect(pinnedTitles()).toEqual(['mail']);
    expect(recentTitles()).toEqual(['mailbox']);
    expect(host.textContent).not.toContain('No bookmarks match');

    await type(search(), 'nothing like it');
    expect(pinnedTitles()).toEqual([]);
    expect(recentTitles()).toEqual([]);
    expect(host.textContent).toContain('No bookmarks match. Enter searches the repo and the web.');
  });

  it('tags DEV, INT and PROD links in the recent list', async () => {
    BOOKMARKS = [
      bookmark('Control PROD', '2026-09-03T10:00:00.000Z'),
      { ...bookmark('Console', '2026-09-02T10:00:00.000Z'), tags: ['int'] },
      bookmark('Wiki', '2026-09-01T10:00:00.000Z'),
    ];
    await mount(() => host.textContent?.includes('Wiki') ?? false);

    const tags = [...host.querySelectorAll('ul[aria-label="Recently used"] li button')]
      .filter((button) => !button.hasAttribute('aria-pressed'))
      .map((button) => button.querySelector('span')?.textContent);
    expect(tags).toEqual(['PROD', 'INT', '—']);
  });

  it('focuses the search on / and opens a pinned bookmark by its number', async () => {
    BOOKMARKS = [
      bookmark('first', '', true),
      bookmark('second', '', true),
      bookmark('loose', '2026-09-03T10:00:00.000Z'),
    ];
    await mount(() => host.textContent?.includes('loose') ?? false);
    expect(host.textContent).toContain('press 1–2 to open');

    press(document.body, '/');
    expect(document.activeElement).toBe(search());

    // Typed into a field, a digit is text.
    press(search(), '2');
    expect(sent.some((message) => message.type === 'OPEN_URL')).toBe(false);

    press(search(), 'Escape');
    expect(document.activeElement).not.toBe(search());

    press(document.body, '3');
    press(document.body, '2');
    await waitFor(() => sent.some((message) => message.type === 'OPEN_URL'));
    expect(sent.filter((message) => message.type === 'OPEN_URL')).toEqual([
      { type: 'OPEN_URL', url: 'https://second.example/page', reuse: true },
    ]);
  });

  it('saves on Ctrl+Enter and lists the latest captures of the kind, kept for later tabs', async () => {
    store = {
      ...store,
      startPageCaptures: { note: [{ time: '09:00', text: 'earlier' }], todo: [], log: [] },
    };
    await mount(() => host.textContent?.includes('earlier') ?? false);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;

    await type(textarea, '   ');
    press(textarea, 'Enter', { ctrlKey: true });
    await tick();
    expect(sent.some((message) => message.type === 'DUMP_NOTE')).toBe(false);

    await type(textarea, 'call the bank');
    press(textarea, 'Enter', { ctrlKey: true });
    await waitFor(() => host.textContent?.includes('call the bank') ?? false);

    const captures = () =>
      [...host.querySelectorAll('ul[aria-label="Latest captures"] li span:last-child')].map(
        (span) => span.textContent,
      );
    expect(captures()).toEqual(['call the bank', 'earlier']);
    expect((store.startPageCaptures as { note: unknown[] }).note).toHaveLength(2);

    click('Todo');
    await waitFor(() => captures().length === 0);
  });
});
