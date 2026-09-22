import type { CommandPalette } from './command-palette';
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
      bookmarkPage: async () => {
        // The canonical link is what the popup's Read It Later uses too, so the same page
        // bookmarked from either surface lands on one url.
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
        const { title } = await send({
          type: 'ADD_BOOKMARK',
          url: canonical || location.href,
          title: document.title,
        });
        return `Bookmarked “${title}”`;
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
