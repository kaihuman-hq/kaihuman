import { useState } from 'preact/hooks';

interface BookmarkPageFormProps {
  page: { title: string; url: string } | null;
  repo: string;
}

/**
 * Bookmarks the popup's own tab. It talks to the service worker directly rather than lifting
 * state into App, because nothing else in the popup depends on the result.
 */
export function BookmarkPageForm({ page, repo }: BookmarkPageFormProps) {
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!page?.url) return;
    setStatus('saving');
    setMessage(null);

    const tags = tagsInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    chrome.runtime.sendMessage(
      { type: 'ADD_BOOKMARK', url: page.url, title: page.title, tags },
      (response) => {
        const failure = chrome.runtime.lastError?.message || response?.error;
        if (failure) {
          setMessage(failure);
          setStatus('error');
          return;
        }
        setTagsInput('');
        setStatus('success');
        setTimeout(() => setStatus('idle'), 2000);
      },
    );
  };

  return (
    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Bookmarks</h2>
        <span
          class="text-[10px] text-[var(--los-fg-dim)] truncate max-w-[150px]"
          title={`${repo}/.kh/browser.bookmarks.json`}
        >
          .kh/browser.bookmarks.json
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        class="p-3 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] space-y-2"
      >
        <div class="text-xs text-[var(--los-fg-dim)] line-clamp-2">
          {page?.title || 'No active tab'}
        </div>

        <input
          type="text"
          value={tagsInput}
          onInput={(e) => setTagsInput((e.target as HTMLInputElement).value)}
          class="w-full bg-[var(--los-bg)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors"
          placeholder="Tags (comma separated)"
          disabled={status === 'saving'}
        />

        {status === 'error' && message && (
          <div class="text-[10px] text-red-400 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'saving' || !page?.url}
          class="w-full py-1.5 px-3 bg-[var(--los-bg)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'saving'
            ? 'Saving...'
            : status === 'success'
              ? 'Bookmarked!'
              : 'Bookmark this page'}
        </button>
      </form>
    </section>
  );
}
