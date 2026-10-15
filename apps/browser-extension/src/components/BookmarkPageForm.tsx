import { useEffect, useRef, useState } from 'preact/hooks';

interface DraftDuplicate {
  kind: 'bookmark' | 'read-later' | 'stream';
  title: string;
  url: string;
  exact: boolean;
}

const KIND_LABEL = { bookmark: 'a bookmark', 'read-later': 'read later', stream: 'a stream' };
const ENVIRONMENT_WORD = /\b(dev|int|prod)\b/i;

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
  // The page's own url and title are a starting point, not the answer: a tracking-laden url or a
  // site's boilerplate title is worth fixing before it is saved.
  const [url, setUrl] = useState(page?.url ?? '');
  const [title, setTitle] = useState(page?.title ?? '');
  const [tagsInput, setTagsInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DraftDuplicate | null>(null);
  // A suggestion arrives late; it only fills a field the user has not started editing.
  const touched = useRef({ title: false, tags: false });

  useEffect(() => {
    if (!page?.url) return;
    chrome.runtime.sendMessage(
      { type: 'BOOKMARK_DRAFT', url: page.url, title: page.title },
      (response) => {
        if (chrome.runtime.lastError || !response?.draft) return;
        const { title: suggested, tags: suggestedTags, environment } = response.draft;
        if (!touched.current.title && suggested) setTitle(suggested);
        if (!touched.current.tags) {
          // The environment is read from the title or a tag, so a model-found one becomes a tag.
          const extra =
            environment && !ENVIRONMENT_WORD.test(suggested ?? '')
              ? [String(environment).toLowerCase()]
              : [];
          const all = [...(suggestedTags ?? []), ...extra];
          if (all.length) setTagsInput(all.join(', '));
        }
        const found: DraftDuplicate[] = response.duplicates ?? [];
        setDuplicate(found.find((entry) => entry.exact) ?? found[0] ?? null);
      },
    );
  }, [page?.url, page?.title]);

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
    if (!url.trim()) return;
    send({ type: 'ADD_BOOKMARK', url: url.trim(), title: title.trim(), tags }, () => {
      setStatus('success');
      // Long enough to read "Bookmarked!", short enough not to be in the way.
      setTimeout(onClose, 900);
    });
  };

  const tags = tagsInput
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  /**
   * The popup is the only place that can ask: `chrome.permissions.request` needs a user gesture in
   * an extension page, so the palette's version of this action can only tell you to come here.
   */
  const importAll = async () => {
    setStatus('saving');
    setMessage(null);
    let granted = false;
    try {
      granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
    } catch (e: any) {
      setMessage(e?.message || 'Could not ask for access to your bookmarks');
      setStatus('error');
      return;
    }
    if (!granted) {
      setMessage('Access to your browser bookmarks is needed to import them');
      setStatus('error');
      return;
    }
    send({ type: 'IMPORT_CHROME_BOOKMARKS' }, (response) => {
      setStatus('success');
      setMessage(`Imported ${response.imported}, skipped ${response.skipped}`);
    });
  };

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(tags);
        }}
        class="flex flex-col gap-2"
      >
        <label
          class="block text-[10px] text-[var(--los-fg-dim)] uppercase tracking-wider font-bold"
          for="bookmark-url"
        >
          URL
        </label>
        <input
          id="bookmark-url"
          type="text"
          value={url}
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
          class="w-full bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors"
          placeholder="https://example.com"
          disabled={status === 'saving'}
        />

        <label
          class="block text-[10px] text-[var(--los-fg-dim)] uppercase tracking-wider font-bold"
          for="bookmark-title"
        >
          Title
        </label>
        <input
          id="bookmark-title"
          type="text"
          value={title}
          onInput={(e) => {
            touched.current.title = true;
            setTitle((e.target as HTMLInputElement).value);
          }}
          class="w-full bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors"
          placeholder="Defaults to the URL"
          disabled={status === 'saving'}
        />

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
          onInput={(e) => {
            touched.current.tags = true;
            setTagsInput((e.target as HTMLInputElement).value);
          }}
          class="w-full bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors"
          placeholder="e.g. dev, docs"
          disabled={status === 'saving'}
          // biome-ignore lint/a11y/noAutofocus: the user opened this view to fill it in, and tags are the field they came to add
          autoFocus
        />

        {duplicate && (
          <div class="flex items-center justify-between gap-2 text-[10px] p-2 rounded border text-[var(--los-fg-dim)] bg-[var(--los-bg-hover)] border-[var(--los-border)]">
            <span class="break-words min-w-0">
              {duplicate.exact ? 'Already saved' : 'Looks like'} in {KIND_LABEL[duplicate.kind]}:{' '}
              {duplicate.title || duplicate.url}
            </span>
            <button
              type="button"
              onClick={() => chrome.runtime.sendMessage({ type: 'OPEN_URL', url: duplicate.url })}
              class="shrink-0 uppercase tracking-wider font-bold hover:text-[var(--los-fg)]"
            >
              Open existing
            </button>
          </div>
        )}

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
            disabled={status === 'saving' || !url.trim()}
            class="flex-1 py-2 px-3 bg-[var(--los-accent)] text-black hover:opacity-90 font-bold text-xs rounded transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'saving' ? 'Saving...' : status === 'success' ? 'Bookmarked!' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => save([])}
            disabled={status === 'saving' || !url.trim()}
            class="py-2 px-3 bg-[var(--los-bg-hover)] hover:bg-[var(--los-border)] text-[var(--los-fg)] border border-[var(--los-border)] text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Save without tags"
          >
            Skip tags
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
          skipped, so running it twice is safe. Asks for access to your bookmarks the first time.
        </p>
      </div>
    </div>
  );
}
