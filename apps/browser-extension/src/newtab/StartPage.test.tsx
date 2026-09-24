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
let GROUPS: { id: string; name: string; createdAt: string; tabCount: number }[];
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
  habits: [],
  timers: [],
  clocks: [],
  actionLogPath: '.kh/daily.actionlog.md',
  fetchedAt: 0,
});

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

const cardTitles = () =>
  [...host.querySelectorAll('ul[aria-label="Bookmarks"] li button span:first-child')].map(
    (span) => span.textContent,
  );

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
    { id: 'work', name: 'Work', createdAt: NOW, tabCount: 3 },
    { id: 'home', name: 'Home', createdAt: NOW, tabCount: 1 },
  ];
  activeGroup = 'home';
  pinReply = null;
  TODAY = undefined;
  store = { lifeos_token: 'token', lifeos_repo: 'owner/repo' };
  sent = [];
  listeners = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (_keys: string[], respond: (result: Record<string, unknown>) => void) =>
          respond(store),
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

    expect(cardTitles()).toEqual(['newer', 'older']);
    expect(host.textContent).toContain('newer.example');
  });

  it('puts a pinned bookmark first, whatever was used since', async () => {
    BOOKMARKS = [
      bookmark('older', '2026-09-01T10:00:00.000Z', true),
      bookmark('newer', '2026-09-03T10:00:00.000Z'),
    ];
    await mount(() => host.textContent?.includes('newer') ?? false);

    expect(cardTitles()).toEqual(['older', 'newer']);
    expect(pinButton('older').getAttribute('aria-pressed')).toBe('true');
    expect(pinButton('newer').getAttribute('aria-pressed')).toBe('false');
  });

  it('pins from the card, moving it to the top and committing the pin', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    pinButton('older').click();
    await waitFor(() => cardTitles()[0] === 'older');

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
    await waitFor(() => cardTitles()[0] === 'newer');

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

    expect(cardTitles()).toEqual(['newer', 'older']);
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

  it('lists the pinned tab groups above the bookmarks, marking the loaded one', async () => {
    await mount(() => host.textContent?.includes('Work') ?? false);

    const groups = host.querySelector('ul[aria-label="Pinned tab groups"]');
    expect(groups?.textContent).toContain('3 tabs');
    expect(groups?.textContent).toContain('1 tab');
    const headings = [...host.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings.indexOf('Pinned tabs')).toBeLessThan(
      headings.indexOf('Pinned & recently used'),
    );
    const current = groups?.querySelectorAll('button[aria-current="true"]');
    expect([...(current ?? [])].map((b) => b.textContent)).toEqual(['Home1 tab']);
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
    textarea.value = 'remember this';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();

    click('Add note');
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
      habits: [{ path: '.kh/health.habit.csv', name: 'health', checkedToday: false, streak: 4 }],
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
      clocks: [{ zone: 'Asia/Tokyo', label: 'Tokyo' }],
    };
    await mount(() => host.textContent?.includes('Implement demo mode') ?? false);

    const text = host.textContent ?? '';
    expect(text).toContain('in 2 days');
    expect(text).toContain("Anna's birthday");
    expect(text).toContain('Launch');
    expect(text).toContain('3 in the inbox');
    expect(text).toContain('! Fix alpha');
    expect(text).toContain('4d streak');
    expect(text).toContain('2h 05m');
    expect(text).toContain('Long read');
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
      habits: [{ path: '.kh/health.habit.csv', name: 'health', checkedToday: false, streak: 4 }],
    };
    await mount(() => host.textContent?.includes('4d streak') ?? false);

    click('health');
    await waitFor(() => host.textContent?.includes('5d streak') ?? false);

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

  it('turns the note box into a todo for the inbox or an action log entry', async () => {
    TODAY = emptyToday();
    await mount(() => host.textContent?.includes('newer') ?? false);
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    const type = async (value: string) => {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await tick();
    };

    click('Todo');
    await waitFor(() => host.textContent?.includes('.kh/inbox.todos.md') ?? false);
    await type('Buy milk #home');
    click('Add todo');
    await waitFor(() => sent.some((message) => message.type === 'ADD_TODO'));
    expect(sent.find((message) => message.type === 'ADD_TODO')).toEqual({
      type: 'ADD_TODO',
      text: 'Buy milk #home',
    });
    await waitFor(() => textarea.value === '');

    click('Log');
    await waitFor(() => host.textContent?.includes('.kh/daily.actionlog.md') ?? false);
    await type('Shipped it #work #milestone');
    click('Log it');
    await waitFor(() => sent.some((message) => message.type === 'ADD_ACTION_LOG'));
    expect(sent.find((message) => message.type === 'ADD_ACTION_LOG')).toEqual({
      type: 'ADD_ACTION_LOG',
      path: '.kh/daily.actionlog.md',
      description: 'Shipped it',
      tags: ['work', 'milestone'],
    });
  });

  it('says how fresh the data is and syncs on request', async () => {
    await mount(() => host.textContent?.includes('synced 12 min ago') ?? false);
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

  it('opens the palette from the search field', async () => {
    await mount(() => host.textContent?.includes('newer') ?? false);

    click('Search bookmarks');
    await tick();

    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });
});
