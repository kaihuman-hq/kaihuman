import { useEffect } from 'preact/hooks';
import { authStore } from '@lifosy/core';

export function ExtensionAuthBridge() {
  useEffect(() => {
    // Expose token for the extension content script to grab
    // We put it in a specific hidden element that the content script can find easily
    // This is a simple bridge mechanism.
    const token = authStore.token.value;
    if (token) {
      document.body.setAttribute('data-lifosy-auth', token);
    } else {
      document.body.removeAttribute('data-lifosy-auth');
    }

    // Also dispatch an event in case the extension is listening
    window.dispatchEvent(new CustomEvent('lifosy-auth-update', { detail: { token } }));

    return () => {
      document.body.removeAttribute('data-lifosy-auth');
    };
  }, [authStore.token.value]);

  return <div id="lifosy-extension-bridge" style={{ display: 'none' }} />;
}
