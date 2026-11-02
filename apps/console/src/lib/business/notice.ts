import { signal } from '@preact/signals';

/**
 * A one-line success notice that survives the route change after a write; the page it lands on
 * shows it (PageShell) until it is dismissed.
 */
export const businessNotice = signal<string | null>(null);
