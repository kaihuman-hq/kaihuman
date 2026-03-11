import { githubProfileStore } from '@lifosy/core';
import { useEffect } from 'preact/hooks';

export function ExtensionSuccess() {
  useEffect(() => {
    // Fetch repos so AuthBridge can sync them to the extension via DOM
    githubProfileStore.fetchRepos();
    // We don't necessarily need to do anything here because ExtensionAuthBridge
    // runs globally and will inject the token into the DOM for the content script
    // to read. The content script will hear the token and dispatch EXTENSION_ONBOARDED.

    // Auto close window after successful extension onboarding
    const handleSuccess = () => {
      setTimeout(() => {
        window.close();
      }, 1500);
    };

    window.addEventListener('EXTENSION_ONBOARDED', handleSuccess);
    return () => window.removeEventListener('EXTENSION_ONBOARDED', handleSuccess);
  }, []);

  return (
    <div class="flex h-full w-full flex-col items-center justify-center space-y-4">
      <div class="rounded-full bg-[var(--los-success)]/20 p-4">
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative success icon */}
        <svg
          class="h-12 w-12 text-[var(--los-success)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-[var(--los-fg)]">Extension Connected!</h1>
      <p class="text-[var(--los-fg-dim)] text-center max-w-sm">
        You've successfully authorized the KaiHuman browser extension. You can close this tab and
        start using the extension from your browser toolbar.
      </p>
      <button
        type="button"
        onClick={() => window.close()}
        class="mt-4 rounded bg-[var(--los-bg-hover)] px-4 py-2 border border-[var(--los-border)] font-bold text-[var(--los-fg)] hover:text-[var(--los-accent)] transition-colors"
      >
        Close Tab
      </button>
    </div>
  );
}
