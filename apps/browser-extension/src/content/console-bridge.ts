// Runs only on the console (see the manifest): hands the signed-in token to the extension.
import { isConsolePage } from '../console';

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
