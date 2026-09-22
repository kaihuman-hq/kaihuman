import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bookmark } from '../background/bookmarks';
import { PALETTE_HOST_ID } from '../palette/command-palette';
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
/** What the worker says to a pin; a string is answered as an error. */
let pinReply: string | null;

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
  if (message.type === 'GET_RECENTS') return { recents: [] };
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
  [...host.querySelectorAll('li button span:first-child')].map((span) => span.textContent);

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
  pinReply = null;
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
