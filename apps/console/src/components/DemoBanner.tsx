import { authStore, exitDemoMode, isDemoMode } from '@kaihuman/core';
import { route } from 'preact-router';

/**
 * Says the demo is a demo, and is the way out of it: nothing in the demo is saved, so whoever
 * came from a link needs to know that, and how to start with their own repository.
 *
 * Floats over the page rather than taking a row, since every page sizes itself to the viewport.
 */
export function DemoBanner() {
  if (!isDemoMode.value) return null;
  return (
    <aside
      aria-label="Demo mode"
      class="fixed inset-x-0 mx-auto w-fit bottom-20 sm:bottom-12 z-[100] flex whitespace-nowrap items-center gap-3 rounded-full border border-[var(--los-accent)] bg-[var(--los-bg)] px-4 py-2 text-xs shadow-lg max-w-[calc(100vw-2rem)]"
    >
      <span class="text-[var(--los-muted)] sm:hidden">Demo · not saved</span>
      <span class="text-[var(--los-muted)] hidden sm:inline">
        Demo — nothing you change is saved
      </span>
      <button
        type="button"
        class="shrink-0 font-bold text-[var(--los-accent)] hover:underline"
        onClick={() => {
          exitDemoMode();
          authStore.login();
        }}
      >
        Sign in with GitHub
      </button>
      <button
        type="button"
        class="shrink-0 text-[var(--los-muted)] hover:text-[var(--los-fg)]"
        onClick={() => {
          exitDemoMode();
          route('/login', true);
        }}
      >
        Exit
      </button>
    </aside>
  );
}
