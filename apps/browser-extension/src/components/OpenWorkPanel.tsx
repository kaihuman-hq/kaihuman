import { useOpenSidePanel } from '../sidepanel/open-panel';

/** The toolbar icon opens this popup, so the work side panel needs a way in from here. */
export function OpenWorkPanel() {
  // The popup would otherwise stay open on top of the panel it just opened.
  const open = useOpenSidePanel(() => window.close());
  return (
    <button
      type="button"
      onClick={open}
      class="w-full py-2 px-3 border border-[var(--los-border)] text-xs rounded hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] transition-colors"
    >
      Open work panel
    </button>
  );
}
