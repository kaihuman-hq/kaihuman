import { signal } from '@preact/signals';

/**
 * Global flag indicating the app is running in demo mode.
 *
 * When true, all GitHub persistence is routed to an in-memory virtual
 * filesystem (see `services/github.service.memory.ts`) and durable writes to
 * localStorage / IndexedDB are skipped, so demo data stays temporary and
 * disappears on refresh. Kept in its own module to avoid import cycles between
 * the service and the stores that both read it.
 */
export const demoMode = signal<boolean>(false);
