import { type BraindumpId, parseIdea } from '@kaihuman/formats';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRAINDUMP_IDLE_SYNC_MS,
  BRAINDUMP_MAX_UNSYNCED_MS,
  BRAINDUMP_RETRY_MS,
  BRAINDUMP_SAVE_DELAY_MS,
  type BraindumpWindow,
  createBraindumpWindow,
  findMatches,
  ideaTitleOf,
} from './braindump-window.js';
import type { ActionPort, Braindump } from './protocol.js';

/** The desktop's braindump requests, in memory: what is saved here, and whether sync fails. */
let stored: Map<string, string>;
let nextId: number;
let syncError: string | null;
let sent: { type: string; id?: string; text?: string }[];
/** The ideas `SAVE_IDEA` created, by path; an existing path is refused, as GitHub does. */
let ideas: Map<string, string>;

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
      case 'SAVE_IDEA': {
        const { path, content } = request as { path: string; content: string };
        if (ideas.has(path)) throw new Error(`Failed to update ${path}: 422`);
        ideas.set(path, content);
        return { url: `https://console.example/files/${path}` } as never;
      }
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

const key = (target: HTMLElement, name: string, ctrlKey = false, shiftKey = false) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, ctrlKey, shiftKey, bubbles: true }),
  );

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
  ideas = new Map();
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

describe('findMatches', () => {
  it('finds every occurrence, ignoring case, and treats the query as plain text', () => {
    expect(findMatches('Milk, milk and MILK', 'milk')).toEqual([
      { start: 0, end: 4 },
      { start: 6, end: 10 },
      { start: 15, end: 19 },
    ]);
    expect(findMatches('a.b axb (c)', '.')).toEqual([{ start: 1, end: 2 }]);
    expect(findMatches('f(x) = (c)', '(c)')).toEqual([{ start: 7, end: 10 }]);
    expect(findMatches('anything', '')).toEqual([]);
  });

  it('keeps offsets right where lower case is longer', () => {
    expect(findMatches('İstanbul is', 'is')).toEqual([{ start: 9, end: 11 }]);
  });
});

describe('find in the braindump', () => {
  const bar = () => root.querySelector('.braindump-find') as HTMLElement;
  const input = () => root.querySelector('.braindump-find-input') as HTMLInputElement;
  const count = () => root.querySelector('.braindump-find-count')?.textContent;
  const marked = () =>
    [...root.querySelectorAll('.braindump-marks mark')].map((mark) =>
      mark.classList.contains('current') ? `[${mark.textContent}]` : mark.textContent,
    );
  const find = (query: string) => {
    input().value = query;
    input().dispatchEvent(new Event('input'));
  };

  it('opens on ⌃F and highlights every match, the first after the caret as current', () => {
    type('one two one three one');
    text().setSelectionRange(5, 5);
    key(text(), 'f', true);
    expect(bar().hidden).toBe(false);
    expect(document.activeElement).toBe(input());
    find('one');
    expect(marked()).toEqual(['one', '[one]', 'one']);
    expect(count()).toBe('2/3');
    expect(root.querySelector('.braindump-marks')?.textContent).toBe('one two one three one ');
  });

  it('starts from the selected text', () => {
    type('pick this word');
    text().setSelectionRange(5, 9);
    key(text(), 'f', true);
    expect(input().value).toBe('this');
    expect(count()).toBe('1/1');
  });

  it('steps with ⏎ and ⇧⏎, wrapping around', () => {
    type('a b a b a');
    text().setSelectionRange(0, 0);
    key(text(), 'f', true);
    find('a');
    expect(count()).toBe('1/3');
    key(input(), 'Enter');
    expect(count()).toBe('2/3');
    key(input(), 'Enter');
    key(input(), 'Enter');
    expect(count()).toBe('1/3');
    key(input(), 'Enter', false, true);
    expect(count()).toBe('3/3');
    expect(marked()).toEqual(['a', 'a', '[a]']);
  });

  it('says when nothing matches', () => {
    type('nothing here');
    key(text(), 'f', true);
    find('zebra');
    expect(marked()).toEqual([]);
    expect(count()).toBe('no matches');
  });

  it('closes on Esc, back in the text with the current match selected, and leaves the window open', () => {
    type('x target y');
    key(text(), 'f', true);
    find('target');
    key(input(), 'Escape');
    expect(bar().hidden).toBe(true);
    expect(marked()).toEqual([]);
    expect(document.activeElement).toBe(text());
    expect([text().selectionStart, text().selectionEnd]).toEqual([2, 8]);
    expect(hide).not.toHaveBeenCalled();
  });

  it('follows edits made while it is open', () => {
    type('cat');
    text().setSelectionRange(0, 0);
    key(text(), 'f', true);
    find('cat');
    type('cat and cat');
    expect(marked()).toEqual(['[cat]', 'cat']);
    expect(count()).toBe('1/2');
  });

  it('closes when the list opens', async () => {
    type('cat');
    key(text(), 'f', true);
    find('cat');
    key(text(), 'o', true);
    await tick();
    expect(bar().hidden).toBe(true);
  });
});

describe('promote to idea', () => {
  it('takes the first line, without a heading’s #, as the title', () => {
    expect(ideaTitleOf('\n  ## Offline palette \nmore')).toBe('Offline palette');
    expect(ideaTitleOf(' \n ')).toBe('');
  });

  it('makes an idea of the braindump on ⌃I, then deletes the braindump', async () => {
    type('# Offline palette\nIt should work on a plane.');
    await tick(BRAINDUMP_SAVE_DELAY_MS);
    expect(stored.get('100')).toBeDefined();
    key(text(), 'i', true);
    await tick();
    const content = ideas.get('.kh/ideas/offline-palette.md') ?? '';
    const idea = parseIdea(content);
    expect(idea).toMatchObject({ title: 'Offline palette', status: 'seed' });
    expect(idea.braindump).toBe('### Offline palette\nIt should work on a plane.');
    expect(idea.log[0]).toMatchObject({ author: 'human', text: 'Promoted from a braindump.' });
    expect(stored.size).toBe(0);
    expect(saves().at(-1)).toEqual({ type: 'SAVE_BRAINDUMP', id: '100', text: '' });
    expect(syncs()).toBe(2);
    expect(text().value).toBe('');
    expect(state()).toMatch(/^idea offline-palette made, braindump deleted · synced \d\d:\d\d$/);
  });

  it('keeps the braindump when the idea exists already', async () => {
    ideas.set('.kh/ideas/offline-palette.md', 'theirs');
    type('Offline palette');
    key(text(), 'i', true);
    await tick();
    expect(ideas.get('.kh/ideas/offline-palette.md')).toBe('theirs');
    expect(text().value).toBe('Offline palette');
    expect(state()).toBe(
      'not made an idea — Failed to update .kh/ideas/offline-palette.md: 422; the braindump is kept',
    );
    await tick(BRAINDUMP_SAVE_DELAY_MS);
    expect(stored.get('100')).toBe('Offline palette');
  });

  it('does nothing with an empty braindump', async () => {
    key(text(), 'i', true);
    await tick();
    expect(ideas.size).toBe(0);
    expect(state()).toBe('nothing to make an idea of');
  });
});
