import { signal } from '@preact/signals';

export type BusinessNotice = { text: string; path: string };

/**
 * A one-line success notice that survives the route change after a write. `path` is the page it is
 * meant for; PageShell shows it there, and the next navigation away clears it.
 */
export const businessNotice = signal<BusinessNotice | null>(null);

export const showNotice = (text: string, path: string): void => {
  businessNotice.value = { text, path };
};

/** Called on every route change (App's router): leaving the notice's page clears it for good. */
export const noticeAfterRoute = (url: string): void => {
  const notice = businessNotice.peek();
  if (notice && url.split(/[?#]/)[0] !== notice.path) businessNotice.value = null;
};
