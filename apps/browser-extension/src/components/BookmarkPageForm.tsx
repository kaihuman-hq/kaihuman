import { useState } from 'preact/hooks';

interface BookmarkPageFormProps {
  page: { title: string; url: string } | null;
  repo: string;
  onClose: () => void;
}

/**
 * The view the star opens: bookmark the page with tags, or skip them and just save. It talks to
 * the service worker directly, because nothing else in the popup depends on the result.
 */
export function BookmarkPageForm({ page, repo, onClose }: BookmarkPageFormProps) {
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const send = (message: Record<string, unknown>, onDone: (response: any) => void) => {
    setStatus('saving');
    setMessage(null);
    chrome.runtime.sendMessage(message, (response) => {
      const failure = chrome.runtime.lastError?.message || response?.error;
      if (failure) {
        setMessage(failure);
        setStatus('error');
        return;
      }
      onDone(response);
    });
  };

  const save = (tags: string[]) => {
    if (!page?.url) return;
    send({ type: 'ADD_BOOKMARK', url: page.url, title: page.title, tags }, () => {
      setStatus('success');
      // Long enough to read "Bookmarked!", short enough not to be in the way.
      setTimeout(onClose, 900);
    });
  };

  const tags = tagsInput
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const importAll = () =>
    send({ type: 'IMPORT_CHROME_BOOKMARKS' }, (response) => {
      setStatus('success');
      setMessage(`Imported ${response.imported}, skipped ${response.skipped}`);
    });

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Bookmark this page</h2>
        <button
          type="button"
          onClick={onClose}
          class="text-[10px] text-[var(--los-fg-dim)] hover:text-[var(--los-fg)] uppercase tracking-wider"
        >
          Back
        </button>
      </div>

      <div class="p-3 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] space-y-1">
        <div class="text-xs text-[var(--los-fg)] line-clamp-2">
          {page?.title || 'No active tab'}
        </div>
        <div class="text-[10px] text-[var(--los-fg-dim)] truncate">{page?.url}</div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(tags);
        }}
        class="flex flex-col gap-2"
      >
        <label
          class="block text-[10px] text-[var(--los-fg-dim)] uppercase tracking-wider font-bold"
          for="bookmark-tags"
        >
          Tags (comma separated)
        </label>
        <input
          id="bookmark-tags"
          type="text"
          value={tagsInput}
          onInput={(e) => setTagsInput((e.target as HTMLInputElement).value)}
          class="w-full bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors"
          placeholder="e.g. dev, docs"
          disabled={status === 'saving'}
          // biome-ignore lint/a11y/noAutofocus: the user opened this view to type tags, so landing in its only field is what they came for
          autoFocus
        />

        {message && (
          <div
            class={`text-[10px] p-2 rounded border break-words ${
              status === 'error'
                ? 'text-red-400 bg-red-950/30 border-red-900/50'
                : 'text-[var(--los-fg-dim)] bg-[var(--los-bg-hover)] border-[var(--los-border)]'
            }`}
          >
            {message}
          </div>
        )}

        <div class="flex gap-2">
          <button
            type="submit"
            disabled={status === 'saving' || !page?.url}
            class="flex-1 py-2 px-3 bg-[var(--los-accent)] text-black hover:opacity-90 font-bold text-xs rounded transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'saving' ? 'Saving...' : status === 'success' ? 'Bookmarked!' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => save([])}
            disabled={status === 'saving' || !page?.url}
            class="py-2 px-3 bg-[var(--los-bg-hover)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save without tags"
          >
            Skip
          </button>
        </div>
      </form>

      <div class="pt-2 border-t border-[var(--los-border)] space-y-1">
        <button
          type="button"
          onClick={importAll}
          disabled={status === 'saving'}
          class="w-full py-1.5 px-3 bg-[var(--los-bg-hover)] hover:bg-[var(--los-border)] text-[var(--los-fg-dim)] border border-[var(--los-border)] text-[11px] rounded transition-colors disabled:opacity-50"
        >
          Import all browser bookmarks
        </button>
        <p class="text-[10px] text-[var(--los-fg-dim)] leading-relaxed">
          Copies this browser's bookmarks into {repo}, tagged by folder. Pages already saved are
          skipped, so running it twice is safe.
        </p>
      </div>
    </div>
  );
}
