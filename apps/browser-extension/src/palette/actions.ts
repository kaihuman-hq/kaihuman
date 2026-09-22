/**
 * The palette wiring both surfaces share.
 *
 * Everything here goes through the service worker, so it behaves the same in a content script and
 * on the start page. Actions that read the page around them — bookmarking it, pinning it, clipping
 * a selection — stay with the content script, since the start page has no such page.
 */
import { CONSOLE_URL } from '../console';
import type { PaletteAction, PaletteHandlers } from './command-palette';

export const send = (message: Record<string, unknown>): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const failure = chrome.runtime.lastError?.message || response?.error;
      if (failure) reject(new Error(failure));
      else resolve(response);
    });
  });

export const splitTags = (input: string) =>
  input
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

export const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/** Targets for a note: the repo's quick-note files, plus the default dump. */
const noteTargets = async (): Promise<PaletteAction[]> => {
  const { quickNotes } = await send({ type: 'FETCH_QUICK_NOTES' });
  const paths = ['.lifeos/dump.md', ...((quickNotes as string[] | undefined) ?? [])];
  return Array.from(new Set(paths)).map((path) => ({
    id: `note:${path}`,
    title: path,
    // The popup picks its form the same way: an action log takes a description and tags.
    prompts: [{ label: path.endsWith('.actionlog.md') ? 'What happened? #tags' : 'Note' }],
    run: async ([input = '']: string[]) => {
      if (!input.trim()) throw new Error('Nothing to add');
      if (path.endsWith('.actionlog.md')) {
        const description = input.replace(/#[\w-]+/g, '').trim();
        await send({
          type: 'ADD_ACTION_LOG',
          path,
          description,
          tags: splitTags(input.match(/#[\w-]+/g)?.join(' ') ?? ''),
        });
      } else {
        await send({ type: 'DUMP_NOTE', path, note: input });
      }
      return `Added to ${path}`;
    },
  }));
};

/** Each saved group, with everything the popup can do to it. */
const pinnedTabGroups = async (): Promise<PaletteAction[]> => {
  const { groups } = await send({ type: 'LIST_PINNED_TAB_GROUPS' });
  return ((groups as { id: string; name: string; tabCount: number }[]) ?? []).map((group) => ({
    id: `tabs:${group.id}`,
    title: group.name,
    subtitle: plural(group.tabCount, 'tab'),
    children: async () => [
      {
        id: `tabs:${group.id}:load`,
        title: `Load ${group.name}`,
        subtitle: 'Pins what is missing and unpins what the group does not have',
        run: async () => {
          const { opened, unpinned } = await send({
            type: 'LOAD_PINNED_TAB_GROUP',
            groupId: group.id,
          });
          if (!opened && !unpinned) return `${group.name} is already loaded`;
          return `${group.name}: pinned ${opened}, unpinned ${unpinned}`;
        },
      },
      {
        id: `tabs:${group.id}:update`,
        title: `Update ${group.name} with this window's pinned tabs`,
        run: async () => {
          const { count } = await send({ type: 'SAVE_PINNED_TAB_GROUP', groupId: group.id });
          return `Updated ${group.name} with ${plural(count, 'tab')}`;
        },
      },
      {
        id: `tabs:${group.id}:rename`,
        title: `Rename ${group.name}…`,
        prompts: [{ label: 'New name', initial: () => group.name }],
        run: async ([input = '']: string[]) => {
          const { name } = await send({
            type: 'RENAME_PINNED_TAB_GROUP',
            groupId: group.id,
            name: input,
          });
          return `Renamed to ${name}`;
        },
      },
      {
        id: `tabs:${group.id}:up`,
        title: `Move ${group.name} up`,
        run: async () => {
          const { moved } = await send({
            type: 'MOVE_PINNED_TAB_GROUP',
            groupId: group.id,
            offset: -1,
          });
          return moved ? `Moved ${group.name} up` : `${group.name} is already first`;
        },
      },
      {
        id: `tabs:${group.id}:down`,
        title: `Move ${group.name} down`,
        run: async () => {
          const { moved } = await send({
            type: 'MOVE_PINNED_TAB_GROUP',
            groupId: group.id,
            offset: 1,
          });
          return moved ? `Moved ${group.name} down` : `${group.name} is already last`;
        },
      },
      {
        id: `tabs:${group.id}:delete`,
        title: `Delete ${group.name}`,
        // Deleting is one keystroke away, so it asks rather than assuming.
        prompts: [{ label: `Type DELETE to forget ${group.name}` }],
        run: async ([input = '']: string[]) => {
          if (input.trim().toUpperCase() !== 'DELETE') return 'Left alone';
          const { name } = await send({ type: 'DELETE_PINNED_TAB_GROUP', groupId: group.id });
          return `Deleted ${name}`;
        },
      },
    ],
  }));
};

const repoChoices = async (): Promise<PaletteAction[]> => {
  const { repo, repos } = await send({ type: 'GET_REPOS' });
  return ((repos as { full_name: string }[]) ?? []).map((candidate) => ({
    id: `repo:${candidate.full_name}`,
    title: candidate.full_name,
    subtitle: candidate.full_name === repo ? 'current' : '',
    run: async () => {
      await send({ type: 'SET_REPO', repo: candidate.full_name });
      return `Now using ${candidate.full_name}`;
    },
  }));
};

/** Everything the extension can do that needs no page around it. */
export const repoActions = (): PaletteAction[] => [
  { id: 'note', title: 'Add a note…', children: noteTargets },
  { id: 'tabs', title: 'Pinned tab groups…', children: pinnedTabGroups },
  {
    id: 'tabs-save',
    title: 'Save this window’s pinned tabs as a new group…',
    prompts: [{ label: 'Group name' }],
    run: async ([input = '']: string[]) => {
      const { count, name } = await send({ type: 'SAVE_PINNED_TAB_GROUP', name: input });
      return `Saved ${name} with ${plural(count, 'tab')}`;
    },
  },
  {
    id: 'import-chrome-bookmarks',
    title: 'Import the browser’s bookmarks',
    subtitle: 'Copies them into the repo, skipping pages already there',
    run: async () => {
      const { imported, skipped } = await send({ type: 'IMPORT_CHROME_BOOKMARKS' });
      return `Imported ${plural(imported, 'bookmark')}, skipped ${skipped}`;
    },
  },
  { id: 'switch-repo', title: 'Switch repository…', children: repoChoices },
  {
    id: 'sync-now',
    title: 'Sync with GitHub now',
    subtitle: 'Ignores the hourly budget and pushes what has been counted',
    run: async () => {
      const { synced, bookmarks } = await send({ type: 'SYNC_NOW', force: true });
      return synced ? `Synced ${bookmarks} bookmarks` : 'Nothing to sync — log in first';
    },
  },
  {
    id: 'open-console',
    title: 'Open the Lifosy console',
    run: async () => {
      await send({ type: 'OPEN_URL', url: CONSOLE_URL });
      return 'Opening the console';
    },
  },
];

/** The handlers that only talk to the worker; `actions` and `open` differ per surface. */
export const workerHandlers = (): Omit<PaletteHandlers, 'actions' | 'open'> => ({
  loadBookmarks: async () => (await send({ type: 'GET_BOOKMARKS' })).bookmarks,
  searchRepo: async (query) => (await send({ type: 'SEARCH_REPO', query })).results,
  loadRecents: async () => (await send({ type: 'GET_RECENTS' })).recents,
  rememberRecent: (entry) => {
    send({ type: 'ADD_RECENT', entry }).catch((e) =>
      console.warn('LifeOS Extension: could not record', entry, e),
    );
  },
  countBookmarkUse: (bookmarkId) => {
    send({ type: 'RECORD_BOOKMARK_USE', bookmarkId }).catch((e) =>
      console.warn('LifeOS Extension: could not count use of', bookmarkId, e),
    );
  },
});
