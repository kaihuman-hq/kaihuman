interface QuickActionsProps {
  pageTitle: string;
  onPin: () => void;
  onBookmark: () => void;
  status: 'idle' | 'saving' | 'success' | 'error';
}

const BUTTON_CLASS =
  'flex items-center justify-center w-9 h-9 rounded border border-[var(--los-border)] bg-[var(--los-bg-hover)] text-[var(--los-fg-dim)] hover:text-[var(--los-accent)] hover:border-[var(--los-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** The two things worth one click when the popup opens, kept to icons so they cost no space. */
export function QuickActions({ pageTitle, onPin, onBookmark, status }: QuickActionsProps) {
  return (
    <section class="flex items-center gap-2">
      <button
        type="button"
        onClick={onPin}
        disabled={status === 'saving'}
        class={BUTTON_CLASS}
        title="Pin this page to the Knowledge Base"
        aria-label="Pin this page to the Knowledge Base"
      >
        {/* bookmark-with-fold */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      <button
        type="button"
        onClick={onBookmark}
        disabled={status === 'saving'}
        class={BUTTON_CLASS}
        title="Bookmark this page"
        aria-label="Bookmark this page"
      >
        {/* star */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M11.5 3.2a.6.6 0 0 1 1 0l2.4 5a.6.6 0 0 0 .5.3l5.4.8a.6.6 0 0 1 .3 1L17.2 14a.6.6 0 0 0-.2.6l1 5.4a.6.6 0 0 1-.9.6l-4.8-2.5a.6.6 0 0 0-.6 0L7 20.6a.6.6 0 0 1-.9-.6l1-5.4a.6.6 0 0 0-.2-.6L3 10.3a.6.6 0 0 1 .3-1l5.4-.8a.6.6 0 0 0 .5-.3z" />
        </svg>
      </button>

      <div class="min-w-0 flex-1 text-[10px] text-[var(--los-fg-dim)] truncate" title={pageTitle}>
        {pageTitle || 'No active tab'}
      </div>
    </section>
  );
}
