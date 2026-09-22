import { useState } from 'preact/hooks';
import { MonoHeader } from '../../Atoms/Typography';
import type { BookmarkDraft } from './BookmarksLogic';

interface BookmarkAddFormProps {
  /** Rejected drafts (bad url, duplicate) come back here so the message shows inline. */
  onAdd: (draft: BookmarkDraft) => string | undefined;
  onCancel: () => void;
  existingTags?: string[];
}

export const BookmarkAddForm = ({ onAdd, onCancel, existingTags = [] }: BookmarkAddFormProps) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tags = tagInput
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError(onAdd({ title, url, tags }) ?? null);
  };

  return (
    <div className="w-full text-[var(--los-fg)] p-4">
      <MonoHeader className="text-xl mb-6 text-[var(--los-accent)]">ADD BOOKMARK</MonoHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        <div className="flex flex-col gap-1">
          <label for="bookmark-url" className="text-[10px] text-[var(--los-muted)] uppercase">
            URL
          </label>
          <input
            id="bookmark-url"
            type="text"
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            placeholder="https://example.com"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label for="bookmark-title" className="text-[10px] text-[var(--los-muted)] uppercase">
            Title
          </label>
          <input
            id="bookmark-title"
            type="text"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            placeholder="Defaults to the URL"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label for="bookmark-tags" className="text-[10px] text-[var(--los-muted)] uppercase">
            Tags
          </label>
          <input
            id="bookmark-tags"
            type="text"
            value={tagInput}
            onInput={(e) => setTagInput(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            placeholder="dev docs"
          />
          {existingTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {existingTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagInput(tags.includes(tag) ? tagInput : `${tagInput} ${tag}`)}
                  className="text-[10px] font-mono px-1.5 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-accent)] hover:border-[var(--los-accent)] transition-colors"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="text-xs text-red-500 font-mono">{error}</div>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!url.trim()}
            className="bg-[var(--los-accent)] text-black font-bold px-4 py-2 text-xs font-mono hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            ADD BOOKMARK
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          >
            CANCEL
          </button>
        </div>
      </form>
    </div>
  );
};
