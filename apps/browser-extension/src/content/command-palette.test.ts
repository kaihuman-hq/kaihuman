import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bookmark } from '../background/bookmarks';
import {
  type CommandPalette,
  createCommandPalette,
  PALETTE_HOST_ID,
  type RepoResult,
} from './command-palette';

const NOW = '2026-09-22T10:00:00.000Z';

const bookmark = (title: string, url: string, tags: string[] = []): Bookmark => ({
  id: title,
  title,
  url,
  tags,
  createdAt: NOW,
  updatedAt: NOW,
});

const BOOKMARKS = [
  bookmark('Vitest guide', 'https://vitest.dev/guide', ['testing']),
  bookmark('Zulip', 'https://zulip.example/', ['chat']),
];

let palette: CommandPalette;
let open: ReturnType<typeof vi.fn>;
let searchRepo: ReturnType<typeof vi.fn>;
let loadBookmarks: ReturnType<typeof vi.fn>;

const shadow = () => {
  const host = document.getElementById(PALETTE_HOST_ID);
  if (!host?.shadowRoot) throw new Error('palette is not mounted');
  return host.shadowRoot;
};

const input = () => shadow().querySelector('input') as HTMLInputElement;
const rowTitles = () =>
  Array.from(shadow().querySelectorAll('.row .title')).map((r) => r.textContent);
const selectedTitle = () =>
  shadow().querySelector('.row[data-selected="true"] .title')?.textContent ?? null;
const statusText = () => {
  const status = shadow().querySelector('.status') as HTMLElement;
  return status.hidden ? null : status.textContent;
};
const hintText = () => shadow().querySelector('.hint')?.textContent ?? '';

const type = (value: string) => {
  input().value = value;
  input().dispatchEvent(new Event('input'));
};

const press = (key: string) => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

/** The palette loads bookmarks asynchronously; let that promise settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  document.body.replaceChildren();
  open = vi.fn();
  searchRepo = vi.fn(async (): Promise<RepoResult[]> => []);
  loadBookmarks = vi.fn(async () => BOOKMARKS);
  palette = createCommandPalette({
    loadBookmarks: loadBookmarks as any,
    searchRepo: searchRepo as any,
    open: open as any,
  });
  palette.toggle();
  await settle();
});

describe('toggle', () => {
  it('mounts the palette with every bookmark and focuses the input', () => {
    expect(rowTitles()).toEqual(['Vitest guide', 'Zulip']);
    expect(shadow().activeElement).toBe(input());
  });

  it('unmounts on a second toggle and remounts on a third', () => {
    palette.toggle();
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
    palette.toggle();
    expect(document.getElementById(PALETTE_HOST_ID)).not.toBeNull();
  });

  it('closes on Escape', () => {
    press('Escape');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });
});

describe('bookmark search', () => {
  it('filters locally without touching the repo search', () => {
    type('zul');
    expect(rowTitles()).toEqual(['Zulip']);
    expect(searchRepo).not.toHaveBeenCalled();
  });

  it('reports when nothing matches', () => {
    type('nothing here');
    expect(rowTitles()).toEqual([]);
    expect(shadow().querySelector('.empty')?.textContent).toContain('No bookmark matches');
  });

  it('moves the selection with the arrow keys and wraps around', () => {
    expect(selectedTitle()).toBe('Vitest guide');
    press('ArrowDown');
    expect(selectedTitle()).toBe('Zulip');
    press('ArrowDown');
    expect(selectedTitle()).toBe('Vitest guide');
    press('ArrowUp');
    expect(selectedTitle()).toBe('Zulip');
  });

  it('opens the selected bookmark on Enter and closes', () => {
    press('ArrowDown');
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://zulip.example/');
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
  });

  it('opens a bookmark that is clicked', () => {
    const row = shadow().querySelectorAll('.row')[0] as HTMLElement;
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledWith('https://vitest.dev/guide');
  });
});

describe('repo search', () => {
  it('only runs on Tab, and only for the typed query', async () => {
    searchRepo.mockResolvedValue([
      { path: 'apps/console/vite.config.ts', name: 'vite.config.ts', url: 'https://github.test/1' },
    ]);
    type('vite');
    expect(searchRepo).not.toHaveBeenCalled();

    press('Tab');
    await settle();

    expect(searchRepo).toHaveBeenCalledTimes(1);
    expect(searchRepo).toHaveBeenCalledWith('vite');
    expect(rowTitles()).toContain('vite.config.ts');
  });

  it('offers the repo search in the hint until it has run', async () => {
    type('vite');
    expect(hintText()).toContain('tab search repo');
    press('Tab');
    await settle();
    expect(hintText()).not.toContain('tab search repo');
  });

  it('does nothing on Tab with an empty query', async () => {
    press('Tab');
    await settle();
    expect(searchRepo).not.toHaveBeenCalled();
  });

  it('opens a repo result on Enter', async () => {
    searchRepo.mockResolvedValue([{ path: 'a/b.ts', name: 'b.ts', url: 'https://github.test/b' }]);
    type('nothing here');
    press('Tab');
    await settle();

    expect(rowTitles()).toEqual(['b.ts']);
    press('Enter');
    expect(open).toHaveBeenCalledWith('https://github.test/b');
  });

  it('says so when the repo has no matches', async () => {
    type('vite');
    press('Tab');
    await settle();
    expect(statusText()).toContain('No repo matches');
  });

  it('surfaces a rate limit instead of failing silently', async () => {
    searchRepo.mockRejectedValue(new Error('GitHub search is rate limited'));
    type('vite');
    press('Tab');
    await settle();
    expect(statusText()).toContain('rate limited');
  });

  it('drops stale repo results once the query changes', async () => {
    searchRepo.mockResolvedValue([{ path: 'a/b.ts', name: 'b.ts', url: 'https://github.test/b' }]);
    type('vite');
    press('Tab');
    await settle();
    expect(rowTitles()).toContain('b.ts');

    type('zul');
    expect(rowTitles()).toEqual(['Zulip']);
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

  it('surfaces a load failure', async () => {
    palette.toggle();
    loadBookmarks.mockRejectedValue(new Error('No token found'));
    palette.toggle();
    await settle();
    expect(statusText()).toBe('No token found');
  });
});
