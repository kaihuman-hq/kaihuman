import { repoActions, send, splitTags, workerHandlers } from '../palette/actions';
import type { CommandPalette, PaletteAction } from '../palette/command-palette';
import { createCommandPalette } from '../palette/command-palette';
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
        try {
          repos = JSON.parse(reposRaw);
        } catch (e) {}
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
    if (
      mutation.type === 'attributes' &&
      (mutation.attributeName === 'data-lifosy-auth' ||
        mutation.attributeName === 'data-lifosy-repo' ||
        mutation.attributeName === 'data-lifosy-repos')
    ) {
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
  ...repoActions(),
];

function getPalette(): CommandPalette {
  if (!palette) {
    palette = createCommandPalette({
      ...workerHandlers(),
      // Content scripts cannot open tabs, and routing through the worker also puts the URL
      // through its scheme check before anything is navigated to.
      open: (url) => {
        send({ type: 'OPEN_URL', url }).catch((e) =>
          console.warn('LifeOS Extension: could not open', url, e),
        );
      },
      actions: paletteActions,
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
