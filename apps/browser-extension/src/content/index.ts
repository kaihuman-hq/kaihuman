console.log('LifeOS Extension: Content script loaded');

// Function to extract token and send to background
function extractToken() {
  const bridge = document.getElementById('lifosy-extension-bridge');
  if (bridge) {
    // Check if attribute is already there (React/Preact might have rendered it)
    const token = document.body.getAttribute('data-lifosy-auth');
    const repo = document.body.getAttribute('data-lifosy-repo');
    if (token) {
      console.log('LifeOS Extension: Token found, sending to background');
      chrome.runtime.sendMessage({ type: 'AUTH_TOKEN_UPDATE', token, repo });
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
  if (token) {
    console.log('LifeOS Extension: Token update received');
    chrome.runtime.sendMessage({ type: 'AUTH_TOKEN_UPDATE', token, repo });
  }
});

// Also observe DOM changes just in case, though the event is cleaner
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-lifosy-auth') {
      extractToken();
    }
  }
});

observer.observe(document.body, { attributes: true });
