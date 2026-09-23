/**
 * The palette wiring every surface shares.
 *
 * Everything here goes through an `ActionPort`, so it behaves the same wherever the palette runs —
 * a content script, the extension's start page, or the desktop app. Actions that read the page
 * around them — bookmarking it, pinning it, clipping a selection — stay with the content script,
 * since nothing else has such a page.
 */
import type { PaletteAction, PaletteHandlers } from './command-palette.js';
import type { ActionPort } from './protocol.js';

/** The Lifosy console — where a repo file is opened, rather than on GitHub. */
export const CONSOLE_URL = 'https://app.kaihuman.com';

export const splitTags = (input: string) =>
  input
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

export const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/** Targets for a note: the repo's quick-note files, plus the default dump. */
const noteTargets = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { quickNotes } = await port.send({ type: 'FETCH_QUICK_NOTES' });
  const paths = ['.lifeos/dump.md', ...(quickNotes ?? [])];
  return Array.from(new Set(paths)).map((path) => ({
    id: `note:${path}`,
    title: path,
    // The popup picks its form the same way: an action log takes a description and tags.
    prompts: [{ label: path.endsWith('.actionlog.md') ? 'What happened? #tags' : 'Note' }],
    run: async ([input = '']: string[]) => {
      if (!input.trim()) throw new Error('Nothing to add');
      if (path.endsWith('.actionlog.md')) {
        const description = input.replace(/#[\w-]+/g, '').trim();
        await port.send({
          type: 'ADD_ACTION_LOG',
          path,
          description,
          tags: splitTags(input.match(/#[\w-]+/g)?.join(' ') ?? ''),
        });
      } else {
        await port.send({ type: 'DUMP_NOTE', path, note: input });
      }
      return `Added to ${path}`;
    },
  }));
};

/** Each saved group, with everything the popup can do to it. */
const pinnedTabGroups = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { groups } = await port.send({ type: 'LIST_PINNED_TAB_GROUPS' });
  return groups.map((group) => ({
    id: `tabs:${group.id}`,
    title: group.name,
    subtitle: plural(group.tabCount, 'tab'),
    children: async () => [
      {
        id: `tabs:${group.id}:load`,
        title: `Load ${group.name}`,
        subtitle: 'Pins what is missing and unpins what the group does not have',
        run: async () => {
          const { opened, unpinned } = await port.send({
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
          const { count } = await port.send({ type: 'SAVE_PINNED_TAB_GROUP', groupId: group.id });
          return `Updated ${group.name} with ${plural(count, 'tab')}`;
        },
      },
      {
        id: `tabs:${group.id}:rename`,
        title: `Rename ${group.name}…`,
        prompts: [{ label: 'New name', initial: () => group.name }],
        run: async ([input = '']: string[]) => {
          const { name } = await port.send({
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
          const { moved } = await port.send({
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
          const { moved } = await port.send({
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
          const { name } = await port.send({ type: 'DELETE_PINNED_TAB_GROUP', groupId: group.id });
          return `Deleted ${name}`;
        },
      },
    ],
  }));
};

const repoChoices = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { repo, repos } = await port.send({ type: 'GET_REPOS' });
  return repos.map((candidate) => ({
    id: `repo:${candidate.full_name}`,
    title: candidate.full_name,
    subtitle: candidate.full_name === repo ? 'current' : '',
    run: async () => {
      await port.send({ type: 'SET_REPO', repo: candidate.full_name });
      return `Now using ${candidate.full_name}`;
    },
  }));
};

/** Everything the extension can do that needs no page around it. */
export const repoActions = (port: ActionPort): PaletteAction[] => [
  { id: 'note', title: 'Add a note…', children: () => noteTargets(port) },
  { id: 'tabs', title: 'Pinned tab groups…', children: () => pinnedTabGroups(port) },
  {
    id: 'tabs-save',
    title: 'Save this window’s pinned tabs as a new group…',
    prompts: [{ label: 'Group name' }],
    run: async ([input = '']: string[]) => {
      const { count, name } = await port.send({ type: 'SAVE_PINNED_TAB_GROUP', name: input });
      return `Saved ${name} with ${plural(count, 'tab')}`;
    },
  },
  {
    id: 'import-chrome-bookmarks',
    title: 'Import the browser’s bookmarks',
    subtitle: 'Copies them into the repo, skipping pages already there',
    run: async () => {
      const { imported, skipped } = await port.send({ type: 'IMPORT_CHROME_BOOKMARKS' });
      return `Imported ${plural(imported, 'bookmark')}, skipped ${skipped}`;
    },
  },
  { id: 'switch-repo', title: 'Switch repository…', children: () => repoChoices(port) },
  {
    id: 'sync-now',
    title: 'Sync with GitHub now',
    subtitle: 'Ignores the hourly budget and pushes what has been counted',
    run: async () => {
      const { synced, bookmarks } = await port.send({ type: 'SYNC_NOW', force: true });
      return synced ? `Synced ${bookmarks} bookmarks` : 'Nothing to sync — log in first';
    },
  },
  {
    id: 'open-console',
    title: 'Open the Lifosy console',
    run: async () => {
      await port.send({ type: 'OPEN_URL', url: CONSOLE_URL });
      return 'Opening the console';
    },
  },
];

/** The handlers that only talk to the backend; `actions` and `open` differ per surface. */
export const portHandlers = (port: ActionPort): Omit<PaletteHandlers, 'actions' | 'open'> => ({
  loadBookmarks: async () => (await port.send({ type: 'GET_BOOKMARKS' })).bookmarks,
  searchRepo: async (query) => (await port.send({ type: 'SEARCH_REPO', query })).results,
  loadRecents: async () => (await port.send({ type: 'GET_RECENTS' })).recents,
  rememberRecent: (entry) => {
    port
      .send({ type: 'ADD_RECENT', entry })
      .catch((e) => console.warn('LifeOS palette: could not record', entry, e));
  },
  countBookmarkUse: (bookmarkId) => {
    port
      .send({ type: 'RECORD_BOOKMARK_USE', bookmarkId })
      .catch((e) => console.warn('LifeOS palette: could not count use of', bookmarkId, e));
  },
});
