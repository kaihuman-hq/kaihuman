import { CONSOLE_URL } from '../console';
import type { CommandPalette, PaletteAction } from './command-palette';
import { createCommandPalette } from './command-palette';
import { extractArticle } from './extract';

console.log('LifeOS Extension: Content script loaded');

// Function to extract token and send to background
function extractToken() {
  const bridge = document.getElementById('lifosy-extension-bridge');
  if (bridge) {
    // Check if attribute is already there (React/Preact might have rendered it)
    const token = document.body.getAttribute('data-lifosy-auth');
    const repo = document.body.getAttribute('data-lifosy-repo');
    const reposRaw = document.body.getAttribute('data-lifosy-repos');

    if (token) {
      let repos = [];
      if (reposRaw) {
        try { repos = JSON.parse(reposRaw); } catch (e) { }
      }
      console.log('LifeOS Extension: Token found, sending to background');
      chrome.runtime.sendMessage({ type: 'AUTH_TOKEN_UPDATE', token, repo, repos });
      // Notify the console that we successfully onboarded
      window.dispatchEvent(new CustomEvent('EXTENSION_ONBOARDED'));
    }
  }
}

// Initial check
extractToken();

// Listen for custom event from the web app
window.addEventListener('lifosy-auth-update', (event: any) => {
  const token = event.detail.token;
  const repo = event.detail.repo;
  const repos = event.detail.repos || [];
  if (token) {
    console.log('LifeOS Extension: Token update received');
    chrome.runtime.sendMessage({ type: 'AUTH_TOKEN_UPDATE', token, repo, repos });
  }
});

// Also observe DOM changes just in case, though the event is cleaner
const observer = new MutationObserver((mutations) => {
  let shouldExtract = false;
  for (const mutation of mutations) {
    if (mutation.type === 'attributes' &&
      (mutation.attributeName === 'data-lifosy-auth' ||
        mutation.attributeName === 'data-lifosy-repo' ||
        mutation.attributeName === 'data-lifosy-repos')) {
      shouldExtract = true;
    }
  }
  if (shouldExtract) {
    extractToken();
  }
});

observer.observe(document.body, { attributes: true });

// Built on first use so pages that never open the palette pay nothing for it.
let palette: CommandPalette | null = null;

const send = (message: Record<string, unknown>): Promise<any> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const failure = chrome.runtime.lastError?.message || response?.error;
      if (failure) reject(new Error(failure));
      else resolve(response);
    });
  });

/** The canonical link, so a page saved from here and from the popup lands on one url. */
const pageUrl = () =>
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href;

const splitTags = (input: string) =>
  input
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

const bookmarkPage = async (tags: string[]) => {
  const { title } = await send({
    type: 'ADD_BOOKMARK',
    url: pageUrl(),
    title: document.title,
    tags,
  });
  return `Bookmarked “${title}”`;
};

/** Targets for a note: the repo's quick-note files, plus the default dump. */
const noteTargets = async (): Promise<PaletteAction[]> => {
  const { quickNotes } = await send({ type: 'FETCH_QUICK_NOTES' });
  const paths = ['.lifeos/dump.md', ...((quickNotes as string[] | undefined) ?? [])];
  return Array.from(new Set(paths)).map((path) => ({
    id: `note:${path}`,
    title: path,
    // The popup picks its form the same way: an action log takes a description and tags.
    prompt: path.endsWith('.actionlog.md') ? 'What happened? #tags' : 'Note',
    run: async (input: string) => {
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
        prompt: 'New name',
        run: async (input: string) => {
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
        prompt: `Type DELETE to forget ${group.name}`,
        run: async (input: string) => {
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

/** Everything the popup and the context menu can do, as palette actions. */
const paletteActions = (): PaletteAction[] => [
  {
    id: 'bookmark-page',
    title: 'Bookmark this page',
    subtitle: document.title || location.href,
    run: () => bookmarkPage([]),
  },
  {
    id: 'bookmark-page-tags',
    title: 'Bookmark this page with tags…',
    prompt: 'Tags, separated by spaces or commas',
    run: (input) => bookmarkPage(splitTags(input)),
  },
  {
    id: 'pin-article',
    title: 'Pin this page to the Knowledge Base',
    subtitle: 'Saves the page text as a note to process later',
    run: async () => {
      const article = extractArticle();
      await send({ type: 'PIN_ARTICLE', ...article, url: article.url || pageUrl() });
      return `Pinned “${article.title}”`;
    },
  },
  {
    id: 'clip-selection',
    title: 'Add the selected text to the Knowledge Base',
    run: async () => {
      const text = window.getSelection()?.toString() ?? '';
      await send({ type: 'SAVE_SELECTION', text, url: pageUrl(), title: document.title });
      return 'Added to the Knowledge Base';
    },
  },
  { id: 'note', title: 'Add a note…', children: noteTargets },
  { id: 'tabs', title: 'Pinned tab groups…', children: pinnedTabGroups },
  {
    id: 'tabs-save',
    title: 'Save this window\u2019s pinned tabs as a new group…',
    prompt: 'Group name',
    run: async (input: string) => {
      const { count, name } = await send({ type: 'SAVE_PINNED_TAB_GROUP', name: input });
      return `Saved ${name} with ${plural(count, 'tab')}`;
    },
  },
  {
    id: 'import-chrome-bookmarks',
    title: 'Import the browser\u2019s bookmarks',
    subtitle: 'Copies them into the repo, skipping pages already there',
    run: async () => {
      const { imported, skipped } = await send({ type: 'IMPORT_CHROME_BOOKMARKS' });
      return `Imported ${plural(imported, 'bookmark')}, skipped ${skipped}`;
    },
  },
  { id: 'switch-repo', title: 'Switch repository…', children: repoChoices },
  {
    id: 'open-console',
    title: 'Open the Lifosy console',
    run: async () => {
      await send({ type: 'OPEN_URL', url: CONSOLE_URL });
      return 'Opening the console';
    },
  },
];

function getPalette(): CommandPalette {
  if (!palette) {
    palette = createCommandPalette({
      loadBookmarks: async () => (await send({ type: 'GET_BOOKMARKS' })).bookmarks,
      searchRepo: async (query) => (await send({ type: 'SEARCH_REPO', query })).results,
      // Content scripts cannot open tabs, and routing through the worker also puts the URL
      // through its scheme check before anything is navigated to.
      open: (url) => {
        send({ type: 'OPEN_URL', url }).catch((e) =>
          console.warn('LifeOS Extension: could not open', url, e),
        );
      },
      actions: paletteActions,
      loadRecents: async () => (await send({ type: 'GET_RECENTS' })).recents,
      rememberRecent: (entry) => {
        send({ type: 'ADD_RECENT', entry }).catch((e) =>
          console.warn('LifeOS Extension: could not record', entry, e),
        );
      },
    });
  }
  return palette;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_ARTICLE') {
    sendResponse(extractArticle());
    return false;
  }
  if (msg.type === 'TOGGLE_COMMAND_PALETTE') {
    getPalette().toggle();
    sendResponse({ success: true });
    return false;
  }
});
