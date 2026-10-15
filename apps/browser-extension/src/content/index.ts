import {
  type CommandPalette,
  commandsMode,
  copyToClipboard,
  createCommandPalette,
  type PaletteAction,
  paletteModes,
  portHandlers,
  repoActions,
  splitTags,
} from '@kaihuman/palette';
import { send, workerPort } from '../palette/port';
import { openWorkPanelAction } from '../palette/work-panel';
import { extractArticle } from './extract';

// Built on first use so pages that never open the palette pay nothing for it.
let palette: CommandPalette | null = null;

/** The canonical link, so a page saved from here and from the popup lands on one url. */
const pageUrl = () =>
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href;

/**
 * The worker's suggestion for the bookmark prompts, asked for when the palette opens so it is
 * usually there by the time the prompt is. `initial` is synchronous, so a suggestion that has not
 * arrived falls back to the page's own values.
 */
let bookmarkDraft: { title: string; tags: string[] } | null = null;

const requestBookmarkDraft = () => {
  bookmarkDraft = null;
  send({ type: 'BOOKMARK_DRAFT', url: pageUrl(), title: document.title }).then(
    (response) => {
      if (response?.draft) bookmarkDraft = response.draft;
    },
    () => {},
  );
};

const bookmarkPage = async (url: string, title: string, tags: string[]) => {
  const saved = await send({ type: 'ADD_BOOKMARK', url, title, tags });
  return `Bookmarked “${saved.title}”`;
};

/** Everything the popup and the context menu can do, as palette actions. */
const paletteActions = (): PaletteAction[] => [
  {
    id: 'bookmark-page',
    title: 'Bookmark this page…',
    subtitle: document.title || location.href,
    // The page's own url and title are only a starting point: a tracking-laden url or a
    // site's boilerplate title is worth fixing before it is saved, so both are prefilled
    // and editable, and ⏎ keeps what is there.
    prompts: [
      { label: 'URL', initial: pageUrl },
      { label: 'Title', initial: () => bookmarkDraft?.title || document.title },
      // Kept short: the label doubles as the breadcrumb's field name.
      { label: 'Tags', initial: () => bookmarkDraft?.tags.join(', ') ?? '' },
    ],
    run: ([url = '', title = '', tags = '']: string[]) => bookmarkPage(url, title, splitTags(tags)),
  },
  {
    id: 'read-later',
    title: 'Read later: this page',
    subtitle: 'Adds it to the repo’s read-later list, which the start page shows',
    run: async () => {
      await send({ type: 'READ_LATER_ADD', url: pageUrl(), title: document.title });
      return `Saved “${document.title || pageUrl()}” for later`;
    },
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
  openWorkPanelAction(send),
  ...repoActions(workerPort),
];

function getPalette(): CommandPalette {
  if (!palette) {
    palette = createCommandPalette({
      ...portHandlers(workerPort),
      // Content scripts cannot open tabs, and routing through the worker also puts the URL
      // through its scheme check before anything is navigated to.
      open: (url) => {
        send({ type: 'OPEN_URL', url }).catch((e) =>
          console.warn('kaihuman: could not open', url, e),
        );
      },
      actions: paletteActions,
      // The browser cannot run commands, so `>x` only copies them.
      modes: [...paletteModes(workerPort), commandsMode(workerPort, { canRun: false })],
      copy: copyToClipboard,
    });
  }
  return palette;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // The worker injects this script on demand and asks first whether it is already there.
  if (msg.type === 'PAGE_SCRIPT_PING') {
    sendResponse({ success: true });
    return false;
  }
  if (msg.type === 'EXTRACT_ARTICLE') {
    sendResponse(extractArticle());
    return false;
  }
  if (msg.type === 'TOGGLE_COMMAND_PALETTE') {
    requestBookmarkDraft();
    getPalette().toggle();
    sendResponse({ success: true });
    return false;
  }
});
