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
import { isConsolePage } from '../console';
import { send, workerPort } from '../palette/port';
import { extractArticle } from './extract';

// Function to extract token and send to background
function extractToken() {
  const bridge = document.getElementById('kaihuman-extension-bridge');
  if (bridge) {
    // Check if attribute is already there (React/Preact might have rendered it)
    const token = document.body.getAttribute('data-kaihuman-auth');
    const repo = document.body.getAttribute('data-kaihuman-repo');
    const reposRaw = document.body.getAttribute('data-kaihuman-repos');

    if (token) {
      let repos = [];
      if (reposRaw) {
        try {
          repos = JSON.parse(reposRaw);
        } catch (e) {}
      }
      chrome.runtime.sendMessage({ type: 'AUTH_TOKEN_UPDATE', token, repo, repos });
      // Notify the console that we successfully onboarded
      window.dispatchEvent(new CustomEvent('EXTENSION_ONBOARDED'));
    }
  }
}

// The token bridge only runs on the console: any other page could plant its own token.
if (isConsolePage(location.href)) {
  // Initial check
  extractToken();

  // Listen for custom event from the web app
  window.addEventListener('kaihuman-auth-update', (event: any) => {
    const token = event.detail.token;
    const repo = event.detail.repo;
    const repos = event.detail.repos || [];
    if (token) {
      chrome.runtime.sendMessage({ type: 'AUTH_TOKEN_UPDATE', token, repo, repos });
    }
  });

  // Also observe DOM changes just in case, though the event is cleaner
  observeTokenAttributes();
}

function observeTokenAttributes() {
  const observer = new MutationObserver((mutations) => {
    let shouldExtract = false;
    for (const mutation of mutations) {
      if (
        mutation.type === 'attributes' &&
        (mutation.attributeName === 'data-kaihuman-auth' ||
          mutation.attributeName === 'data-kaihuman-repo' ||
          mutation.attributeName === 'data-kaihuman-repos')
      ) {
        shouldExtract = true;
      }
    }
    if (shouldExtract) {
      extractToken();
    }
  });

  observer.observe(document.body, { attributes: true });
}

// Built on first use so pages that never open the palette pay nothing for it.
let palette: CommandPalette | null = null;

/** The canonical link, so a page saved from here and from the popup lands on one url. */
const pageUrl = () =>
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href;

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
      { label: 'Title', initial: () => document.title },
      // Kept short: the label doubles as the breadcrumb's field name.
      { label: 'Tags' },
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
