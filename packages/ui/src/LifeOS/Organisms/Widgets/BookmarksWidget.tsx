import { ExternalLink, Pencil, Pin, Star, Trash2 } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import {
  type Bookmark,
  type BookmarkEdit,
  type BookmarkSort,
  collectTags,
  deleteBookmark,
  filterBookmarks,
  parseBookmarks,
  serializeBookmarks,
  setBookmarkPinned,
  sortBookmarks,
  updateBookmark,
} from './BookmarksLogic';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';

export interface BookmarksWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  onChange?: (newContent: string) => void;
}

const SMALL_LIMIT = 8;

export const BookmarksWidget = ({
  content,
  mode = 'SMALL',
  className,
  onChange,
}: BookmarksWidgetProps) => {
  const config = useMemo(() => parseBookmarks(content), [content]);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<BookmarkSort>('NEWEST');
  const [editingId, setEditingId] = useState<string | null>(null);

  const tags = useMemo(() => collectTags(config.bookmarks), [config.bookmarks]);
  const visible = useMemo(
    () => sortBookmarks(filterBookmarks(config.bookmarks, query, activeTag ?? undefined), sort),
    [config.bookmarks, query, activeTag, sort],
  );

  const handleDelete = (id: string) => {
    onChange?.(serializeBookmarks(deleteBookmark(config, id)));
  };

  /** Returns the rejection message so the editor can show it and stay open. */
  const handleSaveEdit = (id: string, edit: BookmarkEdit): string | undefined => {
    try {
      onChange?.(serializeBookmarks(updateBookmark(config, id, edit)));
      setEditingId(null);
      return undefined;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const handleTogglePin = (bookmark: Bookmark) => {
    onChange?.(serializeBookmarks(setBookmarkPinned(config, bookmark.id, !bookmark.pinned)));
  };

  if (config.bookmarks.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]',
          className,
        )}
      >
        <Star size={24} className="mb-2 opacity-50" />
        <MonoText>No Bookmarks Yet</MonoText>
      </div>
    );
  }

  if (mode === 'MOBILE_COLLAPSED') {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full w-full p-4', className)}>
        <MonoHeader className="text-5xl font-bold text-[var(--los-fg)] mb-1">
          {config.bookmarks.length}
        </MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
          BOOKMARKS
        </MonoText>
      </div>
    );
  }

  if (mode === 'SMALL') {
    return (
      <div className={cn('flex flex-col h-full w-full overflow-hidden', className)}>
        <div className="divide-y divide-[var(--los-border)] overflow-y-auto">
          {config.bookmarks.slice(0, SMALL_LIMIT).map((bookmark) => (
            <BookmarkRow key={bookmark.id} bookmark={bookmark} />
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'MOBILE_EXPANDED') {
    return (
      <CompactWidgetLayout className={className}>
        <div className="flex justify-between items-center shrink-0 border-b border-[var(--los-border)] pb-2">
          <MonoHeader className="text-xs text-[var(--los-muted)]">BOOKMARKS</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-accent)]">
            {config.bookmarks.length} SAVED
          </MonoText>
        </div>
        <CompactList>
          <div className="divide-y divide-[var(--los-border)]">
            {config.bookmarks.map((bookmark) => (
              <BookmarkRow key={bookmark.id} bookmark={bookmark} />
            ))}
          </div>
        </CompactList>
      </CompactWidgetLayout>
    );
  }

  return (
    <div className={cn('flex flex-col h-full w-full', className)}>
      <div className="border-b border-[var(--los-border)] p-2 flex flex-col gap-2 bg-[var(--los-bg)]">
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search bookmarks..."
            className="flex-1 bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50"
          />
          <MonoText className="text-[var(--los-muted)] text-xs whitespace-nowrap">
            {visible.length}/{config.bookmarks.length}
          </MonoText>
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              ['NEWEST', 'NEWEST'],
              ['LEAST_USED', 'LEAST USED'],
              ['MOST_USED', 'MOST USED'],
            ] as [BookmarkSort, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              className={cn(
                'text-[10px] font-mono px-1.5 py-0.5 border transition-colors',
                sort === value
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                  : 'border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={cn(
                  'text-[10px] font-mono px-1.5 py-0.5 border transition-colors',
                  activeTag === tag
                    ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                    : 'border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]',
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--los-border)]">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--los-muted)]">
            <Star className="w-8 h-8 mb-2 opacity-50" />
            <MonoText>No bookmarks match.</MonoText>
          </div>
        ) : (
          visible.map((bookmark) =>
            editingId === bookmark.id ? (
              <BookmarkEditor
                key={bookmark.id}
                bookmark={bookmark}
                onSave={(edit) => handleSaveEdit(bookmark.id, edit)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <BookmarkRow
                key={bookmark.id}
                bookmark={bookmark}
                onEdit={() => setEditingId(bookmark.id)}
                onTogglePin={() => handleTogglePin(bookmark)}
                onDelete={() => handleDelete(bookmark.id)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
};

const formatCreatedAt = (createdAt: string) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

const formatUsage = (bookmark: Bookmark) => {
  if (bookmark.useCount === 0) return 'never opened';
  const when = formatCreatedAt(bookmark.lastUsedAt);
  const times = `opened ${bookmark.useCount}\u00d7`;
  return when ? `${times}, last ${when}` : times;
};

const editorInputClass =
  'w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none';

const BookmarkEditor = ({
  bookmark,
  onSave,
  onCancel,
}: {
  bookmark: Bookmark;
  onSave: (edit: BookmarkEdit) => string | undefined;
  onCancel: () => void;
}) => {
  const [title, setTitle] = useState(bookmark.title);
  const [url, setUrl] = useState(bookmark.url);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setError(onSave({ title, url }) ?? null);
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      className="py-2 px-2 flex flex-col gap-1.5 bg-white/5"
    >
      <input
        type="text"
        aria-label="Bookmark title"
        value={title}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder="Defaults to the URL"
        className={editorInputClass}
      />
      <input
        type="text"
        aria-label="Bookmark URL"
        value={url}
        onInput={(e) => setUrl(e.currentTarget.value)}
        placeholder="https://example.com"
        className={editorInputClass}
      />
      {error && <div className="text-[10px] text-red-500 font-mono">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!url.trim()}
          className="text-[10px] font-mono px-2 py-0.5 bg-[var(--los-accent)] text-black hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          SAVE
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
        >
          CANCEL
        </button>
      </div>
    </form>
  );
};

const BookmarkRow = ({
  bookmark,
  onEdit,
  onTogglePin,
  onDelete,
}: {
  bookmark: Bookmark;
  onEdit?: () => void;
  onTogglePin?: () => void;
  onDelete?: () => void;
}) => {
  const created = formatCreatedAt(bookmark.createdAt);

  return (
    <div className="py-2 px-2 group hover:bg-white/5 transition-colors flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          onClick={(e) => e.stopPropagation()}
        >
          <MonoText className="font-bold text-[var(--los-fg)] hover:text-[var(--los-accent)] whitespace-normal break-words block">
            {bookmark.title}
          </MonoText>
        </a>
        <div className="flex flex-wrap gap-2 text-[10px] text-[var(--los-muted)] mt-0.5">
          <span className="truncate max-w-[220px]">{bookmark.url}</span>
          {created && <span>{created}</span>}
          <span className={bookmark.useCount === 0 ? 'text-[var(--los-accent)]' : undefined}>
            {formatUsage(bookmark)}
          </span>
          {bookmark.tags.map((tag) => (
            <span
              key={tag}
              className="bg-[var(--los-border)] px-1 rounded text-[var(--los-fg)] opacity-70"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open"
          className="p-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit title and link"
            aria-label="Edit"
            className="p-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {onTogglePin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            title={bookmark.pinned ? 'Unpin from the start page' : 'Pin to the start page'}
            aria-pressed={bookmark.pinned}
            className={cn(
              'p-1.5 transition-colors',
              bookmark.pinned
                ? 'text-[var(--los-accent)] hover:text-[var(--los-fg)]'
                : 'text-[var(--los-muted)] hover:text-[var(--los-accent)]',
            )}
          >
            <Pin className="w-4 h-4" fill={bookmark.pinned ? 'currentColor' : 'none'} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
            aria-label="Delete"
            className="p-1.5 text-[var(--los-muted)] hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
