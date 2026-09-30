import type { BraindumpId } from '@lifosy/formats';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRAINDUMP_IDLE_SYNC_MS,
  BRAINDUMP_MAX_UNSYNCED_MS,
  BRAINDUMP_RETRY_MS,
  BRAINDUMP_SAVE_DELAY_MS,
  type BraindumpWindow,
  createBraindumpWindow,
} from './braindump-window.js';
import type { ActionPort, Braindump } from './protocol.js';

/** The desktop's braindump requests, in memory: what is saved here, and whether sync fails. */
let stored: Map<string, string>;
let nextId: number;
let syncError: string | null;
let sent: { type: string; id?: string; text?: string }[];

const listed = (): Braindump[] =>
  [...stored].map(([id, text]) => ({
    id: id as BraindumpId,
    text,
    updatedAt: 0,
    synced: true,
  }));

const port: ActionPort = {
  send: async (request) => {
    sent.push(request as never);
    switch (request.type) {
      case 'SAVE_BRAINDUMP': {
        const { id, text } = request as { id?: string; text: string };
        if (!text) {
          if (id) stored.delete(id);
          return {} as never;
        }
        const target = id ?? String(nextId++);
        stored.set(target, text);
        return { id: target } as never;
      }
      case 'LIST_BRAINDUMPS':
        return { braindumps: listed() } as never;
      case 'SYNC_BRAINDUMPS':
        if (syncError) throw new Error(syncError);
        return { braindumps: listed() } as never;
      default:
        throw new Error(`unexpected ${request.type}`);
    }
  },
};

let root: HTMLElement;
let hide: ReturnType<typeof vi.fn<() => void>>;
let copy: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
let win: BraindumpWindow;

const text = () => root.querySelector('textarea') as HTMLTextAreaElement;
const state = () => root.querySelector('.braindump-state')?.textContent;
const titleShown = () => root.querySelector('.braindump-title')?.textContent;
const syncs = () => sent.filter((request) => request.type === 'SYNC_BRAINDUMPS').length;
const saves = () => sent.filter((request) => request.type === 'SAVE_BRAINDUMP');

const type = (value: string) => {
  text().value = value;
  text().dispatchEvent(new Event('input'));
};

const key = (target: HTMLElement, name: string, ctrlKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, ctrlKey, bubbles: true }));

/** Lets queued promises and due timers run. */
const tick = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(async () => {
  vi.useFakeTimers();
  stored = new Map();
  nextId = 100;
  syncError = null;
  sent = [];
  root = document.createElement('div');
  document.body.replaceChildren(root);
  hide = vi.fn<() => void>();
  copy = vi.fn(async (_text: string) => {});
  win = createBraindumpWindow(root, port, { hide, copy }, () => Date.now());
  await tick();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('braindump window', () => {
  it('syncs once on start, for anything an earlier session left', () => {
    expect(syncs()).toBe(1);
    expect(titleShown()).toBe('New braindump');
  });

  it('saves 400 ms after the last key, creating the braindump once and writing to it after', async () => {
    type('a');
    await tick(BRAINDUMP_SAVE_DELAY_MS - 1);
    expect(saves()).toEqual([]);
    type('ab');
    await tick(BRAINDUMP_SAVE_DELAY_MS);
    type('ab\nc');
    await tick(BRAINDUMP_SAVE_DELAY_MS);
    expect(saves()).toEqual([
      { type: 'SAVE_BRAINDUMP', text: 'ab' },
      { type: 'SAVE_BRAINDUMP', id: '100', text: 'ab\nc' },
    ]);
    expect(titleShown()).toBe('ab');
    expect(state()).toBe('saved here');
  });

  it('syncs after 30 s without typing', async () => {
    type('idea');
    await tick(BRAINDUMP_IDLE_SYNC_MS - 1);
    expect(syncs()).toBe(1);
    await tick(1);
    expect(syncs()).toBe(2);
    expect(stored.get('100')).toBe('idea');
    expect(state()).toMatch(/^synced \d\d:\d\d$/);
  });

  it('syncs at least every 2 minutes while typing goes on', async () => {
    for (let elapsed = 0; elapsed <= BRAINDUMP_MAX_UNSYNCED_MS; elapsed += 10_000) {
      type(`words ${elapsed}`);
      await tick(10_000);
    }
    expect(syncs()).toBe(2);
  });

  it('hides on Esc, saving and syncing what was typed', async () => {
    type('before the meeting');
    key(text(), 'Escape');
    await tick();
    expect(hide).toHaveBeenCalledOnce();
    expect(stored.get('100')).toBe('before the meeting');
    expect(syncs()).toBe(2);
  });

  it('hides without a sync when nothing changed', async () => {
    key(text(), 'Escape');
    await tick();
    expect(hide).toHaveBeenCalledOnce();
    expect(syncs()).toBe(1);
  });

  it('copies everything on ⌃⏎ and hides', async () => {
    type('copy me');
    key(text(), 'Enter', true);
    await tick();
    expect(copy).toHaveBeenCalledWith('copy me');
    expect(hide).toHaveBeenCalledOnce();
  });

  it('keeps an empty new braindump when asked for another, and starts over once typed in', async () => {
    await win.open();
    expect(saves()).toEqual([]);
    type('first');
    await win.open();
    expect(text().value).toBe('');
    expect(stored.get('100')).toBe('first');
    type('second');
    await win.settled();
    expect([...stored.values()]).toEqual(['first', 'second']);
  });

  it('opens an existing braindump with the cursor at its end', async () => {
    stored.set('7', 'kept\nnotes');
    await win.open('7' as BraindumpId);
    expect(text().value).toBe('kept\nnotes');
    expect(text().selectionStart).toBe('kept\nnotes'.length);
    type('kept\nnotes\nmore');
    await win.settled();
    expect(stored.get('7')).toBe('kept\nnotes\nmore');
  });

  it('says so when the braindump asked for is gone, and starts a new one', async () => {
    await win.open('404' as BraindumpId);
    expect(text().value).toBe('');
    expect(state()).toContain('gone');
  });

  it('deletes a braindump emptied by hand', async () => {
    stored.set('7', 'x');
    await win.open('7' as BraindumpId);
    type('');
    await win.settled();
    expect(stored.has('7')).toBe(false);
  });

  it('lists braindumps on ⌃O, filters them and opens the chosen one', async () => {
    stored.set('1', 'groceries\nmilk');
    stored.set('2', 'release plan');
    key(text(), 'o', true);
    await tick();
    const filter = root.querySelector('.braindump-filter') as HTMLInputElement;
    expect(text().hidden).toBe(true);
    expect(
      [...root.querySelectorAll('.braindump-row .title')].map((row) => row.textContent),
    ).toEqual(['groceries', 'release plan']);
    filter.value = 'release';
    filter.dispatchEvent(new Event('input'));
    key(filter, 'Enter');
    await tick();
    expect(text().hidden).toBe(false);
    expect(text().value).toBe('release plan');
  });

  it('goes back to the text on Esc from the list', async () => {
    type('unchanged');
    key(text(), 'o', true);
    await tick();
    key(root.querySelector('.braindump-filter') as HTMLElement, 'Escape');
    expect(text().hidden).toBe(false);
    expect(text().value).toBe('unchanged');
  });

  it('says why a sync failed and tries again a minute later', async () => {
    syncError = 'Could not reach GitHub: offline';
    type('on the train');
    key(text(), 'Escape');
    await tick();
    expect(state()).toBe('not synced — Could not reach GitHub: offline; trying again in a minute');
    syncError = null;
    await tick(BRAINDUMP_RETRY_MS);
    expect(state()).toMatch(/^synced/);
  });

  it('shows an edit a sync brought in, unless something was typed since', async () => {
    type('mine');
    await win.settled();
    stored.set('100', 'edited elsewhere');
    key(text(), 'Escape');
    await tick();
    expect(text().value).toBe('edited elsewhere');
  });
});
