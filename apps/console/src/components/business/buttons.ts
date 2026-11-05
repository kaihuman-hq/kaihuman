/**
 * Button classes shared by the business pages. Links that act as buttons (navigation) use the
 * same classes as real buttons so a primary action looks the same either way.
 */

/** The one main action of a form or section. */
export const PRIMARY =
  'inline-block px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50';
/** A secondary action next to `PRIMARY`. */
export const SECONDARY =
  'inline-block px-4 py-2 text-sm rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90 disabled:opacity-50';
/** Compact primary, for inline controls such as the timer. */
export const PRIMARY_MD =
  'inline-block px-3 py-1.5 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50';
/** Compact secondary. */
export const SECONDARY_MD =
  'inline-block px-3 py-1.5 text-sm font-bold rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90 disabled:opacity-50';
/** Row-level actions in tables and lists. */
export const BUTTON_SM =
  'inline-block px-2 py-1 text-xs rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90 disabled:opacity-50';
